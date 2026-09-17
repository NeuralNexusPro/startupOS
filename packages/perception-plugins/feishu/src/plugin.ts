import * as lark from '@larksuiteoapi/node-sdk';
import type {
  PerceptionPlugin, PerceptionPluginManifest, PerceptionPluginProvisionContext, PerceptionPluginProvisionResult,
  PerceptionPluginRuntimeContext, PluginReplyEvent, PluginReplyReceipt,
} from '@originos/core/modules/perception-runtime/plugins';
import { normalizeFeishuMessage } from './normalizer';
import { FeishuOfficeCapabilityProvider, type FeishuOfficeCli } from './office-capabilities';
import type { FeishuApiClient, FeishuMarkdownStreamController, FeishuSdkFactory, FeishuSdkFactoryOptions, FeishuSdkMessageEvent, FeishuSdkRuntime } from './types';

export const feishuManifest: PerceptionPluginManifest = {
  id: 'originos.feishu', name: '飞书机器人', version: '0.3.0', hostApi: '1.0', entry: '@originos/perception-plugin-feishu', source: 'feishu', transport: 'stream',
  capabilities: ['inbound-events', 'outbound-reply', 'outbound-files', 'attachments', 'office-capabilities'], permissions: ['credentials', 'events', 'health', 'replies', 'office-capabilities'],
  configurationSchema: { version: '1.0', fields: [
    { key: 'appId', label: 'App ID', type: 'text', required: true, help: '飞书开放平台应用凭证中的 App ID' },
    { key: 'appSecret', label: 'App Secret', type: 'password', required: true, sensitive: true },
    { key: 'domain', label: '服务区域', type: 'select', defaultValue: 'feishu', options: [{ value: 'feishu', label: '飞书（中国）' }, { value: 'lark', label: 'Lark（国际）' }] },
    { key: 'officeCapabilitiesEnabled', label: '启用飞书办公能力', type: 'boolean', defaultValue: false, help: '使用独立的 lark-cli 用户授权，不使用机器人 App Secret' },
    { key: 'officeAllowedActorIds', label: '办公能力授权发送者 ID', type: 'text', defaultValue: '', help: '多个 ID 用逗号分隔；留空时全部拒绝' },
    { key: 'officeWriteEnabled', label: '允许办公写操作', type: 'boolean', defaultValue: false, help: '仅对白名单发送者生效；破坏性操作仍禁止' },
  ] },
};

interface FeishuCredentialBundle { appSecret: string }
interface RunningClient extends FeishuSdkRuntime { reconnectCount: number }

function defaultSdkFactory(options: FeishuSdkFactoryOptions): FeishuSdkRuntime {
  const domain = options.domain === 'lark' ? lark.Domain.Lark : lark.Domain.Feishu;
  const dispatcher = new lark.EventDispatcher({ logger: options.logger });
  const client = new lark.Client({ appId: options.appId, appSecret: options.appSecret, domain, logger: options.logger });
  const ws = new lark.WSClient({
    appId: options.appId, appSecret: options.appSecret, domain, logger: options.logger, autoReconnect: true, source: 'originos',
    onReady: options.onReady, onError: options.onError, onReconnecting: options.onReconnecting, onReconnected: options.onReconnected,
    handshakeTimeoutMs: 15_000, wsConfig: { pingTimeout: 10 },
  });
  const channel = lark.createLarkChannel({
    appId: options.appId, appSecret: options.appSecret, domain, logger: options.logger, source: 'originos',
    outbound: { streamThrottleMs: 250, streamThrottleChars: 24, streamInitialText: '正在思考…' },
  });
  return {
    ws, dispatcher,
    api: {
      replyFile: async (messageId, _chatId, file, assertActive) => {
        assertActive();
        const uploaded = await client.im.v1.file.create({ data: { file_type: 'stream', file_name: file.fileName, file: Buffer.from(file.bytes) } });
        assertActive();
        const response = uploaded as { file_key?: string; data?: { file_key?: string } } | null;
        const fileKey = response?.file_key ?? response?.data?.file_key;
        if (!fileKey) throw new Error('IM_FILE_SEND_UNCONFIRMED');
        const result = await client.im.v1.message.reply({ path: { message_id: messageId }, data: { msg_type: 'file', content: JSON.stringify({ file_key: fileKey }) } });
        if ((result.code !== undefined && result.code !== 0) || !result.data?.message_id) throw new Error('IM_FILE_SEND_UNCONFIRMED');
        return { messageId: result.data.message_id };
      },
      replyText: async (messageId, chatId, content) => channel.send(chatId, { text: content }, { replyTo: messageId }),
      replyMarkdown: async (messageId, chatId, content) => channel.send(chatId, { markdown: content }, { replyTo: messageId }),
      streamReply: async (messageId, chatId, producer) => channel.stream(chatId, { markdown: producer }, { replyTo: messageId }),
    },
  };
}

