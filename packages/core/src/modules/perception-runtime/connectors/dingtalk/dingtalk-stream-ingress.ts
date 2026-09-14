import type { DingTalkStreamAck, DingTalkStreamFrame } from '../../../../lib/integrations/perception/dingtalk';
import { DingTalkStreamNormalizer, parseFrameData } from '../../../../lib/integrations/perception/dingtalk';
import type { JsonValue, PerceptionEventV1 } from '../../../../types/perception';
import type { SaveEventResult } from '../../storage/event-store';
import { PerceptionEventStore } from '../../storage/event-store';
import type { InboxRecord } from '../../protocol/types';
import { InboxStore } from '../../storage/inbox-store';

export interface DingTalkStreamTrustContext {
  authenticated: boolean;
  connectionId?: string;
}

export interface DingTalkStreamIngressResult {
  ack: DingTalkStreamAck;
  events: PerceptionEventV1[];
  duplicateEventIds: string[];
}

interface DingTalkInboxPort {
  accept(connectorId: string, payload: JsonValue, receivedAt?: string): InboxRecord;
  reference(record: InboxRecord): string;
}
interface DingTalkEventPort { save(event: PerceptionEventV1): SaveEventResult }

export class DingTalkStreamIngress {
  private readonly normalizer = new DingTalkStreamNormalizer();
  private readonly inbox: DingTalkInboxPort;
  private readonly events: DingTalkEventPort;

  constructor(private readonly connectorId: string, dataRoot: string, stores?: { inbox: DingTalkInboxPort; events: DingTalkEventPort }) {
    this.inbox = stores?.inbox ?? new InboxStore(dataRoot);
    this.events = stores?.events ?? new PerceptionEventStore(dataRoot);
  }

  ingest(frame: DingTalkStreamFrame, trust: DingTalkStreamTrustContext, receivedAt = new Date().toISOString()): DingTalkStreamIngressResult {
    if (!trust.authenticated) throw new Error('Unauthenticated DingTalk Stream frame');
    const safeFrame: JsonValue = {
      specVersion: frame.specVersion,
      type: frame.type,
      headers: {
        appId: frame.headers.appId ?? null,
        connectionId: trust.connectionId ?? frame.headers.connectionId ?? null,
        contentType: frame.headers.contentType ?? null,
        messageId: frame.headers.messageId ?? null,
        time: frame.headers.time ?? null,
        topic: frame.headers.topic ?? null,
      },
      data: parseFrameData(frame.data),
    };
    const inboxRecord = this.inbox.accept(this.connectorId, safeFrame, receivedAt);
    const normalized = this.normalizer.normalize(frame, {
      connectorId: this.connectorId,
      inboxRef: this.inbox.reference(inboxRecord),
      receivedAt,
    });
    const canonical: PerceptionEventV1[] = [];
    const duplicateEventIds: string[] = [];
    for (const event of normalized) {
      const saved = this.events.save(event);
      canonical.push(saved.event);
      if (saved.duplicate) duplicateEventIds.push(saved.event.id);
    }
    return { ack: { status: 'SUCCESS' }, events: canonical, duplicateEventIds };
  }
}
