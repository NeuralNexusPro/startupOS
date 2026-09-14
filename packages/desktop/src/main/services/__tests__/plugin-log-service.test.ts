import { mkdtemp, readFile, rm, readdir } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { BufferedDailyLogWriter } from '../daily-log-writer';
import { createPluginLogSink } from '../plugin-log-service';

describe('independent plugin files', () => {
  it('writes four isolated daily files, rotates and flushes on shutdown', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'plugin-log-'));
    try {
      let now = new Date(2026, 8, 14, 23, 59);
      const writer = new BufferedDailyLogWriter({ logsDir: root, now: () => now });
      const sources = { email: 'email', wecom: 'wecom', feishu: 'feishu', dingtalk: 'dingtalk' };
      const log = createPluginLogSink(writer, sources);
      for (const plugin of Object.keys(sources)) for (const connector of ['one', 'two']) log.write(plugin, connector, { level: 'error', stage: 'connect', error: new Error('ENOTFOUND password=secret') });
      await writer.flush();
      now = new Date(2026, 8, 15);
      log.write('wecom', 'one', { level: 'info', stage: 'stop' });
      log.write('../escape', 'one', { level: 'info', stage: 'stop' });
      await writer.dispose();
      expect(await readdir(root)).toEqual(['plugins']);
      for (const plugin of Object.keys(sources)) {
        const content = await readFile(path.join(root, 'plugins', plugin, 'plugin-2026-09-14.log'), 'utf8');
        expect(content.trim().split('\n')).toHaveLength(2);
        expect(content).not.toContain('secret'); expect(content).toContain('ENOTFOUND');
      }
      expect(await readFile(path.join(root, 'plugins/wecom/plugin-2026-09-15.log'), 'utf8')).toContain('stop');
    } finally { await rm(root, { recursive: true, force: true }); }
  });
  it('bounds queued writes and makes disk failures/drops observable without throwing', async () => {
    let release!: () => void;
    const onDrop = vi.fn(); const onWriteFailure = vi.fn();
    const writer = new BufferedDailyLogWriter({ logsDir: '/unused', maxQueuedBytes: 8, maxBytes: 1,
      ensureDirectory: async () => undefined, appendFile: async () => { await new Promise<void>(resolve => { release = resolve; }); throw new Error('ENOSPC'); }, onDrop, onWriteFailure });
    expect(writer.append('plugin:wecom', '12345678')).toBe(true);
    await Promise.resolve(); await Promise.resolve();
    expect(writer.append('plugin:wecom', 'x')).toBe(false);
    expect(writer.status()).toMatchObject({ queuedBytes: 8, dropped: 1 });
    release(); await writer.dispose();
    expect(writer.status()).toEqual({ queuedBytes: 0, dropped: 1, failures: 1 });
    expect(onDrop).toHaveBeenCalledOnce(); expect(onWriteFailure).toHaveBeenCalledOnce();
  });
});
