import {
  CHANNEL_PROTOCOL_VERSION,
  type AgentOutputEvent,
  type ChannelInboundMessage,
  type ChannelRuntimeTarget,
} from './types';

const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9._:@/-]{0,255}$/;
const MAX_TEXT_LENGTH = 1_000_000;
const MAX_ATTACHMENTS = 100;
const ORIGINS = new Set(['originos-ui', 'email', 'wecom', 'feishu', 'dingtalk']);

export function validateChannelInboundMessage(message: ChannelInboundMessage): ChannelInboundMessage {
  if (message.protocolVersion !== CHANNEL_PROTOCOL_VERSION) throw new Error('CHANNEL_PROTOCOL_UNSUPPORTED');
  if (!ORIGINS.has(message.origin)) throw new Error('CHANNEL_ORIGIN_UNSUPPORTED');
  assertId(message.id, 'CHANNEL_MESSAGE_ID_INVALID');
  assertId(message.connectorId, 'CHANNEL_CONNECTOR_ID_INVALID');
  assertId(message.conversationId, 'CHANNEL_CONVERSATION_ID_INVALID');
  assertId(message.actorId, 'CHANNEL_ACTOR_ID_INVALID');
  if (!Number.isFinite(Date.parse(message.receivedAt))) throw new Error('CHANNEL_RECEIVED_AT_INVALID');
  const text = message.content.text ?? '';
  const attachments = message.content.attachmentRefs ?? [];
  if (!text.trim() && attachments.length === 0) throw new Error('CHANNEL_CONTENT_EMPTY');
  if (text.length > MAX_TEXT_LENGTH) throw new Error('CHANNEL_TEXT_TOO_LONG');
  if (attachments.length > MAX_ATTACHMENTS || attachments.some((item) => !item || item.length > 2_048)) {
    throw new Error('CHANNEL_ATTACHMENTS_INVALID');
  }
  if (message.replyHandle !== undefined && (!SAFE_ID.test(message.replyHandle) || message.replyHandle.length > 256)) {
    throw new Error('CHANNEL_REPLY_HANDLE_INVALID');
  }
  return message;
}

export function validateChannelRuntimeTarget(target: ChannelRuntimeTarget): ChannelRuntimeTarget {
  if (target.kind === 'project-multi-agent') {
    assertId(target.projectId, 'CHANNEL_PROJECT_ID_INVALID');
    if (target.runtime !== 'collaboration') throw new Error('CHANNEL_RUNTIME_UNSUPPORTED');
    return target;
  }
  if (target.kind === 'project-agent') assertId(target.projectId, 'CHANNEL_PROJECT_ID_INVALID');
  if (target.kind === 'skill') {
    if (target.ownership.mode === 'inherited') {
      if (target.ownership.ownerKind !== 'project' && target.ownership.ownerKind !== 'role-agent') throw new Error('CHANNEL_SKILL_OWNER_INVALID');
      assertId(target.ownership.ownerId, 'CHANNEL_SKILL_OWNER_INVALID');
    }
  }
  assertId(target.id, 'CHANNEL_TARGET_ID_INVALID');
  return target;
}

export function isExternallyVisibleOutput(event: AgentOutputEvent): boolean {
  if (event.type === 'artifact_changed') return false;
  return event.type !== 'text_delta' || Boolean(event.delta);
}

function assertId(value: string, code: string): void {
  if (!SAFE_ID.test(value)) throw new Error(code);
}
