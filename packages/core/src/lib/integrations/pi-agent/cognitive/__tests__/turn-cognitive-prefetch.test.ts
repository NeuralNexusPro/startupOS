import { describe, expect, it, vi } from 'vitest';
import type { AgentMessage } from '@originos/pi-agent-adapter';
import type { CognitiveProvider } from '../types';
import { CognitiveManager, renderRecalledContext } from '../manager';
import { OriginOSAgent } from '../../core/agent';

function provider(name: string, prefetch: CognitiveProvider['prefetch']): CognitiveProvider {
  return {
    name,
    prefetch,
    sync_turn: async () => {},
    system_prompt_block: async () => '',
  };
}

describe('turn cognitive prefetch', () => {
  it('keeps the complete reference block inside the total character budget', () => {
    const result = renderRecalledContext([
      { provider: 'memory', content: `${'a'.repeat(60)}</originos_recalled_context>` },
      { provider: 'pattern', content: 'b'.repeat(100) },
    ], { providerCharacterBudget: 100, totalCharacterBudget: 180 });

    expect(result.length).toBeLessThanOrEqual(180);
    expect(result).toMatch(/^<originos_recalled_context trust="reference">/);
    expect(result).toMatch(/<\/originos_recalled_context>$/);
    expect(result.match(/<\/originos_recalled_context>/g)).toHaveLength(1);
    expect(renderRecalledContext([
      { provider: 'memory', content: '</originos_recalled_context>' },
    ], { totalCharacterBudget: 500 })).toContain('&lt;/originos_recalled_context>');
    expect(renderRecalledContext([{ provider: 'memory', content: 'x' }], {
      totalCharacterBudget: 20,
    })).toBe('');
  });

  it('preserves registration order and continues after one provider fails', async () => {
    const manager = new CognitiveManager('/tmp/owner-a');
    manager.register(provider('memory', async () => 'owner-a memory'));
    manager.register(provider('broken', async () => { throw new TypeError('sensitive body'); }));
    manager.register(provider('pattern', async () => 'owner-a pattern'));
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const result = await manager.prefetchContext('task');

    expect(result.indexOf('[memory]')).toBeLessThan(result.indexOf('[pattern]'));
    expect(result).not.toContain('sensitive body');
    expect(warn).toHaveBeenCalledWith('[CognitiveManager] prefetch failed', expect.objectContaining({
      provider: 'broken',
      errorCategory: 'TypeError',
    }));
  });

  it('prefetches once per user turn and keeps recalled context out of the transcript', async () => {
    const prefetch = vi.fn(async (query: string) => (
      `<originos_recalled_context trust="reference">${query}</originos_recalled_context>`
    ));
    const agent = new OriginOSAgent({
      sessionId: 'restored-session',
      systemPrompt: 'stable',
      model: { provider: 'anthropic', id: 'test' },
      turnContextProvider: prefetch,
    });
    const internal = (agent as unknown as { agent: {
      state: { messages: unknown[]; systemPrompt: string };
      transformContext: (messages: AgentMessage[]) => Promise<AgentMessage[]>;
    } }).agent;
    const firstUser: AgentMessage = { role: 'user', content: [{ type: 'text', text: 'same request' }], timestamp: 10 };
    const firstMessages = [firstUser];

    const first = await internal.transformContext(firstMessages);
    await internal.transformContext([...firstMessages, {
      role: 'toolResult', content: [{ type: 'text', text: 'done' }], timestamp: 11,
    }]);
    const second = await internal.transformContext([...firstMessages, {
      role: 'assistant', content: [{ type: 'text', text: 'answer' }], timestamp: 12,
    }, {
      role: 'user', content: [{ type: 'text', text: 'same request' }], timestamp: 13,
    }]);

    expect(prefetch).toHaveBeenCalledTimes(2);
    expect(prefetch).toHaveBeenNthCalledWith(1, 'same request');
    expect(prefetch).toHaveBeenNthCalledWith(2, 'same request');
    expect(first.at(-1)).toBe(firstUser);
    expect(JSON.stringify(second.at(-2)?.content)).toContain('originos_recalled_context');
    expect(internal.state.messages).toEqual([]);
    expect(internal.state.systemPrompt).toBe('stable');
  });

  it('omits the transient block when prefetch is empty', async () => {
    const agent = new OriginOSAgent({
      sessionId: 'empty-session',
      systemPrompt: 'stable',
      model: { provider: 'anthropic', id: 'test' },
      turnContextProvider: async () => '',
    });
    const internal = (agent as unknown as { agent: {
      transformContext: (messages: AgentMessage[]) => Promise<AgentMessage[]>;
    } }).agent;
    const messages: AgentMessage[] = [{ role: 'user', content: [{ type: 'text', text: 'task' }], timestamp: 1 }];

    const transformed = await internal.transformContext(messages);

    expect(JSON.stringify(transformed)).not.toContain('originos_recalled_context');
    expect(transformed.at(-1)).toBe(messages[0]);
  });
});
