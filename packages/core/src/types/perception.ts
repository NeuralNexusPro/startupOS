export type PerceptionSource = 'email' | 'wecom' | 'feishu' | 'dingtalk';
export type PerceptionEventType = 'message.received' | 'mention.received' | 'mail.received' | 'action.invoked';
export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };

export interface PerceptionActor { externalId: string; displayName?: string }
export interface PerceptionConversation { externalId: string; kind: 'direct' | 'group' | 'thread' }
export interface PerceptionContent { text?: string; subject?: string; attachmentRefs?: string[] }
export interface PerceptionEventV1 {
  schemaVersion: '1.0'; id: string; source: PerceptionSource; sourceEventId: string; connectorId: string;
  type: PerceptionEventType; occurredAt: string; receivedAt: string; actor: PerceptionActor;
  conversation?: PerceptionConversation; content: PerceptionContent;
  provenance: { tenantExternalId?: string; rawPayloadRef: string };
}
export interface ConnectorCapabilities {
  inboundEvents: PerceptionEventType[]; outboundReply: boolean; callbackHandshake: boolean;
  encryptedPayload: boolean; polling: boolean; attachments: boolean;
}
export interface ConnectorVerificationContext {
  headers: Readonly<Record<string, string>>; query: Readonly<Record<string, string>>;
  receivedAt: string; rawBody?: string;
}
export interface ConnectorVerificationResult { authenticated: boolean; reason?: string; replayKey?: string; signedAt?: string }
export interface ConnectorNormalizeContext { connectorId: string; inboxRef: string; receivedAt: string }
export interface ConnectorAck { status: number; headers?: Record<string, string>; body?: JsonValue }
export interface ConnectorHandshakeContext { query: Readonly<Record<string, string>>; receivedAt: string }
export interface ConnectorHandshakeResult { authenticated: boolean; reason?: string; replayKey?: string; signedAt?: string; ack?: ConnectorAck }
export interface PerceptionConnector {
  readonly source: PerceptionSource; readonly capabilities: ConnectorCapabilities;
  verify(payload: JsonValue, context: ConnectorVerificationContext): Promise<ConnectorVerificationResult>;
  normalize(payload: JsonValue, context: ConnectorNormalizeContext): Promise<PerceptionEventV1[]>;
  acknowledge(events: readonly PerceptionEventV1[], payload?: JsonValue, context?: ConnectorNormalizeContext): Promise<ConnectorAck>;
  handshake?(context: ConnectorHandshakeContext): Promise<ConnectorHandshakeResult>;
}
export interface PerceptionDataFile<T> { version: string; createdAt: string; updatedAt: string; data: T }
export interface InboxRecord { id: string; connectorId: string; receivedAt: string; payloadSha256: string; payload: JsonValue }
export interface ExecutionLease {
  id: string; eventId: string; ruleId: string; status: 'acquired' | 'completed' | 'failed';
  acquiredAt: string; updatedAt: string; resultRef?: string; attemptKey?: string;
}
export interface PerceptionAuditEntry {
  id: string;
  action: 'inbox.accepted' | 'inbox.rejected' | 'event.created' | 'event.duplicate' | 'rule.matched' | 'target.denied' | 'lease.acquired' | 'lease.completed' | 'lease.failed' | 'trigger.dispatched';
  occurredAt: string; connectorId?: string; eventId?: string; detail?: JsonValue;
}
export interface PerceptionTargetResultSummary {
  status: ExecutionLease['status']; resultRef?: string; sessionId?: string; summary?: string;
}
export interface PerceptionRuleTriggerTrace {
  ruleId: string; matchedAt?: string; dispatchedAt?: string; finishedAt?: string;
  rule?: PerceptionTriggerRule; lease?: ExecutionLease; result?: PerceptionTargetResultSummary;
}
export interface PerceptionEventTrace {
  event: PerceptionEventV1; ruleTriggers: PerceptionRuleTriggerTrace[]; audit: PerceptionAuditEntry[];
}

export type TriggerFilterPath =
  | 'source' | 'connectorId' | 'type'
  | 'actor.externalId' | 'conversation.externalId'
  | 'content.text' | 'content.subject' | 'provenance.tenantExternalId';
export type TriggerFilterOperator = 'equals' | 'contains' | 'startsWith' | 'exists';
export interface TriggerFilterCondition {
  path: TriggerFilterPath;
  operator: TriggerFilterOperator;
  value?: JsonPrimitive;
}
export type PerceptionTargetKind = 'project' | 'role-agent' | 'skill';
export type SkillCognitionOwnership =
  | { mode: 'ephemeral' }
  | { mode: 'inherited'; ownerKind: 'project' | 'role-agent'; ownerId: string };
