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

function setup(status = 'authorized', botIdsByDir: Record<string, string> = {}) {
  const calls: string[][] = [];
  const configDirs: (string | undefined)[] = [];
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
    ['auth show', 'Status: authorized\nBot ID: expected-bot\n'],
    ['identity whoami', JSON.stringify({ extra_identity_context: 'opaque-user-context' })],
  ]);
  const cli: WeComOfficeCli = { run: vi.fn(async (args, _signal, configDir) => {
    calls.push([...args]);
    configDirs.push(configDir);
    if (args.join(' ') === 'auth show' && configDir && botIdsByDir[configDir]) {
      return `Status: authorized\nBot ID: ${botIdsByDir[configDir]}\n`;
    }
    if (args.includes('--json')) return JSON.stringify({ ok: true, title: '可读结果', todo_id: 'internal-only' });
    const value = outputs.get(args.join(' '));
    if (value === undefined) throw new Error(`unexpected: ${args.join(' ')}`);
    return value;
  }) };
  return { provider: new WeComOfficeCapabilityProvider(cli), cli, calls, configDirs };
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

  it('does not treat another locally authorized robot as this connection', async () => {
    const { provider, cli } = setup();
    await provider.list(context, new AbortController().signal);
    const authorization = await provider.authorization({ ...context, settings: { botId: 'different-bot' } }, new AbortController().signal);
    expect(authorization).toMatchObject({ status: 'needs_authorization', scopes: [] });
    expect(vi.mocked(cli.run).mock.calls.map(([args]) => args.join(' '))).not.toContain('identity whoami');

    const matchingContext = { ...context, settings: { botId: 'expected-bot' } };
    await provider.list(matchingContext, new AbortController().signal);
    const matching = await provider.authorization(matchingContext, new AbortController().signal);
    expect(matching).toMatchObject({ status: 'authorized', scopes: ['wecom.calendar', 'wecom.todo'] });
  });

  it('routes two robots through separate CLI authorization directories and schemas', async () => {
    const { provider, configDirs } = setup('authorized', {
      '/private/robot-one': 'first-bot', '/private/robot-two': 'second-bot',
    });
    const first = { ...context, connectorId: 'robot-one', officeAuthDir: '/private/robot-one', settings: { botId: 'first-bot' } };
    const second = { ...context, connectorId: 'robot-two', officeAuthDir: '/private/robot-two', settings: { botId: 'second-bot' } };
    const firstCatalog = await provider.list(first, new AbortController().signal);
    const secondCatalog = await provider.list(second, new AbortController().signal);
    expect(configDirs).toContain('/private/robot-one');
    expect(configDirs).toContain('/private/robot-two');
    expect(await provider.authorization(first, new AbortController().signal)).toMatchObject({ status: 'authorized' });
    expect(await provider.authorization(second, new AbortController().signal)).toMatchObject({ status: 'authorized' });
    expect(await provider.authorization({ ...second, officeAuthDir: first.officeAuthDir }, new AbortController().signal))
      .toMatchObject({ status: 'needs_authorization' });
    await provider.invoke(second, { name: 'calendar.schedules.create', catalogRevision: secondCatalog.revision,
      callId: 'second-call', arguments: { subject: '评审会' } }, await provider.authorization(second, new AbortController().signal), new AbortController().signal);
    expect(configDirs.at(-1)).toBe('/private/robot-two');
    expect(provider.validate('calendar.schedules.create', { subject: '评审会' }, first)).toBe(true);
    expect(provider.validate('calendar.schedules.create', { subject: '评审会' },
      { ...first, settings: { botId: 'replacement-bot' } })).toBe(false);
    expect(firstCatalog.revision).toBe(secondCatalog.revision);
  });

  it('authorizes an office connector once and reuses its scoped credentials afterwards', async () => {
    let authorized = false;
    const calls: Array<{ args: string[]; configDir?: string }> = [];
    const cli: WeComOfficeCli = { run: vi.fn(async (args, _signal, configDir) => {
      calls.push({ args: [...args], configDir });
      if (args.join(' ') === 'auth show --status') return authorized ? 'authorized' : 'unauthorized';
      if (args.join(' ') === 'auth init --noninteractive') { authorized = true; return 'authorized'; }
      if (args.join(' ') === 'auth show') return 'Status: authorized\nBot ID: expected-bot\n';
      if (args.join(' ') === 'identity whoami') return JSON.stringify({ user: 'opaque' });
      throw new Error(`unexpected: ${args.join(' ')}`);
    }) };
    const provider = new WeComOfficeCapabilityProvider(cli);
    const scoped = { ...context, officeAuthDir: '/private/wecom-main', settings: { botId: 'expected-bot' } };

    await expect(provider.requestAuthorization(scoped, new AbortController().signal))
      .resolves.toMatchObject({ status: 'authorized' });
    await expect(provider.requestAuthorization(scoped, new AbortController().signal))
      .resolves.toMatchObject({ status: 'authorized' });

    expect(calls.filter(({ args }) => args.join(' ') === 'auth init --noninteractive')).toHaveLength(1);
    expect(calls.every(({ configDir }) => configDir === '/private/wecom-main')).toBe(true);
  });

  it('validates native schemas and invokes only a discovered fixed method', async () => {
    const { provider, calls } = setup();
    const catalog = await provider.list(context, new AbortController().signal);
    const authorization = await provider.authorization(context, new AbortController().signal);
    expect(provider.validate('calendar.schedules.create', { subject: '评审会', attendees: [{ userid: 'internal-user' }] }, context)).toBe(true);
    expect(provider.validate('calendar.schedules.create', {}, context)).toBe(false);
    expect(provider.validate('calendar.schedules.create', { subject: '评审会', connectorId: 'other' }, context)).toBe(false);
    expect(provider.validate('shell.exec', {}, context)).toBe(false);

    const invocation: PluginCapabilityInvocation = {
      name: 'todo.list', catalogRevision: catalog.revision, callId: 'call-1', arguments: { keywords: ['评审'] },
    };
    await expect(provider.invoke(context, invocation, authorization, new AbortController().signal)).resolves.toMatchObject({ ok: true, title: '可读结果' });
    expect(calls.at(-1)).toEqual(['todo', 'list', '--json', JSON.stringify(invocation.arguments)]);
    await expect(provider.invoke(context, { ...invocation, name: 'shell.exec' }, authorization, new AbortController().signal)).rejects.toThrow('DENIED');
  });

  it('classifies an expired service grant separately from CLI login authorization', async () => {
    const { provider, cli } = setup();
    const catalog = await provider.list(context, new AbortController().signal);
    const authorization = await provider.authorization(context, new AbortController().signal);
    vi.mocked(cli.run).mockImplementation(async (args) => {
      if (args.includes('--json')) return JSON.stringify({ errcode: 850003, errmsg: 'authorization expired' });
      throw new Error('unexpected call');
    });
    await expect(provider.invoke(context, {
      name: 'calendar.schedules.create', catalogRevision: catalog.revision, callId: 'call-expired', arguments: { subject: '评审会' },
    }, authorization, new AbortController().signal)).rejects.toThrow('IM_CAPABILITY_SERVICE_AUTHORIZATION_REQUIRED');
  });
});
