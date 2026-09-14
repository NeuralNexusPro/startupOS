import { describe, expect, it } from 'vitest';
import { validateWeComConnectorSettings } from '../provisioning';

const profile = { transport: 'aibot-websocket' as const, botId: 'bot-id' };

describe('WeCom provisioning contracts', () => {
  it('validates a non-secret profile and creates a stable secret reference', () => {
    expect(validateWeComConnectorSettings(profile)).toEqual(profile);
  });

  it.each([
    [{ ...profile, botId: '' }],
    [{ ...profile, websocketUrl: 'http://wrong' }],
  ])('rejects invalid profile fields', (value) => {
    expect(() => validateWeComConnectorSettings(value)).toThrow('Invalid WeCom');
  });

});
