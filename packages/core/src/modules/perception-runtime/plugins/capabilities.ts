import { createHash } from 'node:crypto';
import { z } from 'zod';
import type { JsonValue } from '../protocol/types';
import { AtomicDataFileStore } from '../storage/data-file-store';
import { resolvePerceptionPath } from '../storage/paths';
import type { PerceptionPluginRuntimeContext } from './types';

const identifier = z.string().min(1).max(192);
const descriptorSchema = z.object({
  name: identifier.regex(/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/),
  description: z.string().min(1).max(8192),
  inputSchema: z.record(z.unknown()),
  resultDescription: z.string().min(1).max(8192),
  requiredScopes: z.array(identifier).max(128),
  identityModes: z.array(z.enum(['application', 'user'])).min(1).max(2),
  effect: z.enum(['read', 'write', 'destructive', 'unknown']),
}).strict();
const catalogSchema = z.object({
  revision: identifier,
  provider: identifier,
  providerVersion: identifier,
  capabilities: z.array(descriptorSchema).max(2000),
}).strict();

export interface PluginCapabilityDescriptor extends Omit<z.infer<typeof descriptorSchema>, 'inputSchema'> {
  inputSchema: Record<string, JsonValue>;
}
export interface PluginCapabilityCatalog extends Omit<z.infer<typeof catalogSchema>, 'capabilities'> {
  capabilities: PluginCapabilityDescriptor[];
}
export interface PluginCapabilityAuthorization {
  /** Opaque, non-secret references from the platform authorization provider. */
  principalId: string;
  tenantId: string;
  revision: string;
  identityMode: 'application' | 'user';
  status: 'authorized' | 'needs_authorization' | 'unknown';
  scopes: readonly string[];
}
/** Host-assembled event context. Never accept these fields from model tool arguments. */
export interface PluginCapabilityActor {
  eventId: string;
  sessionId: string;
  actorId: string;
  conversationId: string;
  conversationKind: 'group' | 'direct';
  requireHitl?: boolean;
  targetKind?: 'project' | 'role-agent' | 'skill';
  targetId?: string;
}
export interface PluginCapabilityInvocation {
  name: string;
  catalogRevision: string;
  callId: string;
  arguments: Record<string, JsonValue>;
}
export interface PluginCapabilityProvider {
  list(context: PerceptionPluginRuntimeContext, signal: AbortSignal): Promise<PluginCapabilityCatalog>;
  authorization(context: PerceptionPluginRuntimeContext, signal: AbortSignal): Promise<PluginCapabilityAuthorization>;
  /** Starts an interactive, connector-scoped authorization flow when the provider requires one. */
  requestAuthorization?(context: PerceptionPluginRuntimeContext, signal: AbortSignal): Promise<PluginCapabilityAuthorization>;
  /** Use the same pinned native schema that generated inputSchema; fail closed. */
  validate(name: string, arguments_: Record<string, JsonValue>, context?: PerceptionPluginRuntimeContext): boolean;
  invoke(context: PerceptionPluginRuntimeContext, input: PluginCapabilityInvocation, authorization: PluginCapabilityAuthorization, signal: AbortSignal): Promise<JsonValue>;
}
/** Host policy must check actor-to-principal binding, Agent scope, and side-effect approval. */
export interface PluginCapabilityPolicyPort {
  authorize(input: {
    pluginId: string; connectorId: string; actor: PluginCapabilityActor;
    capability: PluginCapabilityDescriptor; authorization: PluginCapabilityAuthorization;
    invocation?: PluginCapabilityInvocation;
  }): Promise<boolean>;
}
export type PluginCapabilityAvailability = 'available' | 'needs_authorization' | 'unknown' | 'denied';
export interface PluginCapabilityListing {
  revision: string;
  provider: string;
  providerVersion: string;
  authorizationStatus: PluginCapabilityAuthorization['status'];
  capabilities: (Omit<PluginCapabilityDescriptor, 'inputSchema'> & { inputSchema?: Record<string, JsonValue>; availability: PluginCapabilityAvailability })[];
}
export interface PluginCapabilityConnectionStatus {
  connectorId: string;
  state: 'unsupported' | 'disabled' | 'available' | 'needs_authorization' | 'sync_failed';
  provider?: string;
  providerVersion?: string;
  capabilityCount?: number;
  identityMode?: 'application' | 'user';
  writeEnabled?: boolean;
}
interface CallRecord { digest: string; status: 'pending' | 'completed' | 'uncertain' | 'failed'; safeCode?: string }
interface CapabilityCache {
  pluginId: string;
  connectorId: string;
  catalog?: PluginCapabilityCatalog;
  fetchedAt?: string;
  authorizationReference?: Pick<PluginCapabilityAuthorization, 'tenantId' | 'principalId' | 'revision' | 'identityMode'>;
  calls: Record<string, CallRecord>;
}

