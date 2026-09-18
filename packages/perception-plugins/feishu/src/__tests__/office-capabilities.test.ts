import { describe, expect, it, vi } from 'vitest';
import type { PerceptionPluginRuntimeContext, PluginCapabilityInvocation } from '@originos/core/modules/perception-runtime/plugins';
import { FeishuOfficeCapabilityProvider, type FeishuOfficeCli } from '../office-capabilities';

const context: PerceptionPluginRuntimeContext = {
  pluginId: 'originos.feishu', connectorId: 'feishu-main', settings: {}, ports: {},
};

const help = (commands: string[]): string => `Available Commands:\n${commands.map(name => `  ${name}  Description`).join('\n')}\n\nFlags:`;

function setup(authenticated = true) {
  const calls: string[][] = [];
  const cli: FeishuOfficeCli = { run: vi.fn(async args => {
    calls.push([...args]);
    if (args[0] === '--version') return 'lark-cli version 1.0.95';
    if (args[0] === 'calendar' && args[1] === '--help') return help(['events']);
    if (args[0] === 'task' && args[1] === '--help') return help(['tasks']);
    if (args[0] === 'calendar' && args[1] === 'events' && args[2] === '--help') return help(['create', 'list']);
    if (args[0] === 'task' && args[1] === 'tasks' && args[2] === '--help') return help(['create', 'delete']);
    if (args[0] === 'schema') {
      const name = args[1]!;
      const destructive = name.endsWith('.delete');
      const write = name.endsWith('.create');
      return JSON.stringify({
        name: name.replaceAll('.', ' '), description: `Capability ${name}`,
        inputSchema: { type: 'object', properties: {
          params: { type: 'object', properties: { id: { type: 'string' } }, additionalProperties: false },
          data: { type: 'object', properties: { title: { type: 'string' } }, additionalProperties: false },
        }, required: write ? ['data'] : ['params'] },
        _meta: { access_tokens: ['user', 'bot'], required_scopes: [], risk: destructive ? 'high-risk-write' : write ? 'write' : 'read' },
      });
    }
    if (args[0] === 'auth' && args[1] === 'status') return JSON.stringify(authenticated ? { ok: true, authenticated: true } : { ok: false });
    if (args[0] === 'whoami') return JSON.stringify({ ok: true, profile: 'work-profile', user: { open_id: 'ou-internal' } });
    if (args[0] === 'auth' && args[1] === 'scopes') return JSON.stringify({ data: { scopes: ['calendar:calendar', 'task:task:write'] } });
    return JSON.stringify({ ok: true, data: { id: 'result-1' } });
  }) };
  return { provider: new FeishuOfficeCapabilityProvider(cli), calls };
}

describe('Feishu office capability provider', () => {
  it('discovers calendar and task methods from the official CLI schema', async () => {
    const { provider } = setup();
    const catalog = await provider.list(context, new AbortController().signal);
    expect(catalog).toMatchObject({ provider: 'lark-cli', providerVersion: '1.0.95' });
    expect(catalog.capabilities.map(({ name, effect }) => [name, effect])).toEqual([
      ['calendar.events.create', 'write'], ['calendar.events.list', 'read'],
      ['task.tasks.create', 'write'], ['task.tasks.delete', 'destructive'],
    ]);
  });

  it('binds calls to the current user profile and rejects transport controls', async () => {
    const { provider, calls } = setup();
    const catalog = await provider.list(context, new AbortController().signal);
    const authorization = await provider.authorization(context, new AbortController().signal);
    expect(authorization).toMatchObject({ status: 'authorized', identityMode: 'user', scopes: ['calendar:calendar', 'task:task:write'] });
    expect(authorization.principalId).toMatch(/^identity-[a-f0-9]{64}$/);
    expect(provider.validate('calendar.events.create', { data: { title: '评审会' } })).toBe(true);
    expect(provider.validate('calendar.events.create', { data: { title: '评审会' }, profile: 'other' })).toBe(false);
    const invocation: PluginCapabilityInvocation = {
      name: 'calendar.events.create', catalogRevision: catalog.revision, callId: 'call-1', arguments: { data: { title: '评审会' } },
    };
    await expect(provider.invoke(context, invocation, authorization, new AbortController().signal)).resolves.toMatchObject({ ok: true });
    expect(calls.at(-1)).toEqual(['--profile', 'work-profile', 'calendar', 'events', 'create', '--data', '{"title":"评审会"}', '--as', 'user', '--json']);
    expect(await setup(false).provider.authorization(context, new AbortController().signal)).toMatchObject({ status: 'needs_authorization' });
  });
});
