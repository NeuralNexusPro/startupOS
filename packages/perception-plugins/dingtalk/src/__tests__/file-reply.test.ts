import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PerceptionPluginRuntimeContext, PluginReplyEvent, PluginReplyReceipt } from '@originos/core/modules/perception-runtime/plugins';
const mock = vi.hoisted(() => ({ clients: [] as Array<{ connected: boolean; registered: boolean; callback?: (frame: unknown) => Promise<void>; ack: ReturnType<typeof vi.fn>; disconnect: ReturnType<typeof vi.fn> }> }));
vi.mock('dingtalk-stream', () => ({ TOPIC_ROBOT: '/v1.0/im/bot/messages/get', DWClient: class {
  connected = false; registered = false; callback?: (frame: unknown) => Promise<void>;
  ack = vi.fn(); socketCallBackResponse = this.ack;
  disconnect = vi.fn(() => { this.connected = false; this.registered = false; });
  removeAllListeners = vi.fn(); connect = vi.fn(async () => {});
  constructor(readonly options: unknown) { mock.clients.push(this); }
  registerCallbackListener(_topic: string, callback: (frame: unknown) => Promise<void>) { this.callback = callback; }
} }));
import { DingTalkPerceptionPlugin } from '../plugin';
function setup(kind = '2') {
  const deliveries = new Map<string, (event: PluginReplyEvent) => Promise<PluginReplyReceipt>>();
  const health = vi.fn(); const schedule = vi.fn();
  const submit = vi.fn(async (_event: unknown, options?: { onAccepted?: () => void | Promise<void> }) => { await options?.onAccepted?.(); await new Promise<void>(() => {}); return []; });
  const context: PerceptionPluginRuntimeContext = { pluginId: 'originos.dingtalk', connectorId: 'fixture', settings: { appId: 'app', robotCode: 'robot', secretRef: 'secret-ref' }, ports: {
    credentials: { resolve: vi.fn(async () => 'secret'), bind: vi.fn(async () => 'secret-ref'), remove: vi.fn() },
    events: { submit }, health: { report: health }, schedule: { every: schedule, cancel: vi.fn() },
    replies: { register: vi.fn((handle, deliver) => { deliveries.set(handle, deliver); return () => { deliveries.delete(handle); }; }) },
  } };
  const frame = { type: 'CALLBACK', specVersion: '1.0', headers: { topic: '/v1.0/im/bot/messages/get', messageId: 'frame1' }, data: JSON.stringify({ msgId: 'msg1', robotCode: 'robot', conversationId: 'cid-original', conversationType: kind, senderId: 'encoded-not-staff', senderStaffId: 'staff-original', text: { content: 'send file' } }) };
  const fetcher = vi.fn(async (_input: string | URL | Request, _init?: RequestInit) => Response.json({ accessToken: 'token', expireIn: 7200 }));
  vi.stubGlobal('fetch', fetcher);
  const plugin = new DingTalkPerceptionPlugin();
  return { plugin, context, frame, deliveries, health, schedule, submit, fetcher, file: { type: 'file', file: { fileName: 'report.pdf', bytes: new Uint8Array([1, 2]) } } as const };
}
beforeEach(() => { mock.clients.length = 0; vi.restoreAllMocks(); vi.unstubAllGlobals(); });
async function ready(kind = '2') {
  const x = setup(kind); await x.plugin.start(x.context);
  void mock.clients[0].callback?.(x.frame);
  await vi.waitFor(() => expect(x.deliveries.size).toBe(1));
  const deliver = [...x.deliveries.values()][0]; expect(deliver).toBeTypeOf('function');
  return { ...x, deliver };
}
describe('DingTalk file replies', () => {
  it('provisions secrets through credentials without persisting plaintext settings', async () => {
    const x = setup();
    const result = await x.plugin.provision({ ...x.context, secrets: { appSecret: 'private-secret' } });
    expect(x.context.ports.credentials?.bind).toHaveBeenCalledWith('fixture', 'dingtalk', 'private-secret');
    expect(result).toEqual({ settings: { appId: 'app', robotCode: 'robot' }, secretRefs: { credentials: 'secret-ref' } });
  });
  it.each(['robot', 'staff'])('rejects mismatched robot or missing direct staff identity: %s', async field => {
    const x = setup('1'); const data = JSON.parse(x.frame.data);
    if (field === 'robot') data.robotCode = 'another-robot'; else delete data.senderStaffId;
    await x.plugin.start(x.context); await mock.clients[0].callback?.({ ...x.frame, data: JSON.stringify(data) });
    expect(x.submit).not.toHaveBeenCalled(); expect(x.fetcher).not.toHaveBeenCalled(); await x.plugin.stop(x.context);
  });
  it('does not start an SDK client when stopped during credential resolution', async () => {
    const x = setup(); let resolveSecret: ((secret: string) => void) | undefined;
    x.context.ports.credentials!.resolve = () => new Promise(resolve => { resolveSecret = resolve; });
    const starting = x.plugin.start(x.context); await x.plugin.stop(x.context); resolveSecret?.('secret'); await starting;
    expect(mock.clients).toHaveLength(0);
  });

  it.each(['1', '2'])('uploads and sends to original conversation type %s', async kind => {
    const x = await ready(kind);
    x.fetcher.mockResolvedValueOnce(Response.json({ accessToken: 'token', expireIn: 7200 })).mockResolvedValueOnce(Response.json({ errcode: 0, media_id: 'media' })).mockResolvedValueOnce(Response.json({ processQueryKey: 'sent' }));
    expect(await x.deliver(x.file)).toMatchObject({ messageId: 'sent', status: 'delivered' });
    const calls = x.fetcher.mock.calls;
    expect(String(calls[1][0])).toContain('/media/upload?access_token=token');
    expect(calls[1][1]?.body).toBeInstanceOf(FormData);
    const form = calls[1][1]?.body as FormData; expect(form.get('type')).toBe('file'); expect((form.get('media') as File).name).toBe('report.pdf');
    const body = JSON.parse(calls[2][1]?.body as string);
    expect(body).toMatchObject({ robotCode: 'robot', msgKey: 'sampleFile', msgParam: JSON.stringify({ mediaId: 'media', fileName: 'report.pdf', fileType: 'pdf' }) });
    expect(body).toMatchObject(kind === '1' ? { userIds: ['staff-original'] } : { openConversationId: 'cid-original' });
    expect(String(calls[2][0])).toContain(kind === '1' ? 'oToMessages/batchSend' : 'groupMessages/send');
    await x.plugin.stop(x.context);
  });
  it('ACKs on durable acceptance without waiting for dispatch', async () => {
    const x = setup(); let finish: (() => void) | undefined;
    x.submit.mockImplementationOnce(async (_event, options) => { await options?.onAccepted?.(); await new Promise<void>(resolve => { finish = resolve; }); return []; });
    await x.plugin.start(x.context); const pending = mock.clients[0].callback?.(x.frame);
    await vi.waitFor(() => expect(mock.clients[0].ack).toHaveBeenCalledWith('frame1', {}));
    finish?.(); await pending; await x.plugin.stop(x.context);
  });
  it('does not ACK failed acceptance or a stopped callback', async () => {
    const x = setup(); x.submit.mockRejectedValueOnce(new Error('disk failure'));
    await x.plugin.start(x.context); await mock.clients[0].callback?.(x.frame); expect(mock.clients[0].ack).not.toHaveBeenCalled();
    await x.plugin.stop(x.context); await mock.clients[0].callback?.(x.frame); expect(mock.clients[0].ack).not.toHaveBeenCalled();
  });
  it('reports healthy only after SDK registration and clears replies on stop', async () => {
    const x = await ready(); expect(x.health).not.toHaveBeenCalledWith(expect.objectContaining({ status: 'healthy' }));
    mock.clients[0].connected = true; mock.clients[0].registered = true;
    await x.schedule.mock.calls[0][2](); expect(x.health).toHaveBeenCalledWith(expect.objectContaining({ status: 'healthy' }));
    await x.plugin.stop(x.context); expect(x.deliveries.size).toBe(0); expect(mock.clients[0].disconnect).toHaveBeenCalled();
  });
  it('sends one final sampleText, not each delta', async () => {
    const x = await ready(); x.fetcher.mockResolvedValueOnce(Response.json({ accessToken: 'token', expireIn: 7200 })).mockResolvedValueOnce(Response.json({ processQueryKey: 'text' }));
    await x.deliver({ type: 'text_delta', delta: 'hello ' }); await x.deliver({ type: 'text_delta', delta: 'world' }); expect(x.fetcher).not.toHaveBeenCalled();
    await x.deliver({ type: 'completed', resultRef: 'result' });
    expect(JSON.parse(x.fetcher.mock.calls[1][1]?.body as string)).toMatchObject({ msgKey: 'sampleText', msgParam: JSON.stringify({ content: 'hello world' }) });
    await x.plugin.stop(x.context);
  });
  it('keeps final-send failure visible on reentry without blindly resending', async () => {
    const x = await ready(); x.fetcher.mockResolvedValueOnce(Response.json({ accessToken: 'token', expireIn: 7200 })).mockRejectedValueOnce(new Error('private backend detail'));
    await expect(x.deliver({ type: 'completed', resultRef: 'result' })).rejects.toThrow('DINGTALK_SEND_FAILED');
    await expect(x.deliver({ type: 'completed', resultRef: 'result' })).rejects.toThrow('DINGTALK_SEND_FAILED');
    expect(x.fetcher).toHaveBeenCalledTimes(2); await x.plugin.stop(x.context);
  });
  it('contains health-report rejection after failed acceptance', async () => {
    const x = setup(); await x.plugin.start(x.context);
    x.submit.mockRejectedValueOnce(new Error('disk failure')); x.health.mockRejectedValueOnce(new Error('health unavailable'));
    await expect(mock.clients[0].callback?.(x.frame)).resolves.toBeUndefined(); await x.plugin.stop(x.context);
  });
  it.each(['invalidStaffIdList', 'flowControlledStaffIdList'])('rejects HTTP 200 with %s', async field => {
    const x = await ready('1'); x.fetcher.mockResolvedValueOnce(Response.json({ accessToken: 'token', expireIn: 7200 })).mockResolvedValueOnce(Response.json({ errcode: 0, media_id: 'media' })).mockResolvedValueOnce(Response.json({ processQueryKey: 'sent', [field]: ['staff-original'] }));
    await expect(x.deliver(x.file)).rejects.toThrow('DINGTALK_SEND_FAILED'); await x.plugin.stop(x.context);
  });
  it('rejects unsupported formats and oversized files before upload', async () => {
    const x = await ready(); await expect(x.deliver({ type: 'file', file: { ...x.file.file, fileName: 'notes.md' } })).rejects.toThrow('IM_FILE_FORMAT_UNSUPPORTED');
    await expect(x.deliver({ type: 'file', file: { ...x.file.file, bytes: new Uint8Array(20_000_001) } })).rejects.toThrow(); expect(x.fetcher).not.toHaveBeenCalled(); await x.plugin.stop(x.context);
  });
  it.each(['stop', 'abort'])('does not send after upload when %s occurs', async action => {
    const x = await ready(); const abort = new AbortController();
    x.fetcher.mockResolvedValueOnce(Response.json({ accessToken: 'token', expireIn: 7200 })).mockImplementationOnce(async () => { if (action === 'stop') await x.plugin.stop(x.context); else abort.abort(); return Response.json({ errcode: 0, media_id: 'media' }); });
    await expect(x.deliver({ ...x.file, signal: abort.signal })).rejects.toThrow(); expect(x.fetcher).toHaveBeenCalledTimes(2); await x.plugin.stop(x.context);
  });
});
