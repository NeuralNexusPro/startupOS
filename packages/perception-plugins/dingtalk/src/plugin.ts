import { createHash } from 'node:crypto';
import { DingTalkStreamNormalizer, parseFrameData } from './normalizer';
import { DingTalkApi, type DingTalkRecipient } from './api';
import type { DingTalkStreamFrame } from './types';
import type { PluginSdkLogger, PerceptionPlugin, PerceptionPluginManifest, PerceptionPluginProvisionContext, PerceptionPluginProvisionResult, PerceptionPluginRuntimeContext, PerceptionPluginWebhookRequest, PerceptionPluginWebhookResult, PluginReplyEvent, PluginReplyReceipt } from '@originos/core/modules/perception-runtime/plugins';
import { DingTalkOfficeCapabilityProvider, type DingTalkOfficeCli } from './office-capabilities';

const loadSDK = () => import('dingtalk-stream');
const ROBOT_TOPIC = '/v1.0/im/bot/messages/get';

export const dingtalkManifest: PerceptionPluginManifest = {
  id: 'originos.dingtalk', name: '钉钉', version: '0.1.0', hostApi: '1.0', entry: '@originos/perception-plugin-dingtalk', source: 'dingtalk', transport: 'stream',
  capabilities: ['inbound-events', 'outbound-reply', 'outbound-files', 'office-capabilities'], permissions: ['credentials', 'events', 'health', 'replies', 'schedule', 'office-capabilities'],
  configurationSchema: { version: '1.0', fields: [
    { key: 'appId', label: 'Client ID（AppKey）', type: 'text', required: true },
    { key: 'appSecret', label: 'Client Secret', type: 'password', sensitive: true, required: true },
    { key: 'robotCode', label: '机器人编码', type: 'text', required: true },
  ] },
};
interface Runtime {
  stop: AbortController;
  client?: InstanceType<Awaited<ReturnType<typeof loadSDK>>['DWClient']>;
  api?: DingTalkApi;
  replies: Map<string, () => void>;
}
function setting(context: PerceptionPluginRuntimeContext, key: string): string {
  const value = context.settings[key];
  if (typeof value !== 'string' || !value.trim()) throw new Error('DINGTALK_CONFIGURATION_REQUIRED');
  return value.trim();
}
function sdkLog(context: PerceptionPluginRuntimeContext, level: keyof Pick<PluginSdkLogger, 'info' | 'warn' | 'error'>, args: unknown[]): void {
  try {
    if (context.ports.log?.sdkLogger) context.ports.log.sdkLogger[level](...args);
    else context.ports.log?.write({ level, stage: 'sdk', error: args.find(value => value instanceof Error) });
  } catch { /* SDK logging must not interrupt connection or callback handling. */ }
}
export class DingTalkPerceptionPlugin implements PerceptionPlugin {
  readonly manifest = dingtalkManifest;
  readonly officeCapabilities: DingTalkOfficeCapabilityProvider;
  private readonly runtimes = new Map<string, Runtime>();

  constructor(officeCli?: DingTalkOfficeCli) {
    this.officeCapabilities = new DingTalkOfficeCapabilityProvider(officeCli);
  }

  async provision(context: PerceptionPluginProvisionContext): Promise<PerceptionPluginProvisionResult> {
    const appId = setting(context, 'appId'); const robotCode = setting(context, 'robotCode');
    const secret = context.secrets.appSecret;
    if (!secret || !context.ports.credentials) throw new Error('DINGTALK_CREDENTIALS_REQUIRED');
    const ref = await context.ports.credentials.bind(context.connectorId, 'dingtalk', secret);
    return { settings: { appId, robotCode }, secretRefs: { credentials: ref } };
  }

  async start(context: PerceptionPluginRuntimeContext): Promise<void> {
    if (this.runtimes.has(context.connectorId)) return;
    const runtime: Runtime = { stop: new AbortController(), replies: new Map() };
    this.runtimes.set(context.connectorId, runtime);
    try {
      if (!context.ports.credentials || !context.ports.events || !context.ports.replies || !context.ports.schedule) throw new Error('DINGTALK_PLUGIN_PORT_MISSING');
      const appId = setting(context, 'appId'); setting(context, 'robotCode');
      const secret = await context.ports.credentials.resolve(context.connectorId, setting(context, 'secretRef'));
      if (runtime.stop.signal.aborted) return;
      runtime.api = new DingTalkApi(appId, secret, runtime.stop.signal);
      const { DWClient } = await loadSDK();
      if (runtime.stop.signal.aborted) return;
      const client = new DWClient({ clientId: appId, clientSecret: secret, subscriptions: [], keepAlive: true, debug: false, logger: {
        info: (...args: unknown[]) => sdkLog(context, 'info', args),
        warn: (...args: unknown[]) => sdkLog(context, 'warn', args),
        error: (...args: unknown[]) => sdkLog(context, 'error', args),
      } });
      runtime.client = client;
      client.registerCallbackListener(ROBOT_TOPIC, async frame => {
        try { await this.receive(context, runtime, { ...frame, type: 'CALLBACK' }, () => client.socketCallBackResponse(frame.headers.messageId, {})); }
        catch {
          try {
            if (!runtime.stop.signal.aborted) await context.ports.health?.report({ status: 'degraded', safeCode: 'DINGTALK_EVENT_FAILED' });
          } catch { /* Reporting must not reject the SDK callback. */ }
        }
      });
      const report = async () => {
        if (runtime.stop.signal.aborted) return;
        const healthy = client.connected && client.registered;
        await context.ports.health?.report({ status: healthy ? 'healthy' : 'disconnected', detail: { connectionState: healthy ? 'connected' : 'disconnected' } });
      };
      context.ports.schedule.every('connection-health', 5_000, report);
      await report();
      await client.connect();
      await report();
    } catch (error) {
      if (!runtime.stop.signal.aborted) {
        await this.stop(context);
        await context.ports.health?.report({ status: 'degraded', safeCode: 'DINGTALK_START_FAILED' });
        throw Object.assign(new Error('DINGTALK_START_FAILED'), { cause: error });
      }
    }
  }

