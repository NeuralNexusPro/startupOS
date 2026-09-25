// @vitest-environment node
import { mkdtempSync, rmSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PerceptionPluginHost, PerceptionPluginRegistry, PluginCapabilitySession, validateCapabilityCatalog,
  type PluginCapabilityCatalog, type PluginCapabilityProvider, type PluginCapabilityActor,
  type PerceptionPluginRuntimeContext, type PerceptionPluginHostPorts } from '../plugins';

const roots: string[] = [];
afterEach(() => roots.splice(0).forEach(root => rmSync(root, { recursive: true, force: true })));
const actor: PluginCapabilityActor = { eventId: 'event-1', sessionId: 'session-1', actorId: 'sender-1', conversationId: 'group-1', conversationKind: 'group' };
const context: PerceptionPluginRuntimeContext = { pluginId: 'test.plugin', connectorId: 'connection-1', settings: {}, ports: {} };
const catalog: PluginCapabilityCatalog = { revision: 'r1', provider: 'official-test-provider', providerVersion: '1.0.0', capabilities: [{
  name: 'calendar.create', description: 'Create event', inputSchema: { type: 'object', properties: { title: { type: 'string' } }, required: ['title'], additionalProperties: false },
  resultDescription: 'Object ID', requiredScopes: ['calendar.write'], identityModes: ['user'], effect: 'write',
}] };
function setup() {
  const root = mkdtempSync(path.join(tmpdir(), 'capabilities-')); roots.push(root);
  const auth = { principalId: 'user-1', tenantId: 'tenant-1', revision: 'a1', identityMode: 'user' as const, status: 'authorized' as const, scopes: ['calendar.write'] };
  const provider: PluginCapabilityProvider = { list: vi.fn(async () => catalog), authorization: vi.fn(async () => auth),
    validate: vi.fn((_name, args) => typeof args.title === 'string' && Object.keys(args).length === 1), invoke: vi.fn(async () => ({ id: 'external-1' })) };
  const policy = { authorize: vi.fn(async () => true) };
  return { root, provider, policy, auth, session: new PluginCapabilitySession(context, provider, policy, root) };
}
const request = { name: 'calendar.create', catalogRevision: 'r1', callId: 'call-1', arguments: { title: 'test' } };