/** Bound JSON at the plugin/process boundary; reject executable and prototype-bearing values. */
export function capabilityJson(value: unknown): JsonValue {
  let nodes = 0;
  const visit = (item: unknown, depth: number): void => {
    if (++nodes > 100000 || depth > 32) throw new Error('IM_CAPABILITY_INVALID_DATA');
    if (item === null || typeof item === 'string' || typeof item === 'boolean') return;
    if (typeof item === 'number' && Number.isFinite(item)) return;
    if (Array.isArray(item)) { item.forEach(child => visit(child, depth + 1)); return; }
    if (typeof item !== 'object' || !item || Object.getPrototypeOf(item) !== Object.prototype) throw new Error('IM_CAPABILITY_INVALID_DATA');
    for (const [key, child] of Object.entries(item)) {
      if (['__proto__', 'prototype', 'constructor'].includes(key)) throw new Error('IM_CAPABILITY_INVALID_DATA');
      visit(child, depth + 1);
    }
  };
  visit(value, 0);
  const json = JSON.stringify(value);
  if (Buffer.byteLength(json) > 2 * 1024 * 1024) throw new Error('IM_CAPABILITY_INVALID_DATA');
  return JSON.parse(json) as JsonValue;
}

export function validateCapabilityCatalog(value: unknown): PluginCapabilityCatalog {
  const result = catalogSchema.safeParse(capabilityJson(value));
  if (!result.success) throw new Error('IM_CAPABILITY_INVALID_CATALOG');
  const names = new Set<string>();
  for (const descriptor of result.data.capabilities) {
    if (names.has(descriptor.name) || descriptor.inputSchema['type'] !== 'object') throw new Error('IM_CAPABILITY_INVALID_CATALOG');
    names.add(descriptor.name);
    // Schemas are supplied by trusted plugins; executable validation stays in that plugin.
    // No external schema resolution may cause network access or arbitrary file reads.
    const scan = (node: unknown): void => {
      if (!node || typeof node !== 'object') return;
      for (const [key, child] of Object.entries(node)) {
        if (key === '$ref' || key === '$dynamicRef') throw new Error('IM_CAPABILITY_INVALID_CATALOG');
        scan(child);
      }
    };
    scan(descriptor.inputSchema);
  }
  return result.data as PluginCapabilityCatalog;
}

function checkedAuthorization(value: PluginCapabilityAuthorization): PluginCapabilityAuthorization {
  const parsed = z.object({ principalId: identifier, tenantId: identifier, revision: identifier,
    identityMode: z.enum(['application', 'user']), status: z.enum(['authorized', 'needs_authorization', 'unknown']),
    scopes: z.array(identifier).max(1000),
  }).strict().safeParse(value);
  if (!parsed.success) throw new Error('IM_CAPABILITY_AUTHORIZATION_UNKNOWN');
  return parsed.data as PluginCapabilityAuthorization;
}

const CAPABILITY_SEARCH_ALIASES = [
  ['日历', '日程', 'calendar', 'schedule'],
  ['待办', '任务', 'todo', 'task'],
  ['文档', 'document', 'doc'],
  ['微盘', '网盘', 'drive', 'disk'],
  ['会议', 'meeting'],
  ['邮件', '邮箱', 'mail', 'email'],
] as const;

function searchTerms(keyword: string): readonly string[] {
  const expanded = new Set<string>([keyword]);
  for (const aliases of CAPABILITY_SEARCH_ALIASES) {
    if (aliases.some(alias => keyword.includes(alias))) aliases.forEach(alias => expanded.add(alias));
  }
  return [...expanded];
}

/** One connection lifecycle. Persistent state contains no credentials, input, or result bodies. */
export class PluginCapabilitySession {
  private readonly controller = new AbortController();
  private readonly store: AtomicDataFileStore<CapabilityCache>;

  constructor(private readonly context: PerceptionPluginRuntimeContext, private readonly provider: PluginCapabilityProvider,
    private readonly policy: PluginCapabilityPolicyPort, dataRoot: string) {
    this.store = new AtomicDataFileStore(resolvePerceptionPath(dataRoot, 'capabilities', `${context.connectorId}.json`));
  }

