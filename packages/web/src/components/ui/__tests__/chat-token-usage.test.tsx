import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ChatMessageList } from '../chat/ChatMessageList';

describe('ChatMessageList token usage', () => {
  it('summarizes completed assistant usage and keeps legacy sessions quiet', () => {
    const { container, rerender } = render(
      <ChatMessageList
        messages={[
          { role: 'user', content: 'hello' },
          {
            role: 'assistant',
            content: 'one',
            usage: {
              input: 10,
              output: 2,
              cacheRead: 3,
              cacheWrite: 1,
              totalTokens: 16,
            },
          },
          {
            role: 'assistant',
            content: 'two',
            usage: {
              input: 20,
              output: 4,
              cacheRead: 6,
              cacheWrite: 2,
              totalTokens: 32,
            },
            contextTokenEstimate: {
              total: 100,
              stableSystem: 20,
              sessionContext: 30,
              turnRecall: 10,
              history: 40,
              estimated: true,
            },
          },
        ]}
        isLoading={false}
        isThinking={false}
      />
    );

    expect(
      screen.getByText('Token 48 · 输入 30 · 输出 6 · 缓存读 9 · 缓存写 3')
    ).toBeTruthy();
    expect(screen.getByText(/Token 48/).closest('.overflow-y-auto')).toBeNull();
    expect(container.querySelector('.overflow-y-auto')).toBeTruthy();
    expect(screen.getByText(/上下文估算 100/)).toBeTruthy();

    rerender(
      <ChatMessageList
        messages={[{ role: 'assistant', content: 'legacy' }]}
        isLoading={false}
        isThinking={false}
      />
    );
    expect(screen.queryByText(/Token /)).toBeNull();
  });
});
