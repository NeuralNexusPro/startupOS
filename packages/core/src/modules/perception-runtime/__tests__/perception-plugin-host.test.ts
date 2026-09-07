import { describe, expect, it, vi } from 'vitest';
import type { JsonValue, PerceptionEventV1 } from '../index';
import {
  PerceptionPluginHost,
  PerceptionPluginRegistry,
  type PerceptionPlugin,
  type PerceptionPluginHostPorts,
  type PerceptionPluginManifest,
} from '../plugins';

function manifest(overrides: Partial<PerceptionPluginManifest> = {}): PerceptionPluginManifest {
  return {
    id: 'originos.perception.wecom',
    name: 'WeCom',
    version: '1.0.0',
    hostApi: '1.0',
    entry: '@originos/perception-plugin-wecom',
    source: 'wecom',
    transport: 'stream',
    capabilities: ['inbound-events'],
    permissions: ['events', 'network', 'audit'],
    configurationSchema: {
      version: '1.0',
      fields: [
        { key: 'botId', type: 'text', label: 'Bot ID', required: true },
        { key: 'secret', type: 'password', label: 'Secret', required: true, sensitive: true },
      ],
    },
    ...overrides,
  };
}

function plugin(pluginManifest = manifest(), hooks: Partial<PerceptionPlugin> = {}): PerceptionPlugin {
  return {
    manifest: pluginManifest,
    start: hooks.start ?? vi.fn().mockResolvedValue(undefined),
    stop: hooks.stop ?? vi.fn().mockResolvedValue(undefined),
    health: hooks.health,
    provision: hooks.provision,
    handleWebhook: hooks.handleWebhook,
  };
}

function event(overrides: Partial<PerceptionEventV1> = {}): PerceptionEventV1 {
  return {
    schemaVersion: '1.0', id: 'evt-1', source: 'wecom', sourceEventId: 'source-1', connectorId: 'wecom-main',
    type: 'message.received', occurredAt: '2026-09-04T00:00:00.000Z', receivedAt: '2026-09-04T00:00:01.000Z',
    actor: { externalId: 'user-1' }, content: { text: 'hello' }, provenance: { rawPayloadRef: 'perception://inbox/1' },
    ...overrides,
  };
}

function ports(): PerceptionPluginHostPorts {
  return {
    credentials: { bind: vi.fn(), resolve: vi.fn(), remove: vi.fn() },
    events: { submit: vi.fn() },
    network: { request: vi.fn() },
    schedule: { every: vi.fn(), cancel: vi.fn() },
    state: { read: vi.fn(), write: vi.fn(), remove: vi.fn() },
    health: { report: vi.fn() },
    audit: { record: vi.fn() },
  };
}

describe('Perception Plugin SDK and registry', () => {
  it('accepts a strict manifest and rejects incompatible, unsafe, or executable schemas', () => {
    const registry = new PerceptionPluginRegistry();
    registry.register({ plugin: plugin(), approvedPermissions: ['events', 'network', 'audit'] });
    expect(registry.list()).toHaveLength(1);

    const rejected = new PerceptionPluginRegistry().registerCatalog([
      { plugin: plugin(manifest({ hostApi: '2.0' as '1.0' })), approvedPermissions: [] },
      { plugin: plugin(manifest({ entry: '../../remote.js' })), approvedPermissions: [] },
      { plugin: plugin({ ...manifest(), capabilities: ['root-access' as 'inbound-events'] }), approvedPermissions: [] },
      { plugin: plugin({ ...manifest(), configurationSchema: { version: '1.0', fields: [{ key: 'x', type: 'text', label: 'X', render: () => null } as never] } }), approvedPermissions: [] },
    ]);
    expect(rejected).toHaveLength(4);
    expect(rejected.every((item) => item.safeCode === 'PLUGIN_REGISTRATION_REJECTED')).toBe(true);
  });

  it('rejects approvals for undeclared permissions and duplicate plugin ids', () => {
    const registry = new PerceptionPluginRegistry();
    expect(() => registry.register({ plugin: plugin(), approvedPermissions: ['credentials'] })).toThrow('undeclared');
    registry.register({ plugin: plugin(), approvedPermissions: ['events'] });
    expect(() => registry.register({ plugin: plugin(), approvedPermissions: ['events'] })).toThrow('already registered');
  });
});

