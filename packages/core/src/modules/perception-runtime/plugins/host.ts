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

interface PluginInstance {
  context: PerceptionPluginRuntimeContext;
  status: PerceptionPluginInstanceStatus;
}

function instanceKey(pluginId: string, connectorId: string): string { return `${pluginId}:${connectorId}`; }

export class PerceptionPluginHost {
  private readonly instances = new Map<string, PluginInstance>();
  private readonly scheduledKeys = new Map<string, Set<string>>();

  constructor(private readonly registry: PerceptionPluginRegistry, private readonly ports: PerceptionPluginHostPorts) {}

  private context(pluginId: string, connectorId: string, settings: Readonly<Record<string, JsonValue>>): PerceptionPluginRuntimeContext {
    const entry = this.registry.get(pluginId);
    if (!entry) throw new Error(`Plugin not registered: ${pluginId}`);
    assertSafePerceptionId(connectorId, 'connector id');
    const approved = new Set<PerceptionPluginPermission>(entry.approvedPermissions);
    const exposed: { -readonly [Key in keyof PerceptionPluginRuntimePorts]: PerceptionPluginRuntimePorts[Key] } = {};
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
    if (approved.has('health')) exposed.health = { report: (health) => this.ports.health.report({ ...health, pluginId, connectorId }) };
    if (approved.has('audit')) exposed.audit = this.ports.audit;
    if (approved.has('events')) {
      exposed.events = {
        submit: async (event) => {
          try {
            assertPluginEvent(event, entry.plugin.manifest, connectorId);
            return await this.ports.events.submit(event);
          } catch (error) {
            await this.safeAudit(pluginId, connectorId, 'plugin.event.rejected', { safeCode: 'PLUGIN_EVENT_REJECTED' });
            throw error;
          }
        },
      };
    }
    return Object.freeze({ pluginId, connectorId, settings: Object.freeze({ ...settings }), ports: Object.freeze(exposed) });
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
    } catch {
      instance.status = { pluginId, connectorId, state: 'failed', safeCode: 'PLUGIN_START_FAILED' };
      await this.safeAudit(pluginId, connectorId, 'plugin.start.failed', { safeCode: 'PLUGIN_START_FAILED' });
    }
    return instance.status;
  }

  async stop(pluginId: string, connectorId: string): Promise<PerceptionPluginInstanceStatus> {
    const key = instanceKey(pluginId, connectorId);
    const instance = this.instances.get(key);
    if (!instance || instance.status.state === 'stopped') return { pluginId, connectorId, state: 'stopped' };
    const entry = this.registry.get(pluginId);
    if (!entry) throw new Error(`Plugin not registered: ${pluginId}`);
    instance.status = { pluginId, connectorId, state: 'stopping' };
    try {
      await entry.plugin.stop(instance.context);
      instance.status = { pluginId, connectorId, state: 'stopped' };
    } catch {
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

  private async safeAudit(pluginId: string, connectorId: string, action: string, detail: JsonValue): Promise<void> {
    const entry = this.registry.get(pluginId);
    if (!entry?.approvedPermissions.includes('audit')) return;
    try { await this.ports.audit.record(action, { pluginId, connectorId, detail }); } catch { /* audit must not break isolation */ }
  }
}
