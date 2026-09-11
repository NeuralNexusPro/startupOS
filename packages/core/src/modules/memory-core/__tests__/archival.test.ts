import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { ArchivalMemory } from '../archival/archival-memory';
import { cosineSimilarity, zeros } from '../archival/embedding';
import fs from 'node:fs';
import path from 'node:path';

function makeTestDir(): string {
  const dir = path.join('/tmp', `archival-test-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

describe('ArchivalMemory', () => {
  let dir: string;
  let archival: ArchivalMemory;

  beforeEach(() => {
    dir = makeTestDir();
    archival = new ArchivalMemory(dir);
  });

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  describe('insert', () => {
    it('inserts a single entry', async () => {
      const id = await archival.insert('The sky is blue');
      expect(id).toMatch(/^arch-/);
      expect(archival.count()).toBe(1);
    });

    it('inserts with tags', async () => {
      const id = await archival.insert('Python is a programming language', ['pattern', 'python']);
      expect(archival.count()).toBe(1);
      const entries = archival.getAll();
      expect(entries[0].tags).toEqual(['pattern', 'python']);
    });

    it('inserts multiple entries', async () => {
      await archival.insert('First entry');
      await archival.insert('Second entry');
      await archival.insert('Third entry');
      expect(archival.count()).toBe(3);
    });
  });

  describe('search', () => {
    it('returns empty when no entries', async () => {
      const results = await archival.search('anything');
      expect(results).toEqual([]);
    });

    it('searches and returns results', async () => {
      await archival.insert('The capital of France is Paris');
      await archival.insert('Python is a great programming language');
      await archival.insert('The weather is sunny today');

      const results = await archival.search('France capital', { limit: 2 });
      expect(results.length).toBeGreaterThan(0);
      expect(results[0].text).toContain('France');
    });

    it('filters by tags', async () => {
      await archival.insert('Pattern about file reading', ['pattern']);
      await archival.insert('Reflection about failed tool call', ['reflection']);
      await archival.insert('Random memory', ['other']);

      const results = await archival.search('pattern', { tags: ['pattern'] });
      expect(results.length).toBeGreaterThan(0);
      expect(results[0].tags).toContain('pattern');
    });

    it('respects minScore threshold', async () => {
      await archival.insert('Unrelated text about nothing');
      const results = await archival.search('xyzabc123', { minScore: 0.9 });
      expect(results).toEqual([]);
    });
  });

  describe('delete', () => {
    it('deletes an entry by ID', async () => {
      const id = await archival.insert('to be deleted');
      expect(archival.count()).toBe(1);
      expect(archival.delete(id)).toBe(true);
      expect(archival.count()).toBe(0);
    });

    it('returns false for non-existent ID', async () => {
      expect(archival.delete('non-existent')).toBe(false);
    });
  });

  describe('persistence', () => {
    it('persists entries to disk', async () => {
      await archival.insert('persisted entry');
      const entry = JSON.parse(fs.readFileSync(path.join(dir, 'archival', 'entries.jsonl'), 'utf8').trim());
      expect(entry).toEqual(expect.objectContaining({
        version: 'memory-core/1.0',
        createdAt: expect.any(String),
        updatedAt: expect.any(String),
        data: expect.objectContaining({ text: 'persisted entry' }),
      }));
    });

    it('loads entries from disk on restart', async () => {
      await archival.insert('entry one');
      await archival.insert('entry two');

      const archival2 = new ArchivalMemory(dir);
      expect(archival2.count()).toBe(2);
    });

    it('loads legacy unwrapped entries', () => {
      const file = path.join(dir, 'archival', 'entries.jsonl');
      fs.writeFileSync(file, `${JSON.stringify({ id: 'legacy', text: 'old entry', tags: [], createdAt: 1 })}\n`, 'utf8');
      expect(new ArchivalMemory(dir).getAll()).toEqual([expect.objectContaining({ id: 'legacy', text: 'old entry' })]);
    });
  });
});

describe('cosineSimilarity', () => {
  it('returns 1.0 for identical vectors', () => {
    const a = new Float32Array([1, 0, 0]);
    const b = new Float32Array([1, 0, 0]);
    expect(cosineSimilarity(a, b)).toBeCloseTo(1, 5);
  });

  it('returns 0.0 for orthogonal vectors', () => {
    const a = new Float32Array([1, 0, 0]);
    const b = new Float32Array([0, 1, 0]);
    expect(cosineSimilarity(a, b)).toBeCloseTo(0, 5);
  });

  it('returns -1.0 for opposite vectors', () => {
    const a = new Float32Array([1, 0, 0]);
    const b = new Float32Array([-1, 0, 0]);
    expect(cosineSimilarity(a, b)).toBeCloseTo(-1, 5);
  });

  it('returns 0.0 for empty vectors', () => {
    const a = zeros(0);
    const b = zeros(0);
    expect(cosineSimilarity(a, b)).toBe(0);
  });
});
