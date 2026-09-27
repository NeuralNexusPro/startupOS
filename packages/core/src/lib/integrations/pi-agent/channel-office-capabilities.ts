import { AsyncLocalStorage } from 'node:async_hooks';
import { randomUUID } from 'node:crypto';

export type ChannelOfficeJsonValue = string | number | boolean | null | ChannelOfficeJsonValue[] | { [key: string]: ChannelOfficeJsonValue };

export interface ChannelOfficeCapabilityInvocation {
  name: string;
  catalogRevision: string;
  callId: string;
  arguments: Record<string, ChannelOfficeJsonValue>;
}

export interface ChannelOfficeCapabilityPort {
  discover(query?: string, name?: string): Promise<unknown>;
  invoke(input: ChannelOfficeCapabilityInvocation): Promise<unknown>;
}

interface CapabilityContext { port: ChannelOfficeCapabilityPort; lease: AbortController }
const storage = new AsyncLocalStorage<CapabilityContext>();
let fallbackPort: ChannelOfficeCapabilityPort | undefined;
const sessionPorts = new Map<string, { token: symbol; port: ChannelOfficeCapabilityPort }>();

export async function withChannelOfficeCapabilities<T>(port: ChannelOfficeCapabilityPort, operation: () => Promise<T>): Promise<T> {
  const lease = new AbortController();
  try { return await storage.run({ port, lease }, operation); }
  finally { lease.abort(); }
}

export function requireChannelOfficeCapabilities(): ChannelOfficeCapabilityPort {
  const context = storage.getStore();
  if (context && !context.lease.signal.aborted) return context.port;
  if (fallbackPort) return fallbackPort;
  throw new Error('IM_CAPABILITY_UNAVAILABLE');
}

export function hasChannelOfficeCapabilities(): boolean {
  const context = storage.getStore();
  return Boolean((context && !context.lease.signal.aborted) || fallbackPort);
}

export function setChannelOfficeCapabilityFallback(port?: ChannelOfficeCapabilityPort): void {
  fallbackPort = port;
}

export function bindChannelOfficeCapabilitySession(sessionId: string, port: ChannelOfficeCapabilityPort): () => void {
  if (!sessionId || sessionId.length > 192) throw new Error('IM_CAPABILITY_INVALID_INPUT');
  const token = Symbol(sessionId);
  sessionPorts.set(sessionId, { token, port });
  return () => { if (sessionPorts.get(sessionId)?.token === token) sessionPorts.delete(sessionId); };
}

export async function executeChannelOfficeCapabilityProxy(
  sessionId: string,
  toolName: string,
  toolCallId: string,
  rawArguments: unknown,
): Promise<unknown> {
  const port = sessionPorts.get(sessionId)?.port;
  if (!port) throw new Error('IM_CAPABILITY_UNAVAILABLE');
  if (!rawArguments || typeof rawArguments !== 'object' || Array.isArray(rawArguments)) throw new Error('IM_CAPABILITY_INVALID_INPUT');
  const args = rawArguments as Record<string, unknown>;
  if (toolName === 'discover_im_capabilities') {
    if (Object.keys(args).some(key => key !== 'query' && key !== 'name') ||
      (args['query'] !== undefined && typeof args['query'] !== 'string') || (args['name'] !== undefined && typeof args['name'] !== 'string')) {
      throw new Error('IM_CAPABILITY_INVALID_INPUT');
    }
    return port.discover(args['query'] as string | undefined, args['name'] as string | undefined);
  }
  if (toolName !== 'invoke_im_capability' || Object.keys(args).some(key => !['name', 'catalogRevision', 'arguments'].includes(key)) ||
    typeof args['name'] !== 'string' || typeof args['catalogRevision'] !== 'string' || !args['arguments'] || typeof args['arguments'] !== 'object' || Array.isArray(args['arguments'])) {
    throw new Error('IM_CAPABILITY_INVALID_INPUT');
  }
  return port.invoke({ name: args['name'], catalogRevision: args['catalogRevision'], callId: toolCallId,
    arguments: args['arguments'] as Record<string, ChannelOfficeJsonValue> });
}

export function createChannelOfficeCapabilityWorkerFallback(
  callHostTool: (toolCallId: string, toolName: string, args: unknown) => Promise<string>,
): ChannelOfficeCapabilityPort {
  return {
    discover: async (query, name) => parseHostResult(await callHostTool(randomUUID(), 'discover_im_capabilities', { query, name })),
    invoke: async ({ callId, ...input }) => parseHostResult(await callHostTool(callId, 'invoke_im_capability', input)),
  };
}

function parseHostResult(value: string): unknown {
  try {
    const parsed = JSON.parse(value) as { ok?: unknown; result?: unknown; code?: unknown };
    if (parsed.ok === true) return parsed.result;
    throw new Error(typeof parsed.code === 'string' && /^IM_CAPABILITY_[A-Z_]+$/.test(parsed.code) ? parsed.code : 'IM_CAPABILITY_FAILED');
  } catch (error) {
    if (error instanceof Error && /^IM_CAPABILITY_[A-Z_]+$/.test(error.message)) throw error;
    throw new Error('IM_CAPABILITY_FAILED');
  }
}
