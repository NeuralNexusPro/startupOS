import { DingTalkStreamNormalizer, parseFrameData } from './normalizer';
import type { DingTalkStreamFrame } from './types';
import type { PerceptionPlugin, PerceptionPluginManifest, PerceptionPluginRuntimeContext, PerceptionPluginWebhookRequest, PerceptionPluginWebhookResult } from '@originos/core/modules/perception-runtime/plugins';

export const dingtalkManifest: PerceptionPluginManifest = {
  id: 'originos.dingtalk', name: '钉钉', version: '0.1.0', hostApi: '1.0', entry: '@originos/perception-plugin-dingtalk', source: 'dingtalk', transport: 'stream',
  capabilities: ['inbound-events', 'outbound-reply', 'attachments'], permissions: ['events', 'health'],
  configurationSchema: { version: '1.0', fields: [{ key: 'appId', label: 'App ID', type: 'text', required: true }] },
};
export class DingTalkPerceptionPlugin implements PerceptionPlugin {
  readonly manifest = dingtalkManifest;
  async start(context: PerceptionPluginRuntimeContext): Promise<void> { await context.ports.health?.report({ status: 'healthy', detail: { connectionState: 'connected' } }); }
  async stop(context: PerceptionPluginRuntimeContext): Promise<void> { await context.ports.health?.report({ status: 'disconnected', detail: { connectionState: 'disconnected' } }); }
  async handleWebhook(context: PerceptionPluginRuntimeContext, request: PerceptionPluginWebhookRequest): Promise<PerceptionPluginWebhookResult> {
    if (!context.ports.events) throw new Error('DINGTALK_EVENT_PORT_MISSING');
    const payload = request.payload;
    if (payload === null || Array.isArray(payload) || typeof payload !== 'object') return { status: 400, body: { success: false, error: 'DINGTALK_INVALID_FRAME' } };
    const rawData = payload.data;
    const frameData = typeof rawData === 'string' ? rawData : rawData !== null && !Array.isArray(rawData) && typeof rawData === 'object' ? parseFrameData(rawData) : {};
    const frame: DingTalkStreamFrame = { specVersion: stringValue(payload.specVersion) ?? '1.0', type: stringValue(payload.type) === 'CALLBACK' ? 'CALLBACK' : 'EVENT', headers: objectHeaders(payload.headers), data: frameData };
    const events = new DingTalkStreamNormalizer().normalize(frame, { connectorId: context.connectorId, inboxRef: `perception://webhook/${context.connectorId}`, receivedAt: request.receivedAt });
    for (const event of events) await context.ports.events.submit(event);
    return { status: 200, body: { status: 'SUCCESS' } };
  }
}
function stringValue(value: unknown): string | undefined { return typeof value === 'string' || typeof value === 'number' ? String(value) : undefined; }
function objectHeaders(value: unknown): DingTalkStreamFrame['headers'] { if (!value || Array.isArray(value) || typeof value !== 'object') return {}; const input = value as Record<string, unknown>; return { appId: stringValue(input.appId), connectionId: stringValue(input.connectionId), contentType: stringValue(input.contentType), messageId: stringValue(input.messageId), time: stringValue(input.time), topic: stringValue(input.topic) }; }
export const dingtalkPlugin = new DingTalkPerceptionPlugin();
