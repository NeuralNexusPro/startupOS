import { describe, expect, it, vi } from 'vitest';
import type { PerceptionPluginRuntimeContext, PluginCapabilityInvocation } from '@originos/core/modules/perception-runtime/plugins';
import { DingTalkOfficeCapabilityProvider, type DingTalkOfficeCli } from '../office-capabilities';

const context: PerceptionPluginRuntimeContext = {
  pluginId: 'originos.dingtalk', connectorId: 'dingtalk-main', settings: {}, ports: {},
};

const source = {
  products: [
    { id: 'calendar', tools: [
      { canonical_path: 'calendar.list_calendar_events', cli_path: 'calendar event list', description: '查询日程', availability: 'available', effect: 'read', parameters: { limit: { type: 'integer', minimum: 1, maximum: 100 } } },
      { canonical_path: 'calendar.create_calendar_event', cli_path: 'calendar event create', description: '创建日程', availability: 'available', effect: 'write', parameters: { title: { type: 'string', required: true }, start: { type: 'string', required: true }, end: { type: 'string', required: true } } },
    ] },
    { id: 'todo', tools: [
      { canonical_path: 'todo.delete_todo_task', cli_path: 'todo task delete', description: '删除待办', availability: 'available', effect: 'destructive', parameters: { task: { type: 'string', required: true } } },
      { canonical_path: 'todo.shortcut_update', cli_path: 'todo +update', description: '更新待办', availability: 'available', effect: 'write', parameters: { title: { type: 'string' }, due: { type: 'string' } }, constraints: { require_one_of: [['title', 'due']] } },
    ] },
  ],
};

function setup(authenticated = true) {
  const calls: string[][] = [];
  const cli: DingTalkOfficeCli = { run: vi.fn(async args => {
    calls.push([...args]);
    if (args[0] === 'version') return 'Version:        v1.0.61\nEdition: open';
    if (args[0] === 'schema') return JSON.stringify(source);
    if (args[0] === 'auth') return JSON.stringify({ success: true, authenticated });
    if (args[0] === 'profile') return JSON.stringify({ currentProfile: 'corp-internal:user-internal', profiles: [] });
    return JSON.stringify({ success: true, result: [{ subject: '评审会' }] });
  }) };
  return { provider: new DingTalkOfficeCapabilityProvider(cli), calls };
}

describe('DingTalk office capability provider', () => {
  it('projects the official dws schema into a dynamic capability catalog', async () => {
    const { provider, calls } = setup();
    const catalog = await provider.list(context, new AbortController().signal);
    expect(catalog).toMatchObject({ provider: 'dingtalk-dws', providerVersion: '1.0.61' });
    expect(catalog.capabilities.map(({ name, effect }) => [name, effect])).toEqual([
      ['calendar.create_calendar_event', 'write'],
      ['calendar.list_calendar_events', 'read'],
      ['todo.delete_todo_task', 'destructive'],
      ['todo.shortcut_update', 'write'],
    ]);
    expect(calls.find(call => call[0] === 'schema')).toEqual(['schema', '--all', '--jq', expect.stringContaining('calendar')]);
  });

  it('binds authorization to an opaque current OAuth profile', async () => {
    const { provider } = setup();
    const authorization = await provider.authorization(context, new AbortController().signal);
    expect(authorization).toMatchObject({ status: 'authorized', identityMode: 'user', scopes: ['dingtalk.calendar', 'dingtalk.todo'] });
    expect(authorization.principalId).toMatch(/^identity-[a-f0-9]{64}$/);
    expect(JSON.stringify(authorization)).not.toContain('corp-internal');
    expect(await setup(false).provider.authorization(context, new AbortController().signal)).toMatchObject({ status: 'needs_authorization', scopes: [] });
  });

  it('accepts only discovered flags and executes under the pinned profile', async () => {
    const { provider, calls } = setup();
    const catalog = await provider.list(context, new AbortController().signal);
    const authorization = await provider.authorization(context, new AbortController().signal);
    expect(provider.validate('calendar.create_calendar_event', { title: '评审会', start: '2026-09-16T10:00:00+08:00', end: '2026-09-16T11:00:00+08:00' })).toBe(true);
    expect(provider.validate('calendar.create_calendar_event', { title: '评审会', profile: 'other' })).toBe(false);
    expect(provider.validate('todo.shortcut_update', {})).toBe(false);
    const invocation: PluginCapabilityInvocation = {
      name: 'calendar.list_calendar_events', catalogRevision: catalog.revision, callId: 'call-1', arguments: { limit: 20 },
    };
    await expect(provider.invoke(context, invocation, authorization, new AbortController().signal)).resolves.toMatchObject({ success: true });
    expect(calls.at(-1)).toEqual([
      '--profile', 'corp-internal:user-internal', 'calendar', 'event', 'list', '--limit=20', '--format', 'json', '--yes',
    ]);
  });
});
