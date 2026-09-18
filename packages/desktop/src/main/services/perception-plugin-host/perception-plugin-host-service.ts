import { ipcMain, safeStorage } from 'electron';
import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { PluginLogSink } from '../../../../../core/src/modules/perception-runtime/plugins';
import { dingtalkPlugin } from '@originos/perception-plugin-dingtalk';
import { emailPlugin } from '@originos/perception-plugin-email';
import { feishuPlugin } from '@originos/perception-plugin-feishu';
import { weComPlugin } from '@originos/perception-plugin-wecom';
import { fingerprintMailProfile, validateMailConnectorSettings } from '../../../../../core/src/lib/integrations/perception/email';
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
  type PluginCapabilityConnectionStatus,
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
      'attachments',
      'office-capabilities',
    ] as const,
  },
  {
    plugin: feishuPlugin,
    approvedPermissions: [
      'credentials',
      'events',
      'health',
      'replies',
      'office-capabilities',
    ] as const,
  },
  {
    plugin: dingtalkPlugin,
    approvedPermissions: ['credentials', 'events', 'health', 'replies', 'schedule', 'office-capabilities'] as const,
  },
];
const PLUGIN_IDS = Object.fromEntries(
  BUNDLED_CATALOG.map(({ plugin }) => [
    plugin.manifest.source,
    plugin.manifest.id,
  ])
);

export function authorizeConfiguredOfficeCapability(
  settings: Readonly<Record<string, JsonValue>> | undefined,
  actor: { actorId: string; requireHitl?: boolean },
  effect: 'read' | 'write' | 'destructive' | 'unknown'
): boolean {
  const allowed = configuredActorIds(settings);
  if (!allowed.has(actor.actorId)) return false;
  if (effect === 'read') return true;
  if (effect !== 'write') return false;
  return settings?.['officeWriteEnabled'] === true && actor.requireHitl === false;
}

function configuredActorIds(settings: Readonly<Record<string, JsonValue>> | undefined): Set<string> {
  const configured = settings?.['officeAllowedActorIds'];
  if (typeof configured !== 'string' || configured.length > 8192) return new Set();
  return new Set(configured.split(/[\s,]+/).map(value => value.trim()).filter(Boolean).slice(0, 100));
}

export function mergeProvisionedSettings(
  requested: Record<string, JsonValue>,
  provisioned?: Readonly<Record<string, JsonValue>>
): Record<string, JsonValue> {
  return { ...requested, ...(provisioned ?? {}) };
}

