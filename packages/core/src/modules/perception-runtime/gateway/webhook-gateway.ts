import { randomUUID } from 'node:crypto';
import type { ConnectorAck, JsonValue, PerceptionAuditEntry, PerceptionConnector, PerceptionEventV1 } from '../protocol/types';
import { validatePerceptionEvent } from '../protocol/validation';
import { PerceptionAuditStore } from '../storage/audit-store';
import { PerceptionEventStore } from '../storage/event-store';
import { InboxStore, PayloadTooLargeError } from '../storage/inbox-store';
import { ConnectorRegistry } from './connector-registry';
import { WebhookGatewayError } from './errors';
import { ReplayGuard } from './replay-guard';

export interface WebhookRequestInput {
  connectorId: string;
  payload: JsonValue;
  headers?: Readonly<Record<string, string>>;
  query?: Readonly<Record<string, string>>;
  receivedAt?: string;
  rawBody?: string;
}

export interface WebhookGatewayResult {
  ack: ConnectorAck;
  events: PerceptionEventV1[];
  duplicateEventIds: string[];
}

export class WebhookGateway {
  private readonly inbox: InboxStore;
  private readonly events: PerceptionEventStore;
  private readonly audit: PerceptionAuditStore;
  private readonly replay: ReplayGuard;

  constructor(
    private readonly registry: ConnectorRegistry,
    dataRoot: string,
    options?: { maxPayloadBytes?: number; replayWindowMs?: number },
  ) {
    this.inbox = new InboxStore(dataRoot, options?.maxPayloadBytes);
    this.events = new PerceptionEventStore(dataRoot);
    this.audit = new PerceptionAuditStore(dataRoot);
    this.replay = new ReplayGuard(dataRoot, options?.replayWindowMs);
  }

  async handle(input: WebhookRequestInput): Promise<WebhookGatewayResult> {
    const receivedAt = input.receivedAt ?? new Date().toISOString();
    let connector: PerceptionConnector;
    try {
      connector = this.registry.resolve(input.connectorId);
      const verification = await connector.verify(input.payload, {
        headers: input.headers ?? {},
        query: input.query ?? {},
        receivedAt,
        rawBody: input.rawBody,
      });
      if (!verification.authenticated) {
        throw new WebhookGatewayError('UNAUTHORIZED', verification.reason ?? 'Webhook authentication failed');
      }
      this.replay.consume(input.connectorId, verification.replayKey, verification.signedAt, receivedAt);

      const inboxRecord = this.inbox.accept(input.connectorId, input.payload, receivedAt);
      const normalized = await connector.normalize(input.payload, {
        connectorId: input.connectorId,
        inboxRef: this.inbox.reference(inboxRecord),
        receivedAt,
      });
      const canonical: PerceptionEventV1[] = [];
      const duplicateEventIds: string[] = [];
      for (const event of normalized) {
        validatePerceptionEvent(event);
        const saved = this.events.save(event);
        canonical.push(saved.event);
        if (saved.duplicate) duplicateEventIds.push(saved.event.id);
        this.appendAudit({
          id: randomUUID(),
          action: saved.duplicate ? 'event.duplicate' : 'event.created',
          occurredAt: receivedAt,
          connectorId: input.connectorId,
          eventId: saved.event.id,
        });
      }
      const ack = await connector.acknowledge(canonical, input.payload, {
        connectorId: input.connectorId,
        inboxRef: this.inbox.reference(inboxRecord),
        receivedAt,
      });
      return { ack, events: canonical, duplicateEventIds };
    } catch (error) {
      const gatewayError = this.normalizeError(error);
      this.appendAudit({
        id: randomUUID(),
        action: 'inbox.rejected',
        occurredAt: receivedAt,
        connectorId: input.connectorId,
        detail: { code: gatewayError.code },
      });
      throw gatewayError;
    }
  }

  async handshake(connectorId: string, query: Readonly<Record<string, string>>, receivedAt = new Date().toISOString()): Promise<ConnectorAck> {
    try {
      const connector = this.registry.resolve(connectorId);
      if (!connector.capabilities.callbackHandshake || !connector.handshake) {
        throw new WebhookGatewayError('INVALID_PAYLOAD', 'Connector does not support callback handshake');
      }
      const result = await connector.handshake({ query, receivedAt });
      if (!result.authenticated || !result.ack) {
        throw new WebhookGatewayError('UNAUTHORIZED', result.reason ?? 'Callback handshake authentication failed');
      }
      this.replay.consume(connectorId, result.replayKey, result.signedAt, receivedAt);
      return result.ack;
    } catch (error) {
      throw this.normalizeError(error);
    }
  }

  private normalizeError(error: unknown): WebhookGatewayError {
    if (error instanceof WebhookGatewayError) return error;
    if (error instanceof PayloadTooLargeError) return new WebhookGatewayError('PAYLOAD_TOO_LARGE', error.message);
    if (error instanceof SyntaxError) return new WebhookGatewayError('INVALID_PAYLOAD', 'Webhook payload is invalid');
    return new WebhookGatewayError('NORMALIZATION_FAILED', 'Webhook processing failed');
  }

  private appendAudit(entry: PerceptionAuditEntry): void {
    this.audit.append(entry);
  }
}