export class FeishuPerceptionPlugin implements PerceptionPlugin {
  readonly manifest = feishuManifest;
  readonly officeCapabilities: FeishuOfficeCapabilityProvider;
  private readonly clients = new Map<string, RunningClient>();
  constructor(private readonly createSdk: FeishuSdkFactory = defaultSdkFactory, officeCli?: FeishuOfficeCli) {
    this.officeCapabilities = new FeishuOfficeCapabilityProvider(officeCli);
  }

  async provision(context: PerceptionPluginProvisionContext): Promise<PerceptionPluginProvisionResult> {
    if (!context.ports.credentials) throw new Error('FEISHU_CREDENTIAL_PORT_MISSING');
    const appId = setting(context, 'appId'); const appSecret = context.secrets.appSecret; const domain = parseDomain(context.settings.domain);
    if (!appId || !isAppId(appId) || !appSecret) throw new Error('FEISHU_REQUIRED_CONFIGURATION_MISSING');
    const secretRef = await context.ports.credentials.bind(context.connectorId, 'feishu', JSON.stringify({ appSecret } satisfies FeishuCredentialBundle));
    return { settings: { appId, domain }, secretRefs: { credentials: secretRef } };
  }

  async start(context: PerceptionPluginRuntimeContext): Promise<void> {
    if (this.clients.has(context.connectorId)) return;
    try {
      if (!context.ports.events || !context.ports.credentials) throw new Error('FEISHU_PLUGIN_PORT_MISSING');
      const appId = setting(context, 'appId'); const credentials = await this.resolveCredentials(context); const domain = parseDomain(context.settings.domain);
      if (!appId || !isAppId(appId)) throw new Error('FEISHU_APP_ID_REQUIRED');
      const runtime = this.createSdk({
        appId, appSecret: credentials.appSecret, domain, logger: context.ports.log?.sdkLogger,
        onReady: () => { void this.report(context, 'healthy', 'connected'); },
        onError: (error) => { context.ports.log?.write({ level: 'error', stage: 'connection.error', safeCode: safeCode(error), error }); void this.report(context, 'degraded', 'disconnected', safeCode(error)); },
        onReconnecting: () => { const client = this.clients.get(context.connectorId); if (client) client.reconnectCount += 1; void this.report(context, 'degraded', 'reconnecting'); },
        onReconnected: () => { void this.report(context, 'healthy', 'connected'); },
      });
      runtime.dispatcher.register({ 'im.message.receive_v1': (message) => this.submit(context, runtime.api, message) });
      this.clients.set(context.connectorId, { ...runtime, reconnectCount: 0 });
      await runtime.ws.start({ eventDispatcher: runtime.dispatcher });
    } catch (error) {
      await context.ports.health?.report({ status: 'degraded', safeCode: safeCode(error) });
      throw error;
    }
  }

  async stop(context: PerceptionPluginRuntimeContext): Promise<void> {
    const runtime = this.clients.get(context.connectorId); this.clients.delete(context.connectorId);
    runtime?.ws.close({ force: true });
    if (runtime) await context.ports.health?.report({ status: 'disconnected', detail: { connectionState: 'disconnected', reconnectCount: runtime.reconnectCount } });
  }

