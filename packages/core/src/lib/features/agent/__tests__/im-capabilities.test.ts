// @vitest-environment node
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { afterEach, expect, it, vi } from 'vitest';
import { bindChannelOfficeCapabilitySession, createChannelOfficeCapabilityWorkerFallback, executeChannelOfficeCapabilityProxy, setChannelOfficeCapabilityFallback, withChannelOfficeCapabilities } from '../../../integrations/pi-agent/channel-office-capabilities';
import { imCapabilityTools } from '../tools/im-capabilities';

afterEach(() => setChannelOfficeCapabilityFallback());

it('uses host-bound connection context and derives callId from the tool call', async () => {
  const discover = vi.fn(async () => ({ revision: 'r1', capabilities: [] }));
  const invoke = vi.fn(async () => ({ id: 'external-1' }));
  const [discoverTool, invokeTool] = imCapabilityTools;
  expect((await discoverTool.execute('ignored', { query: 'calendar' })).details).toMatchObject({ code: 'IM_CAPABILITY_UNAVAILABLE' });
  await withChannelOfficeCapabilities({ discover, invoke }, async () => {
    await discoverTool.execute('discover-call', { name: 'calendar.create' });
    const result = await invokeTool.execute('trusted-call-id', { name: 'calendar.create', catalogRevision: 'r1', arguments: { title: 'Review' } });
    expect(result.details).toEqual({ id: 'external-1' });
  });
  expect(discover).toHaveBeenCalledWith(undefined, 'calendar.create');
  expect(invoke).toHaveBeenCalledWith({ name: 'calendar.create', catalogRevision: 'r1', callId: 'trusted-call-id', arguments: { title: 'Review' } });
});

it('returns the exact capability schema when an IM call contains an unsupported argument', async () => {
  const discover = vi.fn(async () => ({ revision: 'r2', capabilities: [{
    name: 'calendar.schedules.list',
    inputSchema: { type: 'object', properties: { begin_time: { type: 'string' }, end_time: { type: 'string' } }, additionalProperties: false },
  }] }));
  const invoke = vi.fn(async () => { throw new Error('IM_CAPABILITY_INVALID_INPUT'); });
  await withChannelOfficeCapabilities({ discover, invoke }, async () => {
    const result = await imCapabilityTools[1].execute('bad-list-call', {
      name: 'calendar.schedules.list', catalogRevision: 'r2', arguments: { begin_time: '2026-09-24', limit: 50 },
    });
    expect(result.details).toMatchObject({
      ok: false, code: 'IM_CAPABILITY_INVALID_INPUT', catalog: { revision: 'r2', capabilities: [{
        name: 'calendar.schedules.list', inputSchema: { properties: { begin_time: {}, end_time: {} }, additionalProperties: false },
      }] },
    });
  });
  expect(discover).toHaveBeenCalledWith('', 'calendar.schedules.list');
});

it('proxies worker tool calls through the host-bound session without exposing routing fields', async () => {
  const discover = vi.fn(async () => ({ revision: 'r1', capabilities: [] }));
  const invoke = vi.fn(async () => ({ id: 'external-1' }));
  const release = bindChannelOfficeCapabilitySession('session-im', { discover, invoke });
  setChannelOfficeCapabilityFallback(createChannelOfficeCapabilityWorkerFallback(async (toolCallId, toolName, args) => {
    try { return JSON.stringify({ ok: true, result: await executeChannelOfficeCapabilityProxy('session-im', toolName, toolCallId, args) }); }
    catch (error) { return JSON.stringify({ ok: false, code: error instanceof Error ? error.message : 'IM_CAPABILITY_FAILED' }); }
  }));
  const [discoverTool, invokeTool] = imCapabilityTools;
  expect((await discoverTool.execute('discover', { query: 'calendar' })).details).toEqual({ revision: 'r1', capabilities: [] });
  expect((await invokeTool.execute('worker-call', { name: 'calendar.create', catalogRevision: 'r1', arguments: { title: 'Review' } })).details).toEqual({ id: 'external-1' });
  expect(invoke).toHaveBeenCalledWith({ name: 'calendar.create', catalogRevision: 'r1', callId: 'worker-call', arguments: { title: 'Review' } });
  release();
  expect((await discoverTool.execute('expired', {})).details).toMatchObject({ code: 'IM_CAPABILITY_UNAVAILABLE' });
});

it('round-trips a capability request through an actual worker process', async () => {
  const discover = vi.fn(async () => ({ revision: 'r1', capabilities: [] }));
  const release = bindChannelOfficeCapabilitySession('session-child', { discover, invoke: vi.fn() });
  const child = spawn(process.execPath, ['--import', createRequire(import.meta.url).resolve('tsx'), fileURLToPath(new URL('./fixtures/im-capability-worker.mts', import.meta.url))],
    { cwd: process.cwd(), stdio: ['pipe', 'pipe', 'pipe'] });
  const lines: string[] = [];
  let stderr = '';
  let buffer = '';
  child.stderr.on('data', chunk => { stderr += String(chunk); });
  child.stdout.on('data', chunk => {
    buffer += String(chunk);
    const parts = buffer.split('\n'); buffer = parts.pop() ?? '';
    for (const line of parts.filter(Boolean)) {
      const message = JSON.parse(line) as { type: string; toolCallId?: string; toolName?: string; args?: unknown };
      lines.push(line);
      if (message.type === 'host_tool_call' && message.toolCallId && message.toolName) {
        void executeChannelOfficeCapabilityProxy('session-child', message.toolName, message.toolCallId, message.args)
          .then(result => child.stdin.write(`${JSON.stringify({ toolCallId: message.toolCallId, result: JSON.stringify({ ok: true, result }) })}\n`));
      }
    }
  });
  await new Promise<void>((resolve, reject) => {
    child.once('exit', code => code === 0 ? resolve() : reject(new Error(`worker exited ${code}: ${stderr}`)));
    child.once('error', reject);
  });
  release();
  const messages = lines.map(line => JSON.parse(line) as { type: string; result?: unknown; args?: unknown });
  expect(messages.at(-1)).toEqual({ type: 'done', result: { revision: 'r1', capabilities: [] } });
  expect(messages[0]).toMatchObject({ type: 'host_tool_call', toolName: 'discover_im_capabilities', args: { query: 'calendar' } });
  expect(JSON.stringify(messages[0])).not.toMatch(/connector|credential|actor/i);
});

it('rejects routing fields supplied by an untrusted worker', async () => {
  const release = bindChannelOfficeCapabilitySession('session-secure', { discover: vi.fn(), invoke: vi.fn() });
  await expect(executeChannelOfficeCapabilityProxy('session-secure', 'discover_im_capabilities', 'call', {
    query: 'calendar', connectorId: 'other-connection',
  })).rejects.toThrow('IM_CAPABILITY_INVALID_INPUT');
  release();
});