export interface PerceptionTriggerTarget {
  kind: PerceptionTargetKind;
  id: string;
  skillOwnership?: SkillCognitionOwnership;
}
export interface PerceptionTriggerRule {
  id: string;
  enabled: boolean;
  sources: PerceptionSource[];
  eventTypes: PerceptionEventType[];
  conditions: TriggerFilterCondition[];
  target: PerceptionTriggerTarget;
  execution: { requireHitl: boolean; maxAttempts: number };
  createdAt: string;
  updatedAt: string;
}
export interface PerceptionTargetAuthorization {
  authorized: boolean;
  reason?: string;
  effectiveToolScope?: string[];
}
export interface TargetAuthorizationPort {
  authorize(input: { event: PerceptionEventV1; rule: PerceptionTriggerRule; target: PerceptionTriggerTarget }): Promise<PerceptionTargetAuthorization>;
}
export interface PerceptionTargetExistencePort {
  exists(target: PerceptionTriggerTarget): Promise<boolean>;
}
export interface PerceptionTriggerExecutionContext {
  connectorId: string;
  eventId: string;
  ruleId: string;
  leaseId: string;
  rawPayloadRef: string;
  requireHitl: boolean;
  cognitionOwner: { kind: 'project' | 'role-agent'; id: string } | { kind: 'ephemeral' };
}
export interface TriggerExecutionResult { resultRef: string; sessionId?: string; responseText?: string; responseTexts?: string[] }
export interface TriggerExecutionPort {
  dispatch(input: { event: PerceptionEventV1; target: PerceptionTriggerTarget; context: PerceptionTriggerExecutionContext }): Promise<TriggerExecutionResult>;
}
export interface ExternalTriggerGrant {
  target: { kind: PerceptionTargetKind; id: string };
  enabled: boolean;
  allowedConnectorIds?: string[];
  allowedRuleIds?: string[];
  effectiveToolScope?: string[];
  createdAt: string;
  updatedAt: string;
}

export type PerceptionConnectorMode = 'email-poll' | 'webhook' | 'stream';
export interface PerceptionConnectorConfig {
  id: string; source: PerceptionSource; mode: PerceptionConnectorMode; enabled: boolean;
  secretRef?: string; settings: { [key: string]: JsonValue }; createdAt: string; updatedAt: string;
}
export type MailAuthMode = 'password' | 'oauth2-token';
export interface MailConnectorSettings {
  host: string; port: number; secure: boolean; username: string; authMode: MailAuthMode;
  mailbox: string; pollIntervalSeconds: number;
}
export interface MailSecretInput { kind: MailAuthMode; value: string }
export interface MailSecret { kind: MailAuthMode; value: string }
export type MailConnectionErrorCode = 'SECURE_STORAGE_UNAVAILABLE' | 'INVALID_PROFILE' | 'DNS_FAILED' | 'TLS_FAILED' | 'AUTH_FAILED' | 'MAILBOX_NOT_FOUND' | 'TIMEOUT' | 'CONNECTION_FAILED';
export interface MailConnectionTestReceipt {
  connectorId: string; profileFingerprint: string; verifiedAt: string;
  capabilities: string[]; mailbox: string;
}
export type MailConnectionTestResult =
  | { success: true; receipt: MailConnectionTestReceipt }
  | { success: false; code: MailConnectionErrorCode };
export interface MailCredentialPort {
  bind(connectorId: string, secret: MailSecretInput): Promise<string>;
  resolve(secretRef: string): Promise<MailSecret>;
  remove(secretRef: string): Promise<void>;
}
export interface MailClientPort {
  testConnection(input: { connectorId: string; profile: MailConnectorSettings; secret: MailSecret; timeoutMs: number }): Promise<MailConnectionTestResult>;
}
export interface WeComConnectorSettings {
  transport: 'aibot-websocket';
  botId: string;
  websocketUrl?: string;
}
export interface WeComBotSecretInput { value: string }
export interface WeComBotSecret { value: string }
export interface WeComBotCredentialPort {
  bind(connectorId: string, secret: WeComBotSecretInput): Promise<string>;
  resolve(secretRef: string): Promise<WeComBotSecret>;
  remove(secretRef: string): Promise<void>;
}
export interface FeishuConnectorSettings { appId: string; domain?: 'feishu' | 'lark' }
export interface FeishuCredentialInput { appSecret: string }
type ConnectorHealthStatus = 'healthy' | 'degraded' | 'disconnected' | 'disabled';
interface ConnectorHealthBase { connectorId: string; status: ConnectorHealthStatus; updatedAt: string; lastSuccessAt?: string; lastSafeCode?: string }
export type ConnectorHealth =
  | ConnectorHealthBase & { mode: 'email-poll'; mailbox?: string; lastUid?: number; lastCursorAt?: string }
  | ConnectorHealthBase & { mode: 'webhook'; lastCallbackAt?: string; lastAckAt?: string }
  | ConnectorHealthBase & { mode: 'stream'; connectionState: 'connected' | 'reconnecting' | 'disconnected'; reconnectCount: number; pendingHandlers: number };
export interface PerceptionRetryRecord {
  id: string; eventId: string; ruleId: string; connectorId: string; attempt: number; maxAttempts: number;
  status: 'scheduled' | 'processing' | 'completed' | 'dead-letter'; nextAttemptAt: string; lastSafeCode: string;
  createdAt: string; updatedAt: string;
}
export interface PerceptionDeadLetter {
  id: string; retryId: string; eventId: string; ruleId: string; connectorId: string; attempts: number;
  lastSafeCode: string; createdAt: string; replayedAt?: string;
}
