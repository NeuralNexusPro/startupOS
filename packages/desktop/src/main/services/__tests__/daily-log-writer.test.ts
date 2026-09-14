import { readFileSync, writeFileSync } from 'node:fs';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BufferedDailyLogWriter, DailyLogWriter } from '../daily-log-writer';

describe('DailyLogWriter', () => {
  let logsDir: string;

  beforeEach(async () => {
    logsDir = await mkdtemp(path.join(os.tmpdir(), 'originos-daily-log-'));
  });

  afterEach(async () => {
    await rm(logsDir, { recursive: true, force: true });
  });

  it('resolves controlled desktop and LLM names using the local calendar date', () => {
    const localDate = new Date(2026, 6, 27, 23, 30, 0);
    const writer = new DailyLogWriter({ logsDir, now: () => localDate });

    expect(writer.resolvePath('desktop')).toBe(
      path.join(logsDir, 'desktop-2026-07-27.log')
    );
    expect(writer.resolvePath('llm')).toBe(
      path.join(logsDir, 'llm-2026-07-27.log')
    );
    expect(path.basename(writer.resolvePath('desktop'))).toMatch(
      /^[a-z]+-\d{4}-\d{2}-\d{2}\.log$/
    );
  });

  it('appends across restarts without truncating the daily file', async () => {
    const now = () => new Date(2026, 6, 27, 12, 0, 0);
    new DailyLogWriter({ logsDir, now }).append('desktop', 'first\n');
    new DailyLogWriter({ logsDir, now }).append('desktop', 'second\n');

    expect(
      await readFile(path.join(logsDir, 'desktop-2026-07-27.log'), 'utf8')
    ).toBe('first\nsecond\n');
  });

  it('switches files across local midnight without recreating the writer', async () => {
    let current = new Date(2026, 6, 27, 23, 59, 59);
    const writer = new DailyLogWriter({ logsDir, now: () => current });

    writer.append('llm', 'before\n');
    current = new Date(2026, 6, 28, 0, 0, 0);
    writer.append('llm', 'after\n');

    expect(
      await readFile(path.join(logsDir, 'llm-2026-07-27.log'), 'utf8')
    ).toBe('before\n');
    expect(
      await readFile(path.join(logsDir, 'llm-2026-07-28.log'), 'utf8')
    ).toBe('after\n');
  });

  it('appends to the prior daily file when the system clock moves backwards', async () => {
    let current = new Date(2026, 6, 28, 0, 0, 1);
    const writer = new DailyLogWriter({ logsDir, now: () => current });

    writer.append('desktop', 'new-day\n');
    current = new Date(2026, 6, 27, 23, 59, 58);
    writer.append('desktop', 'clock-back\n');
    writer.append('desktop', 'clock-back-again\n');

    expect(
      await readFile(path.join(logsDir, 'desktop-2026-07-27.log'), 'utf8')
    ).toBe('clock-back\nclock-back-again\n');
  });

  it('leaves legacy log files unchanged', async () => {
    const legacyDesktop = path.join(logsDir, 'desktop.log');
    const legacyLlm = path.join(logsDir, 'llm.log');
    await writeFile(legacyDesktop, 'legacy desktop');
    await writeFile(legacyLlm, 'legacy llm');
    const writer = new DailyLogWriter({
      logsDir,
      now: () => new Date(2026, 6, 27, 12, 0, 0),
    });

    writer.append('desktop', 'new desktop\n');
    writer.append('llm', 'new llm\n');

    expect(await readFile(legacyDesktop, 'utf8')).toBe('legacy desktop');
    expect(await readFile(legacyLlm, 'utf8')).toBe('legacy llm');
  });

  it('does not create a file for an empty line', () => {
    const appendFile = vi.fn();
    const ensureDirectory = vi.fn();
    const writer = new DailyLogWriter({ logsDir, appendFile, ensureDirectory });

    expect(writer.append('desktop', '')).toBe(true);
    expect(ensureDirectory).not.toHaveBeenCalled();
    expect(appendFile).not.toHaveBeenCalled();
  });

  it('isolates directory and append failures without using console', () => {
    const consoleError = vi
      .spyOn(console, 'error')
      .mockImplementation(() => undefined);
    const failedDirectoryWriter = new DailyLogWriter({
      logsDir,
      ensureDirectory: () => {
        throw new Error('read only');
      },
    });
    const failedAppendWriter = new DailyLogWriter({
      logsDir,
      appendFile: () => {
        throw new Error('disk full');
      },
    });

    expect(failedDirectoryWriter.append('desktop', 'line\n')).toBe(false);
    expect(failedAppendWriter.append('llm', 'line\n')).toBe(false);
    expect(consoleError).not.toHaveBeenCalled();
  });

  it('uses the injected append operation and keeps the resolved path under logsDir', () => {
    const appendFile = vi.fn((filePath: string, content: string) => {
      writeFileSync(filePath, content, 'utf8');
    });
    const writer = new DailyLogWriter({
      logsDir,
      now: () => new Date(2026, 6, 27),
      appendFile,
    });

    expect(writer.append('desktop', 'line\n')).toBe(true);
    const targetPath = appendFile.mock.calls[0]?.[0];
    expect(targetPath).toBe(path.join(logsDir, 'desktop-2026-07-27.log'));
    expect(readFileSync(targetPath!, 'utf8')).toBe('line\n');
  });

  it('buffers high-frequency logs and appends them asynchronously in order', async () => {
    const appendFile = vi.fn(async () => undefined);
    const ensureDirectory = vi.fn(async () => undefined);
    const writer = new BufferedDailyLogWriter({
      logsDir,
      now: () => new Date(2026, 6, 27),
      appendFile,
      ensureDirectory,
      maxBytes: Number.MAX_SAFE_INTEGER,
    });

    for (let index = 0; index < 10_000; index += 1) {
      expect(writer.append('desktop', `${index}\n`)).toBe(true);
    }
    expect(appendFile).not.toHaveBeenCalled();

    await writer.flush();

    expect(ensureDirectory).toHaveBeenCalledTimes(1);
    expect(appendFile).toHaveBeenCalledTimes(1);
    expect(appendFile).toHaveBeenCalledWith(
      path.join(logsDir, 'desktop-2026-07-27.log'),
      Array.from({ length: 10_000 }, (_, index) => `${index}\n`).join('')
    );
  });

  it('keeps desktop and LLM batches isolated and swallows async write failures', async () => {
    const appendFile = vi.fn(async () => {
      throw new Error('disk full');
    });
    const writer = new BufferedDailyLogWriter({
      logsDir,
      now: () => new Date(2026, 6, 27),
      appendFile,
    });

    writer.append('desktop', 'desktop\n');
    writer.append('llm', 'llm\n');

    await expect(writer.flush()).resolves.toBeUndefined();
    expect(appendFile).toHaveBeenCalledTimes(2);
    expect(writer.append('desktop', 'after failure\n')).toBe(true);
    await expect(writer.flush()).resolves.toBeUndefined();
  });
});
