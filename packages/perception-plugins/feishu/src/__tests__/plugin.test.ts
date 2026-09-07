import { describe, expect, it, vi } from 'vitest';
import type { PerceptionPluginRuntimeContext } from '@originos/core/modules/perception-runtime/plugins';
import { FeishuPerceptionPlugin, feishuManifest } from '../plugin';
import type { FeishuEventDispatcher, FeishuSdkFactory, FeishuSdkMessageEvent } from '../types';

const message: FeishuSdkMessageEvent = {
  event_id: 'event-1', create_time: '1788756000000', tenant_key: 'tenant-1',
  sender: { sender_id: { open_id: 'ou-user-1' }, sender_type: 'user' },
  message: { message_id: 'om-message-1', chat_id: 'oc-chat-1', chat_type: 'group', message_type: 'text', create_time: '1788756000000', content: JSON.stringify({ text: '你好 OriginOS' }) },
};

function context(overrides: Partial<PerceptionPluginRuntimeContext> = {}): PerceptionPluginRuntimeContext {
  return {
    pluginId: 'originos.feishu', connectorId: 'feishu-main', settings: { appId: 'cli_0123456789abcdef', domain: 'feishu', secretRef: 'credential-feishu' },
    ports: {
      credentials: { bind: vi.fn(), remove: vi.fn(), resolve: vi.fn(async () => JSON.stringify({ appSecret: 'app-secret' })) },
      events: { submit: vi.fn().mockResolvedValue([{ status: 'dispatched' }]) }, health: { report: vi.fn() },
    },
    ...overrides,
  };
}

function sdk() {
  let receive: ((event: FeishuSdkMessageEvent) => Promise<void> | void) | undefined;
  const ws = { start: vi.fn(async () => undefined), close: vi.fn() };
  const dispatcher: FeishuEventDispatcher = { register: vi.fn((handlers: { 'im.message.receive_v1'?: typeof receive }): FeishuEventDispatcher => { receive = handlers['im.message.receive_v1']; return dispatcher; }) };
  const streamed: string[] = [];
  const api = {
    replyText: vi.fn(async () => ({ messageId: 'text-reply-1' })),
    replyMarkdown: vi.fn(async () => ({ messageId: 'markdown-reply-1' })),
    streamReply: vi.fn(async (_messageId: string, _chatId: string, producer: Parameters<import('../types').FeishuApiClient['streamReply']>[2]) => {
      await producer({ append: async (chunk) => { streamed.push(chunk); }, setContent: async (content) => { streamed.push(`=${content}`); } });
      return { messageId: 'stream-reply-1' };
    }),
  };
  const factory = vi.fn((_options: Parameters<FeishuSdkFactory>[0]) => ({ ws, dispatcher, api })) satisfies FeishuSdkFactory;
  return { factory, ws, dispatcher, api, streamed, emit: async () => receive?.(message) };
}