  private async submit(context: PerceptionPluginRuntimeContext, api: FeishuApiClient, message: FeishuSdkMessageEvent): Promise<void> {
    if (!context.ports.events) return;
    let unregister: (() => void) | undefined;
    let submitted = false;
    let eventId: string | undefined;
    try {
      const event = normalizeFeishuMessage({ connectorId: context.connectorId, message });
      eventId = event.id;
      unregister = context.ports.replies?.register(event.provenance.rawPayloadRef, this.replyDelivery(context, event.id, api, message.message.message_id, message.message.chat_id), { supportsFiles: true });
      submitted = true;
      await context.ports.events.submit(event);
    } catch (error) {
      if (!submitted) context.ports.log?.write({ level: 'error', stage: 'receive', safeCode: 'FEISHU_RECEIVE_FAILED', eventId, error });
      await context.ports.health?.report({ status: 'degraded', safeCode: 'FEISHU_EVENT_SUBMIT_FAILED' });
    } finally { unregister?.(); }
  }

  private replyDelivery(context: PerceptionPluginRuntimeContext, eventId: string, api: FeishuApiClient, messageId: string, chatId: string): (event: PluginReplyEvent) => Promise<PluginReplyReceipt> {
    const connectorId = context.connectorId;
    let sessionId: string | undefined;
    const logFailure = (stage: string, error: unknown): void => {
      context.ports.log?.write({ level: 'error', stage, safeCode: 'FEISHU_REPLY_FAILED', eventId, sessionId, error });
    };
    const stream = new FeishuStreamQueue();
    const state: { delta: string; sentAssistant: boolean; task?: Promise<FeishuStreamOutcome> } = { delta: '', sentAssistant: false };
    const ensureStream = (): void => {
      if (state.task) return;
      state.task = api.streamReply(messageId, chatId, (controller) => stream.consume(controller))
        .then((result) => ({ result }), (error: unknown) => { logFailure('reply.stream', error); return { error }; });
    };
    const finishStream = async (fallbackContent: string): Promise<PluginReplyReceipt> => {
      stream.close();
      const outcome = await state.task;
      if (outcome?.result) return receipt(connectorId, outcome.result.messageId);
      const fallback = await api.replyText(messageId, chatId, fallbackContent);
      return receipt(connectorId, fallback.messageId);
    };
    const deliver = async (event: PluginReplyEvent): Promise<PluginReplyReceipt> => {
      if (event.type === 'file') {
        const assertActive = () => {
          event.signal?.throwIfAborted();
          if (this.clients.get(connectorId)?.api !== api) throw new Error('IM_FILE_REPLY_UNAVAILABLE');
        };
        assertActive();
        if (!event.file.bytes.byteLength) throw new Error('IM_FILE_NOT_NONEMPTY_REGULAR_FILE');
        if (event.file.bytes.byteLength > 20_000_000) throw new Error('IM_FILE_TOO_LARGE');
        const result = await api.replyFile(messageId, chatId, event.file, assertActive);
        return receipt(connectorId, result.messageId);
      }
      if (event.type === 'text_delta') {
        state.delta += event.delta;
        ensureStream();
        stream.push({ type: 'append', content: event.delta });
        return receipt(connectorId, 'streaming');
      }
      if (event.type === 'assistant_message') {
        state.sentAssistant = true;
        if (state.task) {
          state.delta = event.content;
          stream.push({ type: 'set', content: event.content });
          return receipt(connectorId, 'streaming');
        }
        const result = await safeMarkdownReply(api, messageId, chatId, event.content, logFailure);
        return receipt(connectorId, result.messageId);
      }
      if (event.type === 'completed' && state.task) {
        return finishStream(state.delta);
      }
      let content: string | undefined;
      if (event.type === 'hitl_request') content = `需要人工确认：${event.summary}`;
      if (event.type === 'failed') content = `处理失败：${event.safeCode}`;
      if (event.type === 'cancelled') content = '任务已取消';
      if (event.type === 'completed' && !state.sentAssistant && state.delta.trim()) content = state.delta;
      if (!content) return receipt(connectorId, 'internal');
      if (state.task && (event.type === 'failed' || event.type === 'cancelled')) {
        const finalContent = state.delta.trim() ? `${state.delta}\n\n${content}` : content;
        state.delta = finalContent;
        stream.push({ type: 'set', content: finalContent });
        return finishStream(finalContent);
      }
      const result = await safeMarkdownReply(api, messageId, chatId, content, logFailure);
      return receipt(connectorId, result.messageId);
    };
    return async (event) => {
      if (event.type === 'accepted') sessionId = event.sessionId;
      try { return await deliver(event); }
      catch (error) { logFailure('reply', error); throw error; }
    };
  }

