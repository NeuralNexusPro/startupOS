import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';

import { openNotificationUrl } from '../native-notification-service';

const openExternal = vi.hoisted(() => vi.fn(() => Promise.resolve()));

vi.mock('electron', () => ({
  BrowserWindow: { getAllWindows: () => [] },
  Notification: { isSupported: () => false },
  app: { getName: () => 'OriginOS CE', isPackaged: true },
  shell: { openExternal },
}));

describe('openNotificationUrl', () => {
  beforeEach(() => {
    openExternal.mockClear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('opens http/https urls through shell.openExternal', () => {
    expect(openNotificationUrl('https://example.com/meeting?id=1')).toBe(true);
    expect(openExternal).toHaveBeenCalledWith('https://example.com/meeting?id=1');
    expect(openNotificationUrl('  http://example.com/  ')).toBe(true);
    expect(openExternal).toHaveBeenLastCalledWith('http://example.com/');
  });

  it('blocks non-http(s) schemes and malformed input', () => {
    for (const raw of [
      'file:///etc/passwd',
      'javascript:alert(1)',
      'ssh://host',
      'not a url',
      '',
      '   ',
    ]) {
      expect(openNotificationUrl(raw)).toBe(false);
    }
    expect(openExternal).not.toHaveBeenCalled();
  });
});
