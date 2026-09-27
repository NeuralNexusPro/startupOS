import { PluginCapabilitySession, type PluginCapabilityActor, type PluginCapabilityConnectionStatus, type PluginCapabilityInvocation, type PluginCapabilityPolicyPort } from './capabilities';
import type { JsonValue } from '../protocol/types';
import { assertSafePerceptionId } from '../protocol/validation';
import type {
  PerceptionPluginHostPorts,
  PerceptionPluginInstanceStatus,
  PerceptionPluginPermission,
  PerceptionPluginRuntimeContext,
  PerceptionPluginRuntimePorts,
  PerceptionPluginWebhookRequest,
  PerceptionPluginWebhookResult,
} from './types';
import { PerceptionPluginRegistry } from './registry';
import { assertPluginEvent } from './validation';
import { createPluginSdkLogger, writePluginLog } from './logging';
import { resolvePerceptionPath } from '../storage/paths';

interface PluginInstance {
  context: PerceptionPluginRuntimeContext;
  status: PerceptionPluginInstanceStatus;
  capabilities?: PluginCapabilitySession;
}

function instanceKey(pluginId: string, connectorId: string): string { return `${pluginId}:${connectorId}`; }

export class PerceptionPluginHost {
  private readonly instances = new Map<string, PluginInstance>();
  private readonly replyRegistrations = new Map<string, Set<() => void>>();
  private readonly scheduledKeys = new Map<string, Set<string>>();

  constructor(private readonly registry: PerceptionPluginRegistry, private readonly ports: PerceptionPluginHostPorts,
    private readonly capabilityOptions?: { dataRoot: string; policy: PluginCapabilityPolicyPort }) {}

  private context(pluginId: string, connectorId: string, settings: Readonly<Record<string, JsonValue>>): PerceptionPluginRuntimeContext {
    const entry = this.registry.get(pluginId);
    if (!entry) throw new Error(`Plugin not registered: ${pluginId}`);
    assertSafePerceptionId(connectorId, 'connector id');
    const approved = new Set<PerceptionPluginPermission>(entry.approvedPermissions);
    const exposed: { -readonly [Key in keyof PerceptionPluginRuntimePorts]: PerceptionPluginRuntimePorts[Key] } = {};
    if (this.ports.log) {
      exposed.log = { write: record => { try { this.ports.log?.write(pluginId, connectorId, record); } catch { /* isolated diagnostics */ } } };
      exposed.log.sdkLogger = createPluginSdkLogger(exposed.log);
    }
    if (approved.has('credentials')) {
      exposed.credentials = {
        bind: async (requestedConnectorId, name, secret) => {
          if (requestedConnectorId !== connectorId) throw new Error('Plugin credential scope mismatch');
          return this.ports.credentials.bind(connectorId, name, secret);
        },
        resolve: async (requestedConnectorId, secretRef) => {
          if (requestedConnectorId !== connectorId) throw new Error('Plugin credential scope mismatch');
          return this.ports.credentials.resolve(connectorId, secretRef);
        },
        remove: async (requestedConnectorId, secretRef) => {
          if (requestedConnectorId !== connectorId) throw new Error('Plugin credential scope mismatch');
          return this.ports.credentials.remove(connectorId, secretRef);
        },
      };
    }
    if (approved.has('network')) exposed.network = this.ports.network;
    if (approved.has('schedule')) {
      const scopedKeys = this.scheduledKeys.get(instanceKey(pluginId, connectorId)) ?? new Set<string>();
      this.scheduledKeys.set(instanceKey(pluginId, connectorId), scopedKeys);
      exposed.schedule = {
        every: (key, intervalMs, task) => {
          assertSafePerceptionId(key, 'schedule key');
          const scopedKey = `${pluginId}:${connectorId}:${key}`;
          scopedKeys.add(scopedKey);
          this.ports.schedule.every(scopedKey, intervalMs, task);
        },
        cancel: (key) => {
          const scopedKey = `${pluginId}:${connectorId}:${key}`;
          scopedKeys.delete(scopedKey);
          this.ports.schedule.cancel(scopedKey);
        },
      };
    }
    if (approved.has('state')) {
      exposed.state = {
        read: async (key) => { assertSafePerceptionId(key, 'plugin state key'); return this.ports.state.read(`${pluginId}:${connectorId}:${key}`); },
        write: async (key, value) => { assertSafePerceptionId(key, 'plugin state key'); await this.ports.state.write(`${pluginId}:${connectorId}:${key}`, value); },
        remove: async (key) => { assertSafePerceptionId(key, 'plugin state key'); await this.ports.state.remove(`${pluginId}:${connectorId}:${key}`); },
      };
    }
    if (approved.has('health')) exposed.health = { report: (health) => this.ports.health.report({ ...health, pluginId, connectorId }) };
    if (approved.has('audit')) exposed.audit = this.ports.audit;
    if (approved.has('attachments') && this.ports.attachments) {
      exposed.attachments = {
        store: async (requestedConnectorId, file) => {
          if (requestedConnectorId !== connectorId) throw new Error('Plugin attachment scope mismatch');
          return this.ports.attachments!.store(connectorId, file);
        },
      };
    }
    if (approved.has('replies') && this.ports.replies) {
      const key = instanceKey(pluginId, connectorId);
      const registrations = this.replyRegistrations.get(key) ?? new Set<() => void>();
      this.replyRegistrations.set(key, registrations);
      exposed.replies = { register: (handle, deliver, options) => {
        if (this.replyRegistrations.get(key) !== registrations) throw new Error('IM_FILE_REPLY_UNAVAILABLE');
        const unregister = this.ports.replies!.register(handle, async event => {
          try { return await deliver(event); }
          catch (error) { writePluginLog(exposed.log, { level: 'error', stage: 'delivery', error }); throw error; }
        }, {
          supportsFiles: options?.supportsFiles === true && entry.plugin.manifest.capabilities.includes('outbound-files'),
        });
        const remove = () => { registrations.delete(remove); unregister(); };
        registrations.add(remove);
        return remove;
      } };
    }
    if (approved.has('events')) {
      exposed.events = {
        submit: async (event, options) => {
          try {
            assertPluginEvent(event, entry.plugin.manifest, connectorId);
            const result = await this.ports.events.submit(event, options);
            writePluginLog(exposed.log, { level: 'info', stage: 'event.dispatched', eventId: event.id });
            return result;
          } catch (error) {
            writePluginLog(exposed.log, { level: 'error', stage: 'event.submit', eventId: event.id, error });
            await this.safeAudit(pluginId, connectorId, 'plugin.event.rejected', { safeCode: 'PLUGIN_EVENT_REJECTED' });
            throw error;
          }
        },
      };
    }
    return Object.freeze({ pluginId, connectorId, settings: Object.freeze({ ...settings }), ports: Object.freeze(exposed),
      ...(approved.has('office-capabilities') && this.capabilityOptions
        ? { officeAuthDir: resolvePerceptionPath(this.capabilityOptions.dataRoot, 'office-auth', pluginId, connectorId) } : {}),
    });
  }