describe('FeishuPerceptionPlugin WebSocket channel', () => {
  it('declares WebSocket transport with only App ID and App Secret credentials', () => {
    expect(feishuManifest).toMatchObject({ source: 'feishu', transport: 'stream', capabilities: expect.arrayContaining(['inbound-events', 'outbound-reply']) });
    expect(feishuManifest.capabilities).not.toContain('callback-handshake');
    expect(feishuManifest.configurationSchema.fields).toEqual(expect.arrayContaining([
      expect.objectContaining({ key: 'appId', type: 'text', required: true }),
      expect.objectContaining({ key: 'appSecret', type: 'password', required: true, sensitive: true }),
      expect.objectContaining({ key: 'domain', type: 'select' }),
    ]));
    expect(feishuManifest.configurationSchema.fields.map((field) => field.key)).not.toEqual(expect.arrayContaining(['verificationToken', 'encryptKey']));
  });

  it('starts and stops the official SDK client idempotently', async () => {
    const fake = sdk(); const plugin = new FeishuPerceptionPlugin(fake.factory); const host = context();
    await plugin.start(host); await plugin.start(host);
    expect(fake.factory).toHaveBeenCalledTimes(1);
    expect(fake.factory).toHaveBeenCalledWith(expect.objectContaining({ appId: 'cli_0123456789abcdef', appSecret: 'app-secret', domain: 'feishu' }));
    expect(fake.ws.start).toHaveBeenCalledWith({ eventDispatcher: fake.dispatcher });
    await plugin.stop(host); await plugin.stop(host);
    expect(fake.ws.close).toHaveBeenCalledTimes(1);
  });

  it('normalizes SDK messages and submits them through the event port', async () => {
    const fake = sdk(); const plugin = new FeishuPerceptionPlugin(fake.factory); const host = context();
    await plugin.start(host); await fake.emit();
    expect(host.ports.events?.submit).toHaveBeenCalledWith(expect.objectContaining({
      source: 'feishu', connectorId: 'feishu-main', content: { text: '你好 OriginOS' },
      actor: { externalId: 'ou-user-1' }, conversation: { externalId: 'oc-chat-1', kind: 'group' },
      provenance: expect.objectContaining({ rawPayloadRef: 'feishu-ws://feishu-main/om-message-1' }),
    }));
  });

  it('reports SDK ready, reconnecting and authentication failures with safe health data', async () => {
    const fake = sdk(); const plugin = new FeishuPerceptionPlugin(fake.factory); const host = context();
    await plugin.start(host);
    const options = fake.factory.mock.calls[0]?.[0];
    options?.onReady(); options?.onReconnecting(); options?.onError(new Error('invalid app secret'));
    expect(host.ports.health?.report).toHaveBeenCalledWith(expect.objectContaining({ status: 'healthy', detail: expect.objectContaining({ connectionState: 'connected' }) }));
    expect(host.ports.health?.report).toHaveBeenCalledWith(expect.objectContaining({ status: 'degraded', detail: expect.objectContaining({ connectionState: 'reconnecting' }) }));
    expect(host.ports.health?.report).toHaveBeenCalledWith(expect.objectContaining({ safeCode: 'FEISHU_AUTH_FAILED' }));
  });

  it('renders a non-streamed assistant message as Markdown through the official SDK', async () => {
    const fake = sdk(); let deliver: ((event: import('@originos/core/modules/perception-runtime/plugins').PluginReplyEvent) => Promise<unknown>) | undefined;
    const register = vi.fn((_handle: string, next: Parameters<NonNullable<PerceptionPluginRuntimeContext['ports']['replies']>['register']>[1]) => { deliver = next; return vi.fn(); });
    const base = context();
    const submit = vi.fn(async () => { await deliver?.({ type: 'assistant_message', content: '**完成**\n- 第一条' }); return [{ status: 'dispatched' as const }]; });
    const host = context({ ports: { ...base.ports, events: { submit }, replies: { register } } });
    const plugin = new FeishuPerceptionPlugin(fake.factory); await plugin.start(host); await fake.emit();
    expect(register).toHaveBeenCalledWith('feishu-ws://feishu-main/om-message-1', expect.any(Function));
    expect(fake.api.replyMarkdown).toHaveBeenCalledWith('om-message-1', 'oc-chat-1', '**完成**\n- 第一条');
  });

  it('streams text deltas into one Markdown card and does not duplicate the final assistant message', async () => {
    const fake = sdk(); let deliver: ((event: import('@originos/core/modules/perception-runtime/plugins').PluginReplyEvent) => Promise<unknown>) | undefined;
    const register = vi.fn((_handle: string, next: Parameters<NonNullable<PerceptionPluginRuntimeContext['ports']['replies']>['register']>[1]) => { deliver = next; return vi.fn(); });
    const base = context();
    const submit = vi.fn(async () => {
      await deliver?.({ type: 'text_delta', delta: '**流式' });
      await deliver?.({ type: 'text_delta', delta: '回复**' });
      await deliver?.({ type: 'assistant_message', content: '**流式回复**' });
      await deliver?.({ type: 'completed', resultRef: 'session://done' });
      return [{ status: 'dispatched' as const }];
    });
    const host = context({ ports: { ...base.ports, events: { submit }, replies: { register } } });
    const plugin = new FeishuPerceptionPlugin(fake.factory); await plugin.start(host); await fake.emit();
    expect(fake.api.streamReply).toHaveBeenCalledTimes(1);
    expect(fake.streamed).toEqual(['**流式', '回复**', '=**流式回复**']);
    expect(fake.api.replyMarkdown).not.toHaveBeenCalled();
    expect(fake.api.replyText).not.toHaveBeenCalled();
  });

  it('falls back to a complete text reply when CardKit streaming fails', async () => {
    const fake = sdk(); fake.api.streamReply.mockRejectedValueOnce(new Error('card permission denied'));
    let deliver: ((event: import('@originos/core/modules/perception-runtime/plugins').PluginReplyEvent) => Promise<unknown>) | undefined;
    const register = vi.fn((_handle: string, next: Parameters<NonNullable<PerceptionPluginRuntimeContext['ports']['replies']>['register']>[1]) => { deliver = next; return vi.fn(); });
    const base = context();
    const submit = vi.fn(async () => {
      await deliver?.({ type: 'text_delta', delta: '完整回复' });
      await deliver?.({ type: 'completed', resultRef: 'session://done' });
      return [{ status: 'dispatched' as const }];
    });
    const host = context({ ports: { ...base.ports, events: { submit }, replies: { register } } });
    const plugin = new FeishuPerceptionPlugin(fake.factory); await plugin.start(host); await fake.emit();
    expect(fake.api.replyText).toHaveBeenCalledWith('om-message-1', 'oc-chat-1', '完整回复');
  });
});
