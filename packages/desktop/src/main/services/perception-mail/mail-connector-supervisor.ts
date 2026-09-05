import { safeStorage } from 'electron';
import { getDataRoot } from '../../../../../core/src/lib/paths';
import { validateMailConnectorSettings } from '../../../../../core/src/lib/integrations/perception/email';
import {
  ConnectorHealthStore,
  createFileBackedEmailPoller,
  ExternalTriggerGrantStore,
  FileTargetAuthorizationPort,
  PerceptionConnectorConfigStore,
  PerceptionEventStore,
  PerceptionRouter,
  TriggerRuleStore,
  ChannelTriggerExecutionAdapter,
} from '../../../../../core/src/modules/perception-runtime';
import type { ChannelMessageIngress } from '../../../../../core/src/modules/channel-runtime';
import { FileSystemPerceptionTargetRegistry } from '../../../../../core/src/lib/features/services/perception-target-registry';
import type { MailConnectionErrorCode, PerceptionConnectorConfig } from '../../../../../core/src/types/perception';
import { ImapFlowEmailPollingClient } from './imapflow-email-polling-client';
import { toMailConnectionErrorCode } from './imapflow-mail-client';
import { SafeStorageMailCredentialAdapter } from './safe-storage-credential-adapter';
import { showNativeSystemNotification } from '../native-notification-service';

export interface MailSupervisorPorts {
  listConnectors(): PerceptionConnectorConfig[];
  poll(config: PerceptionConnectorConfig): Promise<{ lastUid: number; eventIds: string[] }>;
  route(eventId: string): Promise<void>;
  health(config: PerceptionConnectorConfig, status: 'healthy' | 'degraded' | 'disabled', detail?: { lastUid?: number; safeCode?: string }): void;
}

export class MailConnectorSupervisor {
  private timer: NodeJS.Timeout | null = null;
  private readonly dueAt = new Map<string, number>();
  private readonly inFlight = new Set<string>();

  private readonly ports: MailSupervisorPorts;

  constructor(ports?: MailSupervisorPorts, channelIngress?: ChannelMessageIngress) {
    if (!ports && !channelIngress) throw new Error('CHANNEL_INGRESS_REQUIRED');
    this.ports = ports ?? createDesktopPorts(getDataRoot(), channelIngress as ChannelMessageIngress);
  }

  start(): void {
    if (this.timer) return;
    void this.runDue();
    this.timer = setInterval(() => { void this.runDue(); }, 1_000);
    this.timer.unref();
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  async runDue(now = Date.now()): Promise<void> {
    const connectors = this.ports.listConnectors().filter((config) => config.source === 'email');
    await Promise.all(connectors.map(async (config) => {
      if (!config.enabled) { this.ports.health(config, 'disabled'); return; }
      if (this.inFlight.has(config.id) || (this.dueAt.get(config.id) ?? 0) > now) return;
      this.inFlight.add(config.id);
      const profile = validateMailConnectorSettings(config.settings);
      this.dueAt.set(config.id, now + profile.pollIntervalSeconds * 1_000);
      try {
        const result = await this.ports.poll(config);
        for (const eventId of result.eventIds) await this.ports.route(eventId);
        this.ports.health(config, 'healthy', { lastUid: result.lastUid });
      } catch (error) {
        this.ports.health(config, 'degraded', { safeCode: safeCode(error) });
      } finally {
        this.inFlight.delete(config.id);
      }
    }));
  }
}

function createDesktopPorts(dataRoot: string, channelIngress: ChannelMessageIngress): MailSupervisorPorts {
  const configs = new PerceptionConnectorConfigStore(dataRoot);
  const credentials = new SafeStorageMailCredentialAdapter(dataRoot, safeStorage);
  const events = new PerceptionEventStore(dataRoot);
  const healthStore = new ConnectorHealthStore(dataRoot);
  const grants = new ExternalTriggerGrantStore(dataRoot);
  const escalationNotifier = {
    notify: async (input: { eventId: string; actorId: string; subject?: string; target: { kind: string; id: string } }) => {
      await showNativeSystemNotification({
        title: `邮件需要人工处理：${input.subject || '无主题'}`,
        body: `来自 ${input.actorId}，目标 ${input.target.kind}/${input.target.id}`,
        activationTarget: { type: 'perception-event' as const, eventId: input.eventId },
      });
    },
  };
  const execution = new ChannelTriggerExecutionAdapter(channelIngress, escalationNotifier);
  const router = new PerceptionRouter(
    dataRoot,
    new TriggerRuleStore(dataRoot),
    new FileTargetAuthorizationPort(grants, new FileSystemPerceptionTargetRegistry(dataRoot)),
    execution,
  );
  return {
    listConnectors: () => configs.list(),
    poll: async (config) => {
      if (!config.secretRef) throw new Error('CREDENTIAL_MISSING');
      const profile = validateMailConnectorSettings(config.settings);
      const secret = await credentials.resolve(config.secretRef);
      const result = await createFileBackedEmailPoller(dataRoot, new ImapFlowEmailPollingClient(profile, secret)).poll({
        connectorId: config.id,
        mailbox: profile.mailbox,
      });
      return { lastUid: result.cursor.lastUid, eventIds: result.eventIds };
    },
    route: async (eventId) => { await router.route(events.get(eventId)); },
    health: (config, status, detail) => {
      const now = new Date().toISOString();
      healthStore.save({
        connectorId: config.id,
        mode: 'email-poll',
        status,
        mailbox: typeof config.settings['mailbox'] === 'string' ? config.settings['mailbox'] : undefined,
        lastUid: detail?.lastUid,
        lastCursorAt: detail?.lastUid === undefined ? undefined : now,
        lastSuccessAt: status === 'healthy' ? now : undefined,
        lastSafeCode: detail?.safeCode,
        updatedAt: now,
      });
    },
  };
}

function safeCode(error: unknown): MailConnectionErrorCode | 'CREDENTIAL_MISSING' {
  if (error instanceof Error && /credential|secret/i.test(error.message)) return 'CREDENTIAL_MISSING';
  return toMailConnectionErrorCode(error);
}
