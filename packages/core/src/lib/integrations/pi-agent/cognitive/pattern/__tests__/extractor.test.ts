import { describe, it, expect, vi } from 'vitest';
import { extractAndIngest } from '../../../../../features/agent/cognitive/pattern/extractor';
import type { TurnCognitiveData } from '../../types';

// 轻量级 mock ArchivalMemory
function makeArchival() {
  const entries: Array<{ text: string; tags: string[] }> = [];
  return {
    insert: vi.fn(async (text: string, tags: string[]) => {
      entries.push({ text, tags });
      return `id-${entries.length}`;
    }),
    _entries: entries,
  };
}

function makeTurn(overrides: Partial<TurnCognitiveData> = {}): TurnCognitiveData {
  return {
    turnNumber: 1,
    userMessage: '帮我分析这个文件',
    assistantMessage: 'OK',
    assistantThinking: '',
    toolCalls: [
      { name: 'read_file', params: {}, result: '内容摘要', success: true },
    ],
    outcome: { resolved: true, toolChainLength: 1 },
    timestamp: Date.now(),
    ...overrides,
  };
}

describe('extractor.extractAndIngest', () => {
  it('纯对话（无工具）跳过', async () => {
    const archival = makeArchival();
    await extractAndIngest(makeTurn({ toolCalls: [] }), [], archival as any);
    expect(archival.insert).not.toHaveBeenCalled();
  });

  it('resolved + 无纠正 → positive', async () => {
    const archival = makeArchival();
    await extractAndIngest(makeTurn(), [], archival as any);
    expect(archival.insert).toHaveBeenCalled();
    const [text, tags] = archival.insert.mock.calls[0]!;
    expect(text).toMatch(/\[POSITIVE\]/);
    expect(text).toContain('结果摘要: 内容摘要');
    expect(tags).toContain('positive');
    expect(tags).toContain('pattern');
  });

  it('!resolved → negative', async () => {
    const archival = makeArchival();
    await extractAndIngest(
      makeTurn({ outcome: { resolved: false, toolChainLength: 1 } }),
      [],
      archival as any,
    );
    const [text, tags] = archival.insert.mock.calls[0]!;
    expect(text).toMatch(/\[NEGATIVE\]/);
    expect(tags).toContain('negative');
  });

  it('有纠正信号 → negative + correction tag', async () => {
    const archival = makeArchival();
    const signals = [{ strength: 'strong' as const, matched: '不对', excerpt: '不对重来' }];
    await extractAndIngest(makeTurn({ outcome: { resolved: true, toolChainLength: 1, userCorrections: 1 } }), signals, archival as any);
    const [text, tags] = archival.insert.mock.calls[0]!;
    expect(text).toMatch(/\[NEGATIVE\]/);
    expect(tags).toContain('correction-strong');
  });

  it('工具失败 → negative', async () => {
    const archival = makeArchival();
    await extractAndIngest(
      makeTurn({
        toolCalls: [{ name: 'bash_run', params: {}, result: 'error: timeout', success: false }],
        outcome: { resolved: false, toolChainLength: 1 },
      }),
      [],
      archival as any,
    );
    expect(archival.insert).toHaveBeenCalledTimes(1);
    const [text, tags] = archival.insert.mock.calls[0]!;
    expect(text).toMatch(/\[NEGATIVE\]/);
    expect(tags).toContain('negative');
  });
});
