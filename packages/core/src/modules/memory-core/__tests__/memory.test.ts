import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { Memory, parseBlocksFromMarkdown } from '../core/memory';
import { DEFAULT_BLOCKS, createBlock } from '../core/block';
import fs from 'node:fs';
import path from 'node:path';

function makeTestDir(): string {
  const dir = path.join('/tmp', `memory-test-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

describe('Memory', () => {
  let dir: string;
  let memory: Memory;

  beforeEach(() => {
    dir = makeTestDir();
    memory = new Memory(dir);
  });

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  describe('initialization', () => {
    it('creates 5 default blocks', () => {
      expect(memory.listBlocks()).toHaveLength(5);
    });

    it('initializes with correct default labels', () => {
      const labels = memory.listBlocks().map((b) => b.label);
      expect(labels).toEqual(['human', 'persona', 'project', 'scratchpad', 'temporal']);
    });
  });

  describe('getBlock / listBlocks', () => {
    it('gets a block by label', () => {
      const block = memory.getBlock('human');
      expect(block).not.toBeNull();
      expect(block!.label).toBe('human');
    });

    it('returns null for unknown label', () => {
      expect(memory.getBlock('nonexistent')).toBeNull();
    });

    it('lists all blocks', () => {
      const list = memory.listBlocks();
      expect(list).toHaveLength(5);
    });
  });

  describe('setBlock', () => {
    it('sets block value', () => {
      memory.setBlock('human', 'new content');
      expect(memory.getBlock('human')!.value).toBe('new content');
    });

    it('increments version on set', () => {
      const before = memory.getBlock('human')!.version;
      memory.setBlock('human', 'content');
      expect(memory.getBlock('human')!.version).toBe(before + 1);
    });

    it('throws on read-only block', () => {
      expect(() => memory.setBlock('temporal', 'content')).toThrow('read-only');
    });

    it('throws when exceeding limit', () => {
      const block = memory.getBlock('scratchpad')!;
      const tooLong = 'x'.repeat(block.limit + 1);
      expect(() => memory.setBlock('scratchpad', tooLong)).toThrow('exceeds');
    });

    it('throws on non-existent block', () => {
      expect(() => memory.setBlock('nonexistent', 'content')).toThrow('does not exist');
    });
  });

  describe('appendBlock', () => {
    it('appends to existing value', () => {
      memory.setBlock('human', 'existing');
      memory.appendBlock('human', ' appended');
      expect(memory.getBlock('human')!.value).toBe('existing\n appended');
    });

    it('throws on read-only block', () => {
      expect(() => memory.appendBlock('temporal', 'content')).toThrow('read-only');
    });
  });

  describe('replaceBlock', () => {
    it('replaces matching content', () => {
      memory.setBlock('human', 'old text here');
      const result = memory.replaceBlock('human', 'old text', 'new text');
      expect(result).toBe(true);
      expect(memory.getBlock('human')!.value).toBe('new text here');
    });

    it('returns false when old content not found', () => {
      memory.setBlock('human', 'some content');
      const result = memory.replaceBlock('human', 'nonexistent', 'new');
      expect(result).toBe(false);
      expect(memory.getBlock('human')!.value).toBe('some content');
    });

    it('throws on read-only block', () => {
      expect(() => memory.replaceBlock('temporal', 'a', 'b')).toThrow('read-only');
    });
  });

  describe('createBlock / deleteBlock', () => {
    it('creates a new custom block', () => {
      const block = memory.createBlock({
        label: 'custom',
        description: 'custom block',
        limit: 500,
      }, 'initial');
      expect(block.label).toBe('custom');
      expect(memory.getBlock('custom')).not.toBeNull();
    });

    it('throws on duplicate label', () => {
      expect(() => memory.createBlock({
        label: 'human',
        description: 'dup',
        limit: 100,
      })).toThrow('already exists');
    });

    it('deletes a block', () => {
      memory.createBlock({ label: 'temp', description: 'temp', limit: 100 });
      expect(memory.getBlock('temp')).not.toBeNull();
      memory.deleteBlock('temp');
      expect(memory.getBlock('temp')).toBeNull();
    });

    it('throws on deleting read-only block', () => {
      expect(() => memory.deleteBlock('temporal')).toThrow('read-only');
    });
  });

  describe('compile', () => {
    it('compiles to markdown with correct format', () => {
      memory.setBlock('human', 'test content');
      const md = memory.compile({ format: 'markdown' });
      expect(md).toContain('# Memory');
      expect(md).toContain('## human');
      expect(md).toContain('{description:');
      expect(md).toContain('{limit:');
      expect(md).toContain('{readOnly:');
      expect(md).toContain('test content');
    });

    it('compiles to xml', () => {
      memory.setBlock('human', 'test content');
      const xml = memory.compile({ format: 'xml' });
      expect(xml).toContain('<memory_blocks>');
      expect(xml).toContain('<human>');
      expect(xml).toContain('<description>');
      expect(xml).toContain('<value>test content</value>');
      expect(xml).toContain('</human>');
      expect(xml).toContain('</memory_blocks>');
    });

    it('filters by labels in markdown', () => {
      memory.setBlock('human', 'h');
      memory.setBlock('persona', 'p');
      const md = memory.compile({ format: 'markdown', labels: ['human'] });
      expect(md).toContain('## human');
      expect(md).not.toContain('## persona');
    });
  });

  describe('persistence', () => {
    it('saves Memory.md on initialization', () => {
      const mdPath = path.join(dir, 'Memory.md');
      expect(fs.existsSync(mdPath)).toBe(true);
    });

    it('saves blocks.json on initialization', () => {
      const jsonPath = path.join(dir, 'blocks.json');
      expect(fs.existsSync(jsonPath)).toBe(true);
    });

    it('saves blocks.json on mutation', () => {
      const jsonPath = path.join(dir, 'blocks.json');
      const before = JSON.parse(fs.readFileSync(jsonPath, 'utf-8'));
      memory.setBlock('human', 'new');
      const after = JSON.parse(fs.readFileSync(jsonPath, 'utf-8'));
      expect(after.version).toBe('memory-core/1.0');
      expect(after.createdAt).toBe(before.createdAt);
      expect(after.data.blocks.length).toBe(before.data.blocks.length + 1);
    });

    it('loads blocks from existing Memory.md', () => {
      // Create a new memory instance, save it
      const memory1 = new Memory(dir);
      memory1.setBlock('human', 'persisted value');

      // Create another instance pointing to same dir
      const memory2 = new Memory(dir);
      expect(memory2.getBlock('human')!.value).toBe('persisted value');
    });

    it('keeps only last 10 snapshots', () => {
      const jsonPath = path.join(dir, 'blocks.json');
      // Initial save + 10 more mutations
      for (let i = 0; i < 11; i++) {
        memory.setBlock('human', `version ${i}`);
      }
      const snapshots = JSON.parse(fs.readFileSync(jsonPath, 'utf-8'));
      expect(snapshots.data.blocks.length).toBe(10);
    });

    it('reads the legacy blocks array and rewrites it as a DataFile', () => {
      const jsonPath = path.join(dir, 'blocks.json');
      const current = JSON.parse(fs.readFileSync(jsonPath, 'utf-8'));
      fs.writeFileSync(jsonPath, JSON.stringify(current.data.blocks), 'utf8');

      memory.setBlock('human', 'migrated');

      const migrated = JSON.parse(fs.readFileSync(jsonPath, 'utf-8'));
      expect(migrated.version).toBe('memory-core/1.0');
      expect(Array.isArray(migrated.data.blocks)).toBe(true);
    });

    it('backs up and migrates a legacy Memory.md without the format header', () => {
      const legacy = '## human\n{description: User facts}\n{limit: 2000}\n{readOnly: false}\n\nPrefers concise answers\n';
      fs.writeFileSync(path.join(dir, 'Memory.md'), legacy);

      const migrated = new Memory(dir);

      expect(migrated.getBlock('human')?.value).toBe('Prefers concise answers');
      expect(fs.readFileSync(path.join(dir, 'Memory.md.legacy'), 'utf-8')).toBe(legacy);
      expect(fs.readFileSync(path.join(dir, 'Memory.md'), 'utf-8')).toMatch(/^# Memory/);
    });
  });

  describe('parseMemoryMd', () => {
    it('exposes the parser for context loaders', () => {
      const blocks = parseBlocksFromMarkdown(
        '# Memory\n\n## human\n{description: User facts}\n{limit: 42}\n{readOnly: false}\n\nPrefers concise answers\n',
      );

      expect(blocks.get('human')).toEqual(expect.objectContaining({
        value: 'Prefers concise answers',
        description: 'User facts',
        limit: 42,
        readOnly: false,
      }));
    });

    it('parses markdown format back into blocks', () => {
      memory.setBlock('human', 'user prefers concise answers');
      memory.setBlock('persona', 'You are a helpful coding assistant');

      const md = memory.compile({ format: 'markdown' });
      // Clear internal map and re-parse
      (memory as any).blocks.clear();
      (memory as any).parseMemoryMd(md);

      expect(memory.getBlock('human')!.value).toContain('user prefers concise answers');
      expect(memory.getBlock('persona')!.value).toContain('helpful coding assistant');
    });
  });
});
