/**
 * History Store — JSONL 历史存储，按 Session 拆分文件。
 *
 * Story M.4: 每个 session 独立文件存储在 history/ 目录下，
 * 支持旧文件自动迁移，readAll() 自动合并目录下所有 .jsonl 文件。
 */

import fs from 'node:fs';
import path from 'node:path';
import type { CommunicationSource } from '../../../lib/shared/cognitive';

export interface TurnRecord {
  turnNumber: number;
  userMessage: string;
  assistantMessage?: string;
  toolCalls?: Array<{ name: string; params?: unknown; result: string; success: boolean }>;
  source?: CommunicationSource;
}

export interface RecallEntry extends TurnRecord {
  summary: string;
  timestamp: number;
}

export class HistoryStore {
  private historyDir: string;
  private sessionId: string;

  constructor(historyDir: string, sessionId: string) {
    this.historyDir = historyDir;
    this.sessionId = sessionId;

    // 旧文件迁移：memory/history.jsonl → memory/history/default.jsonl
    this.migrateLegacyFile();
  }

  private sessionFilePath(): string {
    return path.join(this.historyDir, `${this.sessionId}.jsonl`);
  }

  /** 追加写入一条记录到当前 session 文件 */
  append(entry: RecallEntry): void {
    if (!fs.existsSync(this.historyDir)) {
      fs.mkdirSync(this.historyDir, { recursive: true });
    }
    const timestamp = new Date(entry.timestamp).toISOString();
    fs.appendFileSync(this.sessionFilePath(), JSON.stringify({
      version: 'memory-core/1.0',
      createdAt: timestamp,
      updatedAt: timestamp,
      data: entry,
    }) + '\n', 'utf-8');
  }

  /** 读取目录下所有 session 的记录，按原始时间和稳定来源排序 */
  readAll(): RecallEntry[] {
    if (!fs.existsSync(this.historyDir)) return [];
    try {
      const files = fs.readdirSync(this.historyDir).filter((f) => f.endsWith('.jsonl'));
      const entries: RecallEntry[] = [];
      for (const file of files) {
        const content = fs.readFileSync(path.join(this.historyDir, file), 'utf-8');
        const lines = content.split('\n').filter((l) => l.trim());
        for (const line of lines) {
          try {
            const parsed = JSON.parse(line) as Record<string, unknown>;
            entries.push(this.restoreEntry(parsed, path.basename(file, '.jsonl')));
          } catch {
            // skip corrupted lines
          }
        }
      }
      entries.sort(compareEntries);
      return entries;
    } catch {
      return [];
    }
  }

  /** 只读取当前 session 的记录 */
  readSession(): RecallEntry[] {
    const filePath = this.sessionFilePath();
    if (!fs.existsSync(filePath)) return [];
    try {
      const content = fs.readFileSync(filePath, 'utf-8');
      const lines = content.split('\n').filter((l) => l.trim());
      const entries: RecallEntry[] = [];
      for (const line of lines) {
        try {
          const parsed = JSON.parse(line) as Record<string, unknown>;
          entries.push(this.restoreEntry(parsed, this.sessionId));
        } catch {
          // skip corrupted lines
        }
      }
      return entries;
    } catch {
      return [];
    }
  }

  /** 读取指定范围后的记录（所有 session） */
  readSince(turnNumber: number): RecallEntry[] {
    return this.readAll().filter((e) => e.turnNumber >= turnNumber);
  }

  /** 旧文件迁移：memory/history.jsonl → memory/history/default.jsonl */
  private migrateLegacyFile(): void {
    const legacySingleFile = path.join(path.dirname(this.historyDir), 'history.jsonl');
    const destination = path.join(this.historyDir, 'default.jsonl');
    if (fs.existsSync(legacySingleFile) && !fs.existsSync(destination)) {
      fs.mkdirSync(this.historyDir, { recursive: true });
      fs.renameSync(legacySingleFile, destination);
    }
  }

  private restoreEntry(parsed: Record<string, unknown>, sessionId: string): RecallEntry {
    const entry = (parsed['data'] ?? parsed) as RecallEntry;
    const wrappedAt = typeof parsed['createdAt'] === 'string' ? Date.parse(parsed['createdAt']) : Number.NaN;
    const timestamp = Number.isFinite(entry.timestamp) ? entry.timestamp : (Number.isFinite(wrappedAt) ? wrappedAt : 0);
    return {
      ...entry,
      timestamp,
      source: entry.source ? { ...entry.source, sessionId: entry.source.sessionId || sessionId } : { sessionId },
    };
  }
}

function compareEntries(a: RecallEntry, b: RecallEntry): number {
  return observedTimestamp(a) - observedTimestamp(b)
    || (a.source?.sessionId ?? '').localeCompare(b.source?.sessionId ?? '')
    || (a.source?.messageId ?? '').localeCompare(b.source?.messageId ?? '')
    || a.turnNumber - b.turnNumber;
}

function observedTimestamp(entry: RecallEntry): number {
  const observedAt = entry.source?.observedAt ? Date.parse(entry.source.observedAt) : Number.NaN;
  return Number.isFinite(observedAt) ? observedAt : entry.timestamp;
}
