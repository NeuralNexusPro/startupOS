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
  AtomicDataFileStore,
  DecisionOrchestrator,
  DecisionReceiptStore,
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
  type PluginSchedulePort,
  type PerceptionDecisionPort,
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
import { showNativeSystemNotification, type NativeNotificationResult } from '../native-notification-service';

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
  private readonly host: PerceptionPluginHost;
  private readonly configs: PerceptionConnectorConfigStore;
  private readonly replies: PluginReplyDeliveryService;
  private timer: NodeJS.Timeout | null = null;
  private active = new Map<string, string>();
  private reconciling = false;
  private generation = 0;
  private router?: PerceptionRouter;
  constructor(
    private readonly channelIngress: ChannelMessageIngress,
    private readonly dataRoot = getDataRoot(),
    private readonly logs: PluginLogSink | undefined,
    private readonly schedule: PluginSchedulePort,
    private readonly decisions?: PerceptionDecisionPort,
    private readonly notify: (request: { title: string; body?: string; activationTarget?: unknown }) => Promise<NativeNotificationResult> = showNativeSystemNotification,
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
    this.registerDecisionIpc();
  }
  private registerDecisionIpc(): void {
    ipcMain.handle(IPC_CHANNELS.PERCEPTION_DECISION_PENDING, async (): Promise<IpcResponse<unknown>> =>
      this.runDecision(() => this.router?.listPendingDecisions() ?? []));
    ipcMain.handle(IPC_CHANNELS.PERCEPTION_DECISION_RESOLVE, async (_event, input: { decisionId?: string; candidateKey?: string }): Promise<IpcResponse<unknown>> =>
      this.runDecision(async () => {
        if (!input || typeof input.decisionId !== 'string' || typeof input.candidateKey !== 'string') throw new Error('INVALID_DECISION_REQUEST');
        await this.requireRouter().resolveDecision(input.decisionId, input.candidateKey);
        return this.requireRouter().getDecision(input.decisionId);
      }));
    ipcMain.handle(IPC_CHANNELS.PERCEPTION_DECISION_RETRY, async (_event, input: { decisionId?: string }): Promise<IpcResponse<unknown>> =>
      this.runDecision(async () => {
        if (!input || typeof input.decisionId !== 'string') throw new Error('INVALID_DECISION_REQUEST');
        await this.requireRouter().retryDecision(input.decisionId);
        return this.requireRouter().getDecision(input.decisionId);
      }));
  }
  private requireRouter(): PerceptionRouter {
    if (!this.router || !this.decisions) throw new Error('RUNTIME_UNAVAILABLE');
    return this.router;
  }
  private async runDecision<T>(action: () => T | Promise<T>): Promise<IpcResponse<T>> {
    try { return { success: true, data: await action(), timestamp: new Date().toISOString() }; }
    catch (error) {
      const message = error instanceof Error ? error.message : '';
      const code = /^[A-Z][A-Z0-9_]{2,64}$/.test(message) ? message : 'DECISION_ACTION_FAILED';
      return { success: false, error: { code, message: code }, timestamp: new Date().toISOString() };
    }
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
    const rules = new TriggerRuleStore(this.dataRoot);
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
    const orchestrator = this.decisions
      ? new DecisionOrchestrator(this.decisions, new DecisionReceiptStore(this.dataRoot), decisionHashSalt(this.dataRoot))
      : undefined;
    const targets = new FileSystemPerceptionTargetRegistry(this.dataRoot);
    const writeDecisionLog = async ({ phase, event, rule, candidateKeys, receipt, outcome }: Parameters<NonNullable<import('../../../../../core/src/modules/perception-runtime').DecisionPendingNotificationPort['logDecision']>>[0]) => {
      const labels = Object.fromEntries(await Promise.all(rule.decision.candidates.map(async (candidate) => [
        candidate.key,
        candidate.action === 'dispatch' ? (await targets.describe(candidate.target))?.name ?? candidate.key : candidate.action === 'ignore' ? '忽略事件' : '通知用户',
      ])));
      const label = (key: string) => labels[key] ?? key;
      const answers = receipt?.answers;
      const decision = {
        phase, decisionId: receipt?.id, ruleId: rule.id, outcome, status: receipt?.status, reason: receipt?.reason,
        candidateKeys: (candidateKeys ?? receipt?.candidateKeys)?.map(label),
        routeTarget: answers?.routeTarget.choice ? label(answers.routeTarget.choice) : undefined, routeConfidence: answers?.routeTarget.confidence,
        routeProbabilities: answers?.routeTarget.probabilities && Object.fromEntries(Object.entries(answers.routeTarget.probabilities).map(([key, value]) => [label(key), value])),
        deliveryMode: answers?.deliveryMode?.choice, deliveryConfidence: answers?.deliveryMode?.confidence, deliveryProbabilities: answers?.deliveryMode?.probabilities,
        needsUserAttention: answers?.needsUserAttention, urgency: answers?.urgency.score, risk: answers?.risk.score,
        needsHitl: answers?.needsHitl, retainAsEvidence: answers?.retainAsEvidence,
      };
      this.logs?.write(PLUGIN_IDS[event.source] ?? event.source, event.connectorId, {
        level: phase === 'failed' ? 'error' : 'info', stage: `decision.${phase}`, eventId: event.id, decision,
      });
      if (process.env['NODE_ENV'] !== 'production') console.info('[perception-decision]', {
        eventId: event.id,
        source: event.source,
        decision: Object.fromEntries(Object.entries(decision).filter(([, value]) => value !== undefined)),
      });
    };
    const router = new PerceptionRouter(
      this.dataRoot,
      rules,
      new FileTargetAuthorizationPort(
        grants,
        targets
      ),
      execution,
      undefined,
      orchestrator,
      {
        logDecision: input => { void writeDecisionLog(input).catch(() => undefined); },
        notify: async ({ receipt, event, rule }) => {
        if (['wecom', 'feishu', 'dingtalk'].includes(event.source) && receipt.reason && receipt.reason !== 'TARGET_AMBIGUOUS') {
          try {
            const replyHandle = event.provenance.rawPayloadRef;
            const content = receipt.reason.startsWith('JEV_') || receipt.status === 'failed'
              ? '我暂时无法完成这条消息的分派，请稍后再试一次。'
              : '我已收到这条消息，暂时无法自动处理，请稍后再试一次。';
            await this.replies.deliver(replyHandle, { type: 'assistant_message', content });
            await this.replies.deliver(replyHandle, { type: 'completed', resultRef: `perception://decision/${receipt.id}` });
            return;
          } catch {
            this.logs?.write(PLUGIN_IDS[event.source] ?? event.source, event.connectorId, { level: 'warn', stage: 'decision.failure-reply', eventId: event.id, safeCode: 'DECISION_FAILURE_REPLY_FAILED' });
          }
        }
        if (receipt.reason === 'TARGET_AMBIGUOUS' && ['wecom', 'feishu', 'dingtalk'].includes(event.source)) {
          try {
            const labels = Object.fromEntries(await Promise.all(rule.decision.candidates.filter((candidate) => candidate.action === 'dispatch').map(async (candidate) => [candidate.key, (await targets.describe(candidate.target))?.name ?? candidate.key])));
            const choices = receipt.answers?.routeTarget.probabilities
              ? Object.entries(receipt.answers.routeTarget.probabilities).filter(([key, probability]) => labels[key] && probability > 0).sort(([, left], [, right]) => right - left).map(([key, probability]) => `${labels[key]}（${Math.round(probability * 100)}%）`).join('、')
              : '多个候选能力';
            const replyHandle = event.provenance.rawPayloadRef;
            await this.replies.deliver(replyHandle, { type: 'assistant_message', content: `我找到了几位合适的处理伙伴：${choices}。您期望由谁，或由什么能力来承接这个请求？` });
            await this.replies.deliver(replyHandle, { type: 'completed', resultRef: `perception://decision/${receipt.id}` });
            return;
          } catch {
            this.logs?.write(PLUGIN_IDS[event.source] ?? event.source, event.connectorId, { level: 'warn', stage: 'decision.choice-reply', eventId: event.id, safeCode: 'DECISION_CHOICE_REPLY_FAILED' });
          }
        }
        let shown = false;
        try {
          shown = (await this.notify({
            title: '感知事件需要确认',
            body: `来源：${event.source} · 原因：${receipt.reason ?? '需要人工选择'}`,
            activationTarget: { type: 'perception-decision', decisionId: receipt.id },
          })).shown;
        } catch { /* A safe diagnostic is emitted below. */ }
        if (!shown) this.logs?.write(PLUGIN_IDS[event.source] ?? event.source, event.connectorId, {
          level: 'warn', stage: 'decision.notification', eventId: event.id, safeCode: 'DECISION_NOTIFICATION_FAILED',
        });
        },
      },
      targets,
    );
    this.router = router;
    const reconsiderImDecision = async (event: Parameters<typeof events.save>[0]) => {
      if (!['wecom', 'feishu', 'dingtalk'].includes(event.source)) return undefined;
      const matches = router.listPendingDecisions().flatMap((receipt) => {
        if (receipt.reason !== 'TARGET_AMBIGUOUS') return [];
        try {
          const original = events.get(receipt.eventId);
          return original.source === event.source && original.connectorId === event.connectorId
            && original.actor.externalId === event.actor.externalId && original.conversation?.externalId === event.conversation?.externalId
            ? [{ receipt, original, rule: rules.get(receipt.ruleId) }]
            : [];
        } catch { return []; }
      });
      const match = matches
        .filter((item) => item.rule?.routingMode === 'jev')
        .sort((left, right) => right.original.receivedAt.localeCompare(left.original.receivedAt))[0];
      if (!match) return undefined;
      if (!match.rule || match.rule.routingMode !== 'jev') return undefined;
      const history = events.list(200).filter((item) => item.source === match.original.source && item.connectorId === match.original.connectorId
        && item.actor.externalId === match.original.actor.externalId && item.conversation?.externalId === match.original.conversation?.externalId
        && item.receivedAt >= match.original.receivedAt && item.receivedAt < event.receivedAt).sort((left, right) => left.receivedAt.localeCompare(right.receivedAt));
      if (!(await router.isPendingChoiceFeedback(match.receipt.id, event, history))) return undefined;
      const result = await router.reconsiderDecision(match.receipt.id, event, history);
      if (result.status === 'pending') return result;
      const response = result.responseTexts?.at(-1) ?? result.responseText ?? (result.status === 'dispatched' ? '已根据你的反馈完成选择，正在处理。' : '已根据你的反馈完成处理。');
      try {
        await this.replies.deliver(event.provenance.rawPayloadRef, { type: 'assistant_message', content: response });
        await this.replies.deliver(event.provenance.rawPayloadRef, { type: 'completed', resultRef: result.resultRef ?? `perception://decision/${match.receipt.id}` });
      } catch {
        this.logs?.write(PLUGIN_IDS[event.source] ?? event.source, event.connectorId, { level: 'warn', stage: 'decision.choice-delivery', eventId: event.id, safeCode: 'DECISION_CHOICE_DELIVERY_FAILED' });
      }
      return result;
    };
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
          const reconsidered = await reconsiderImDecision(saved.event);
          if (reconsidered) return [reconsidered];
          const results = await router.route(saved.event);
          if (['wecom', 'feishu', 'dingtalk'].includes(saved.event.source)
            && results.some((result) => result.status === 'failed' || result.reason === 'JEV_RUNTIME_UNAVAILABLE')) {
            try {
              await this.replies.deliver(saved.event.provenance.rawPayloadRef, { type: 'assistant_message', content: '我暂时无法处理这条消息，请稍后再试一次。' });
              await this.replies.deliver(saved.event.provenance.rawPayloadRef, { type: 'completed', resultRef: `perception://event/${saved.event.id}` });
            } catch {
              this.logs?.write(PLUGIN_IDS[saved.event.source] ?? saved.event.source, saved.event.connectorId, { level: 'warn', stage: 'event.failure-reply', eventId: saved.event.id, safeCode: 'EVENT_FAILURE_REPLY_FAILED' });
            }
          }
          return results;
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
      schedule: this.schedule,
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

function decisionHashSalt(dataRoot: string): string {
  const store = new AtomicDataFileStore<{ hashSalt: string }>(path.join(dataRoot, 'perception', 'decision-runtime.json'));
  if (store.exists()) return store.read().data.hashSalt;
  return store.write({ hashSalt: randomUUID() }).data.hashSalt;
}
