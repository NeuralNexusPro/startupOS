import type { AgentMessage } from '@originos/pi-agent-adapter';

type TraceMessage = AgentMessage & { role?: string };

export interface CompressionOptions {
  maxHistory?: number;
  keepRecent?: number;
  preserveTraceCount?: number;
}

export interface CompressionResult {
  messages: TraceMessage[];
  compressed: boolean;
  preservedTraceCount: number;
}

const DEFAULT_MAX_HISTORY = 20;
const DEFAULT_KEEP_RECENT = 10;
const DEFAULT_PRESERVE_TRACE_COUNT = 6;

function isTraceMessage(message: TraceMessage): boolean {
  const role = String(message.role ?? '');
  return role === 'toolResult' || role === 'tool';
}

function isAssistantMessage(message: TraceMessage): boolean {
  return String(message.role ?? '') === 'assistant';
}

function isUserMessage(message: TraceMessage): boolean {
  return String(message.role ?? '') === 'user';
}

function getToolCallIds(message: TraceMessage): string[] {
  const content = (message as TraceMessage & { content?: unknown }).content;
  if (!isAssistantMessage(message) || !Array.isArray(content)) return [];
  return content
    .filter((block: unknown): block is { type: 'toolCall'; id: string } =>
      typeof block === 'object' &&
      block !== null &&
      (block as { type?: unknown }).type === 'toolCall' &&
      typeof (block as { id?: unknown }).id === 'string'
    )
    .map((block: { type: 'toolCall'; id: string }) => block.id);
}

function getToolResultCallId(message: TraceMessage): string | null {
  const callId = (message as TraceMessage & { toolCallId?: unknown }).toolCallId;
  return typeof callId === 'string' ? callId : null;
}

function collectToolTraceGroups(messages: TraceMessage[]): Map<number, Set<number>> {
  const groupsByMember = new Map<number, Set<number>>();

  for (let index = 0; index < messages.length; index += 1) {
    const callIds = new Set(getToolCallIds(messages[index]!));
    if (callIds.size === 0) continue;

    const group = new Set<number>([index]);
    const resultCounts = new Map([...callIds].map((callId) => [callId, 0]));
    let invalidResult = false;
    for (let cursor = index + 1; cursor < messages.length; cursor += 1) {
      const candidate = messages[cursor]!;
      if (!isTraceMessage(candidate)) break;

      const resultCallId = getToolResultCallId(candidate);
      if (!resultCallId || !callIds.has(resultCallId)) {
        invalidResult = true;
        continue;
      }
      resultCounts.set(resultCallId, (resultCounts.get(resultCallId) ?? 0) + 1);
      group.add(cursor);
    }

    const hasExactlyOneResultPerCall = [...resultCounts.values()].every((count) => count === 1);
    if (invalidResult || !hasExactlyOneResultPerCall) continue;

    for (const member of group) {
      groupsByMember.set(member, group);
    }
  }

  return groupsByMember;
}

export function compressRecentTrace(
  messages: TraceMessage[],
  options?: CompressionOptions,
): CompressionResult {
  const maxHistory = options?.maxHistory ?? DEFAULT_MAX_HISTORY;
  const keepRecent = options?.keepRecent ?? DEFAULT_KEEP_RECENT;
  const preserveTraceCount = options?.preserveTraceCount ?? DEFAULT_PRESERVE_TRACE_COUNT;

  if (messages.length <= maxHistory) {
    return {
      messages,
      compressed: false,
      preservedTraceCount: 0,
    };
  }

  const preservedIndexes = new Set<number>();
  const recentIndexes = new Set<number>();
  const toolTraceGroups = collectToolTraceGroups(messages);

  // First preserve the most recent complete conversational turns.
  for (let i = messages.length - 1; i >= 0 && recentIndexes.size < keepRecent; i -= 1) {
    recentIndexes.add(i);
    if (isUserMessage(messages[i]!)) {
      continue;
    }
    const prev = i - 1;
    if (prev >= 0 && recentIndexes.size < keepRecent) {
      recentIndexes.add(prev);
    }
  }
  [...recentIndexes].sort((a, b) => a - b).forEach((index) => preservedIndexes.add(index));

  // Then preserve the most recent tool trace adjacent to those turns.
  const traceCandidateIndexes = messages
    .map((entry, index) => ({ entry, index }))
    .filter(({ entry }) => isTraceMessage(entry) || isAssistantMessage(entry));

  for (const candidate of traceCandidateIndexes.slice(-preserveTraceCount)) {
    preservedIndexes.add(candidate.index);
    const prev = candidate.index - 1;
    if (prev >= 0 && isUserMessage(messages[prev]!)) {
      preservedIndexes.add(prev);
    }
  }

  // Tool calls and their results form one protocol unit. If any member crosses
  // the compression boundary, preserve the whole group so providers never see
  // an orphan tool result or a tool call without its result.
  for (const index of [...preservedIndexes]) {
    const group = toolTraceGroups.get(index);
    if (!group) continue;
    for (const member of group) preservedIndexes.add(member);
  }

  // Finally ensure we keep chronological order and cap by selecting preserved indexes only.
  const compressedMessages = messages.filter((entry, index) => {
    if (!preservedIndexes.has(index)) return false;
    if (isAssistantMessage(entry) && getToolCallIds(entry).length > 0) {
      return toolTraceGroups.has(index);
    }
    if (!isTraceMessage(entry)) return true;
    const group = toolTraceGroups.get(index);
    return group !== undefined && preservedIndexes.has(Math.min(...group));
  });

  return {
    messages: compressedMessages,
    compressed: true,
    preservedTraceCount: Math.min(traceCandidateIndexes.length, preserveTraceCount),
  };
}
