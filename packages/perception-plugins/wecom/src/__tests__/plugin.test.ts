import { describe, expect, it, vi } from 'vitest';
import type { PerceptionPluginRuntimeContext } from '@originos/core/modules/perception-runtime/plugins';
import { WeComPerceptionPlugin } from '../plugin';
import type { WeComBotClient, WeComFrame } from '../types';

class FakeClient implements WeComBotClient {
  readonly listeners = new Map<string, (payload?: unknown) => void>();
  readonly connect = vi.fn();
  readonly disconnect = vi.fn();
  readonly replyStream = vi.fn(async () => undefined);
  on(event: string, listener: (payload?: unknown) => void): void {
    this.listeners.set(event, listener);
  }
  emit(event: string, payload?: unknown): void {
    this.listeners.get(event)?.(payload);
  }
}

function context(overrides: Partial<PerceptionPluginRuntimeContext> = {}): PerceptionPluginRuntimeContext {
  return {
    pluginId: 'originos.wecom',
    connectorId: 'connector-1',
    settings: { botId: 'bot-1', secretRef: 'credential-1' },
    ports: {
      credentials: {
        bind: vi.fn(), remove: vi.fn(), resolve: vi.fn().mockResolvedValue('secret-1'),
      },
      events: { submit: vi.fn().mockResolvedValue(undefined) },
      health: { report: vi.fn().mockResolvedValue(undefined) },
    },
    ...overrides,
  };
}

describe('WeComPerceptionPlugin', () => {
  it('starts and stops idempotently without exposing the secret', async () => {
    const client = new FakeClient();
    const factory = vi.fn(() => client);
    const plugin = new WeComPerceptionPlugin(factory);
    const host = context();

    await plugin.start(host);
    await plugin.start(host);
    expect(factory).toHaveBeenCalledTimes(1);
    expect(factory).toHaveBeenCalledWith({ botId: 'bot-1', secret: 'secret-1' });
    expect(client.connect).toHaveBeenCalledTimes(1);

    await plugin.stop(host);
    await plugin.stop(host);
    expect(client.disconnect).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(plugin.manifest)).not.toContain('secret-1');
  });

  it('submits both text and voice frames and reports reconnect health', async () => {
    const client = new FakeClient();
    const plugin = new WeComPerceptionPlugin(() => client);
    const host = context();
    await plugin.start(host);

    client.emit('reconnecting');
    client.emit('message.text', { body: { msgid: 'text-1', text: { content: 'hello' } } });
    client.emit('message.voice', { body: { msgid: 'voice-1', voice: { content: '你好' } } });
    await vi.waitFor(() => expect(host.ports.events?.submit).toHaveBeenCalledTimes(2));

    expect(host.ports.health?.report).toHaveBeenCalledWith(expect.objectContaining({
      detail: { connectionState: 'reconnecting', reconnectCount: 1 },
    }));
    expect(host.ports.events?.submit).toHaveBeenNthCalledWith(1, expect.objectContaining({
      sourceEventId: 'wecom-bot:text-1', content: { text: 'hello' },
    }));
    expect(host.ports.events?.submit).toHaveBeenNthCalledWith(2, expect.objectContaining({
      sourceEventId: 'wecom-bot:voice-1', content: { text: '你好' },
    }));
  });

  it('rejects missing settings with a redacted health code', async () => {
    const client = new FakeClient();
    const plugin = new WeComPerceptionPlugin(() => client);
    const host = context({ settings: {} });

    await expect(plugin.start(host)).rejects.toThrow('WECOM_BOT_ID_REQUIRED');
    expect(host.ports.credentials?.resolve).not.toHaveBeenCalled();
    expect(host.ports.health?.report).toHaveBeenCalledWith(expect.objectContaining({
      safeCode: 'WECOM_BOT_ID_REQUIRED',
    }));
  });

  it('reports authentication failures without exposing provider diagnostics', async () => {
    const client = new FakeClient();
    const plugin = new WeComPerceptionPlugin(() => client);
    const host = context();
    await plugin.start(host);

    client.emit('error', new Error('Authentication failed: invalid secret (code: 40001)'));

    expect(host.ports.health?.report).toHaveBeenCalledWith(expect.objectContaining({
      safeCode: 'WECOM_AUTH_FAILED',
      detail: { connectionState: 'disconnected', reconnectCount: 0 },
    }));
    expect(JSON.stringify(vi.mocked(host.ports.health!.report).mock.calls)).not.toContain('invalid secret');
  });

  it('replies to the original WeCom frame with the target final response', async () => {
    const client = new FakeClient();
    const plugin = new WeComPerceptionPlugin(() => client);
    const host = context();
    vi.mocked(host.ports.events!.submit).mockResolvedValue([{ status: 'dispatched', responseText: '最终回复', responseTexts: ['处理中', '最终回复'] }]);
    await plugin.start(host);
    const frame: WeComFrame = { headers: { req_id: 'request-1' }, body: { msgid: 'message-1', text: { content: '你好' } } };

    client.emit('message.text', frame);

    await vi.waitFor(() => expect(client.replyStream).toHaveBeenCalledTimes(2));
    expect(client.replyStream).toHaveBeenNthCalledWith(1, frame, expect.any(String), '处理中', false);
    expect(client.replyStream).toHaveBeenNthCalledWith(2, frame, expect.any(String), '最终回复', true);
  });

  it('registers an opaque reply handle and delivers Channel output through the SDK frame closure', async () => {
    const client = new FakeClient();
    const plugin = new WeComPerceptionPlugin(() => client);
    let deliver: ((event: import('@originos/core/modules/perception-runtime/plugins').PluginReplyEvent) => Promise<unknown>) | undefined;
    const unregister = vi.fn();
    const register = vi.fn((_handle: string, next: NonNullable<PerceptionPluginRuntimeContext['ports']['replies']>['register'] extends (...args: infer Args) => unknown ? Args[1] : never) => { deliver = next; return unregister; });
    const submit = vi.fn(async () => {
      await deliver?.({ type: 'assistant_message', content: '真实回复' });
      await deliver?.({ type: 'completed', resultRef: 'session://one' });
      return [{ status: 'dispatched' as const }];
    });
    const base = context();
    const host = context({ ports: { ...base.ports, events: { submit }, replies: { register } } });
    await plugin.start(host);
    const frame: WeComFrame = { headers: { req_id: 'request-2' }, body: { msgid: 'message-2', text: { content: '你好' } } };
    client.emit('message.text', frame);
    await vi.waitFor(() => expect(unregister).toHaveBeenCalledOnce());
    expect(register).toHaveBeenCalledWith('wecom-ws://connector-1/request-2', expect.any(Function));
    expect(client.replyStream).toHaveBeenNthCalledWith(1, frame, expect.any(String), '真实回复', false);
    expect(client.replyStream).toHaveBeenNthCalledWith(2, frame, expect.any(String), '', true);
  });
});
