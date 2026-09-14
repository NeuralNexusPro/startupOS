export const CHANNEL_PROTOCOL_VERSION = '1.0' as const;

export type ChannelOrigin = 'originos-ui' | 'email' | 'wecom' | 'feishu' | 'dingtalk';

export function isImChannel(origin: ChannelOrigin): boolean {
  return origin === 'wecom' || origin === 'feishu' || origin === 'dingtalk';
}

export type ChannelRuntimeTarget =
  | { kind: 'agent' | 'role-agent'; id: string }
  | { kind: 'project-agent'; id: string; projectId: string }
  | { kind: 'skill'; id: string; ownership: { mode: 'ephemeral' } | { mode: 'inherited'; ownerKind: 'project' | 'role-agent'; ownerId: string } }
  | { kind: 'project-multi-agent'; projectId: string; runtime: 'collaboration' };

export interface ChannelMessageContent {
  text?: string;
  attachmentRefs?: string[];
}

export interface ChannelInboundMessage {
  protocolVersion: typeof CHANNEL_PROTOCOL_VERSION;
  id: string;
  origin: ChannelOrigin;
  connectorId: string;
  conversationId: string;
  actorId: string;
  actorDisplayName?: string;
  conversationKind?: 'direct' | 'group' | 'thread';
  content: ChannelMessageContent;
  replyHandle?: string;
  receivedAt: string;
}

export type ChannelMessageMetadata = Pick<ChannelInboundMessage,
  'origin' | 'connectorId' | 'actorId' | 'actorDisplayName' | 'conversationId' | 'conversationKind'>;

export type AgentOutputEvent =
  | { type: 'accepted'; sessionId: string }
  | { type: 'text_delta'; delta: string }
  | { type: 'assistant_message'; content: string }
  | { type: 'tool_status'; label: string; state: 'running' | 'completed' | 'failed' }
  | { type: 'artifact_changed'; filename: string; filePath: string; artifactType: 'solution' }
  | { type: 'hitl_request'; requestId: string; summary: string }
  | { type: 'completed'; resultRef: string }
  | { type: 'cancelled' }
  | { type: 'failed'; safeCode: string; diagnosticId?: string };

export type FlowPacketKind = 'data' | 'complete' | 'error' | 'control';

export interface FlowPacket<T> {
  protocolVersion: typeof CHANNEL_PROTOCOL_VERSION;
  flowId: string;
  packetId: string;
  sequence: number;
  port: string;
  kind: FlowPacketKind;
  emittedAt: string;
  payload: T;
}

export type FlowPacketStream<T> = AsyncIterable<FlowPacket<T>>;

export interface ChannelRuntimeDiagnostic {
  stage: string;
  safeCode: string;
  diagnosticId: string;
  eventId: string;
  sessionId?: string;
  error: unknown;
}

export interface ChannelInvocation {
  /** Host-local callback; never serialized into an Agent prompt or worker request. */
  onDiagnostic?: (diagnostic: ChannelRuntimeDiagnostic) => void;
  message: ChannelInboundMessage;
  target: ChannelRuntimeTarget;
  sessionId?: string;
  /** Storage owner for an already-created session; avoids deriving it from the target. */
  sessionProjectId?: string;
}

export interface ChannelRuntimePort {
  invoke(input: ChannelInvocation): AsyncIterable<AgentOutputEvent>;
  cancel?(sessionId: string): Promise<void>;
}

export interface ChannelFlowRuntimePort extends ChannelRuntimePort {
  invokePackets(input: ChannelInvocation): FlowPacketStream<AgentOutputEvent>;
}

export interface ChannelMessageIngress {
  send(input: ChannelInvocation): AsyncIterable<AgentOutputEvent>;
}

export interface ChannelFlowMessageIngress extends ChannelMessageIngress {
  sendPackets(input: ChannelInvocation): FlowPacketStream<AgentOutputEvent>;
}

export type DeliveryStatus = 'delivered' | 'retrying' | 'failed' | 'expired';

export interface DeliveryReceipt {
  messageId: string;
  connectorId: string;
  status: DeliveryStatus;
  attempt: number;
  deliveredAt?: string;
  safeCode?: string;
}

export interface ChannelDeliveryPort {
  deliver(replyHandle: string, event: AgentOutputEvent): Promise<DeliveryReceipt>;
  push?(conversationId: string, event: AgentOutputEvent): Promise<DeliveryReceipt>;
}

export interface ChannelSessionBinding {
  id: string;
  origin: ChannelOrigin;
  connectorId: string;
  conversationId: string;
  targetFingerprint: string;
  sessionId: string;
  createdAt: string;
  updatedAt: string;
  expiresAt: string;
}