describe('connection capability boundary', () => {
  it('discovers 1000 cached descriptors within the bounded latency and result limits', async () => {
    const { root, policy, auth } = setup();
    const largeCatalog: PluginCapabilityCatalog = {
      ...catalog,
      capabilities: Array.from({ length: 1000 }, (_, index) => ({
        ...catalog.capabilities[0],
        name: `documents.search.${index}`,
        description: `Search document ${index}`,
        effect: 'read',
      })),
    };
    const provider: PluginCapabilityProvider = {
      list: async () => largeCatalog,
      authorization: async () => auth,
      validate: () => true,
      invoke: async () => ({}),
    };
    const session = new PluginCapabilitySession(context, provider, policy, root);
    const durations: number[] = [];
    for (let index = 0; index < 20; index += 1) {
      const started = performance.now();
      const result = await session.discover(actor, 'document');
      durations.push(performance.now() - started);
      expect(result.capabilities).toHaveLength(20);
      expect(result.capabilities.every(item => item.inputSchema === undefined)).toBe(true);
    }
    durations.sort((left, right) => left - right);
    expect(durations[Math.ceil(durations.length * 0.95) - 1]).toBeLessThan(500);
  });

  it('discovers and invokes a new non-calendar capability without Core registration', async () => {
    const { root, policy, auth } = setup();
    const drive = { ...catalog.capabilities[0], name: 'drive.files.search', description: 'Search drive files', effect: 'read' as const };
    const provider: PluginCapabilityProvider = {
      list: async () => ({ ...catalog, capabilities: [drive] }),
      authorization: async () => auth,
      validate: (name, args) => name === drive.name && typeof args.title === 'string',
      invoke: async (_context, input) => ({ capability: input.name, count: 1 }),
    };
    const session = new PluginCapabilitySession(context, provider, policy, root);
    expect((await session.discover(actor, 'drive')).capabilities[0].name).toBe(drive.name);
    await expect(session.invoke(actor, { ...request, name: drive.name })).resolves.toEqual({ capability: drive.name, count: 1 });
  });

  it('finds capabilities from natural-language queries without requiring every synonym to match', async () => {
    const { session } = setup();
    const discovered = await session.discover(actor, '日历');
    expect(discovered.capabilities.map(item => item.name)).toEqual(['calendar.create']);
    expect(discovered.authorizationStatus).toBe('authorized');
    const empty = await session.discover(actor, '完全无关的能力');
    expect(empty).toMatchObject({ authorizationStatus: 'authorized', capabilities: [] });
  });

  it('validates descriptions and lazily returns schema, enforcing live scopes and actor policy', async () => {
    const { session, provider, policy, auth } = setup();
    expect(await session.inspect()).toEqual({ state: 'available', provider: catalog.provider, providerVersion: catalog.providerVersion, capabilityCount: 1, identityMode: 'user' });
    expect((await session.discover(actor)).capabilities[0]).not.toHaveProperty('inputSchema');
    expect((await session.discover(actor, '', request.name)).capabilities[0].inputSchema).toEqual(catalog.capabilities[0].inputSchema);
    expect(policy.authorize).toHaveBeenCalledWith(expect.objectContaining({ actor, connectorId: 'connection-1', authorization: auth }));
    provider.authorization = vi.fn(async () => ({ ...auth, scopes: [] }));
    expect((await session.discover(actor)).capabilities[0].availability).toBe('needs_authorization');
    await expect(session.invoke(actor, request)).rejects.toThrow('DENIED');
    expect(provider.invoke).not.toHaveBeenCalled();
    expect(() => validateCapabilityCatalog({ ...catalog, capabilities: [...catalog.capabilities, ...catalog.capabilities] })).toThrow('INVALID_CATALOG');
    expect(() => validateCapabilityCatalog({ ...catalog, capabilities: [{ ...catalog.capabilities[0], inputSchema: { type: 'object', properties: { x: { $ref: 'https://bad/schema' } } } }] })).toThrow('INVALID_CATALOG');
  });

  it('reports an uninitialized connection as needing authorization before catalog discovery', async () => {
    const { root, provider, policy, auth } = setup();
    provider.authorization = vi.fn(async () => ({ ...auth, status: 'needs_authorization', scopes: [] }));
    provider.list = vi.fn(async () => { throw new Error('schema requires authorization'); });
    const session = new PluginCapabilitySession(context, provider, policy, root);
    expect(await session.inspect()).toMatchObject({ state: 'needs_authorization', identityMode: 'user' });
    expect(provider.list).not.toHaveBeenCalled();
  });

  it('blocks unknown auth, identity mismatch, policy denial, invalid arguments, and stale schema', async () => {
    const { session, provider, policy, auth } = setup();
    await expect(session.invoke(actor, { ...request, catalogRevision: 'old' })).rejects.toThrow('STALE_CATALOG');
    await expect(session.invoke(actor, { ...request, arguments: { title: 'test', url: 'https://bad' } })).rejects.toThrow('INVALID_INPUT');
    await expect(session.invoke(actor, { ...request, connectorId: 'other' } as typeof request)).rejects.toThrow('INVALID_INPUT');
    policy.authorize.mockResolvedValue(false);
    await expect(session.invoke(actor, request)).rejects.toThrow('DENIED');
    provider.authorization = vi.fn(async () => ({ ...auth, status: 'unknown' }));
    expect((await session.discover(actor)).capabilities[0].availability).toBe('unknown');
    await expect(session.invoke(actor, request)).rejects.toThrow('DENIED');
    provider.authorization = vi.fn(async () => ({ ...auth, identityMode: 'application' }));
    await expect(session.invoke(actor, request)).rejects.toThrow('DENIED');
    expect(provider.invoke).not.toHaveBeenCalled();
  });

  it('durably suppresses duplicate calls, rejects changed payload and isolates sessions', async () => {
    const { session, provider, policy, root } = setup();
    expect(await session.invoke(actor, request)).toEqual({ id: 'external-1' });
    const restored = new PluginCapabilitySession(context, provider, policy, root);
    await expect(restored.invoke(actor, request)).rejects.toThrow('ALREADY_COMPLETED');
    await expect(restored.invoke(actor, { ...request, arguments: { title: 'changed' } })).rejects.toThrow('CALL_CONFLICT');
    expect(provider.invoke).toHaveBeenCalledTimes(1);
    expect(await restored.invoke({ ...actor, sessionId: 'another-session' }, request)).toEqual({ id: 'external-1' });
    await expect(new PluginCapabilitySession({ ...context, pluginId: 'another.plugin' }, provider, policy, root).discover(actor)).rejects.toThrow('INVALID_CACHE');
  });

  it('retains uncertain writes across restart and aborts on lifecycle close', async () => {
    const { session, provider, policy, root } = setup();
    provider.invoke = vi.fn(async (_context, _input, _auth, signal) => {
      session.close(); expect(signal.aborted).toBe(true); throw new Error('SDK token=secret');
    });
    await expect(session.invoke(actor, request)).rejects.toThrow('RESULT_UNCERTAIN');
    await expect(session.discover(actor)).rejects.toThrow('UNAVAILABLE');
    await expect(new PluginCapabilitySession(context, provider, policy, root).invoke(actor, request)).rejects.toThrow('RESULT_UNCERTAIN');
    expect(provider.invoke).toHaveBeenCalledTimes(1);
  });

  it('restores legacy WeCom 850003 receipts as a service grant requirement without replaying the write', async () => {
    const { session, provider, policy, root } = setup();
    provider.invoke = vi.fn(async () => { throw new Error('IM_CAPABILITY_AUTHORIZATION_EXPIRED'); });
    await expect(session.invoke(actor, request)).rejects.toThrow('IM_CAPABILITY_AUTHORIZATION_EXPIRED');
    const restored = new PluginCapabilitySession(context, provider, policy, root);
    await expect(restored.invoke(actor, request)).rejects.toThrow('IM_CAPABILITY_SERVICE_AUTHORIZATION_REQUIRED');
    expect(provider.invoke).toHaveBeenCalledTimes(1);
  });

  it('deduplicates concurrent writes before dispatch and checks close after async policy', async () => {
    const { session, provider, policy } = setup();
    const results = await Promise.allSettled([session.invoke(actor, request), session.invoke(actor, request)]);
    expect(results.filter(r => r.status === 'fulfilled')).toHaveLength(1);
    expect(provider.invoke).toHaveBeenCalledTimes(1);
    policy.authorize.mockImplementation(async () => { session.close(); return true; });
    await expect(session.invoke(actor, { ...request, callId: 'next' })).rejects.toThrow('UNAVAILABLE');
    expect(provider.invoke).toHaveBeenCalledTimes(1);
  });

  it('revalidates authorization after approval and preserves receipts across an in-flight restart', async () => {
    const { session, provider, policy, root, auth } = setup();
    policy.authorize.mockImplementation(async () => { auth.revision = 'revoked'; return true; });
    await expect(session.invoke(actor, request)).rejects.toThrow('AUTHORIZATION_CHANGED');
    expect(provider.invoke).not.toHaveBeenCalled();
    policy.authorize.mockResolvedValue(true);
    let finish: (value: { id: string }) => void = () => {};
    provider.invoke = vi.fn(() => new Promise(resolve => { finish = resolve; }));
    const first = session.invoke(actor, request);
    await vi.waitFor(() => expect(provider.invoke).toHaveBeenCalledTimes(1));
    session.close();
    const restored = new PluginCapabilitySession(context, { ...provider, invoke: async () => ({ id: 'second' }) }, policy, root);
    await restored.invoke(actor, { ...request, callId: 'second' });
    finish({ id: 'first' });
    await first;
    await expect(restored.invoke(actor, { ...request, callId: 'second' })).rejects.toThrow('ALREADY_COMPLETED');
    await expect(restored.invoke(actor, request)).rejects.toThrow('ALREADY_COMPLETED');
  });

  it('recovers a damaged current file without replaying a reserved write', async () => {
    const { session, provider, policy, root } = setup();
    provider.invoke = vi.fn(async () => { throw new Error('transport disconnected'); });
    await expect(session.invoke(actor, request)).rejects.toThrow('RESULT_UNCERTAIN');
    const file = path.join(root, 'perception/capabilities/connection-1.json');
    const saved = JSON.parse(readFileSync(file, 'utf8'));
    expect(saved).toMatchObject({ version: '1.0', createdAt: expect.any(String), updatedAt: expect.any(String) });
    expect(JSON.stringify(saved)).not.toContain('transport disconnected');
    expect(saved.data.calls[Object.keys(saved.data.calls)[0]]).not.toHaveProperty('arguments');
    writeFileSync(file, '{');
    await expect(new PluginCapabilitySession(context, provider, policy, root).invoke(actor, request)).rejects.toThrow('RESULT_UNCERTAIN');
    expect(provider.invoke).toHaveBeenCalledTimes(1);
  });

  it('keeps old plugins compatible and requires explicit host approval and opt-in', async () => {
    const { root, provider, policy } = setup();
    const registry = new PerceptionPluginRegistry();
    const start = vi.fn(async (_pluginContext: PerceptionPluginRuntimeContext) => {});
    registry.register({ plugin: { manifest: { id: context.pluginId, name: 'Test', version: '1.0.0', hostApi: '1.0', entry: '@test/plugin', source: 'wecom', transport: 'stream',
      capabilities: ['office-capabilities'], permissions: ['office-capabilities'], configurationSchema: { version: '1.0', fields: [] } },
      officeCapabilities: provider, start, stop: async () => {}, }, approvedPermissions: ['office-capabilities'] });
    const ports: PerceptionPluginHostPorts = { credentials: { bind: vi.fn(), resolve: vi.fn(), remove: vi.fn() }, events: { submit: vi.fn() }, network: { request: vi.fn() },
      schedule: { every: vi.fn(), cancel: vi.fn() }, state: { read: vi.fn(), write: vi.fn(), remove: vi.fn() }, health: { report: vi.fn() }, audit: { record: vi.fn() } };
    const host = new PerceptionPluginHost(registry, ports, { dataRoot: root, policy });
    await host.start(context.pluginId, context.connectorId);
    await expect(host.discoverCapabilities(context.pluginId, context.connectorId, actor)).rejects.toThrow('UNAVAILABLE');
    await host.restart(context.pluginId, context.connectorId, { officeCapabilitiesEnabled: true });
    await host.start(context.pluginId, 'connection-2', { officeCapabilitiesEnabled: true });
    expect(start.mock.calls.at(-2)?.[0].officeAuthDir).toBe(path.join(root, 'perception/office-auth/test.plugin/connection-1'));
    expect(start.mock.calls.at(-1)?.[0].officeAuthDir).toBe(path.join(root, 'perception/office-auth/test.plugin/connection-2'));
    expect(await host.inspectCapabilities(context.pluginId, context.connectorId)).toMatchObject({ connectorId: context.connectorId, state: 'available', capabilityCount: 1 });
    expect((await host.discoverCapabilities(context.pluginId, context.connectorId, actor)).capabilities[0].availability).toBe('available');
    await host.stop(context.pluginId, context.connectorId);
    await expect(host.invokeCapability(context.pluginId, context.connectorId, actor, request)).rejects.toThrow('UNAVAILABLE');
  });

  it('requests connector-scoped office authorization while provisioning only when enabled', async () => {
    const { root, provider, policy, auth } = setup();
    provider.requestAuthorization = vi.fn(async () => auth);
    const registry = new PerceptionPluginRegistry();
    registry.register({
      plugin: {
        manifest: {
          id: context.pluginId, name: 'Test', version: '1.0.0', hostApi: '1.0', entry: '@test/plugin', source: 'wecom', transport: 'stream',
          capabilities: ['office-capabilities'], permissions: ['credentials', 'office-capabilities'], configurationSchema: { version: '1.0', fields: [] },
        },
        officeCapabilities: provider,
        provision: vi.fn(async () => ({ settings: { transport: 'stream' } })),
        start: async () => {}, stop: async () => {},
      },
      approvedPermissions: ['credentials', 'office-capabilities'],
    });
    const host = new PerceptionPluginHost(registry, {
      credentials: { bind: vi.fn(), resolve: vi.fn(), remove: vi.fn() }, events: { submit: vi.fn() }, network: { request: vi.fn() },
      schedule: { every: vi.fn(), cancel: vi.fn() }, state: { read: vi.fn(), write: vi.fn(), remove: vi.fn() }, health: { report: vi.fn() }, audit: { record: vi.fn() },
    }, { dataRoot: root, policy });

    await host.provision(context.pluginId, 'connection-1', { officeCapabilitiesEnabled: false }, {});
    expect(provider.requestAuthorization).not.toHaveBeenCalled();
    await host.provision(context.pluginId, 'connection-2', { officeCapabilitiesEnabled: true }, {});
    expect(provider.requestAuthorization).toHaveBeenCalledWith(
      expect.objectContaining({
        connectorId: 'connection-2',
        officeAuthDir: path.join(root, 'perception/office-auth/test.plugin/connection-2'),
      }),
      expect.any(AbortSignal)
    );
  });
});