  async start(pluginId: string, connectorId: string, settings: Readonly<Record<string, JsonValue>> = {}): Promise<PerceptionPluginInstanceStatus> {
    const entry = this.registry.get(pluginId);
    if (!entry) throw new Error(`Plugin not registered: ${pluginId}`);
    const key = instanceKey(pluginId, connectorId);
    const current = this.instances.get(key);
    if (current?.status.state === 'running' || current?.status.state === 'starting') return current.status;
    const context = this.context(pluginId, connectorId, settings);
    const instance: PluginInstance = { context, status: { pluginId, connectorId, state: 'starting' } };
    this.instances.set(key, instance);
    try {
      await entry.plugin.start(context);
      instance.status = { pluginId, connectorId, state: 'running' };
      writePluginLog(context.ports.log, { level: 'info', stage: 'lifecycle.started' });
    } catch (error) {
      writePluginLog(context.ports.log, { level: 'error', stage: 'lifecycle.start', safeCode: 'PLUGIN_START_FAILED', error });
      instance.status = { pluginId, connectorId, state: 'failed', safeCode: 'PLUGIN_START_FAILED' };
      await this.safeAudit(pluginId, connectorId, 'plugin.start.failed', { safeCode: 'PLUGIN_START_FAILED' });
    }
    return instance.status;
  }

  async provision(pluginId: string, connectorId: string, settings: Readonly<Record<string, JsonValue>>, secrets: Readonly<Record<string, string>>): Promise<import('./types').PerceptionPluginProvisionResult> {
    const entry = this.registry.get(pluginId);
    if (!entry) throw new Error(`Plugin not registered: ${pluginId}`);
    if (!entry.plugin.provision) return { settings };
    const context = this.context(pluginId, connectorId, settings);
    try {
      const result = await entry.plugin.provision(Object.freeze({ ...context, secrets: Object.freeze({ ...secrets }) }));
      if (settings['officeCapabilitiesEnabled'] === true && entry.plugin.officeCapabilities?.requestAuthorization) {
        const authorization = await entry.plugin.officeCapabilities.requestAuthorization(context, new AbortController().signal);
        if (authorization.status !== 'authorized') throw new Error('IM_CAPABILITY_AUTHORIZATION_REQUIRED');
      }
      return result;
    }
    catch (error) { writePluginLog(context.ports.log, { level: 'error', stage: 'lifecycle.provision', error }); throw error; }
  }

