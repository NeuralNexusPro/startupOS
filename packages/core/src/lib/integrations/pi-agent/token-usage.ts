import type {
  AgentContextTokenEstimate,
  AgentMessage,
  AgentTokenUsage,
  AgentTokenUsageCost,
} from '../../../types/agent';

type UsageSource = {
  input?: unknown;
  output?: unknown;
  cacheRead?: unknown;
  cacheWrite?: unknown;
  cacheWrite1h?: unknown;
  reasoning?: unknown;
  totalTokens?: unknown;
  cost?: unknown;
};

function nonNegativeNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0
    ? value
    : undefined;
}

function normalizeCost(value: unknown): AgentTokenUsageCost | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const source = value as Record<string, unknown>;
  const input = nonNegativeNumber(source['input']);
  const output = nonNegativeNumber(source['output']);
  const cacheRead = nonNegativeNumber(source['cacheRead']);
  const cacheWrite = nonNegativeNumber(source['cacheWrite']);
  const total = nonNegativeNumber(source['total']);
  if ([input, output, cacheRead, cacheWrite, total].some((part) => part === undefined)) {
    return undefined;
  }
  return { input: input!, output: output!, cacheRead: cacheRead!, cacheWrite: cacheWrite!, total: total! };
}

/** Convert a live provider usage payload to the persisted provider-neutral shape. */
export function normalizeAgentTokenUsage(value: unknown): AgentTokenUsage | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const source = value as UsageSource;
  const input = nonNegativeNumber(source.input);
  const output = nonNegativeNumber(source.output);
  const cacheRead = nonNegativeNumber(source.cacheRead);
  const cacheWrite = nonNegativeNumber(source.cacheWrite);
  const totalTokens = nonNegativeNumber(source.totalTokens);
  if ([input, output, cacheRead, cacheWrite, totalTokens].some((part) => part === undefined)) {
    return undefined;
  }

  const cacheWrite1h = nonNegativeNumber(source.cacheWrite1h);
  const reasoning = nonNegativeNumber(source.reasoning);
  const cost = normalizeCost(source.cost);
  return {
    input: input!,
    output: output!,
    cacheRead: cacheRead!,
    cacheWrite: cacheWrite!,
    ...(cacheWrite1h === undefined ? {} : { cacheWrite1h }),
    ...(reasoning === undefined ? {} : { reasoning }),
    totalTokens: totalTokens!,
    ...(cost ? { cost } : {}),
  };
}

/** Aggregate persisted assistant usage. Missing usage remains unavailable. */
export function summarizeSessionTokenUsage(
  messages: readonly Pick<AgentMessage, 'role' | 'usage'>[],
): AgentTokenUsage | undefined {
  let summary: AgentTokenUsage | undefined;
  let completeCost = true;

  for (const message of messages) {
    if (message.role !== 'assistant' || !message.usage) continue;
    const usage = message.usage;
    if (!summary) {
      summary = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0 };
    }
    summary.input += usage.input;
    summary.output += usage.output;
    summary.cacheRead += usage.cacheRead;
    summary.cacheWrite += usage.cacheWrite;
    summary.totalTokens += usage.totalTokens;
    if (usage.cacheWrite1h !== undefined) {
      summary.cacheWrite1h = (summary.cacheWrite1h ?? 0) + usage.cacheWrite1h;
    }
    if (usage.reasoning !== undefined) {
      summary.reasoning = (summary.reasoning ?? 0) + usage.reasoning;
    }
    if (!usage.cost) {
      completeCost = false;
    } else {
      const cost = summary.cost ?? { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 };
      cost.input += usage.cost.input;
      cost.output += usage.cost.output;
      cost.cacheRead += usage.cost.cacheRead;
      cost.cacheWrite += usage.cost.cacheWrite;
      cost.total += usage.cost.total;
      summary.cost = cost;
    }
  }

  if (summary && !completeCost) delete summary.cost;
  return summary;
}

/** Shared context-budget estimate; deliberately approximate and tokenizer-free. */
export function estimateTokens(value: unknown): number {
  if (typeof value === 'string') return Math.ceil(value.length / 3);
  if (!Array.isArray(value)) return 0;
  return value.reduce((total, item) => {
    if (!item || typeof item !== 'object' || !('text' in item)) return total;
    const text = (item as { text?: unknown }).text;
    return total + (typeof text === 'string' ? Math.ceil(text.length / 3) : 0);
  }, 0);
}

export function estimateAgentContextTokens(input: {
  stableSystem?: unknown;
  sessionContext?: unknown;
  turnRecall?: unknown;
  history?: readonly unknown[];
}): AgentContextTokenEstimate {
  const stableSystem = estimateTokens(input.stableSystem);
  const sessionContext = estimateTokens(input.sessionContext);
  const turnRecall = estimateTokens(input.turnRecall);
  const history = input.history?.reduce<number>((total, message) => {
    if (!message || typeof message !== 'object' || !('content' in message)) return total;
    return total + estimateTokens((message as { content?: unknown }).content);
  }, 0) ?? 0;
  return {
    stableSystem,
    sessionContext,
    turnRecall,
    history,
    total: stableSystem + sessionContext + turnRecall + history,
    estimated: true,
  };
}
