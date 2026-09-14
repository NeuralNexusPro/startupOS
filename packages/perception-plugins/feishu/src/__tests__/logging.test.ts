import { beforeEach, expect, it, vi } from 'vitest';
import { createPluginSdkLogger, sanitizePluginLog } from '@originos/core/modules/perception-runtime/plugins/logging';
import type { PerceptionPluginRuntimeContext, PluginLogPort, PluginReplyEvent } from '@originos/core/modules/perception-runtime/plugins';
import { FeishuPerceptionPlugin } from '../plugin';
import type { FeishuSdkFactoryOptions, FeishuSdkMessageEvent } from '../types';

const sdk = vi.hoisted(() => ({ constructors: [] as Array<{ name: string; logger?: PluginLogPort['sdkLogger'] }>, ws: [] as FeishuSdkFactoryOptions[], receive: undefined as ((message: FeishuSdkMessageEvent) => Promise<void>) | undefined, send: vi.fn(), stream: vi.fn() }));
vi.mock('@larksuiteoapi/node-sdk', () => ({
  Domain: { Lark: 'lark', Feishu: 'feishu' },
  Client: class { constructor(options: FeishuSdkFactoryOptions) { sdk.constructors.push({ name: 'Client', logger: options.logger }); } },
  WSClient: class { constructor(options: FeishuSdkFactoryOptions) { sdk.ws.push(options); sdk.constructors.push({ name: 'WSClient', logger: options.logger }); } async start() {} close() {} },
  EventDispatcher: class {
    constructor(options: Pick<FeishuSdkFactoryOptions, 'logger'>) { sdk.constructors.push({ name: 'EventDispatcher', logger: options.logger }); }
    register(handlers: { 'im.message.receive_v1': typeof sdk.receive }) { sdk.receive = handlers['im.message.receive_v1']; return this; }
  },
  createLarkChannel: (options: FeishuSdkFactoryOptions) => { sdk.constructors.push({ name: 'createLarkChannel', logger: options.logger }); return { send: sdk.send, stream: sdk.stream }; },
}));
beforeEach(() => { sdk.constructors.length = 0; sdk.ws.length = 0; sdk.receive = undefined; sdk.send.mockResolvedValue({ messageId: 'reply' }); });

function host(connectorId: string) {
  const records: ReturnType<typeof sanitizePluginLog>[] = [];
  const log: PluginLogPort = { write: record => { records.push(sanitizePluginLog(record)); } };
  log.sdkLogger = createPluginSdkLogger(log);
  const context: PerceptionPluginRuntimeContext = { pluginId: 'originos.feishu', connectorId, settings: { appId: 'cli_0123456789abcdef', secretRef: 'ref' }, ports: {
    log, credentials: { bind: vi.fn(), remove: vi.fn(), resolve: async () => JSON.stringify({ appSecret: 'SECRET' }) },
    events: { submit: vi.fn(async () => []) }, health: { report: vi.fn() },
  } };
  return { context, records };
}
const message: FeishuSdkMessageEvent = { sender: { sender_type: 'user' }, message: { message_id: 'message-1', chat_id: 'chat-1', chat_type: 'group', message_type: 'text', content: '{"text":"BODY"}', create_time: '1788756000000' } };

it('all four default Lark constructors receive the scoped logger and connection callbacks stay isolated', async () => {
  const consoleError = vi.spyOn(console, 'error'); const plugin = new FeishuPerceptionPlugin();
  const first = host('first'); const second = host('second');
  await plugin.start(first.context); await plugin.start(second.context);
  for (const [index, target] of [first, second].entries()) {
    const constructors = sdk.constructors.slice(index * 4, index * 4 + 4);
    expect(constructors.map(entry => entry.name)).toEqual(['EventDispatcher', 'Client', 'WSClient', 'createLarkChannel']);
    for (const entry of constructors) {
      expect(entry.logger).toBe(target.context.ports.log!.sdkLogger);
      entry.logger!.error(new Error('ENOTFOUND SECRET BODY'), { authorization: 'SECRET', body: 'BODY' });
    }
    sdk.ws[index]!.onError(new Error('authentication failed SECRET BODY'));
    sdk.ws[index]!.onReconnecting(); sdk.ws[index]!.onReconnected();
    expect(target.records).toContainEqual(expect.objectContaining({ stage: 'connection.error', safeCode: 'FEISHU_AUTH_FAILED' }));
    expect(target.records).toContainEqual(expect.objectContaining({ stage: 'connection.reconnecting' }));
    expect(target.records.filter(record => record.stage === 'sdk')).toHaveLength(4);
  }
  expect(JSON.stringify(first.records)).not.toMatch(/SECRET|BODY/);
  expect(consoleError).not.toHaveBeenCalled();
  await plugin.stop(first.context); await plugin.stop(second.context);
});

it.each(['markdown', 'stream'])('records %s fallback errors with event/session IDs while preserving text fallback', async mode => {
  const { context, records } = host('reply');
  let deliver!: (event: PluginReplyEvent) => Promise<unknown>; let eventId: string | undefined;
  const runtime = { ...context, ports: { ...context.ports,
    replies: { register: (_handle: string, next: typeof deliver) => { deliver = next; return vi.fn(); } },
    events: { submit: async (event: { id: string }) => {
      eventId = event.id; await deliver({ type: 'accepted', sessionId: 'session-1' });
      if (mode === 'stream') {
        await deliver({ type: 'text_delta', delta: 'BODY' });
        await deliver({ type: 'completed', resultRef: 'session://session-1' });
      } else await deliver({ type: 'assistant_message', content: 'BODY' });
      return [];
    } },
  } };
  const plugin = new FeishuPerceptionPlugin(); await plugin.start(runtime);
  if (mode === 'stream') sdk.stream.mockRejectedValueOnce(new Error('ETIMEDOUT SECRET BODY'));
  else sdk.send.mockRejectedValueOnce(new Error('ETIMEDOUT SECRET BODY'));
  await sdk.receive!(message);
  expect(records).toContainEqual(expect.objectContaining({ stage: `reply.${mode}`, eventId, sessionId: 'session-1', safeCode: 'FEISHU_REPLY_FAILED' }));
  expect(sdk.send).toHaveBeenLastCalledWith('chat-1', { text: 'BODY' }, { replyTo: 'message-1' });
  expect(JSON.stringify(records)).not.toMatch(/SECRET|BODY/);
  await plugin.stop(runtime);
});

it('catches receive normalization failures without handing bodies to diagnostics', async () => {
  const { context, records } = host('receive'); const plugin = new FeishuPerceptionPlugin(); await plugin.start(context);
  await sdk.receive!({ ...message, create_time: '9'.repeat(20) });
  expect(records).toContainEqual(expect.objectContaining({ stage: 'receive', safeCode: 'FEISHU_RECEIVE_FAILED' }));
  expect(context.ports.events!.submit).not.toHaveBeenCalled();
  expect(JSON.stringify(records)).not.toContain('BODY');
  await plugin.stop(context);
});