  private async resolveCredentials(context: PerceptionPluginRuntimeContext): Promise<FeishuCredentialBundle> {
    const secretRef = setting(context, 'secretRef'); if (!secretRef || !context.ports.credentials) throw new Error('FEISHU_CREDENTIALS_MISSING');
    const parsed = JSON.parse(await context.ports.credentials.resolve(context.connectorId, secretRef)) as { appSecret?: unknown };
    if (typeof parsed.appSecret !== 'string' || !parsed.appSecret) throw new Error('FEISHU_CREDENTIALS_INVALID');
    return { appSecret: parsed.appSecret };
  }

  private async report(context: PerceptionPluginRuntimeContext, status: 'healthy' | 'degraded', connectionState: 'connected' | 'reconnecting' | 'disconnected', code?: string): Promise<void> {
    context.ports.log?.write({ level: status === 'healthy' ? 'info' : 'warn', stage: `connection.${connectionState}`, safeCode: code });
    const runtime = this.clients.get(context.connectorId);
    await context.ports.health?.report({ status, safeCode: code, detail: { connectionState, reconnectCount: runtime?.reconnectCount ?? 0, ...(status === 'healthy' ? { lastSuccessAt: new Date().toISOString() } : {}) } });
  }
}

function setting(context: PerceptionPluginRuntimeContext | PerceptionPluginProvisionContext, key: string): string | undefined { const value = context.settings[key]; return typeof value === 'string' && value.trim() ? value.trim() : undefined; }
function parseDomain(value: unknown): 'feishu' | 'lark' { return value === 'lark' ? 'lark' : 'feishu'; }
function isAppId(value: string): boolean { return /^cli_[0-9a-fA-F]{16}$/.test(value); }
function receipt(connectorId: string, messageId: string): PluginReplyReceipt { return { messageId, connectorId, status: 'delivered', attempt: 1, deliveredAt: new Date().toISOString() }; }
function safeCode(error: unknown): string { const value = error instanceof Error ? error.message.toLowerCase() : ''; return value.includes('secret') || value.includes('auth') || value.includes('401') ? 'FEISHU_AUTH_FAILED' : value.includes('timeout') ? 'FEISHU_NETWORK_TIMEOUT' : 'FEISHU_CONNECTION_FAILED'; }

type FeishuStreamOperation = { type: 'append' | 'set'; content: string };
type FeishuStreamOutcome = { result?: { messageId: string }; error?: unknown };

class FeishuStreamQueue {
  private readonly pending: FeishuStreamOperation[] = [];
  private readonly waiters: Array<(operation: FeishuStreamOperation | undefined) => void> = [];
  private closed = false;

  push(operation: FeishuStreamOperation): void {
    if (this.closed) return;
    const waiter = this.waiters.shift();
    if (waiter) waiter(operation);
    else this.pending.push(operation);
  }

  close(): void {
    this.closed = true;
    for (const waiter of this.waiters.splice(0)) waiter(undefined);
  }

  async consume(controller: FeishuMarkdownStreamController): Promise<void> {
    while (true) {
      const operation = await this.next();
      if (!operation) return;
      if (operation.type === 'append') await controller.append(operation.content);
      else await controller.setContent(operation.content);
    }
  }

  private next(): Promise<FeishuStreamOperation | undefined> {
    const operation = this.pending.shift();
    if (operation) return Promise.resolve(operation);
    if (this.closed) return Promise.resolve(undefined);
    return new Promise((resolve) => { this.waiters.push(resolve); });
  }
}

async function safeMarkdownReply(api: FeishuApiClient, messageId: string, chatId: string, content: string, logFailure: (stage: string, error: unknown) => void): Promise<{ messageId: string }> {
  try { return await api.replyMarkdown(messageId, chatId, content); }
  catch (error) { logFailure('reply.markdown', error); return api.replyText(messageId, chatId, content); }
}

export const feishuPlugin = new FeishuPerceptionPlugin();
