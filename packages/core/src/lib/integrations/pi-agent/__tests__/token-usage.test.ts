import { describe, expect, it } from 'vitest';
import type { AgentMessage } from '../../../../types/agent';
import {
  estimateAgentContextTokens,
  estimateTokens,
  normalizeAgentTokenUsage,
  summarizeSessionTokenUsage,
} from '../token-usage';

const assistant = (usage?: AgentMessage['usage']): AgentMessage => ({
  id: crypto.randomUUID(),
  role: 'assistant',
  content: 'answer',
  timestamp: 1,
  ...(usage ? { usage } : {}),
});

describe('agent token usage', () => {
  it('normalizes the complete provider payload including cache breakdowns', () => {
    expect(normalizeAgentTokenUsage({
      input: 100,
      output: 20,
      cacheRead: 60,
      cacheWrite: 10,
      cacheWrite1h: 4,
      reasoning: 5,
      totalTokens: 120,
      cost: { input: 1, output: 2, cacheRead: 0.3, cacheWrite: 0.4, total: 3.7 },
    })).toEqual({
      input: 100,
      output: 20,
      cacheRead: 60,
      cacheWrite: 10,
      cacheWrite1h: 4,
      reasoning: 5,
      totalTokens: 120,
      cost: { input: 1, output: 2, cacheRead: 0.3, cacheWrite: 0.4, total: 3.7 },
    });
  });

  it('keeps missing provider usage unavailable for old sessions', () => {
    expect(normalizeAgentTokenUsage(undefined)).toBeUndefined();
    expect(summarizeSessionTokenUsage([assistant(), {
      id: 'user', role: 'user', content: 'question', timestamp: 1,
    }])).toBeUndefined();
  });

  it('aggregates mixed old and measured messages once in O(n)', () => {
    expect(summarizeSessionTokenUsage([
      assistant(),
      assistant({ input: 10, output: 3, cacheRead: 4, cacheWrite: 2, totalTokens: 13 }),
      assistant({ input: 20, output: 5, cacheRead: 7, cacheWrite: 1, cacheWrite1h: 1, reasoning: 2, totalTokens: 25 }),
    ])).toEqual({
      input: 30,
      output: 8,
      cacheRead: 11,
      cacheWrite: 3,
      cacheWrite1h: 1,
      reasoning: 2,
      totalTokens: 38,
    });
  });

  it('omits an incomplete mixed cost total', () => {
    expect(summarizeSessionTokenUsage([
      assistant({
        input: 1, output: 2, cacheRead: 0, cacheWrite: 0, totalTokens: 3,
        cost: { input: 0.1, output: 0.2, cacheRead: 0, cacheWrite: 0, total: 0.3 },
      }),
      assistant({ input: 1, output: 1, cacheRead: 0, cacheWrite: 0, totalTokens: 2 }),
    ])?.cost).toBeUndefined();
  });
});

describe('context token estimate', () => {
  it('uses one chars/3 estimate and reports each context partition', () => {
    expect(estimateTokens('1234567')).toBe(3);
    expect(estimateAgentContextTokens({
      stableSystem: '123456',
      sessionContext: '123',
      turnRecall: '123456789',
      history: [{ content: '123456789012' }, { content: [{ type: 'text', text: '123456' }] }],
    })).toEqual({
      stableSystem: 2,
      sessionContext: 1,
      turnRecall: 3,
      history: 6,
      total: 12,
      estimated: true,
    });
  });
});
