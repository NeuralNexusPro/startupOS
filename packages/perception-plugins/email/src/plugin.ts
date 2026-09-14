import { randomUUID, createHash } from 'node:crypto';
import { ImapFlow } from 'imapflow';
import { simpleParser } from 'mailparser';
import type {
  PerceptionPlugin,
  PerceptionPluginManifest,
  PerceptionPluginProvisionContext,
  PerceptionPluginProvisionResult,
  PerceptionPluginRuntimeContext,
} from '@originos/core/modules/perception-runtime/plugins';
import type {
  PerceptionEventV1,
} from '@originos/core/types';
import { validateMailConnectorSettings } from './configuration';
import type { MailConnectorSettings, MailSecret } from './types';

export const emailManifest: PerceptionPluginManifest = {
  id: 'originos.email',
  name: 'Email',
  version: '0.1.0',
  hostApi: '1.0',
  entry: '@originos/perception-plugin-email',
  source: 'email',
  transport: 'poll',
  capabilities: ['inbound-events', 'attachments'],
  permissions: ['credentials', 'events', 'schedule', 'state', 'health'],
  configurationSchema: {
    version: '1.0',
    fields: [
      { key: 'host', label: 'IMAP 主机', type: 'text', required: true },
      {
        key: 'port',
        label: '端口',
        type: 'number',
        required: true,
        defaultValue: 993,
        min: 1,
        max: 65535,
      },
      { key: 'secure', label: '使用 TLS', type: 'boolean', defaultValue: true },
      { key: 'username', label: '用户名', type: 'text', required: true },
      {
        key: 'authMode',
        label: '认证方式',
        type: 'select',
        required: true,
        defaultValue: 'password',
        options: [
          { value: 'password', label: '密码 / 应用专用密码' },
          { value: 'oauth2-token', label: 'OAuth2 Access Token' },
        ],
      },
      {
        key: 'secret',
        label: '密码或 Access Token',
        type: 'password',
        required: true,
        sensitive: true,
      },
      {
        key: 'mailbox',
        label: '邮箱目录',
        type: 'text',
        required: true,
        defaultValue: 'INBOX',
      },
      {
        key: 'pollIntervalSeconds',
        label: '轮询间隔（秒）',
        type: 'number',
        required: true,
        defaultValue: 60,
        min: 15,
      },
    ],
  },
};
interface Cursor {
  uidValidity?: string;
  lastUid: number;
}
export class EmailPerceptionPlugin implements PerceptionPlugin {
  readonly manifest = emailManifest;
  async provision(
    context: PerceptionPluginProvisionContext
  ): Promise<PerceptionPluginProvisionResult> {
    if (!context.ports.credentials)
      throw new Error('EMAIL_CREDENTIAL_PORT_MISSING');
    const profile = validateMailConnectorSettings(context.settings);
    const value = context.secrets.secret;
    if (!value) throw new Error('EMAIL_SECRET_MISSING');
    await verifyConnection(profile, { kind: profile.authMode, value });
    const secretRef = await context.ports.credentials.bind(
      context.connectorId,
      'email',
      JSON.stringify({ kind: profile.authMode, value } satisfies MailSecret)
    );
    return { settings: { ...profile }, secretRefs: { credentials: secretRef } };
  }
  async start(context: PerceptionPluginRuntimeContext): Promise<void> {
    if (
      !context.ports.schedule ||
      !context.ports.state ||
      !context.ports.credentials ||
      !context.ports.events
    )
      throw new Error('EMAIL_PLUGIN_PORT_MISSING');
    const profile = validateMailConnectorSettings(context.settings);
    const interval = profile.pollIntervalSeconds * 1_000;
    let polling = false;
    const poll = async (): Promise<void> => {
      if (polling) return;
      polling = true;
      try {
        await this.poll(context, profile);
      } catch (error) {
        await context.ports.health?.report({
          status: 'degraded',
          safeCode: safeCode(error),
        });
      } finally {
        polling = false;
      }
    };
    await poll();
    context.ports.schedule.every('poll', interval, poll);
  }
  async stop(context: PerceptionPluginRuntimeContext): Promise<void> {
    context.ports.schedule?.cancel('poll');
    await context.ports.health?.report({ status: 'disabled' });
  }
  private async poll(
    context: PerceptionPluginRuntimeContext,
    profile: MailConnectorSettings
  ): Promise<void> {
    const ref =
      typeof context.settings.secretRef === 'string'
        ? context.settings.secretRef
        : '';
    const secret = JSON.parse(
      await context.ports.credentials!.resolve(context.connectorId, ref)
    ) as MailSecret;
    const cursor = (await context.ports.state!.read('cursor')) as
      Cursor | undefined;
    const client = new ImapFlow({
      host: profile.host,
      port: profile.port,
      secure: profile.secure,
      auth:
        secret.kind === 'oauth2-token'
          ? { user: profile.username, accessToken: secret.value }
          : { user: profile.username, pass: secret.value },
      logger: false,
    });
    try {
      await client.connect();
      const box = await client.mailboxOpen(profile.mailbox, { readOnly: true });
      const validity = String(box.uidValidity);
      let lastUid =
        cursor?.uidValidity === validity
          ? cursor.lastUid
          : Math.max(0, box.uidNext - 1);
      let processed = 0;
      if (cursor && cursor.uidValidity === validity && box.exists > 0)
        for await (const item of client.fetch(
          `${lastUid + 1}:*`,
          { uid: true, envelope: true, internalDate: true, source: true },
          { uid: true }
        )) {
          if (item.uid <= lastUid) continue;
          const from = item.envelope?.from?.[0];
          if (!from?.address) continue;
          const parsed = item.source
            ? await simpleParser(item.source)
            : undefined;
          const now = new Date().toISOString();
          const event: PerceptionEventV1 = {
            schemaVersion: '1.0',
            id: randomUUID(),
            source: 'email',
            connectorId: context.connectorId,
            sourceEventId: `mail:${createHash('sha256')
              .update(item.envelope?.messageId ?? `${validity}:${item.uid}`)
              .digest('hex')}`,
            type: 'mail.received',
            occurredAt: item.internalDate
              ? new Date(item.internalDate).toISOString()
              : now,
            receivedAt: now,
            actor: { externalId: from.address, displayName: from.name },
            content: {
              subject: item.envelope?.subject,
              text: parsed?.text?.trim(),
            },
            provenance: {
              rawPayloadRef: `email-imap://${context.connectorId}/${validity}/${item.uid}`,
            },
          };
          await context.ports.events!.submit(event);
          lastUid = item.uid;
          await context.ports.state!.write('cursor', {
            uidValidity: validity,
            lastUid,
          });
          processed += 1;
          if (processed >= 50) break;
        }
      await context.ports.state!.write('cursor', {
        uidValidity: validity,
        lastUid,
      });
      await context.ports.health?.report({
        status: 'healthy',
        detail: { lastUid, lastSuccessAt: new Date().toISOString() },
      });
    } finally {
      try {
        if (client.usable) await client.logout();
        else client.close();
      } catch {
        client.close();
      }
    }
  }
}
function safeCode(error: unknown): string {
  const value = error instanceof Error ? error.message.toLowerCase() : '';
  return value.includes('auth')
    ? 'MAIL_AUTH_FAILED'
    : value.includes('timeout')
      ? 'MAIL_TIMEOUT'
      : 'MAIL_CONNECTION_FAILED';
}
async function verifyConnection(profile: MailConnectorSettings, secret: MailSecret): Promise<void> {
  const client = new ImapFlow({ host: profile.host, port: profile.port, secure: profile.secure, auth: secret.kind === 'oauth2-token' ? { user: profile.username, accessToken: secret.value } : { user: profile.username, pass: secret.value }, logger: false });
  try { await client.connect(); await client.mailboxOpen(profile.mailbox, { readOnly: true }); }
  finally { try { if (client.usable) await client.logout(); else client.close(); } catch { client.close(); } }
}
export const emailPlugin = new EmailPerceptionPlugin();