export class PerceptionPluginHostService {
  private readonly timers = new Map<string, NodeJS.Timeout>();
  private readonly host: PerceptionPluginHost;
  private readonly configs: PerceptionConnectorConfigStore;
  private readonly replies: PluginReplyDeliveryService;
  private timer: NodeJS.Timeout | null = null;
  private active = new Map<string, string>();
  private reconciling = false;
  private generation = 0;
  constructor(
    private readonly channelIngress: ChannelMessageIngress,
    private readonly dataRoot = getDataRoot(),
    private readonly logs?: PluginLogSink
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
    this.host = new PerceptionPluginHost(registry, this.createPorts(), {
      dataRoot,
      policy: { authorize: async ({ connectorId, actor, capability }) => {
        const settings = this.configs.get(connectorId)?.settings;
        return authorizeConfiguredOfficeCapability(settings, actor, capability.effect);
      } },
    });
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
      IPC_CHANNELS.PERCEPTION_PLUGIN_CAPABILITY_STATUS,
      async (): Promise<IpcResponse<PluginCapabilityConnectionStatus[]>> => {
        const statuses = await Promise.all(this.configs.list().filter(config => config.source !== 'email').map(async (config): Promise<PluginCapabilityConnectionStatus> => {
          const entry = BUNDLED_CATALOG.find(({ plugin }) => plugin.manifest.id === config.pluginId || plugin.manifest.source === config.source);
          const common = { connectorId: config.id, delegatedActorCount: configuredActorIds(config.settings).size,
            writeEnabled: config.settings['officeWriteEnabled'] === true };
          if (!entry?.plugin.manifest.capabilities.includes('office-capabilities')) return { ...common, state: 'unsupported' };
          return { ...await this.host.inspectCapabilities(entry.plugin.manifest.id, config.id), ...common };
        }));
        return { success: true, data: statuses, timestamp: new Date().toISOString() };
      }
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
          const settings = mergeProvisionedSettings(request.settings, result.settings);
          if (entry.plugin.manifest.source === 'email') {
            settings['testReceipt'] = {
              profileFingerprint: fingerprintMailProfile(validateMailConnectorSettings(settings)),
              verifiedAt: now,
            };
          }
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
            settings,
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
                'PLUGIN_PROVISION_FAILED',
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
  async stop(): Promise<void> {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    this.generation += 1;
    const stopping = [...this.active.keys()].map(key => {
      const [pluginId, ...rest] = key.split(':');
      return pluginId ? this.host.stop(pluginId, rest.join(':')) : Promise.resolve();
    });
    this.active.clear();
    for (const timer of this.timers.values()) clearInterval(timer);
    this.timers.clear();
    await Promise.allSettled(stopping);
  }
  async handleWebhook(
    pluginId: string,
    connectorId: string,
    request: PerceptionPluginWebhookRequest
  ): Promise<PerceptionPluginWebhookResult> {
    return this.host.handleWebhook(pluginId, connectorId, request);
  }
  private async reconcile(): Promise<void> {
    if (this.reconciling) return;
    this.reconciling = true;
    try {
      await this.reconcileConfigurations(this.generation);
    } finally {
      this.reconciling = false;
    }
  }
  private async reconcileConfigurations(generation: number): Promise<void> {
    const configs = this.configs
      .list()
      .filter((item) => PLUGIN_IDS[item.source]);
    const desired = new Set(
      configs
        .filter((item) => item.enabled)
        .map((item) => `${PLUGIN_IDS[item.source]}:${item.id}`)
    );
    for (const key of this.active.keys()) {
      if (!desired.has(key)) {
        const [pluginId, ...rest] = key.split(':');
        this.active.delete(key);
        if (pluginId) await this.host.stop(pluginId, rest.join(':'));
      }
    }
    for (const config of configs) {
      const pluginId = PLUGIN_IDS[config.source];
      if (!pluginId) continue;
      const key = `${pluginId}:${config.id}`;
      if (generation !== this.generation) return;
      if (!config.enabled) continue;
      const version = JSON.stringify([config.updatedAt, config.settings, config.secretRef]);
      if (this.active.get(key) === version) continue;
      if (this.active.has(key)) {
        this.active.delete(key);
        await this.host.stop(pluginId, config.id);
        if (generation !== this.generation) return;
      }
      const status = await this.host.start(pluginId, config.id, {
        ...config.settings,
        secretRef: config.secretRef ?? '',
      });
      if (generation !== this.generation || !this.configs.get(config.id)?.enabled) {
        await this.host.stop(pluginId, config.id);
        continue;
      }
      if (status.state === 'running') this.active.set(key, version);
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
      this.replies,
      (source, connectorId) => ({ write: record => this.logs?.write(PLUGIN_IDS[source] ?? source, connectorId, record) }),
      {
        discover: ({ source, connectorId, eventId, sessionId, actorId, conversationId, conversationKind, requireHitl, targetKind, targetId, query, name }) => {
          const pluginId = PLUGIN_IDS[source];
          if (!pluginId) throw new Error('IM_CAPABILITY_UNSUPPORTED');
          return this.host.discoverCapabilities(pluginId, connectorId,
            { eventId, sessionId, actorId, conversationId, conversationKind, requireHitl, targetKind, targetId }, query, name);
        },
        invoke: ({ source, connectorId, eventId, sessionId, actorId, conversationId, conversationKind, requireHitl, targetKind, targetId, invocation }) => {
          const pluginId = PLUGIN_IDS[source];
          if (!pluginId) throw new Error('IM_CAPABILITY_UNSUPPORTED');
          return this.host.invokeCapability(pluginId, connectorId,
            { eventId, sessionId, actorId, conversationId, conversationKind, requireHitl, targetKind, targetId }, invocation);
        },
      }
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
      log: this.logs,
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
        submit: async (event, options) => {
          const saved = events.save(event);
          try { await options?.onAccepted?.(); }
          catch (error) { this.logs?.write(PLUGIN_IDS[event.source] ?? event.source, event.connectorId, { level: 'error', stage: 'event.ack', eventId: event.id, safeCode: 'EVENT_ACK_FAILED', error }); }
          if (saved.duplicate) return [{ status: 'duplicate' as const }];
          return router.route(saved.event);
        },
      },
      attachments: {
        store: async (connectorId, file) => {
          if (!file.bytes.byteLength) throw new Error('IM_ATTACHMENT_EMPTY');
          if (file.bytes.byteLength > 20_000_000) throw new Error('IM_ATTACHMENT_TOO_LARGE');
          const baseName = path.basename(file.fileName.replaceAll('\\', '/'));
          const fileName = baseName.replace(/[^\p{L}\p{N}._ -]/gu, '_').slice(0, 120);
          const safeName = fileName && fileName !== '.' && fileName !== '..' ? fileName : 'file';
          const directory = path.join(this.dataRoot, 'perception', 'attachments', connectorId, randomUUID());
          await mkdir(directory, { recursive: true, mode: 0o700 });
          const fullPath = path.join(directory, safeName);
          await writeFile(fullPath, file.bytes, { flag: 'wx', mode: 0o600 });
          return `data/${path.relative(this.dataRoot, fullPath).split(path.sep).join('/')}`;
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
