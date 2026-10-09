import { describe, expect, it, vi } from 'vitest';
import { AutoUpdaterManager, type UpdateState } from '../auto-updater';

vi.mock('electron', () => ({
  app: { isPackaged: true, getVersion: () => '0.4.4' },
  BrowserWindow: { getAllWindows: () => [] },
  dialog: { showMessageBox: vi.fn() },
  ipcMain: { removeHandler: vi.fn(), handle: vi.fn() },
}));

describe('Windows update installation', () => {
  it('waits for runtime shutdown before launching NSIS', async () => {
    let finishShutdown: (() => void) | undefined;
    const prepareForInstall = vi.fn(() => new Promise<void>((resolve) => { finishShutdown = resolve; }));
    const quitAndInstall = vi.fn();
    const manager = new AutoUpdaterManager(prepareForInstall, 'win32');
    Object.assign(manager, {
      updater: { quitAndInstall },
      state: { status: 'downloaded', available: true, currentVersion: '0.4.4' } satisfies UpdateState,
    });

    manager.installDownloadedUpdate();
    await new Promise<void>((resolve) => setImmediate(resolve));
    expect(prepareForInstall).toHaveBeenCalledOnce();
    expect(quitAndInstall).not.toHaveBeenCalled();

    finishShutdown?.();
    await new Promise<void>((resolve) => setImmediate(resolve));
    expect(quitAndInstall).toHaveBeenCalledWith(false, true);
  });

  it('does not launch NSIS when runtime shutdown fails', async () => {
    const quitAndInstall = vi.fn();
    const manager = new AutoUpdaterManager(() => Promise.reject(new Error('stop failed')), 'win32');
    Object.assign(manager, {
      updater: { quitAndInstall },
      state: { status: 'downloaded', available: true, currentVersion: '0.4.4' } satisfies UpdateState,
    });
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});

    manager.installDownloadedUpdate();
    await new Promise<void>((resolve) => setImmediate(resolve));
    expect(quitAndInstall).not.toHaveBeenCalled();
    expect(manager.getState().status).toBe('error');
    log.mockRestore();
  });
});
