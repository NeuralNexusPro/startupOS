import { createHash } from 'node:crypto';
import type { PerceptionEventV1, PerceptionTriggerTarget } from '../../../types/perception';
import { AtomicDataFileStore } from './data-file-store';
import { resolvePerceptionPath } from './paths';

const DEFAULT_STICKY_ROUTE_IDLE_MS = 30 * 60 * 1000;

interface StickyRouteBinding {
  ruleId: string;
  candidateKey: string;
  target: PerceptionTriggerTarget;
  startedAt: string;
  updatedAt: string;
  expiresAt: string;
}

interface StickyRouteState {
  bindings: Record<string, StickyRouteBinding>;
}

/**
 * Persists the target that owns an active IM conversation. External platform
 * identifiers are hashed into the lookup key and are never written as values.
 */
export class StickyRouteStore {
  private readonly store: AtomicDataFileStore<StickyRouteState>;

  constructor(dataRoot: string, private readonly idleMs = DEFAULT_STICKY_ROUTE_IDLE_MS) {
    this.store = new AtomicDataFileStore<StickyRouteState>(resolvePerceptionPath(dataRoot, 'routing', 'sticky-routes.json'));
  }

  get(event: PerceptionEventV1, ruleId: string): StickyRouteBinding | null {
    if (!isImConversation(event) || !this.store.exists()) return null;
    const state = this.store.read().data;
    const binding = state.bindings[this.key(event, ruleId)];
    if (!binding) return null;
    const eventTime = Date.parse(event.receivedAt);
    if (!Number.isFinite(eventTime) || Date.parse(binding.expiresAt) < eventTime) {
      this.clear(event, ruleId);
      return null;
    }
    return { ...binding, startedAt: binding.startedAt ?? binding.updatedAt };
  }

  bind(event: PerceptionEventV1, ruleId: string, candidateKey: string, target: PerceptionTriggerTarget): void {
    if (!isImConversation(event)) return;
    const eventTime = Date.parse(event.receivedAt);
    const updatedAt = Number.isFinite(eventTime) ? new Date(eventTime).toISOString() : new Date().toISOString();
    const expiresAt = new Date(Date.parse(updatedAt) + this.idleMs).toISOString();
    const state = this.store.exists() ? this.store.read().data : { bindings: {} };
    const key = this.key(event, ruleId);
    const previous = state.bindings[key];
    const startedAt = previous && previous.candidateKey === candidateKey && JSON.stringify(previous.target) === JSON.stringify(target)
      ? previous.startedAt ?? previous.updatedAt
      : updatedAt;
    state.bindings[key] = { ruleId, candidateKey, target, startedAt, updatedAt, expiresAt };
    this.store.write(state);
  }

  clear(event: PerceptionEventV1, ruleId: string): void {
    if (!isImConversation(event) || !this.store.exists()) return;
    const state = this.store.read().data;
    const key = this.key(event, ruleId);
    if (!(key in state.bindings)) return;
    delete state.bindings[key];
    this.store.write(state);
  }

  private key(event: PerceptionEventV1, ruleId: string): string {
    return createHash('sha256').update([
      event.source,
      event.connectorId,
      event.conversation?.kind ?? '',
      event.conversation?.externalId ?? '',
      event.actor.externalId,
      ruleId,
    ].join('\0')).digest('hex');
  }
}

function isImConversation(event: PerceptionEventV1): boolean {
  return ['wecom', 'feishu', 'dingtalk'].includes(event.source) && Boolean(event.conversation?.externalId);
}
