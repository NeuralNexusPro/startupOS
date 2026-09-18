import { expect, it, vi } from 'vitest';
import { authorizeConfiguredOfficeCapability, mergeProvisionedSettings } from '../perception-plugin-host-service';

vi.mock('electron', () => ({ ipcMain: { handle: vi.fn() }, safeStorage: {} }));

it('requires an explicit sender delegation and blocks protected or destructive writes', () => {
  const settings = { officeAllowedActorIds: 'member-a, member-b', officeWriteEnabled: true };
  expect(authorizeConfiguredOfficeCapability(settings, { actorId: 'member-a' }, 'read')).toBe(true);
  expect(authorizeConfiguredOfficeCapability(settings, { actorId: 'outsider' }, 'read')).toBe(false);
  expect(authorizeConfiguredOfficeCapability(settings, { actorId: 'member-a', requireHitl: false }, 'write')).toBe(true);
  expect(authorizeConfiguredOfficeCapability(settings, { actorId: 'member-a', requireHitl: true }, 'write')).toBe(false);
  expect(authorizeConfiguredOfficeCapability(settings, { actorId: 'member-a', requireHitl: false }, 'destructive')).toBe(false);
});

it('keeps optional form settings when a plugin normalizes only its own fields', () => {
  expect(mergeProvisionedSettings(
    { botId: 'bot', officeCapabilitiesEnabled: true, officeAllowedActorIds: 'member-a' },
    { botId: 'normalized-bot', transport: 'aibot-websocket' }
  )).toEqual({ botId: 'normalized-bot', transport: 'aibot-websocket', officeCapabilitiesEnabled: true, officeAllowedActorIds: 'member-a' });
});
