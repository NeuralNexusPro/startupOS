import { beforeEach, expect, it, vi } from 'vitest';
import { createPluginSdkLogger, sanitizePluginLog } from '@originos/core/modules/perception-runtime/plugins/logging';
import type { PerceptionPluginRuntimeContext, PluginLogPort, PluginReplyEvent } from '@originos/core/modules/perception-runtime/plugins';
import { WeComPerceptionPlugin } from '../plugin';
import type { WeComBotClientFactory } from '../types';

const sdk = vi.hoisted(() => ({ clients: [] as Array<{ options: Parameters<WeComBotClientFactory>[0]; listeners: Map<string, (payload?: unknown) => void> }>, reply: vi.fn() }));
vi.mock('@wecom/aibot-node-sdk', () => ({ default: { WSClient: class {
  listeners = new Map<string, (payload?: unknown) => void>();
  constructor(options: Parameters<WeComBotClientFactory>[0]) { sdk.clients.push({ options, listeners: this.listeners }); }
  on(event: string, listener: (payload?: unknown) => void) { this.listeners.set(event, listener); }
  connect() {} disconnect() {} replyStream = sdk.reply;
} } }));
beforeEach(() => { sdk.clients.length = 0; sdk.reply.mockResolvedValue(undefined); });

function host(connectorId: string) {
  const records: ReturnType<typeof sanitizePluginLog>[] = [];
  const log: PluginLogPort = { write: record => { records.push(sanitizePluginLog(record)); } };
  log.sdkLogger = createPluginSdkLogger(log);
  const context: PerceptionPluginRuntimeContext = { pluginId: 'originos.wecom', connectorId, settings: { botId: 'bot', secretRef: 'ref' }, ports: {
    log, credentials: { bind: vi.fn(), remove: vi.fn(), resolve: async () => 'SECRET' },
    events: { submit: vi.fn(async () => []) }, health: { report: vi.fn() },
  } };
  return { context, records };
}

it('default SDK factory scopes SDK errors and connection callbacks to each connector without console or body leakage', async () => {
  const consoleError = vi.spyOn(console, 'error');
  const plugin = new WeComPerceptionPlugin();
  const first = host('first'); const second = host('second');
  await plugin.start(first.context); await plugin.start(second.context);
  for (const [index, target] of [first, second].entries()) {
    const client = sdk.clients[index]!;
    expect(client.options.logger).toBe(target.context.ports.log!.sdkLogger);
    client.options.logger!.error('ENOTFOUND https://user:SECRET@example.test/?token=SECRET BODY', { body: 'BODY' });
    client.listeners.get('error')!(new Error('Authentication failed SECRET BODY'));
    client.listeners.get('reconnecting')!();
    expect(target.records).toEqual(expect.arrayContaining([
      expect.objectContaining({ stage: 'sdk', error: expect.objectContaining({ reason: 'ENOTFOUND' }) }),
      expect.objectContaining({ stage: 'connection.error', safeCode: 'WECOM_AUTH_FAILED' }),
      expect.objectContaining({ stage: 'connection.reconnecting' }),
    ]));
  }
  expect(first.records).toHaveLength(second.records.length);
  expect(JSON.stringify(first.records)).not.toMatch(/SECRET|BODY/);
  expect(consoleError).not.toHaveBeenCalled();
  await plugin.stop(first.context); await plugin.stop(second.context);
});

it('a failed processing indicator does not stop the accepted Agent run', async () => {
  const { context, records } = host('reply');
  let deliver!: (event: PluginReplyEvent) => Promise<unknown>;
  let eventId: string | undefined;
  const unregister = vi.fn();
  const runtime = { ...context, ports: { ...context.ports,
    replies: { register: (_handle: string, next: typeof deliver) => { deliver = next; return unregister; } },
    events: { submit: vi.fn(async (event: { id: string }) => {
      eventId = event.id;
      await expect(deliver({ type: 'accepted', sessionId: 'session-1' })).resolves.toMatchObject({ status: 'failed' });
      await expect(deliver({ type: 'assistant_message', content: 'BODY' })).resolves.toMatchObject({ status: 'delivered' });
      return [];
    }) },
  } };
  const plugin = new WeComPerceptionPlugin(); await plugin.start(runtime);
  sdk.reply.mockRejectedValueOnce(new Error('ETIMEDOUT SECRET BODY'));
  sdk.clients[0]!.listeners.get('message.text')!({ body: { msgid: 'message-1', text: { content: 'BODY' } } });
  await vi.waitFor(() => expect(unregister).toHaveBeenCalledOnce());
  expect(records).toContainEqual(expect.objectContaining({ stage: 'reply', eventId, sessionId: 'session-1', safeCode: 'WECOM_REPLY_FAILED' }));
  expect(JSON.stringify(records)).not.toMatch(/SECRET|BODY/);
  await plugin.stop(runtime);
});

it('records normalization failures before event submission', async () => {
  const { context, records } = host('receive'); const plugin = new WeComPerceptionPlugin();
  await plugin.start(context);
  sdk.clients[0]!.listeners.get('message.text')!({ body: { create_time: 1e100 } });
  await vi.waitFor(() => expect(records).toContainEqual(expect.objectContaining({ stage: 'receive', safeCode: 'WECOM_RECEIVE_FAILED' })));
  expect(context.ports.events!.submit).not.toHaveBeenCalled();
  await plugin.stop(context);
});
