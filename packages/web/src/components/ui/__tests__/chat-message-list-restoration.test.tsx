import { act, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ChatMessageList } from '../chat/ChatMessageList';

describe('ChatMessageList restored session scrolling', () => {
  afterEach(() => { vi.unstubAllGlobals(); });

  it('scrolls restored history to the bottom when the interview becomes ready', () => {
    const frames = new Map<number, FrameRequestCallback>();
    let nextFrame = 0;
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
      frames.set(++nextFrame, callback);
      return nextFrame;
    });
    vi.stubGlobal('cancelAnimationFrame', (id: number) => frames.delete(id));
    const flushFrames = () => {
      const pending = [...frames.values()];
      frames.clear();
      act(() => pending.forEach((callback) => callback(0)));
    };
    const messages = [{ role: 'assistant' as const, content: '最后一条访谈记录' }];
    const { container, rerender } = render(
      <ChatMessageList messages={[]} isLoading isThinking scrollToBottomKey={undefined} />
    );
    const list = container.querySelector('.overflow-y-auto') as HTMLDivElement;
    Object.defineProperty(list, 'scrollHeight', { configurable: true, value: 1200 });
    Object.defineProperty(list, 'scrollTo', {
      configurable: true,
      value: vi.fn((options: ScrollToOptions) => { list.scrollTop = options.top ?? 0; }),
    });

    rerender(<ChatMessageList messages={messages} isLoading isThinking scrollToBottomKey={undefined} />);
    flushFrames();
    list.scrollTop = 0;

    rerender(<ChatMessageList messages={messages} isLoading={false} isThinking={false} scrollToBottomKey="interview-1" />);
    flushFrames();
    expect(list.scrollTop).toBe(1200);
  });
});
