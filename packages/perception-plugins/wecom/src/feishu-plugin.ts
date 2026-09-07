import type { FeishuSecrets } from '@originos/core/lib/integrations/perception';
import { FeishuAppConnector } from '@originos/core/lib/integrations/perception';
import type { PerceptionPlugin, PerceptionPluginManifest, PerceptionPluginRuntimeContext, PerceptionPluginWebhookRequest, PerceptionPluginWebhookResult } from '@originos/core/modules/perception-runtime/plugins';

export const feishuManifest: PerceptionPluginManifest = {
  id: 'originos.feishu', name: '飞书', version: '0.1.0', hostApi: '1.0', entry: '@originos/perception-plugin-wecom/feishu', source: 'feishu', transport: 'webhook',
  capabilities: ['inbound-events', 'callback-handshake', 'encrypted-payload', 'attachments'], permissions: ['credentials', 'events', 'health'],
  configurationSchema: { version: '1.0', fields: [
    { key: 'verificationTokenRef', label: 'Verification Token', type: 'password', required: true, sensitive: true },
    { key: 'encryptKeyRef', label: 'Encrypt Key', type: 'password', sensitive: true },
  ] },
};

export class FeishuPerceptionPlugin implements PerceptionPlugin {
  readonly manifest = feishuManifest;
  async start(context: PerceptionPluginRuntimeContext): Promise<void> { await context.ports.health?.report({ status: 'healthy', detail: { connectionState: 'connected' } }); }
  async stop(context: PerceptionPluginRuntimeContext): Promise<void> { await context.ports.health?.report({ status: 'disconnected', detail: { connectionState: 'disconnected' } }); }
  async handleWebhook(context: PerceptionPluginRuntimeContext, request: PerceptionPluginWebhookRequest): Promise<PerceptionPluginWebhookResult> {
    if (!context.ports.credentials || !context.ports.events) throw new Error('FEISHU_PLUGIN_PORT_MISSING');
    const tokenRef = setting(context, 'verificationTokenRef');
    if (!tokenRef) throw new Error('FEISHU_VERIFICATION_TOKEN_MISSING');
    const verificationToken = await context.ports.credentials.resolve(context.connectorId, tokenRef);
    const encryptRef = setting(context, 'encryptKeyRef');
    const encryptKey = encryptRef ? await context.ports.credentials.resolve(context.connectorId, encryptRef) : undefined;
    const connector = new FeishuAppConnector({ verificationToken, ...(encryptKey ? { encryptKey } : {}) } satisfies FeishuSecrets);
    const verified = await connector.verify(request.payload, { headers: request.headers, query: request.query, receivedAt: request.receivedAt, rawBody: request.rawBody });
    if (!verified.authenticated) return { status: 401, body: { success: false, error: 'FEISHU_AUTH_FAILED' } };
    const events = await connector.normalize(request.payload, { connectorId: context.connectorId, inboxRef: `perception://webhook/${context.connectorId}`, receivedAt: request.receivedAt });
    for (const event of events) await context.ports.events.submit(event);
    const ack = await connector.acknowledge(events, request.payload);
    return { status: ack.status, headers: ack.headers, body: ack.body };
  }
}
function setting(context: PerceptionPluginRuntimeContext, key: string): string | undefined { const value = context.settings[key]; return typeof value === 'string' && value.trim() ? value : undefined; }
export const feishuPlugin = new FeishuPerceptionPlugin();