  private readCache(data?: CapabilityCache): CapabilityCache {
    const context = this.context;
    const c = data ?? { pluginId: context.pluginId, connectorId: context.connectorId, calls: {} };
    if (c.pluginId !== context.pluginId || c.connectorId !== context.connectorId || !c.calls || Object.getPrototypeOf(c.calls) !== Object.prototype) throw new Error('IM_CAPABILITY_INVALID_CACHE');
    for (const [key, call] of Object.entries(c.calls)) {
      if (!/^[a-f0-9]{64}$/.test(key) || !call || !/^[a-f0-9]{64}$/.test(call.digest) || !['pending', 'completed', 'uncertain', 'failed'].includes(call.status) ||
        (call.safeCode !== undefined && !['IM_CAPABILITY_AUTHORIZATION_EXPIRED', 'IM_CAPABILITY_SERVICE_AUTHORIZATION_REQUIRED', 'IM_CAPABILITY_PLATFORM_REJECTED'].includes(call.safeCode))) throw new Error('IM_CAPABILITY_INVALID_CACHE');
    }
    if (c.catalog) validateCapabilityCatalog(c.catalog);
    return c;
  }

  close(): void { this.controller.abort(); }
  private assertOpen(): void { if (this.controller.signal.aborted) throw new Error('IM_CAPABILITY_UNAVAILABLE'); }

  private async snapshot(): Promise<{ catalog: PluginCapabilityCatalog; authorization: PluginCapabilityAuthorization }> {
    this.assertOpen();
    const initialAuthorization = checkedAuthorization(await this.provider.authorization(this.context, this.controller.signal));
    if (initialAuthorization.status === 'needs_authorization') throw new Error('IM_CAPABILITY_AUTHORIZATION_REQUIRED');
    // Cached descriptions are for display/recovery only, never an authorization source.
    const catalog = validateCapabilityCatalog(await this.provider.list(this.context, this.controller.signal));
    const authorization = checkedAuthorization(await this.provider.authorization(this.context, this.controller.signal));
    this.assertOpen();
    await this.store.updateAsync(data => {
      const cache = this.readCache(data);
      cache.catalog = catalog;
      cache.fetchedAt = new Date().toISOString();
      const { tenantId, principalId, revision, identityMode } = authorization;
      cache.authorizationReference = { tenantId, principalId, revision, identityMode };
      return cache;
    });
    this.assertOpen();
    return { catalog, authorization };
  }

  private async availability(capability: PluginCapabilityDescriptor, authorization: PluginCapabilityAuthorization,
    actor: PluginCapabilityActor, invocation?: PluginCapabilityInvocation): Promise<PluginCapabilityAvailability> {
    if (authorization.status === 'unknown' || capability.effect === 'unknown') return 'unknown';
    if (authorization.status !== 'authorized' || !capability.identityModes.includes(authorization.identityMode) ||
      !capability.requiredScopes.every(scope => authorization.scopes.includes(scope))) return 'needs_authorization';
    return await this.policy.authorize({ pluginId: this.context.pluginId, connectorId: this.context.connectorId,
      actor, capability, authorization, invocation }) ? 'available' : 'denied';
  }

  async discover(actor: PluginCapabilityActor, query = '', name?: string): Promise<PluginCapabilityListing> {
    if (query.length > 256 || (name?.length ?? 0) > 192) throw new Error('IM_CAPABILITY_INVALID_INPUT');
    const { catalog, authorization } = await this.snapshot();
    const keywords = query.toLowerCase().trim().split(/\s+/).filter(Boolean).map(searchTerms);
    // ponytail: bounded substring search; add indexing only if 2000 descriptors becomes insufficient.
    const selected = name
      ? catalog.capabilities.filter(c => c.name === name)
      : catalog.capabilities
        .map(capability => {
          const searchable = `${capability.name} ${capability.description}`.toLowerCase();
          return { capability, score: keywords.filter(terms => terms.some(term => searchable.includes(term))).length };
        })
        .filter(({ score }) => keywords.length === 0 || score > 0)
        .sort((left, right) => right.score - left.score || left.capability.name.localeCompare(right.capability.name))
        .slice(0, 20)
        .map(({ capability }) => capability);
    const capabilities = await Promise.all(selected.map(async c => {
      const { inputSchema, ...summary } = c;
      return { ...summary, ...(name ? { inputSchema } : {}), availability: await this.availability(c, authorization, actor) };
    }));
    this.assertOpen();
    return { revision: catalog.revision, provider: catalog.provider, providerVersion: catalog.providerVersion,
      authorizationStatus: authorization.status, capabilities };
  }

