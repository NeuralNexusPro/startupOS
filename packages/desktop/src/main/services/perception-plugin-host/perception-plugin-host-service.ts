import { ipcMain, safeStorage } from 'electron';
import { dingtalkPlugin } from '@originos/perception-plugin-dingtalk';
import { emailPlugin } from '@originos/perception-plugin-email';
import { feishuPlugin } from '@originos/perception-plugin-feishu';
import { weComPlugin } from '@originos/perception-plugin-wecom';
import { getDataRoot } from '../../../../../core/src/lib/paths';
import { FileSystemPerceptionTargetRegistry } from '../../../../../core/src/lib/features/services/perception-target-registry';
import {
  ChannelTriggerExecutionAdapter,
  ConnectorHealthStore,
  ExternalTriggerGrantStore,
  FileTargetAuthorizationPort,
  PerceptionConnectorConfigStore,
  PerceptionEventStore,
  PerceptionPluginHost,
  PerceptionPluginRegistry,
  PerceptionRouter,
  TriggerRuleStore,
  type PerceptionPluginHostPorts,
  type PerceptionPluginWebhookRequest,
  type PerceptionPluginWebhookResult,
} from '../../../../../core/src/modules/perception-runtime';
import type { ChannelMessageIngress } from '../../../../../core/src/modules/channel-runtime';
import { SafeStorageWeComCredentialAdapter } from '../perception-wecom/safe-storage-wecom-credential-adapter';
import { SafeStoragePerceptionCredentialAdapter } from './safe-storage-perception-credential-adapter';
import { SafeStorageMailCredentialAdapter } from '../perception-mail/safe-storage-credential-adapter';
import { PluginReplyDeliveryService } from './plugin-reply-delivery-service';
import { IPC_CHANNELS } from '../../ipc-protocol';
import type { IpcResponse } from '../../../../../core/src/lib/integrations/electron/ipc-protocol';
import type {
  JsonValue,
  PerceptionPluginManifest,
} from '../../../../../core/src/modules/perception-runtime';
import { FilePluginStateAdapter } from './file-plugin-state-adapter';

const BUNDLED_CATALOG = [
  {
    plugin: emailPlugin,
    approvedPermissions: [
      'credentials',
      'events',
      'schedule',
      'state',
      'health',
    ] as const,
  },
  {
    plugin: weComPlugin,
    approvedPermissions: [
      'credentials',
      'events',
      'network',
      'health',
      'replies',
    ] as const,
  },
  {
    plugin: feishuPlugin,
    approvedPermissions: [
      'credentials',
      'events',
      'health',
      'replies',
    ] as const,
  },
  {
    plugin: dingtalkPlugin,
    approvedPermissions: ['events', 'health'] as const,
  },
];
const PLUGIN_IDS = Object.fromEntries(
  BUNDLED_CATALOG.map(({ plugin }) => [
    plugin.manifest.source,
    plugin.manifest.id,
  ])
);

