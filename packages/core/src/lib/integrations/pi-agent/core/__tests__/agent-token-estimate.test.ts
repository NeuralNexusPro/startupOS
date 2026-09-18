import { describe, expect, it } from 'vitest';
import { OriginOSAgent } from '../agent';

describe('OriginOSAgent context token estimate', () => {
  it('updates stable, session, recall, and history partitions at the provider boundary', async () => {
    const agent = new OriginOSAgent({
      sessionId: 'token-estimate',
      systemPrompt: '123456',
      sessionContext: 'session context',
      turnContextProvider: async () => '123456',
      model: { provider: 'anthropic', id: 'test-model' } as never,
    });
    const internalAgent = (agent as unknown as { agent: {
      transformContext: (messages: unknown[]) => Promise<unknown[]>;
    } }).agent;

    await internalAgent.transformContext([{ role: 'user', content: '123456789', timestamp: 1 }]);

    const estimate = agent.getContextTokenEstimate();
    expect(estimate.stableSystem).toBe(2);
    expect(estimate.sessionContext).toBeGreaterThan(0);
    expect(estimate.turnRecall).toBe(2);
    expect(estimate.history).toBe(3);
    expect(estimate.total).toBe(
      estimate.stableSystem + estimate.sessionContext + estimate.turnRecall + estimate.history,
    );
    expect(estimate.estimated).toBe(true);
  });
});