  async inspect(): Promise<Omit<PluginCapabilityConnectionStatus, 'connectorId'>> {
    // An uninitialized connector-scoped CLI cannot fetch a catalog yet. Surface
    // its authorization state before trying authenticated schema discovery.
    const initialAuthorization = checkedAuthorization(await this.provider.authorization(this.context, this.controller.signal));
    if (initialAuthorization.status !== 'authorized') {
      return { state: initialAuthorization.status === 'needs_authorization' ? 'needs_authorization' : 'sync_failed',
        identityMode: initialAuthorization.identityMode };
    }
    const { catalog, authorization } = await this.snapshot();
    return {
      state: authorization.status === 'authorized' ? 'available'
        : authorization.status === 'needs_authorization' ? 'needs_authorization' : 'sync_failed',
      provider: catalog.provider,
      providerVersion: catalog.providerVersion,
      capabilityCount: catalog.capabilities.length,
      identityMode: authorization.identityMode,
    };
  }

  async invoke(actor: PluginCapabilityActor, input: PluginCapabilityInvocation): Promise<JsonValue> {
    const parsed = z.object({ name: identifier, catalogRevision: identifier, callId: identifier, arguments: z.record(z.unknown()) }).strict().safeParse(capabilityJson(input));
    if (!parsed.success) throw new Error('IM_CAPABILITY_INVALID_INPUT');
    const request = parsed.data as PluginCapabilityInvocation;
    const { catalog, authorization } = await this.snapshot();
    const capability = catalog.capabilities.find(c => c.name === request.name);
    if (!capability || request.catalogRevision !== catalog.revision) throw new Error('IM_CAPABILITY_STALE_CATALOG');
    if (!this.provider.validate(request.name, request.arguments, this.context)) throw new Error('IM_CAPABILITY_INVALID_INPUT');
    if (await this.availability(capability, authorization, actor, request) !== 'available') throw new Error('IM_CAPABILITY_DENIED');
    this.assertOpen();
    // Human approval may take minutes. Recheck both authorization and schema after policy returns.
    const current = await this.snapshot();
    if (current.catalog.revision !== catalog.revision || JSON.stringify(current.authorization) !== JSON.stringify(authorization)) throw new Error('IM_CAPABILITY_AUTHORIZATION_CHANGED');
    const key = createHash('sha256').update(JSON.stringify([actor.sessionId, request.callId])).digest('hex');
    const digest = createHash('sha256').update(JSON.stringify([actor, authorization.principalId, authorization.tenantId, authorization.revision, request])).digest('hex');
    await this.store.updateAsync(data => {
      this.assertOpen();
      const cache = this.readCache(data);
      const previous = cache.calls[key];
      if (previous) throw new Error(previous.digest !== digest ? 'IM_CAPABILITY_CALL_CONFLICT'
        : previous.status === 'completed' ? 'IM_CAPABILITY_ALREADY_COMPLETED'
          : previous.status === 'failed'
            ? previous.safeCode === 'IM_CAPABILITY_AUTHORIZATION_EXPIRED'
              ? 'IM_CAPABILITY_SERVICE_AUTHORIZATION_REQUIRED'
              : previous.safeCode ?? 'IM_CAPABILITY_PLATFORM_REJECTED'
            : 'IM_CAPABILITY_RESULT_UNCERTAIN');
      // ponytail: keep 10000 durable receipts without eviction; add archival before raising this ceiling.
      // Reserve durably before any platform write. Never replay a pending/uncertain call after restart.
      if (Object.keys(cache.calls).length >= 10000) throw new Error('IM_CAPABILITY_LEDGER_FULL');
      cache.calls[key] = { digest, status: 'pending' };
      return cache;
    });
    this.assertOpen();
    try {
      const result = capabilityJson(await this.provider.invoke(this.context, request, authorization, this.controller.signal));
      await this.store.updateAsync(data => { const cache = this.readCache(data); const call = cache.calls[key];
        if (!call) throw new Error('IM_CAPABILITY_INVALID_CACHE'); call.status = 'completed'; return cache; });
      return result;
    } catch (error) {
      const safeCode = error instanceof Error && ['IM_CAPABILITY_AUTHORIZATION_EXPIRED', 'IM_CAPABILITY_SERVICE_AUTHORIZATION_REQUIRED', 'IM_CAPABILITY_PLATFORM_REJECTED'].includes(error.message)
        ? error.message : undefined;
      await this.store.updateAsync(data => { const cache = this.readCache(data); const call = cache.calls[key];
        if (!call) throw new Error('IM_CAPABILITY_INVALID_CACHE');
        call.status = safeCode ? 'failed' : 'uncertain';
        if (safeCode) call.safeCode = safeCode;
        return cache; });
      throw new Error(safeCode ?? 'IM_CAPABILITY_RESULT_UNCERTAIN');
    }
  }
}