describe('Perception Plugin Host', () => {
  it('exposes only declared and approved ports and validates submitted event scope', async () => {
    const registry = new PerceptionPluginRegistry();
    let capturedPorts: readonly string[] = [];
    const submit = vi.fn();
    const hostPorts = ports();
    hostPorts.events.submit = submit;
    registry.register({
      plugin: plugin(manifest(), { start: async (context) => { capturedPorts = Object.keys(context.ports); } }),
      approvedPermissions: ['events', 'audit'],
    });
    const host = new PerceptionPluginHost(registry, hostPorts);
    expect((await host.start('originos.perception.wecom', 'wecom-main')).state).toBe('running');
    expect(capturedPorts.sort()).toEqual(['audit', 'events']);

    // Exercise validation through a plugin start hook on a fresh connector.
    const checking = plugin(manifest({ id: 'originos.perception.wecom-check' }), {
      start: async (context) => {
        await context.ports.events?.submit(event({ connectorId: context.connectorId }));
        await expect(context.ports.events?.submit(event({ connectorId: 'other' }))).rejects.toThrow('scope mismatch');
      },
    });
    registry.register({ plugin: checking, approvedPermissions: ['events', 'audit'] });
    expect((await host.start(checking.manifest.id, 'wecom-main')).state).toBe('running');
    expect(submit).toHaveBeenCalledTimes(1);
    expect(hostPorts.audit.record).toHaveBeenCalledWith('plugin.event.rejected', expect.not.objectContaining({ secret: expect.anything() }));
  });

  it('makes start/stop idempotent and supports restart without duplicate lifecycle calls', async () => {
    const start = vi.fn().mockResolvedValue(undefined);
    const stop = vi.fn().mockResolvedValue(undefined);
    const registry = new PerceptionPluginRegistry();
    registry.register({ plugin: plugin(manifest(), { start, stop }), approvedPermissions: [] });
    const host = new PerceptionPluginHost(registry, ports());
    await host.start(manifest().id, 'wecom-main', { botId: 'bot' });
    await host.start(manifest().id, 'wecom-main');
    await host.stop(manifest().id, 'wecom-main');
    await host.stop(manifest().id, 'wecom-main');
    await host.restart(manifest().id, 'wecom-main');
    expect(start).toHaveBeenCalledTimes(2);
    expect(stop).toHaveBeenCalledTimes(1);
    expect(host.status(manifest().id, 'wecom-main').state).toBe('running');
  });

  it('provisions through the plugin contract without exposing undeclared ports', async () => {
    const registry = new PerceptionPluginRegistry();
    const provision = vi.fn(async (context) => ({ settings: { botId: context.settings.botId }, secretRefs: { secret: 'secret://bound' } }));
    registry.register({ plugin: plugin(manifest({ permissions: ['credentials'] }), { provision }), approvedPermissions: ['credentials'] });
    const host = new PerceptionPluginHost(registry, ports());
    await expect(host.provision(manifest().id, 'wecom-main', { botId: 'bot' }, { secret: 'private' })).resolves.toEqual({ settings: { botId: 'bot' }, secretRefs: { secret: 'secret://bound' } });
    expect(provision.mock.calls[0]?.[0].ports).toEqual(expect.objectContaining({ credentials: expect.any(Object) }));
  });

  it('namespaces and clears scheduled work when an instance stops', async () => {
    const registry = new PerceptionPluginRegistry();
    registry.register({
      plugin: plugin(manifest({ permissions: ['schedule'] }), {
        start: async (context) => context.ports.schedule?.every('poll', 1_000, async () => undefined),
      }),
      approvedPermissions: ['schedule'],
    });
    const hostPorts = ports();
    const host = new PerceptionPluginHost(registry, hostPorts);
    await host.start(manifest().id, 'wecom-main');
    expect(hostPorts.schedule.every).toHaveBeenCalledWith('originos.perception.wecom:wecom-main:poll', 1_000, expect.any(Function));
    await host.stop(manifest().id, 'wecom-main');
    expect(hostPorts.schedule.cancel).toHaveBeenCalledWith('originos.perception.wecom:wecom-main:poll');
  });

  it('namespaces plugin state and rejects unsafe keys', async () => {
    const registry = new PerceptionPluginRegistry();
    registry.register({ plugin: plugin(manifest({ permissions: ['state'] }), { start: async (context) => {
      await context.ports.state?.write('cursor', { lastUid: 3 });
      await expect(context.ports.state?.read('../other')).rejects.toThrow();
    } }), approvedPermissions: ['state'] });
    const hostPorts = ports();
    const host = new PerceptionPluginHost(registry, hostPorts);
    await host.start(manifest().id, 'wecom-main');
    expect(hostPorts.state.write).toHaveBeenCalledWith('originos.perception.wecom:wecom-main:cursor', { lastUid: 3 });
  });

  it('isolates one plugin failure and emits only a safe audit code', async () => {
    const registry = new PerceptionPluginRegistry();
    registry.register({ plugin: plugin(manifest(), { start: async () => { throw new Error('secret-token-value'); } }), approvedPermissions: ['audit'] });
    const healthy = plugin(manifest({ id: 'originos.perception.email', name: 'Email', source: 'email', transport: 'poll' }));
    registry.register({ plugin: healthy, approvedPermissions: [] });
    const hostPorts = ports();
    const host = new PerceptionPluginHost(registry, hostPorts);

    expect((await host.start(manifest().id, 'wecom-main')).state).toBe('failed');
    expect((await host.start(healthy.manifest.id, 'email-main')).state).toBe('running');
    const auditCalls = vi.mocked(hostPorts.audit.record).mock.calls as Array<[string, JsonValue?]>;
    expect(JSON.stringify(auditCalls)).toContain('PLUGIN_START_FAILED');
    expect(JSON.stringify(auditCalls)).not.toContain('secret-token-value');
  });

  it('dispatches webhooks only to a running plugin instance', async () => {
    const handleWebhook = vi.fn().mockResolvedValue({ status: 202, body: { accepted: true } });
    const registry = new PerceptionPluginRegistry();
    registry.register({ plugin: plugin(manifest({ transport: 'webhook' }), { handleWebhook }), approvedPermissions: [] });
    const host = new PerceptionPluginHost(registry, ports());
    await expect(host.handleWebhook(manifest().id, 'wecom-main', { payload: {}, headers: {}, query: {}, receivedAt: '2026-09-06T00:00:00.000Z' })).rejects.toThrow('not running');
    await host.start(manifest().id, 'wecom-main');
    await expect(host.handleWebhook(manifest().id, 'wecom-main', { payload: {}, headers: {}, query: {}, receivedAt: '2026-09-06T00:00:00.000Z' })).resolves.toMatchObject({ status: 202 });
    expect(handleWebhook).toHaveBeenCalledTimes(1);
  });
});
