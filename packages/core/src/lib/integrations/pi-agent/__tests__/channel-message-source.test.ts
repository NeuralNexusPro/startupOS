import { describe, expect, it } from 'vitest';
import { getChannelMessageSource, withChannelMessageSource } from '../channel-message-source';

describe('channel message source context', () => {
  it('keeps concurrent invocations isolated across awaits', async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    const first = withChannelMessageSource({ sessionId: 'one', actorId: 'actor-one' }, async () => {
      await gate;
      return getChannelMessageSource();
    });
    const second = withChannelMessageSource({ sessionId: 'two', actorId: 'actor-two' }, async () => {
      release();
      await Promise.resolve();
      return getChannelMessageSource();
    });

    await expect(Promise.all([first, second])).resolves.toEqual([
      { sessionId: 'one', actorId: 'actor-one' },
      { sessionId: 'two', actorId: 'actor-two' },
    ]);
  });
});
