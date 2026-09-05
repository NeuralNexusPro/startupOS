import { describe, expect, it, vi } from 'vitest';
import { routeTaskAwareChannelMessage } from '..';

describe('routeTaskAwareChannelMessage', () => {
  it('routes waiting task replies without prompting the chat runtime', async () => {
    const promptChat = vi.fn(async () => undefined);
    const snapshot = { execution: { status: 'running' } };
    const result = await routeTaskAwareChannelMessage({
      content: 'approved',
      submitTaskReply: async () => ({ handled: true, snapshot }),
      promptChat,
    });
    expect(result).toEqual({ handledBy: 'task_runtime', snapshot });
    expect(promptChat).not.toHaveBeenCalled();
  });

  it('falls back to the normal chat runtime when no task is waiting', async () => {
    const promptChat = vi.fn(async () => undefined);
    await expect(routeTaskAwareChannelMessage({
      content: 'hello',
      submitTaskReply: async () => ({ handled: false }),
      promptChat,
    })).resolves.toEqual({ handledBy: 'chat' });
    expect(promptChat).toHaveBeenCalledOnce();
  });
});
