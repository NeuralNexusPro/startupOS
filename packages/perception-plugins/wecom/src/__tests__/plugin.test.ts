import { describe, expect, it, vi } from 'vitest';
import type { PerceptionPluginRuntimeContext, PluginReplyEvent } from '@originos/core/modules/perception-runtime/plugins';
import { WeComPerceptionPlugin } from '../plugin';
import type { WeComBotClient, WeComFrame } from '../types';

class FakeClient implements WeComBotClient {
  readonly listeners = new Map<string, (payload?: unknown) => void>();
  readonly connect = vi.fn();
  readonly disconnect = vi.fn();
  readonly downloadFile = vi.fn(async () => ({ buffer: Buffer.from('file-content'), filename: 'report.pdf' }));
  readonly uploadMedia = vi.fn(async () => ({ media_id: 'media-test' }));
  readonly replyMedia = vi.fn(async () => ({}));
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

  it('downloads a file message into host storage before submitting it', async () => {
    const client = new FakeClient();
    const plugin = new WeComPerceptionPlugin(() => client);
    const base = context();
    const store = vi.fn().mockResolvedValue('data/perception/attachments/connector-1/id/report.pdf');
    const host = context({ ports: { ...base.ports, attachments: { store } } });
    await plugin.start(host);

    client.emit('message.file', { body: {
      msgid: 'file-1', file: { url: 'https://download.example/file', aeskey: 'key' },
    } });

    await vi.waitFor(() => expect(host.ports.events?.submit).toHaveBeenCalledOnce());
    expect(client.downloadFile).toHaveBeenCalledWith('https://download.example/file', 'key');
    expect(store).toHaveBeenCalledWith('connector-1', {
      fileName: 'report.pdf', bytes: Buffer.from('file-content'),
    });
    expect(host.ports.events?.submit).toHaveBeenCalledWith(expect.objectContaining({
      sourceEventId: 'wecom-bot:file-1',
      content: {
        text: '[文件] report.pdf',
        attachmentRefs: ['data/perception/attachments/connector-1/id/report.pdf'],
      },
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
      await deliver?.({ type: 'accepted', sessionId: 'session-one' });
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
    expect(register).toHaveBeenCalledWith('wecom-ws://connector-1/request-2', expect.any(Function), { supportsFiles: true });
    expect(client.replyStream).toHaveBeenNthCalledWith(1, frame, expect.any(String), '正在处理中…', false);
    expect(client.replyStream).toHaveBeenNthCalledWith(2, frame, expect.any(String), '真实回复', false);
    expect(client.replyStream).toHaveBeenNthCalledWith(3, frame, expect.any(String), '真实回复', true);
  });

  it('keeps cumulative delta content in the final WeCom stream frame', async () => {
    const client = new FakeClient();
    const plugin = new WeComPerceptionPlugin(() => client);
    let deliver: ((event: import('@originos/core/modules/perception-runtime/plugins').PluginReplyEvent) => Promise<unknown>) | undefined;
    const register = vi.fn((_handle: string, next: NonNullable<PerceptionPluginRuntimeContext['ports']['replies']>['register'] extends (...args: infer Args) => unknown ? Args[1] : never) => {
      deliver = next;
      return vi.fn();
    });
    const submit = vi.fn(async () => {
      await deliver?.({ type: 'accepted', sessionId: 'session-delta' });
      await deliver?.({ type: 'text_delta', delta: '你' });
      await deliver?.({ type: 'text_delta', delta: '好' });
      await deliver?.({ type: 'completed', resultRef: 'session://one' });
      return [{ status: 'dispatched' as const }];
    });
    const base = context();
    const host = context({ ports: { ...base.ports, events: { submit }, replies: { register } } });
    await plugin.start(host);
    const frame: WeComFrame = { headers: { req_id: 'request-delta' }, body: { msgid: 'message-delta', text: { content: 'hi' } } };

    client.emit('message.text', frame);

    await vi.waitFor(() => expect(client.replyStream).toHaveBeenCalledTimes(3));
    expect(client.replyStream).toHaveBeenNthCalledWith(1, frame, expect.any(String), '正在处理中…', false);
    expect(client.replyStream).toHaveBeenNthCalledWith(2, frame, expect.any(String), '你', false);
    expect(client.replyStream).toHaveBeenNthCalledWith(3, frame, expect.any(String), '你好', true);
  });
});

it.each(['success', 'upload-failure', 'send-failure', 'stop', 'cancel'])('files await upload and ACK safely (%s)', async (mode) => {
 const client = new FakeClient(); const plugin = new WeComPerceptionPlugin(() => client); const base = context();
 const signal = new AbortController(); const bytes = new Uint8Array([1,2,3]);
 let delivery: ((event: import('@originos/core/modules/perception-runtime/plugins').PluginReplyEvent) => Promise<unknown>) | undefined;
 let finish!: () => void;
 const pending = new Promise<void>((resolve) => { finish = resolve; });
 const host = context({ ports: { ...base.ports, events:{submit:async()=>{await pending;return[];}},replies:{register:vi.fn((_handle,next)=>{delivery=next;return vi.fn();})} } });
 await plugin.start(host); client.emit('message.text',{headers:{req_id:'file-request'},body:{msgid:'file-message',text:{content:'file'}}});
 await vi.waitFor(()=>expect(delivery).toBeDefined());
 client.uploadMedia.mockImplementationOnce(async()=>{
   if(mode==='upload-failure')throw new Error('failed');
   if(mode==='stop')await plugin.stop(host);
   if(mode==='cancel')signal.abort();
   return {media_id:'media-test'};
 });
 if(mode==='send-failure')client.replyMedia.mockRejectedValueOnce(new Error('failed'));
 const result=delivery!({type:'file',file:{fileName:'report.pdf',bytes},signal:signal.signal});
 if(mode==='success')await expect(result).resolves.toMatchObject({status:'delivered'});else await expect(result).rejects.toBeDefined();
 expect(client.uploadMedia).toHaveBeenCalledWith(Buffer.from(bytes),{type:'file',filename:'report.pdf'});
 expect(client.replyMedia).toHaveBeenCalledTimes(['success','send-failure'].includes(mode)?1:0);
 if(mode==='success')expect(client.replyMedia).toHaveBeenCalledWith(expect.objectContaining({headers:{req_id:'file-request'}}),'file','media-test');
 finish(); await plugin.stop(host);
});


it.each([
  { event: { type: 'text_delta', delta: '-next' }, expected: 'base-next', finish: false },
  { event: { type: 'assistant_message', content: 'replacement' }, expected: 'replacement', finish: false },
  { event: { type: 'hitl_request', summary: 'confirm', requestId: 'request-1' }, expected: '需要人工确认：confirm', finish: false },
  { event: { type: 'failed', safeCode: 'FAILED' }, expected: 'FAILED', finish: true },
  { event: { type: 'cancelled' }, expected: '任务已取消', finish: true },
] satisfies { event: PluginReplyEvent; expected: string; finish: boolean }[])(
  'commits $event.type content only after ACK and retries identical text',
  async ({ event, expected, finish }) => {
    const deliveryEvent = event.type === 'text_delta' ? { type: 'text_delta' as const, delta: 'x'.repeat(160) } : event;
    const deliveryContent = event.type === 'text_delta' ? `base${'x'.repeat(160)}` : expected;
    const client = new FakeClient();
    const plugin = new WeComPerceptionPlugin(() => client);
    const base = context();
    let deliver!: (event: PluginReplyEvent) => Promise<unknown>;
    let finishSubmit!: () => void;
    const pending = new Promise<void>((resolve) => { finishSubmit = resolve; });
    const host = context({ ports: {
      ...base.ports,
      events: { submit: async () => { await pending; return []; } },
      replies: { register: (_handle, next) => { deliver = next; return vi.fn(); } },
    } });
    await plugin.start(host);
    const frame: WeComFrame = { headers: { req_id: 'retry-request' }, body: { msgid: 'retry-message', text: { content: 'hi' } } };
    client.emit('message.text', frame);
    try {
      await vi.waitFor(() => expect(deliver).toBeDefined());
      await deliver({ type: 'text_delta', delta: 'base' });
      client.replyStream.mockRejectedValueOnce(new Error('ACK_TIMEOUT'));
      await expect(deliver(deliveryEvent)).rejects.toThrow('ACK_TIMEOUT');
      await deliver({ type: 'completed', resultRef: 'session://retry' });
      expect(client.replyStream).toHaveBeenNthCalledWith(3, frame, expect.any(String), 'base', true);
      await expect(deliver(deliveryEvent)).resolves.toMatchObject({ status: 'delivered' });
      expect(client.replyStream).toHaveBeenNthCalledWith(2, frame, expect.any(String), deliveryContent, finish);
      expect(client.replyStream).toHaveBeenNthCalledWith(4, frame, expect.any(String), deliveryContent, finish);
      await deliver({ type: 'text_delta', delta: '-tail' });
      await deliver({ type: 'completed', resultRef: 'session://retry' });
      expect(client.replyStream).toHaveBeenLastCalledWith(frame, expect.any(String), `${deliveryContent}-tail`, true);
    } finally {
      finishSubmit();
      await plugin.stop(host);
    }
  },
);