export class PerceptionPluginHostService {
  private readonly timers = new Map<string, NodeJS.Timeout>();
  private readonly host: PerceptionPluginHost;
  private readonly configs: PerceptionConnectorConfigStore;
  private readonly replies: PluginReplyDeliveryService;
  private timer: NodeJS.Timeout | null = null;
  private active = new Set<string>();
  constructor(
    private readonly channelIngress: ChannelMessageIngress,
    private readonly dataRoot = getDataRoot()
  ) {
    this.configs = new PerceptionConnectorConfigStore(dataRoot);
    this.replies = new PluginReplyDeliveryService(dataRoot);
    const registry = new PerceptionPluginRegistry();
    registry.registerCatalog(
      BUNDLED_CATALOG.map((entry) => ({
        plugin: entry.plugin,
        approvedPermissions: [...entry.approvedPermissions],
      }))
    );
    this.host = new PerceptionPluginHost(registry, this.createPorts());
    this.registerProvisioningIpc();
  }
  private registerProvisioningIpc(): void {
    ipcMain.handle(
      IPC_CHANNELS.PERCEPTION_PLUGIN_CATALOG,
      async (): Promise<IpcResponse<PerceptionPluginManifest[]>> => ({
        success: true,
        data: BUNDLED_CATALOG.map(({ plugin }) => plugin.manifest),
        timestamp: new Date().toISOString(),
      })
    );
    ipcMain.handle(
      IPC_CHANNELS.PERCEPTION_PLUGIN_PROVISION,
      async (
        _event,
        request: {
          pluginId: string;
          connectorId: string;
          settings: Record<string, JsonValue>;
          secrets: Record<string, string>;
        }
      ): Promise<
        IpcResponse<{ connectorId: string; secretConfigured: boolean }>
      > => {
        try {
          const entry = BUNDLED_CATALOG.find(
            ({ plugin }) => plugin.manifest.id === request.pluginId
          );
          if (!entry) throw new Error('PLUGIN_NOT_FOUND');
          const result = await this.host.provision(
            request.pluginId,
            request.connectorId,
            request.settings,
            request.secrets
          );
          const secretRef = Object.values(result.secretRefs ?? {})[0];
          const now = new Date().toISOString();
          const existing = this.configs.get(request.connectorId);
          this.configs.save({
            id: request.connectorId,
            pluginId: entry.plugin.manifest.id,
            pluginVersion: entry.plugin.manifest.version,
            source: entry.plugin.manifest.source,
            mode:
              entry.plugin.manifest.transport === 'poll'
                ? 'email-poll'
                : entry.plugin.manifest.transport,
            enabled: false,
            ...(secretRef ? { secretRef } : {}),
            settings: { ...(result.settings ?? request.settings) },
            createdAt: existing?.createdAt ?? now,
            updatedAt: now,
          });
          return {
            success: true,
            data: {
              connectorId: request.connectorId,
              secretConfigured: Boolean(secretRef),
            },
            timestamp: now,
          };
        } catch (error) {
          return {
            success: false,
            error: {
              code:
                error instanceof Error
                  ? error.message
                  : 'PLUGIN_PROVISION_FAILED',
              message: 'Plugin provisioning failed',
            },
            timestamp: new Date().toISOString(),
          };
        }
      }
    );
  }
  start(): void {
    if (!this.timer) {
      void this.reconcile();
      this.timer = setInterval(() => {
        void this.reconcile();
      }, 5_000);
      this.timer.unref();
    }
  }
  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    for (const key of this.active) {
      const [pluginId, ...rest] = key.split(':');
      if (pluginId) void this.host.stop(pluginId, rest.join(':'));
    }
    this.active.clear();
    for (const timer of this.timers.values()) clearInterval(timer);
    this.timers.clear();
  }
  async handleWebhook(
    pluginId: string,
    connectorId: string,
    request: PerceptionPluginWebhookRequest
  ): Promise<PerceptionPluginWebhookResult> {
    return this.host.handleWebhook(pluginId, connectorId, request);
  }
  private async reconcile(): Promise<void> {
    const configs = this.configs
      .list()
      .filter((item) => PLUGIN_IDS[item.source]);
    const desired = new Set(
      configs
        .filter((item) => item.enabled)
        .map((item) => `${PLUGIN_IDS[item.source]}:${item.id}`)
    );
    for (const key of this.active) {
      if (!desired.has(key)) {
        const [pluginId, ...rest] = key.split(':');
        if (pluginId) await this.host.stop(pluginId, rest.join(':'));
        this.active.delete(key);
      }
    }
    for (const config of configs) {
      const pluginId = PLUGIN_IDS[config.source];
      if (!pluginId) continue;
      const key = `${pluginId}:${config.id}`;
      if (!config.enabled || this.active.has(key)) continue;
      const status = await this.host.start(pluginId, config.id, {
        ...config.settings,
        secretRef: config.secretRef ?? '',
      });
      if (status.state === 'running') this.active.add(key);
    }
  }
  private createPorts(): PerceptionPluginHostPorts {
    const wecomCredentials = new SafeStorageWeComCredentialAdapter(
      this.dataRoot,
      safeStorage
    );
    const pluginCredentials = new SafeStoragePerceptionCredentialAdapter(
      this.dataRoot,
      safeStorage
    );
    const mailCredentials = new SafeStorageMailCredentialAdapter(
      this.dataRoot,
      safeStorage
    );
    const events = new PerceptionEventStore(this.dataRoot);
    const grants = new ExternalTriggerGrantStore(this.dataRoot);
    const execution = new ChannelTriggerExecutionAdapter(
      this.channelIngress,
      undefined,
      this.replies
    );
    const router = new PerceptionRouter(
      this.dataRoot,
      new TriggerRuleStore(this.dataRoot),
      new FileTargetAuthorizationPort(
        grants,
        new FileSystemPerceptionTargetRegistry(this.dataRoot)
      ),
      execution
    );
    const state = new FilePluginStateAdapter(this.dataRoot);
    return {
      credentials: {
        bind: async (id, name, secret) =>
          name === 'wecom'
            ? wecomCredentials.bind(id, { value: secret })
            : pluginCredentials.bind(id, name, secret),
        resolve: async (id, ref) =>
          ref.startsWith('secret://perception/mail/')
            ? JSON.stringify(await mailCredentials.resolve(ref))
            : ref.startsWith('secret://perception/wecom/')
              ? (await wecomCredentials.resolve(ref)).value
              : pluginCredentials.resolve(id, ref),
        remove: async (id, ref) =>
          ref.startsWith('secret://perception/mail/')
            ? mailCredentials.remove(ref)
            : ref.startsWith('secret://perception/wecom/')
              ? wecomCredentials.remove(ref)
              : pluginCredentials.remove(id, ref),
      },
      events: {
        submit: async (event) => {
          const saved = events.save(event);
          if (saved.duplicate) return [{ status: 'duplicate' as const }];
          return router.route(saved.event);
        },
      },
      network: {
        request: async (input) => {
          const response = await fetch(input.url, {
            method: input.method,
            headers: input.headers,
            body: input.body,
          });
          return {
            status: response.status,
            headers: Object.fromEntries(response.headers.entries()),
            body: await response.text(),
          };
        },
      },
      schedule: {
        every: (key, ms, task) => {
          const timer = setInterval(() => {
            void task();
          }, ms);
          timer.unref();
          this.timers.set(key, timer);
        },
        cancel: (key) => {
          const timer = this.timers.get(key);
          if (timer) clearInterval(timer);
          this.timers.delete(key);
        },
      },
      state,
      health: {
        report: async (health) => {
          if (!health.connectorId) return;
          const detail =
            health.detail &&
            !Array.isArray(health.detail) &&
            typeof health.detail === 'object'
              ? health.detail
              : {};
          const state = detail['connectionState'];
          const config = this.configs.get(health.connectorId);
          const common = {
            connectorId: health.connectorId,
            status: health.status,
            lastSuccessAt:
              typeof detail['lastSuccessAt'] === 'string'
                ? detail['lastSuccessAt']
                : undefined,
            lastSafeCode: health.safeCode,
            updatedAt: new Date().toISOString(),
          };
          if (config?.mode === 'email-poll') {
            new ConnectorHealthStore(this.dataRoot).save({
              ...common,
              mode: 'email-poll',
              mailbox:
                typeof config.settings['mailbox'] === 'string'
                  ? config.settings['mailbox']
                  : undefined,
              lastUid:
                typeof detail['lastUid'] === 'number'
                  ? detail['lastUid']
                  : undefined,
              lastCursorAt:
                typeof detail['lastUid'] === 'number'
                  ? new Date().toISOString()
                  : undefined,
            });
          } else if (config?.mode === 'webhook') {
            new ConnectorHealthStore(this.dataRoot).save({
              ...common,
              mode: 'webhook',
              lastCallbackAt:
                typeof detail['lastCallbackAt'] === 'string'
                  ? detail['lastCallbackAt']
                  : undefined,
              lastAckAt:
                typeof detail['lastAckAt'] === 'string'
                  ? detail['lastAckAt']
                  : undefined,
            });
          } else {
            new ConnectorHealthStore(this.dataRoot).save({
              ...common,
              mode: 'stream',
              connectionState:
                state === 'connected' || state === 'reconnecting'
                  ? state
                  : 'disconnected',
              reconnectCount:
                typeof detail['reconnectCount'] === 'number'
                  ? detail['reconnectCount']
                  : 0,
              pendingHandlers: 0,
            });
          }
        },
      },
      audit: { record: async () => undefined },
      replies: this.replies,
    };
  }
}
