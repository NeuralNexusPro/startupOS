import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type { ChannelOrigin, ChannelRuntimeTarget, ChannelSessionBinding } from './types';
import { ChannelDataFileStore } from './file-store';
import { validateChannelRuntimeTarget } from './validation';

export interface ResolveBindingInput {
  origin: ChannelOrigin;
  connectorId: string;
  conversationId: string;
  target: ChannelRuntimeTarget;
  createSessionId(): Promise<string>;
  ttlMs?: number;
}

export class ChannelSessionBindingStore {
  private readonly pending = new Map<string, Promise<ChannelSessionBinding>>();

  constructor(private readonly dataRoot: string, private readonly now: () => Date = () => new Date()) {}

  async resolve(input: ResolveBindingInput): Promise<ChannelSessionBinding> {
    validateChannelRuntimeTarget(input.target);
    if (input.ttlMs !== undefined && (!Number.isFinite(input.ttlMs) || input.ttlMs <= 0)) {
      throw new Error('CHANNEL_BINDING_TTL_INVALID');
    }
    const fingerprint = targetFingerprint(input.target);
    const id = bindingId(input.origin, input.connectorId, input.conversationId, fingerprint);
    const active = this.pending.get(id);
    if (active) return active;
    const resolving = this.resolveExclusive(id, fingerprint, input);
    this.pending.set(id, resolving);
    try {
      return await resolving;
    } finally {
      if (this.pending.get(id) === resolving) this.pending.delete(id);
    }
  }

  private async resolveExclusive(
    id: string,
    fingerprint: string,
    input: ResolveBindingInput,
  ): Promise<ChannelSessionBinding> {
    const store = this.store(id);
    const existing = store.exists() ? store.read() : null;
    const now = this.now();
    if (existing && Date.parse(existing.expiresAt) > now.getTime()) return existing;
    const sessionId = await input.createSessionId();
    const timestamp = now.toISOString();
    const binding: ChannelSessionBinding = {
      id, origin: input.origin, connectorId: input.connectorId, conversationId: input.conversationId,
      targetFingerprint: fingerprint, sessionId, createdAt: timestamp, updatedAt: timestamp,
      expiresAt: new Date(now.getTime() + (input.ttlMs ?? 24 * 60 * 60 * 1_000)).toISOString(),
    };
    store.write(binding);
    return binding;
  }

  reset(origin: ChannelOrigin, connectorId: string, conversationId: string, target: ChannelRuntimeTarget): boolean {
    const filePath = this.store(bindingId(origin, connectorId, conversationId, targetFingerprint(target))).filePath;
    if (!fs.existsSync(filePath)) return false;
    fs.unlinkSync(filePath);
    return true;
  }

  private store(id: string): ChannelDataFileStore<ChannelSessionBinding> {
    return new ChannelDataFileStore(path.join(this.dataRoot, 'channels', 'bindings', `${id}.json`));
  }
}

export function targetFingerprint(target: ChannelRuntimeTarget): string {
  if (target.kind === 'project-multi-agent') return `${target.kind}:${target.projectId}:${target.runtime}`;
  if (target.kind === 'project-agent') return `${target.kind}:${target.projectId}:${target.id}`;
  if (target.kind === 'skill') {
    const owner = target.ownership.mode === 'ephemeral'
      ? 'ephemeral'
      : `${target.ownership.ownerKind}:${target.ownership.ownerId}`;
    return `${target.kind}:${target.id}:${owner}`;
  }
  return `${target.kind}:${target.id}`;
}

function bindingId(origin: string, connectorId: string, conversationId: string, fingerprint: string): string {
  return createHash('sha256').update(JSON.stringify([origin, connectorId, conversationId, fingerprint])).digest('hex');
}
