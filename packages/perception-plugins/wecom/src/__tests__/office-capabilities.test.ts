import { describe, expect, it, vi } from 'vitest';
import type { PerceptionPluginRuntimeContext, PluginCapabilityInvocation } from '@originos/core/modules/perception-runtime/plugins';
import { WeComOfficeCapabilityProvider, type WeComOfficeCli } from '../office-capabilities';

const context: PerceptionPluginRuntimeContext = {
  pluginId: 'originos.wecom', connectorId: 'wecom-main', settings: {}, ports: {},
};

function schema(method: string, description: string, properties: Record<string, unknown>, required: string[] = []): string {
  return JSON.stringify({ method, description, request: { $ref: 'Request' }, response: { $ref: 'Response' }, schemas: {
    Request: { type: 'object', properties, required }, Response: { type: 'object', properties: { ok: { type: 'boolean' } } },
  } });
}

function setup(status = 'authorized') {
  const calls: string[][] = [];
  const outputs = new Map<string, string>([
    ['--version', 'wecom-cli 1.2.1'],
    ['calendar --schema', JSON.stringify({ methods: [
      { name: 'calendar.schedules.list', description: '查询日程' },
      { name: 'calendar.schedules.create', description: '创建日程' },
    ] })],
    ['todo --schema', JSON.stringify({ methods: [
      { name: 'todo.list', description: '查询待办' },
      { name: 'todo.delete', description: '删除待办' },
    ] })],
    ['calendar schedules list --schema', schema('calendar.schedules.list', '查询日程', { limit: { type: 'integer', minimum: 1, maximum: 20 } })],
    ['calendar schedules create --schema', JSON.stringify({
      method: 'calendar.schedules.create', description: '创建日程', request: { $ref: 'Request' }, response: { $ref: 'Response' }, schemas: {
        Request: { type: 'object', properties: { subject: { type: 'string' }, attendees: { type: 'array', items: { $ref: 'Attendee' } } }, required: ['subject'] },
        Attendee: { type: 'object', properties: { userid: { type: 'string' } }, required: ['userid'] },
        Response: { type: 'object', properties: { schedule_id: { type: 'string' } } },
      },
    })],
    ['todo list --schema', schema('todo.list', '查询待办', { keywords: { type: 'array', items: { type: 'string' } } })],
    ['todo delete --schema', schema('todo.delete', '删除待办', { todo_id: { type: 'string' } }, ['todo_id'])],
    ['auth show --status', status],
    ['identity whoami', JSON.stringify({ extra_identity_context: 'opaque-user-context' })],
  ]);
  const cli: WeComOfficeCli = { run: vi.fn(async (args) => {
    calls.push([...args]);
    if (args.includes('--json')) return JSON.stringify({ ok: true, title: '可读结果', todo_id: 'internal-only' });
    const value = outputs.get(args.join(' '));
    if (value === undefined) throw new Error(`unexpected: ${args.join(' ')}`);
    return value;
  }) };
  return { provider: new WeComOfficeCapabilityProvider(cli), cli, calls };
}

describe('WeCom office capability provider', () => {
  it('builds a trusted catalog from official service and method schemas', async () => {
    const { provider, cli } = setup();
    const catalog = await provider.list(context, new AbortController().signal);
    expect(catalog).toMatchObject({ provider: 'wecom-cli', providerVersion: '1.2.1' });
    expect(catalog.capabilities.map(({ name, effect }) => [name, effect])).toEqual([
      ['calendar.schedules.create', 'write'],
      ['calendar.schedules.list', 'read'],
      ['todo.delete', 'destructive'],
      ['todo.list', 'read'],
    ]);
    expect(JSON.stringify(catalog)).not.toContain('$ref');
    expect(catalog.capabilities[0]?.inputSchema).toMatchObject({ type: 'object', additionalProperties: false });
    await provider.list(context, new AbortController().signal);
    expect(vi.mocked(cli.run).mock.calls.filter(([args]) => args.includes('--schema'))).toHaveLength(6);
  });

  it('uses independent user authorization and exposes only opaque identity references', async () => {
    const { provider } = setup();
    await provider.list(context, new AbortController().signal);
    const authorization = await provider.authorization(context, new AbortController().signal);
    expect(authorization).toMatchObject({ status: 'authorized', identityMode: 'user', scopes: ['wecom.calendar', 'wecom.todo'] });
    expect(authorization.principalId).toMatch(/^identity-[a-f0-9]{64}$/);
    expect(JSON.stringify(authorization)).not.toContain('opaque-user-context');

    const unauthorized = setup('unauthorized').provider;
    await unauthorized.list(context, new AbortController().signal);
    expect(await unauthorized.authorization(context, new AbortController().signal)).toMatchObject({ status: 'needs_authorization', scopes: [] });
  });

  it('validates native schemas and invokes only a discovered fixed method', async () => {
    const { provider, calls } = setup();
    const catalog = await provider.list(context, new AbortController().signal);
    const authorization = await provider.authorization(context, new AbortController().signal);
    expect(provider.validate('calendar.schedules.create', { subject: '评审会', attendees: [{ userid: 'internal-user' }] })).toBe(true);
    expect(provider.validate('calendar.schedules.create', {})).toBe(false);
    expect(provider.validate('calendar.schedules.create', { subject: '评审会', connectorId: 'other' })).toBe(false);
    expect(provider.validate('shell.exec', {})).toBe(false);

    const invocation: PluginCapabilityInvocation = {
      name: 'todo.list', catalogRevision: catalog.revision, callId: 'call-1', arguments: { keywords: ['评审'] },
    };
    await expect(provider.invoke(context, invocation, authorization, new AbortController().signal)).resolves.toMatchObject({ ok: true, title: '可读结果' });
    expect(calls.at(-1)).toEqual(['todo', 'list', '--json', JSON.stringify(invocation.arguments)]);
    await expect(provider.invoke(context, { ...invocation, name: 'shell.exec' }, authorization, new AbortController().signal)).rejects.toThrow('DENIED');
  });
});
