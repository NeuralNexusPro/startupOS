import * as lark from '@larksuiteoapi/node-sdk';
import type {
  PerceptionPlugin, PerceptionPluginManifest, PerceptionPluginProvisionContext, PerceptionPluginProvisionResult,
  PerceptionPluginRuntimeContext, PluginReplyEvent, PluginReplyReceipt,
} from '@originos/core/modules/perception-runtime/plugins';
import { normalizeFeishuMessage } from './normalizer';
import type { FeishuApiClient, FeishuMarkdownStreamController, FeishuSdkFactory, FeishuSdkFactoryOptions, FeishuSdkMessageEvent, FeishuSdkRuntime } from './types';

export const feishuManifest: PerceptionPluginManifest = {
  id: 'originos.feishu', name: '飞书机器人', version: '0.3.0', hostApi: '1.0', entry: '@originos/perception-plugin-feishu', source: 'feishu', transport: 'stream',
  capabilities: ['inbound-events', 'outbound-reply', 'attachments'], permissions: ['credentials', 'events', 'health', 'replies'],
  configurationSchema: { version: '1.0', fields: [
    { key: 'appId', label: 'App ID', type: 'text', required: true, help: '飞书开放平台应用凭证中的 App ID' },
    { key: 'appSecret', label: 'App Secret', type: 'password', required: true, sensitive: true },
    { key: 'domain', label: '服务区域', type: 'select', defaultValue: 'feishu', options: [{ value: 'feishu', label: '飞书（中国）' }, { value: 'lark', label: 'Lark（国际）' }] },
  ] },
};

interface FeishuCredentialBundle { appSecret: string }
interface RunningClient extends FeishuSdkRuntime { reconnectCount: number }

function defaultSdkFactory(options: FeishuSdkFactoryOptions): FeishuSdkRuntime {
  const domain = options.domain === 'lark' ? lark.Domain.Lark : lark.Domain.Feishu;
  const dispatcher = new lark.EventDispatcher({});
  const ws = new lark.WSClient({
    appId: options.appId, appSecret: options.appSecret, domain, autoReconnect: true, source: 'originos',
    onReady: options.onReady, onError: options.onError, onReconnecting: options.onReconnecting, onReconnected: options.onReconnected,
    handshakeTimeoutMs: 15_000, wsConfig: { pingTimeout: 10 },
  });
  const channel = lark.createLarkChannel({
    appId: options.appId, appSecret: options.appSecret, domain, source: 'originos',
    outbound: { streamThrottleMs: 250, streamThrottleChars: 24, streamInitialText: '正在思考…' },
  });
  return {
    ws, dispatcher,
    api: {
      replyText: async (messageId, chatId, content) => channel.send(chatId, { text: content }, { replyTo: messageId }),
      replyMarkdown: async (messageId, chatId, content) => channel.send(chatId, { markdown: content }, { replyTo: messageId }),
      streamReply: async (messageId, chatId, producer) => channel.stream(chatId, { markdown: producer }, { replyTo: messageId }),
    },
  };
}

export class FeishuPerceptionPlugin implements PerceptionPlugin {
  readonly manifest = feishuManifest;
  private readonly clients = new Map<string, RunningClient>();
  constructor(private readonly createSdk: FeishuSdkFactory = defaultSdkFactory) {}

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
        appId, appSecret: credentials.appSecret, domain,
        onReady: () => { void this.report(context, 'healthy', 'connected'); },
        onError: (error) => { void this.report(context, 'degraded', 'disconnected', safeCode(error)); },
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
    const event = normalizeFeishuMessage({ connectorId: context.connectorId, message });
    const unregister = context.ports.replies?.register(event.provenance.rawPayloadRef, this.replyDelivery(context.connectorId, api, message.message.message_id, message.message.chat_id));
    try { await context.ports.events.submit(event); }
    catch { await context.ports.health?.report({ status: 'degraded', safeCode: 'FEISHU_EVENT_SUBMIT_FAILED' }); }
    finally { unregister?.(); }
  }

  private replyDelivery(connectorId: string, api: FeishuApiClient, messageId: string, chatId: string): (event: PluginReplyEvent) => Promise<PluginReplyReceipt> {
    const stream = new FeishuStreamQueue();
    const state: { delta: string; sentAssistant: boolean; task?: Promise<FeishuStreamOutcome> } = { delta: '', sentAssistant: false };
    const ensureStream = (): void => {
      if (state.task) return;
      state.task = api.streamReply(messageId, chatId, (controller) => stream.consume(controller))
        .then((result) => ({ result }), (error: unknown) => ({ error }));
    };
    const finishStream = async (fallbackContent: string): Promise<PluginReplyReceipt> => {
      stream.close();
      const outcome = await state.task;
      if (outcome?.result) return receipt(connectorId, outcome.result.messageId);
      const fallback = await api.replyText(messageId, chatId, fallbackContent);
      return receipt(connectorId, fallback.messageId);
    };
    return async (event) => {
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
        const result = await safeMarkdownReply(api, messageId, chatId, event.content);
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
      const result = await safeMarkdownReply(api, messageId, chatId, content);
      return receipt(connectorId, result.messageId);
    };
  }

  private async resolveCredentials(context: PerceptionPluginRuntimeContext): Promise<FeishuCredentialBundle> {
    const secretRef = setting(context, 'secretRef'); if (!secretRef || !context.ports.credentials) throw new Error('FEISHU_CREDENTIALS_MISSING');
    const parsed = JSON.parse(await context.ports.credentials.resolve(context.connectorId, secretRef)) as { appSecret?: unknown };
    if (typeof parsed.appSecret !== 'string' || !parsed.appSecret) throw new Error('FEISHU_CREDENTIALS_INVALID');
    return { appSecret: parsed.appSecret };
  }

  private async report(context: PerceptionPluginRuntimeContext, status: 'healthy' | 'degraded', connectionState: 'connected' | 'reconnecting' | 'disconnected', code?: string): Promise<void> {
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

async function safeMarkdownReply(api: FeishuApiClient, messageId: string, chatId: string, content: string): Promise<{ messageId: string }> {
  try { return await api.replyMarkdown(messageId, chatId, content); }
  catch { return api.replyText(messageId, chatId, content); }
}

export const feishuPlugin = new FeishuPerceptionPlugin();
