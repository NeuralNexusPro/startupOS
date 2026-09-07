import { safeStorage } from 'electron';
import { dingtalkPlugin } from '@originos/perception-plugin-dingtalk';
import { feishuPlugin } from '@originos/perception-plugin-feishu';
import { weComPlugin } from '@originos/perception-plugin-wecom';
import { getDataRoot } from '../../../../../core/src/lib/paths';
import { FileSystemPerceptionTargetRegistry } from '../../../../../core/src/lib/features/services/perception-target-registry';
import { ChannelTriggerExecutionAdapter, ConnectorHealthStore, ExternalTriggerGrantStore, FileTargetAuthorizationPort, PerceptionConnectorConfigStore, PerceptionEventStore, PerceptionPluginHost, PerceptionPluginRegistry, PerceptionRouter, TriggerRuleStore, type PerceptionPluginHostPorts, type PerceptionPluginWebhookRequest, type PerceptionPluginWebhookResult } from '../../../../../core/src/modules/perception-runtime';
import type { ChannelMessageIngress } from '../../../../../core/src/modules/channel-runtime';
import { SafeStorageWeComCredentialAdapter } from '../perception-wecom/safe-storage-wecom-credential-adapter';
import { SafeStoragePerceptionCredentialAdapter } from './safe-storage-perception-credential-adapter';
import { PluginReplyDeliveryService } from './plugin-reply-delivery-service';

const PLUGIN_IDS: Record<string, string> = { wecom: 'originos.wecom', feishu: 'originos.feishu', dingtalk: 'originos.dingtalk' };

export class PerceptionPluginHostService {
  private readonly timers = new Map<string, NodeJS.Timeout>();
  private readonly host: PerceptionPluginHost;
  private readonly configs: PerceptionConnectorConfigStore;
  private readonly replies: PluginReplyDeliveryService;
  private timer: NodeJS.Timeout | null = null;
  private active = new Set<string>();
  constructor(
    private readonly channelIngress: ChannelMessageIngress,
    private readonly dataRoot = getDataRoot(),
  ) {
    this.configs = new PerceptionConnectorConfigStore(dataRoot);
    this.replies = new PluginReplyDeliveryService(dataRoot);
    const registry = new PerceptionPluginRegistry();
    registry.register({ plugin: weComPlugin, approvedPermissions: ['credentials', 'events', 'network', 'health', 'replies'] });
    registry.register({ plugin: feishuPlugin, approvedPermissions: ['credentials', 'events', 'health'] });
    registry.register({ plugin: dingtalkPlugin, approvedPermissions: ['events', 'health'] });
    this.host = new PerceptionPluginHost(registry, this.createPorts());
  }
  start(): void { if (!this.timer) { void this.reconcile(); this.timer = setInterval(() => { void this.reconcile(); }, 5_000); this.timer.unref(); } }
  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    for (const key of this.active) { const [pluginId, ...rest] = key.split(':'); if (pluginId) void this.host.stop(pluginId, rest.join(':')); }
    this.active.clear();
    for (const timer of this.timers.values()) clearInterval(timer);
    this.timers.clear();
  }
  async handleWebhook(pluginId: string, connectorId: string, request: PerceptionPluginWebhookRequest): Promise<PerceptionPluginWebhookResult> {
    return this.host.handleWebhook(pluginId, connectorId, request);
  }
  private async reconcile(): Promise<void> {
    const configs = this.configs.list().filter((item) => PLUGIN_IDS[item.source] && (item.mode === 'stream' || item.mode === 'webhook'));
    const desired = new Set(configs.filter((item) => item.enabled).map((item) => `${PLUGIN_IDS[item.source]}:${item.id}`));
    for (const key of this.active) {
      if (!desired.has(key)) { const [pluginId, ...rest] = key.split(':'); if (pluginId) await this.host.stop(pluginId, rest.join(':')); this.active.delete(key); }
    }
    for (const config of configs) {
      const pluginId = PLUGIN_IDS[config.source];
      if (!pluginId) continue;
      const key = `${pluginId}:${config.id}`;
      if (!config.enabled || this.active.has(key)) continue;
      const status = await this.host.start(pluginId, config.id, { ...config.settings, secretRef: config.secretRef ?? '' });
      if (status.state === 'running') this.active.add(key);
    }
  }
  private createPorts(): PerceptionPluginHostPorts {
    const wecomCredentials = new SafeStorageWeComCredentialAdapter(this.dataRoot, safeStorage);
    const pluginCredentials = new SafeStoragePerceptionCredentialAdapter(this.dataRoot, safeStorage);
    const events = new PerceptionEventStore(this.dataRoot);
    const grants = new ExternalTriggerGrantStore(this.dataRoot);
    const execution = new ChannelTriggerExecutionAdapter(this.channelIngress, undefined, this.replies);
    const router = new PerceptionRouter(this.dataRoot, new TriggerRuleStore(this.dataRoot), new FileTargetAuthorizationPort(grants, new FileSystemPerceptionTargetRegistry(this.dataRoot)), execution);
    return {
      credentials: { bind: async (id, name, secret) => name === 'wecom' ? wecomCredentials.bind(id, { value: secret }) : pluginCredentials.bind(id, name, secret), resolve: async (id, ref) => ref.startsWith('secret://perception/wecom/') ? (await wecomCredentials.resolve(ref)).value : pluginCredentials.resolve(id, ref), remove: async (id, ref) => ref.startsWith('secret://perception/wecom/') ? wecomCredentials.remove(ref) : pluginCredentials.remove(id, ref) },
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
      replies: this.replies,
    };
  }
}