  async stop(pluginId: string, connectorId: string): Promise<PerceptionPluginInstanceStatus> {
    const key = instanceKey(pluginId, connectorId);
    const instance = this.instances.get(key);
    if (!instance || instance.status.state === 'stopped') return { pluginId, connectorId, state: 'stopped' };
    const entry = this.registry.get(pluginId);
    if (!entry) throw new Error(`Plugin not registered: ${pluginId}`);
    for (const remove of this.replyRegistrations.get(key) ?? []) remove();
    this.replyRegistrations.delete(key);
    instance.capabilities?.close();
    instance.status = { pluginId, connectorId, state: 'stopping' };
    try {
      await entry.plugin.stop(instance.context);
      instance.status = { pluginId, connectorId, state: 'stopped' };
      writePluginLog(instance.context.ports.log, { level: 'info', stage: 'lifecycle.stopped' });
    } catch (error) {
      writePluginLog(instance.context.ports.log, { level: 'error', stage: 'lifecycle.stop', safeCode: 'PLUGIN_STOP_FAILED', error });
      instance.status = { pluginId, connectorId, state: 'failed', safeCode: 'PLUGIN_STOP_FAILED' };
      await this.safeAudit(pluginId, connectorId, 'plugin.stop.failed', { safeCode: 'PLUGIN_STOP_FAILED' });
    }
    for (const scheduledKey of this.scheduledKeys.get(key) ?? []) this.ports.schedule.cancel(scheduledKey);
    this.scheduledKeys.delete(key);
    return instance.status;
  }

  async restart(pluginId: string, connectorId: string, settings?: Readonly<Record<string, JsonValue>>): Promise<PerceptionPluginInstanceStatus> {
    const previous = this.instances.get(instanceKey(pluginId, connectorId));
    await this.stop(pluginId, connectorId);
    return this.start(pluginId, connectorId, settings ?? previous?.context.settings ?? {});
  }

  status(pluginId: string, connectorId: string): PerceptionPluginInstanceStatus {
    return this.instances.get(instanceKey(pluginId, connectorId))?.status ?? { pluginId, connectorId, state: 'registered' };
  }

  /** Dispatches an already bounded webhook through the running plugin instance. */
  async handleWebhook(pluginId: string, connectorId: string, request: PerceptionPluginWebhookRequest): Promise<PerceptionPluginWebhookResult> {
    const instance = this.instances.get(instanceKey(pluginId, connectorId));
    if (!instance || instance.status.state !== 'running') throw new Error('Plugin is not running');
    const plugin = this.registry.get(pluginId)?.plugin;
    if (!plugin?.handleWebhook) throw new Error('Plugin does not support webhooks');
    return plugin.handleWebhook(instance.context, request);
  }

  private capabilitySession(pluginId: string, connectorId: string): PluginCapabilitySession {
    const instance = this.instances.get(instanceKey(pluginId, connectorId));
    const entry = this.registry.get(pluginId);
    if (!entry?.plugin.officeCapabilities || !entry.plugin.manifest.capabilities.includes('office-capabilities')) throw new Error('IM_CAPABILITY_UNSUPPORTED');
    if (!instance || instance.status.state !== 'running' || instance.context.settings['officeCapabilitiesEnabled'] !== true ||
      !entry.approvedPermissions.includes('office-capabilities') || !this.capabilityOptions) throw new Error('IM_CAPABILITY_UNAVAILABLE');
    return instance.capabilities ??= new PluginCapabilitySession(instance.context, entry.plugin.officeCapabilities,
      this.capabilityOptions.policy, this.capabilityOptions.dataRoot);
  }

  async discoverCapabilities(pluginId: string, connectorId: string, actor: PluginCapabilityActor, query?: string, name?: string) {
    try { return await this.capabilitySession(pluginId, connectorId).discover(actor, query, name); }
    catch (error) { throw new Error(error instanceof Error && /^IM_CAPABILITY_[A-Z_]+$/.test(error.message) ? error.message : 'IM_CAPABILITY_DISCOVERY_FAILED'); }
  }

  async inspectCapabilities(pluginId: string, connectorId: string): Promise<PluginCapabilityConnectionStatus> {
    try { return { connectorId, ...await this.capabilitySession(pluginId, connectorId).inspect() }; }
    catch (error) {
      const code = error instanceof Error ? error.message : '';
      if (code === 'IM_CAPABILITY_UNAVAILABLE') return { connectorId, state: 'disabled' };
      return { connectorId, state: 'sync_failed' };
    }
  }

  async invokeCapability(pluginId: string, connectorId: string, actor: PluginCapabilityActor, input: PluginCapabilityInvocation): Promise<JsonValue> {
    try {
      const result = await this.capabilitySession(pluginId, connectorId).invoke(actor, input);
      await this.safeAudit(pluginId, connectorId, 'plugin.capability.completed', { eventId: actor.eventId, sessionId: actor.sessionId, callId: input.callId, name: input.name });
      return result;
    } catch (error) {
      await this.safeAudit(pluginId, connectorId, 'plugin.capability.failed', { eventId: actor.eventId, sessionId: actor.sessionId, callId: input.callId, name: input.name });
      // Never expose an SDK error body (which may contain tokens or business data).
      const safeCode = error instanceof Error && /^IM_CAPABILITY_[A-Z_]+$/.test(error.message) ? error.message : 'IM_CAPABILITY_FAILED';
      throw new Error(safeCode);
    }
  }

  private async safeAudit(pluginId: string, connectorId: string, action: string, detail: JsonValue): Promise<void> {
    const entry = this.registry.get(pluginId);
    if (!entry?.approvedPermissions.includes('audit')) return;
    try { await this.ports.audit.record(action, { pluginId, connectorId, detail }); } catch { /* audit must not break isolation */ }
  }
}
