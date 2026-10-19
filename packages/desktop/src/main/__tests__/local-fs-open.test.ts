import path from 'node:path';

import { beforeEach, describe, expect, it, vi } from 'vitest';

const { handle, openPath } = vi.hoisted(() => ({
  handle: vi.fn(),
  openPath: vi.fn(async () => ''),
}));

vi.mock('electron', () => ({
  BrowserWindow: { getAllWindows: () => [] },
  ipcMain: { handle },
  shell: { openPath },
}));

vi.mock('../paths', () => ({
  getDataRoot: () => '/tmp/originos-data',
  getMonorepoRoot: () => '/tmp/originos-repo',
}));

import { LocalFileSystem } from '../local-fs';

describe('LocalFileSystem.openFile', () => {
  beforeEach(() => {
    handle.mockClear();
    openPath.mockClear();
  });

  it('opens a data-root relative file with the system default application', async () => {
    const localFs = new LocalFileSystem();

    await localFs.openFile('projects/project-1/output/report.pdf');

    expect(openPath).toHaveBeenCalledWith(path.normalize('/tmp/originos-data/projects/project-1/output/report.pdf'));
  });

  it('rejects an absolute path outside the local filesystem allowlist', async () => {
    const localFs = new LocalFileSystem();

    await expect(localFs.openFile('/private/outside/report.pdf')).rejects.toThrow('Access denied');
    expect(openPath).not.toHaveBeenCalled();
  });

  it('surfaces the operating-system open error', async () => {
    openPath.mockResolvedValueOnce('No application is associated with the specified file');
    const localFs = new LocalFileSystem();

    await expect(localFs.openFile('projects/project-1/output/report.bin')).rejects.toThrow('No application');
  });
});
