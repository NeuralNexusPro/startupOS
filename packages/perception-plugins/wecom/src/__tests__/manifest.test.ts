import { describe, expect, it } from 'vitest';
import { weComManifest } from '../manifest';

describe('weComManifest', () => {
  it('declares a controlled write-only secret field', () => {
    expect(weComManifest).toMatchObject({
      id: 'originos.wecom', source: 'wecom', transport: 'stream', hostApi: '1.0',
    });
    expect(weComManifest.configurationSchema.fields).toEqual(expect.arrayContaining([
      expect.objectContaining({ key: 'botId', type: 'text', required: true }),
      expect.objectContaining({ key: 'secret', type: 'password', required: true, sensitive: true }),
    ]));
    expect(JSON.stringify(weComManifest)).not.toMatch(/secretRef|secret-1/);
  });
});
