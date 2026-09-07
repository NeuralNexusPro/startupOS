import { randomUUID } from 'node:crypto';
import type { PerceptionEventV1 } from '@originos/core/types';
import type { WeComFrame } from './types';

export interface NormalizeWeComFrameInput {
  connectorId: string;
  frame: WeComFrame;
  receivedAt?: string;
  createId?: () => string;
}

/** Normalize both `message.text` and `message.voice` SDK frames. */
export function normalizeWeComFrame(input: NormalizeWeComFrameInput): PerceptionEventV1 {
  const body = input.frame.body ?? {};
  const receivedAt = input.receivedAt ?? new Date().toISOString();
  const requestId = body.msgid ?? input.frame.headers?.req_id;
  const createId = input.createId ?? randomUUID;

  return {
    schemaVersion: '1.0',
    id: createId(),
    source: 'wecom',
    connectorId: input.connectorId,
    sourceEventId: `wecom-bot:${requestId ?? createId()}`,
    type: 'message.received',
    occurredAt: body.create_time
      ? new Date(body.create_time * 1_000).toISOString()
      : receivedAt,
    receivedAt,
    actor: { externalId: body.from?.userid ?? 'unknown' },
    conversation: {
      externalId: body.chatid ?? body.from?.userid ?? 'unknown',
      kind: body.chattype === 'group' ? 'group' : 'direct',
    },
    content: { text: body.text?.content ?? body.voice?.content ?? '' },
    provenance: {
      tenantExternalId: body.aibotid,
      rawPayloadRef: `wecom-ws://${input.connectorId}/${input.frame.headers?.req_id ?? 'unknown'}`,
    },
  };
}