  async stop(context: PerceptionPluginRuntimeContext): Promise<void> {
    const runtime = this.runtimes.get(context.connectorId);
    if (runtime) {
      runtime.stop.abort();
      runtime.client?.disconnect(); runtime.client?.removeAllListeners();
      for (const unregister of runtime.replies.values()) unregister();
      runtime.replies.clear();
      this.runtimes.delete(context.connectorId);
    }
    context.ports.schedule?.cancel('connection-health');
    await context.ports.health?.report({ status: 'disconnected', detail: { connectionState: 'disconnected' } });
  }

  private async receive(context: PerceptionPluginRuntimeContext, runtime: Runtime, frame: DingTalkStreamFrame, ack?: () => void): Promise<void> {
    if (runtime.stop.signal.aborted || frame.headers.topic !== ROBOT_TOPIC) return;
    const data = parseFrameData(frame.data);
    const robotCode = setting(context, 'robotCode');
    if (data.robotCode !== robotCode || typeof data.conversationId !== 'string' || !data.conversationId || !['1', '2'].includes(String(data.conversationType))) throw new Error('DINGTALK_RECIPIENT_INVALID');
    const recipient: DingTalkRecipient = { robotCode, conversationId: data.conversationId, conversationType: String(data.conversationType) as '1' | '2', senderStaffId: typeof data.senderStaffId === 'string' ? data.senderStaffId : undefined };
    if (recipient.conversationType === '1' && !recipient.senderStaffId) throw new Error('DINGTALK_RECIPIENT_INVALID');
    const stableId = String(data.msgId ?? frame.headers.messageId ?? '');
    if (!stableId) throw new Error('DINGTALK_MESSAGE_ID_REQUIRED');
    const hash = createHash('sha256').update(stableId).digest('hex');
    const handle = `perception://dingtalk/${context.connectorId}/${hash}`;
    const events = new DingTalkStreamNormalizer().normalize(frame, { connectorId: context.connectorId, inboxRef: handle, receivedAt: new Date().toISOString() });
    // A retry must not replace a running message's reply state.
    if (runtime.replies.has(handle)) {
      for (const event of events) await context.ports.events!.submit(event, { onAccepted: () => { if (!runtime.stop.signal.aborted) ack?.(); } });
      return;
    }
    let content = '';
    let finalSend: Promise<string> | undefined;
    const deliver = async (event: PluginReplyEvent): Promise<PluginReplyReceipt> => {
      if (runtime.stop.signal.aborted || !runtime.api) throw new Error('DINGTALK_SEND_CANCELLED');
      let messageId = hash;
      if (event.type === 'file') messageId = await runtime.api.sendFile(recipient, event.file, event.signal);
      else if (event.type === 'text_delta') content += event.delta;
      else if (event.type === 'assistant_message') content = event.content;
      else if (['completed', 'failed', 'cancelled'].includes(event.type)) {
        const notice = event.type === 'failed' ? '任务处理失败，请稍后重试。' : event.type === 'cancelled' ? '任务已取消。' : '';
        const text = notice ? [content, notice].filter(Boolean).join('\n\n') : content || '任务已完成。';
        finalSend ??= runtime.api.sendText(recipient, text);
        messageId = await finalSend;
      }
      return { messageId, connectorId: context.connectorId, status: 'delivered', attempt: 1, deliveredAt: new Date().toISOString() };
    };
    const unregister = context.ports.replies!.register(handle, deliver, { supportsFiles: true });
    runtime.replies.set(handle, unregister);
    try {
      for (const event of events) await context.ports.events!.submit(event, { onAccepted: () => { if (!runtime.stop.signal.aborted) ack?.(); } });
    } finally {
      if (runtime.replies.get(handle) === unregister) { unregister(); runtime.replies.delete(handle); }
    }
  }

  async handleWebhook(context: PerceptionPluginRuntimeContext, request: PerceptionPluginWebhookRequest): Promise<PerceptionPluginWebhookResult> {
    const runtime = this.runtimes.get(context.connectorId);
    if (!runtime || runtime.stop.signal.aborted) return { status: 503, body: { success: false } };
    try {
      const payload = request.payload;
      if (!payload || typeof payload !== 'object' || Array.isArray(payload) || !payload.headers || typeof payload.headers !== 'object' || Array.isArray(payload.headers) || typeof payload.data !== 'string') throw new Error('DINGTALK_INVALID_FRAME');
      const headers = payload.headers;
      await this.receive(context, runtime, { type: 'CALLBACK', specVersion: '1.0', headers: { topic: String(headers.topic ?? ''), messageId: String(headers.messageId ?? '') }, data: payload.data });
      return { status: 200, body: { status: 'SUCCESS' } };
    } catch { return { status: 400, body: { success: false, error: 'DINGTALK_INVALID_FRAME' } }; }
  }
}
export const dingtalkPlugin = new DingTalkPerceptionPlugin();
