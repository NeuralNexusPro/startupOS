import { expect, it, vi } from 'vitest';
import { authorizeConfiguredOfficeCapability, mergeProvisionedSettings } from '../perception-plugin-host-service';

vi.mock('electron', () => ({ ipcMain: { handle: vi.fn() }, safeStorage: {} }));

it('authorizes every sender on the enabled connector and blocks protected or destructive writes', () => {
  const settings = { officeWriteEnabled: true };
  expect(authorizeConfiguredOfficeCapability(settings, { actorId: 'member-a' }, 'read')).toBe(true);
  expect(authorizeConfiguredOfficeCapability(settings, { actorId: 'outsider' }, 'read')).toBe(true);
  expect(authorizeConfiguredOfficeCapability(settings, { actorId: 'member-a', requireHitl: false }, 'write')).toBe(true);
  expect(authorizeConfiguredOfficeCapability(settings, { actorId: 'member-a', requireHitl: true }, 'write')).toBe(false);
  expect(authorizeConfiguredOfficeCapability(settings, { actorId: 'member-a', requireHitl: false }, 'destructive')).toBe(false);
});

it('keeps optional form settings when a plugin normalizes only its own fields', () => {
  expect(mergeProvisionedSettings(
    { botId: 'bot', officeCapabilitiesEnabled: true },
    { botId: 'normalized-bot', transport: 'aibot-websocket' }
  )).toEqual({ botId: 'normalized-bot', transport: 'aibot-websocket', officeCapabilitiesEnabled: true });
});
