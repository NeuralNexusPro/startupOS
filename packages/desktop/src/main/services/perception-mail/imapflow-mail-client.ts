import { ImapFlow } from 'imapflow';
import type { MailClientPort, MailConnectionErrorCode, MailConnectionTestResult } from '../../../../../core/src/types/perception';
import { fingerprintMailProfile } from '../../../../../core/src/lib/integrations/perception/email';

export class ImapFlowMailClient implements MailClientPort {
  async testConnection(input: Parameters<MailClientPort['testConnection']>[0]): Promise<MailConnectionTestResult> {
    const auth = input.secret.kind === 'oauth2-token'
      ? { user: input.profile.username, accessToken: input.secret.value }
      : { user: input.profile.username, pass: input.secret.value };
    const client = new ImapFlow({ host: input.profile.host, port: input.profile.port, secure: input.profile.secure, auth, logger: false, connectionTimeout: input.timeoutMs, greetingTimeout: input.timeoutMs, socketTimeout: input.timeoutMs });
    const timeout = new Promise<never>((_resolve, reject) => { const timer = setTimeout(() => reject(new Error('MAIL_TEST_TIMEOUT')), input.timeoutMs); timer.unref(); });
    try {
      await Promise.race([client.connect(), timeout]);
      const mailbox = await Promise.race([client.mailboxOpen(input.profile.mailbox, { readOnly: true }), timeout]);
      return { success: true, receipt: { connectorId: input.connectorId, profileFingerprint: fingerprintMailProfile(input.profile), verifiedAt: new Date().toISOString(), capabilities: [...client.capabilities].map(String).sort().slice(0, 100), mailbox: mailbox.path } };
    } catch (error) {
      return { success: false, code: toMailConnectionErrorCode(error) };
    } finally {
      try { if (client.usable) await client.logout(); else client.close(); } catch { client.close(); }
    }
  }
}

export function toMailConnectionErrorCode(error: unknown): MailConnectionErrorCode {
  const value = error as { code?: unknown; authenticationFailed?: unknown; message?: unknown };
  const code = typeof value?.code === 'string' ? value.code : '';
  const message = typeof value?.message === 'string' ? value.message : '';
  if (message === 'MAIL_TEST_TIMEOUT' || code === 'ETIMEDOUT' || code === 'ESOCKETTIMEDOUT') return 'TIMEOUT';
  if (value?.authenticationFailed === true || /AUTHENTICATIONFAILED|Invalid credentials/i.test(message)) return 'AUTH_FAILED';
  if (/mailbox|NONEXISTENT/i.test(message)) return 'MAILBOX_NOT_FOUND';
  if (code.startsWith('ERR_TLS') || /certificate|TLS/i.test(message)) return 'TLS_FAILED';
  if (code === 'ENOTFOUND' || code === 'EAI_AGAIN') return 'DNS_FAILED';
  return 'CONNECTION_FAILED';
}
