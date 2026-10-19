import { beforeEach, describe, expect, it, vi } from 'vitest';

const verifier = vi.hoisted(() => ({ response: '' }));

vi.mock('@originos/pi-agent-adapter/ai', () => ({
  streamSimple: async function* () {
    yield { type: 'text_delta', delta: verifier.response };
  },
}));

import { verifyTaskCompletion } from '../supervisor-dag-verifier';

const completedMessages = [{
  role: 'assistant',
  content: [
    { type: 'toolCall', name: 'write_file', arguments: { filePath: 'knowledge/handoff.md' } },
    { type: 'text', text: '交接清单已经整理完成。' },
  ],
}];

describe('verifyTaskCompletion', () => {
  beforeEach(() => {
    verifier.response = '';
  });

  it('falls back to task evidence when the model rejects without a reason', async () => {
    verifier.response = '{"passed":false,"reasoning":""}';

    const result = await verifyTaskCompletion(
      '整理交接清单并写入文件',
      completedMessages,
      { createAutoModel: () => ({}) },
    );

    expect(result.passed).toBe(true);
    expect(result.reasoning).toContain('使用回退规则');
    expect(result.extractedArtifacts).toEqual(['knowledge/handoff.md']);
  });

  it('preserves a reasoned rejection from the verifier', async () => {
    verifier.response = '{"passed":false,"reasoning":"缺少第二项验收材料"}';

    const result = await verifyTaskCompletion(
      '整理两项验收材料',
      completedMessages,
      { createAutoModel: () => ({}) },
    );

    expect(result).toMatchObject({ passed: false, reasoning: '缺少第二项验收材料' });
  });
});
