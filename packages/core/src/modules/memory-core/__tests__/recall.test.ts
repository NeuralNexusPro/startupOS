import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { RecallMemory } from '../recall/recall-memory';
import { HistoryStore } from '../recall/history-store';
import fs from 'node:fs';
import path from 'node:path';

function makeTestDir(): string {
  const dir = path.join('/tmp', `recall-test-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

describe('RecallMemory', () => {
  let dir: string;
  let recall: RecallMemory;

  beforeEach(() => {
    dir = makeTestDir();
    recall = new RecallMemory(dir);
  });

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  describe('recordTurn', () => {
    it('records a turn', () => {
      recall.recordTurn({
        turnNumber: 1,
        userMessage: 'How do I write a for loop in Python?',
        assistantMessage: 'Use the "for" keyword...',
      });
      const entries = (recall as any).entries;
      expect(entries).toHaveLength(1);
      expect(entries[0].turnNumber).toBe(1);
    });

    it('appends to history.jsonl', () => {
      recall.recordTurn({
        turnNumber: 1,
        userMessage: 'test message',
      });
      const historyPath = path.join(dir, 'memory', 'history', 'default.jsonl');
      expect(fs.existsSync(historyPath)).toBe(true);
      const content = fs.readFileSync(historyPath, 'utf-8');
      const line = JSON.parse(content.trim());
      expect(line).toEqual(expect.objectContaining({
        version: 'memory-core/1.0',
        createdAt: expect.any(String),
        updatedAt: expect.any(String),
        data: expect.objectContaining({ userMessage: 'test message' }),
      }));
    });

    it('reads legacy unwrapped history entries', () => {
      const historyDir = path.join(dir, 'memory', 'history');
      fs.mkdirSync(historyDir, { recursive: true });
      fs.writeFileSync(path.join(historyDir, 'legacy.jsonl'), `${JSON.stringify({
        turnNumber: 7,
        userMessage: 'legacy message',
        summary: 'legacy message',
        timestamp: 1,
      })}\n`);

      expect(new HistoryStore(historyDir, 'default').readAll()[0]?.userMessage).toBe('legacy message');
    });

    it('moves the legacy single history file without losing entries', () => {
      const memoryDir = path.join(dir, 'memory');
      fs.mkdirSync(memoryDir, { recursive: true });
      const entry = { turnNumber: 8, userMessage: 'migrate me', summary: 'migrate me', timestamp: 1 };
      fs.writeFileSync(path.join(memoryDir, 'history.jsonl'), `${JSON.stringify(entry)}\n`);

      const history = new HistoryStore(path.join(memoryDir, 'history'), 'default');

      expect(history.readAll()).toEqual([entry]);
      expect(fs.existsSync(path.join(memoryDir, 'history.jsonl'))).toBe(false);
    });

    it('does not overwrite an existing history destination', () => {
      const memoryDir = path.join(dir, 'memory');
      const historyDir = path.join(memoryDir, 'history');
      fs.mkdirSync(historyDir, { recursive: true });
      fs.writeFileSync(path.join(memoryDir, 'history.jsonl'), 'legacy source\n');
      fs.writeFileSync(path.join(historyDir, 'default.jsonl'), 'existing destination\n');

      new HistoryStore(historyDir, 'default');

      expect(fs.readFileSync(path.join(memoryDir, 'history.jsonl'), 'utf-8')).toBe('legacy source\n');
      expect(fs.readFileSync(path.join(historyDir, 'default.jsonl'), 'utf-8')).toBe('existing destination\n');
    });
  });

  describe('searchKeyword', () => {
    it('returns ranked keyword matches', () => {
      recall.recordTurn({
        turnNumber: 1,
        userMessage: 'How to create a database connection in Python?',
      });
      recall.recordTurn({
        turnNumber: 2,
        userMessage: 'What is the weather today?',
      });
      recall.recordTurn({
        turnNumber: 3,
        userMessage: 'Python database connection pooling best practices',
      });

      const results = recall.searchKeyword('Python database', 2);
      expect(results).toHaveLength(2);
      expect(results[0].turnNumber).toBe(1);
    });
  });

});
