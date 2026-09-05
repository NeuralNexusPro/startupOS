import { safeStorage } from 'electron';
import { weComPlugin } from '@originos/perception-plugin-wecom';
import { getDataRoot } from '../../../../../core/src/lib/paths';
import { FileSystemPerceptionTargetRegistry } from '../../../../../core/src/lib/features/services/perception-target-registry';
import { ChannelTriggerExecutionAdapter, ConnectorHealthStore, ExternalTriggerGrantStore, FileTargetAuthorizationPort, PerceptionConnectorConfigStore, PerceptionEventStore, PerceptionPluginHost, PerceptionPluginRegistry, PerceptionRouter, TriggerRuleStore, type PerceptionPluginHostPorts } from '../../../../../core/src/modules/perception-runtime';
import type { ChannelMessageIngress } from '../../../../../core/src/modules/channel-runtime';
import { SafeStorageWeComCredentialAdapter } from '../perception-wecom/safe-storage-wecom-credential-adapter';

const PLUGIN_ID = 'originos.wecom';

export class PerceptionPluginHostService {
  private readonly timers = new Map<string, NodeJS.Timeout>();
  private readonly host: PerceptionPluginHost;
  private readonly configs: PerceptionConnectorConfigStore;
  private timer: NodeJS.Timeout | null = null;
  private active = new Set<string>();
  constructor(
    private readonly channelIngress: ChannelMessageIngress,
    private readonly dataRoot = getDataRoot(),
  ) {
    this.configs = new PerceptionConnectorConfigStore(dataRoot);
    const registry = new PerceptionPluginRegistry();
    registry.register({ plugin: weComPlugin, approvedPermissions: ['credentials', 'events', 'network', 'health'] });
    this.host = new PerceptionPluginHost(registry, this.createPorts());
  }
  start(): void { if (!this.timer) { void this.reconcile(); this.timer = setInterval(() => { void this.reconcile(); }, 5_000); this.timer.unref(); } }
  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    for (const id of this.active) void this.host.stop(PLUGIN_ID, id);
    this.active.clear();
    for (const timer of this.timers.values()) clearInterval(timer);
    this.timers.clear();
  }
  private async reconcile(): Promise<void> {
    const configs = this.configs.list().filter((item) => item.source === 'wecom' && item.mode === 'stream');
    const desired = new Set(configs.filter((item) => item.enabled).map((item) => item.id));
    for (const id of this.active) if (!desired.has(id)) { await this.host.stop(PLUGIN_ID, id); this.active.delete(id); }
    for (const config of configs) {
      if (!config.enabled || this.active.has(config.id)) continue;
      const status = await this.host.start(PLUGIN_ID, config.id, { ...config.settings, secretRef: config.secretRef ?? '' });
      if (status.state === 'running') this.active.add(config.id);
    }
  }
  private createPorts(): PerceptionPluginHostPorts {
    const credentials = new SafeStorageWeComCredentialAdapter(this.dataRoot, safeStorage);
    const events = new PerceptionEventStore(this.dataRoot);
    const grants = new ExternalTriggerGrantStore(this.dataRoot);
    const execution = new ChannelTriggerExecutionAdapter(this.channelIngress);
    const router = new PerceptionRouter(this.dataRoot, new TriggerRuleStore(this.dataRoot), new FileTargetAuthorizationPort(grants, new FileSystemPerceptionTargetRegistry(this.dataRoot)), execution);
    return {
      credentials: { bind: async (id, _name, secret) => credentials.bind(id, { value: secret }), resolve: async (_id, ref) => (await credentials.resolve(ref)).value, remove: async (_id, ref) => credentials.remove(ref) },
      events: {
        submit: async (event) => {
          const saved = events.save(event);
          if (saved.duplicate) return [{ status: 'duplicate' as const }];
          return router.route(saved.event);
        },
      },
      network: { request: async (input) => { const response = await fetch(input.url, { method: input.method, headers: input.headers, body: input.body }); return { status: response.status, headers: Object.fromEntries(response.headers.entries()), body: await response.text() }; } },
      schedule: { every: (key, ms, task) => { const timer = setInterval(() => { void task(); }, ms); timer.unref(); this.timers.set(key, timer); }, cancel: (key) => { const timer = this.timers.get(key); if (timer) clearInterval(timer); this.timers.delete(key); } },
      health: { report: async (health) => {
        if (!health.connectorId) return;
        const detail = health.detail && !Array.isArray(health.detail) && typeof health.detail === 'object' ? health.detail : {};
        const state = detail['connectionState'];
        new ConnectorHealthStore(this.dataRoot).save({ connectorId: health.connectorId, mode: 'stream', status: health.status, connectionState: state === 'connected' || state === 'reconnecting' ? state : 'disconnected', reconnectCount: typeof detail['reconnectCount'] === 'number' ? detail['reconnectCount'] : 0, pendingHandlers: 0, lastSuccessAt: typeof detail['lastSuccessAt'] === 'string' ? detail['lastSuccessAt'] : undefined, lastSafeCode: health.safeCode, updatedAt: new Date().toISOString() });
      } },
      audit: { record: async () => undefined },
    };
  }
}
