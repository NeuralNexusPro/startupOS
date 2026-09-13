// @vitest-environment node
import { afterEach, expect, it, vi } from 'vitest';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { sendFileTool, MAX_REPLY_FILE_BYTES } from '../tools/send-file';
import { withChannelFileReply, withChannelFileWorkingDirectory, requireChannelFileReply } from '../../../integrations/pi-agent/channel-file-reply';
const roots: string[] = [];
afterEach(async () => { vi.restoreAllMocks(); for (const root of roots.splice(0)) await fs.rm(root, { recursive: true, force: true }); });
async function root() { const value = await fs.mkdtemp(path.join(os.tmpdir(), 'im-file-')); roots.push(value); return value; }
it('awaits confirmation and rejects missing context, directory, expired lease and extra recipient', async () => {
  const directory = await root(); await fs.writeFile(path.join(directory, 'a.txt'), 'asset');
  const sender = vi.fn(async () => undefined);
  expect((await sendFileTool.execute('call', { filePath: 'a.txt' })).details).toMatchObject({ error: true });
  let captured: ReturnType<typeof requireChannelFileReply> | undefined;
  await withChannelFileReply(sender, async () => {
    expect(() => requireChannelFileReply()).toThrow('WORKING_DIRECTORY');
    await withChannelFileWorkingDirectory(directory, async () => {
      captured = requireChannelFileReply();
      expect((await sendFileTool.execute('call', { filePath: 'a.txt' })).details).toMatchObject({ delivered: true });
      expect((await sendFileTool.execute('call', { filePath: 'a.txt', recipient: 'other' } as { filePath: string })).details).toMatchObject({ error: true });
    });
  });
  expect(sender).toHaveBeenCalledTimes(1);
  await expect(captured!.sendFile({ fileName: 'x', bytes: new Uint8Array([1]) }, 'late')).rejects.toThrow();
});
it('rejects traversal, symlink escape, non-files, empty and oversized files before sending', async () => {
  const directory = await root(); const outside = await root();
  await fs.writeFile(path.join(outside, 'secret'), 'secret');
  await fs.symlink(path.join(outside, 'secret'), path.join(directory, 'link'));
  await fs.writeFile(path.join(directory, 'empty'), '');
  await fs.writeFile(path.join(directory, 'large'), 'x');
  await fs.truncate(path.join(directory, 'large'), MAX_REPLY_FILE_BYTES + 1);
  const sender = vi.fn();
  await withChannelFileReply(sender, () => withChannelFileWorkingDirectory(directory, async () => {
    for (const filePath of [path.join(outside, 'secret'), 'link', '.', 'empty', 'large']) {
      expect((await sendFileTool.execute('call', { filePath })).details).toMatchObject({ error: true });
    }
  }));
  expect(sender).not.toHaveBeenCalled();
});
it('caps reads even when stat underreports a growing file', async () => {
  const directory = await root(); await fs.writeFile(path.join(directory, 'growing'), 'x');
  const read = vi.fn(async (buffer: Buffer, offset: number, length: number) => ({ bytesRead: length, buffer }));
  const close = vi.fn(async () => undefined);
  vi.spyOn(fs, 'open').mockResolvedValue({ stat: async () => ({ isFile: () => true, size: 1 }), read, close } as unknown as Awaited<ReturnType<typeof fs.open>>);
  const sender = vi.fn();
  await withChannelFileReply(sender, () => withChannelFileWorkingDirectory(directory, async () => {
    expect((await sendFileTool.execute('call', { filePath: 'growing' })).details).toMatchObject({ code: 'IM_FILE_TOO_LARGE' });
  }));
  expect(read.mock.calls.reduce((sum, args) => sum + args[2], 0)).toBe(MAX_REPLY_FILE_BYTES + 1);
  expect(close).toHaveBeenCalledOnce(); expect(sender).not.toHaveBeenCalled();
});
it('propagates cancellation and sanitizes sender failure', async () => {
  const directory = await root(); await fs.writeFile(path.join(directory, 'file'), 'x');
  const sender = vi.fn(async () => { throw new Error('secret-provider-response'); });
  await withChannelFileReply(sender, () => withChannelFileWorkingDirectory(directory, async () => {
    const aborted = new AbortController(); aborted.abort();
    expect((await sendFileTool.execute('call', { filePath: 'file' }, aborted.signal)).details).toMatchObject({ error: true });
    const result = await sendFileTool.execute('call', { filePath: 'file' });
    expect(result.details).toMatchObject({ error: true }); expect(JSON.stringify(result)).not.toContain('secret-provider');
  }));
  expect(sender).toHaveBeenCalledOnce();
});
