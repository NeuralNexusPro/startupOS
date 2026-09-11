/**
 * Memory — Block 集合 + compile/render。
 *
 * Story M.2: 管理 Block Map，支持 markdown/xml 两种输出格式，
 * CRUD 操作，以及持久化到 Memory.md + blocks.json 版本快照。
 */

import fs from 'node:fs';
import path from 'node:path';
import {
  Block,
  BlockDefinition,
  LegacyMemoryBlock,
  DEFAULT_BLOCKS,
  createBlock,
  serializeBlock,
  validateBlock,
} from './block';

/** Parse the public Memory.md format without constructing a writable Memory instance. */
export function parseBlocksFromMarkdown(content: string): Map<string, LegacyMemoryBlock> {
  const blocks = new Map<string, LegacyMemoryBlock>();
  let label: string | null = null;
  let description = '';
  let limit = 2000;
  let readOnly = false;
  const value: string[] = [];

  const flush = () => {
    if (!label) return;
    blocks.set(label, {
      label,
      value: value.join('\n').trim(),
      limit,
      description: description || label,
      metadata: {},
      readOnly,
    });
  };

  for (const rawLine of content.split('\n')) {
    const line = rawLine.trimEnd();
    const heading = line.match(/^##\s+(.+)$/);
    if (heading?.[1]) {
      flush();
      label = heading[1].trim();
      description = '';
      limit = 2000;
      readOnly = false;
      value.length = 0;
      continue;
    }
    if (!label || line === '# Memory') continue;
    const metadata = line.match(/^\{(description|limit|readOnly):\s*(.*?)\}$/);
    if (metadata?.[1]) {
      if (metadata[1] === 'description') description = metadata[2] ?? '';
      if (metadata[1] === 'limit') limit = Number.parseInt(metadata[2] ?? '', 10) || 2000;
      if (metadata[1] === 'readOnly') readOnly = metadata[2] === 'true';
      continue;
    }
    value.push(line);
  }
  flush();
  return blocks;
}

export interface CompileOptions {
  format?: 'markdown' | 'xml';
  includeHidden?: boolean;
  labels?: string[];
}

export interface BlocksVersionSnapshot {
  version: number;
  timestamp: number;
  blocks: Array<Record<string, unknown>>;
  changedBlocks?: string[];
}

interface BlocksDataFile {
  version: string;
  createdAt: string;
  updatedAt: string;
  data: { blocks: BlocksVersionSnapshot[] };
}

export class Memory {
  private blocks = new Map<string, Block>();
  private agentDir: string;

  constructor(agentDir: string, definitions?: BlockDefinition[]) {
    this.agentDir = agentDir;
    this.loadFromDisk();
    if (this.blocks.size === 0) {
      this.initializeDefaults(definitions);
    }
  }

  // ==========================================================================
  // CRUD
  // ==========================================================================

  getBlock(label: string): Block | null {
    return this.blocks.get(label) ?? null;
  }

  /** 设置 block 的完整内容 */
  setBlock(label: string, value: string): void {
    const block = this.blocks.get(label);
    if (!block) throw new Error(`Block '${label}' does not exist`);
    if (block.readOnly) throw new Error(`Block '${label}' is read-only`);
    if (value.length > block.limit) {
      throw new Error(`Content exceeds block limit (${block.limit} chars)`);
    }
    block.value = value;
    block.updatedAt = Date.now();
    block.version += 1;
    block.metadata = {
      ...block.metadata,
      lastEdited: Date.now(),
      lastEditedBy: block.metadata.lastEditedBy ?? 'agent',
    };
    this.save();
  }

  /** 追加内容到 block 末尾 */
  appendBlock(label: string, content: string): void {
    const block = this.blocks.get(label);
    if (!block) throw new Error(`Block '${label}' does not exist`);
    if (block.readOnly) throw new Error(`Block '${label}' is read-only`);
    const newValue = block.value + (block.value ? '\n' : '') + content;
    if (newValue.length > block.limit) {
      throw new Error(`Content exceeds block limit (${block.limit} chars)`);
    }
    block.value = newValue;
    block.updatedAt = Date.now();
    block.version += 1;
    block.metadata = {
      ...block.metadata,
      lastEdited: Date.now(),
      lastEditedBy: block.metadata.lastEditedBy ?? 'agent',
    };
    this.save();
  }

  /** 精确替换 block 中的内容 */
  replaceBlock(label: string, oldContent: string, newContent: string): boolean {
    const block = this.blocks.get(label);
    if (!block) throw new Error(`Block '${label}' does not exist`);
    if (block.readOnly) throw new Error(`Block '${label}' is read-only`);
    if (!block.value.includes(oldContent)) return false;
    const newValue = block.value.replace(oldContent, newContent);
    if (newValue.length > block.limit) {
      throw new Error(`Content exceeds block limit (${block.limit} chars)`);
    }
    block.value = newValue;
    block.updatedAt = Date.now();
    block.version += 1;
    block.metadata = {
      ...block.metadata,
      lastEdited: Date.now(),
      lastEditedBy: block.metadata.lastEditedBy ?? 'agent',
    };
    this.save();
    return true;
  }

  /** 创建新 block */
  createBlock(def: BlockDefinition, value = ''): Block {
    if (this.blocks.has(def.label)) {
      throw new Error(`Block '${def.label}' already exists`);
    }
    const block = createBlock(def, value);
    const err = validateBlock(block);
    if (err) throw new Error(err);
    this.blocks.set(block.label, block);
    this.save();
    return block;
  }

  /** 删除 block */
  deleteBlock(label: string): void {
    const block = this.blocks.get(label);
    if (!block) throw new Error(`Block '${label}' does not exist`);
    if (block.readOnly) throw new Error(`Block '${label}' is read-only`);
    this.blocks.delete(label);
    this.save();
  }

  listBlocks(): Block[] {
    return Array.from(this.blocks.values());
  }

  // ==========================================================================
  // Compile / Render
  // ==========================================================================

  compile(options?: CompileOptions): string {
    const { format = 'markdown', includeHidden = false, labels } = options ?? {};
    if (format === 'markdown') {
      return this.compileToMarkdown(labels, includeHidden);
    }
    return this.compileToXml(labels, includeHidden);
  }

  private compileToMarkdown(
    includeLabels?: string[],
    includeHidden = false,
  ): string {
    const lines: string[] = ['# Memory\n'];
    for (const block of this.blocks.values()) {
      if (includeLabels && !includeLabels.includes(block.label)) continue;
      if (block.metadata.hidden && !includeHidden) continue;

      lines.push(`## ${block.label}`);
      lines.push(`{description: ${block.description}}`);
      lines.push(`{limit: ${block.limit}}`);
      lines.push(`{readOnly: ${block.readOnly}}`);
      if (block.tags.length > 0) {
        lines.push(`{tags: ${block.tags.join(', ')}}`);
      }
      lines.push('');
      if (block.value) {
        lines.push(block.value);
      }
      lines.push('');
    }
    return lines.join('\n');
  }

  private compileToXml(
    includeLabels?: string[],
    includeHidden = false,
  ): string {
    const s: string[] = [];
    s.push('<memory_blocks>');
    s.push('The following memory blocks are currently engaged in your core memory unit:\n');

    for (const block of this.blocks.values()) {
      if (includeLabels && !includeLabels.includes(block.label)) continue;
      if (block.metadata.hidden && !includeHidden) continue;

      s.push(`<${block.label}>`);
      s.push(`<description>${block.description}</description>`);
      s.push('<metadata>');
      s.push(`- chars_current=${block.value.length}`);
      s.push(`- chars_limit=${block.limit}`);
      if (block.readOnly) s.push('- read_only=true');
      s.push('</metadata>');
      s.push(`<value>${block.value}</value>`);
      s.push(`</${block.label}>`);
      s.push('');
    }

    s.push('</memory_blocks>');
    return s.join('\n');
  }

  // ==========================================================================
  // Persistence
  // ==========================================================================

  save(): void {
    this.saveMemoryMd();
    this.saveBlocksSnapshot();
  }

  private saveMemoryMd(): void {
    const content = this.compileToMarkdown();
    const filePath = path.join(this.agentDir, 'Memory.md');
    fs.mkdirSync(this.agentDir, { recursive: true });
    fs.writeFileSync(filePath, content, 'utf-8');
  }

  private saveBlocksSnapshot(): void {
    const filePath = path.join(this.agentDir, 'blocks.json');
    fs.mkdirSync(this.agentDir, { recursive: true });
    const existing = this.loadBlocksSnapshot();
    const snapshots: BlocksVersionSnapshot[] = existing ?? [];

    const snapshot: BlocksVersionSnapshot = {
      version: this.getNextVersion(snapshots),
      timestamp: Date.now(),
      blocks: Array.from(this.blocks.values()).map(serializeBlock),
    };

    // Keep last 10 versions
    snapshots.push(snapshot);
    while (snapshots.length > 10) {
      snapshots.shift();
    }

    const previous = this.loadBlocksDataFile();
    const now = new Date().toISOString();
    const file: BlocksDataFile = {
      version: 'memory-core/1.0',
      createdAt: previous?.createdAt ?? now,
      updatedAt: now,
      data: { blocks: snapshots },
    };
    fs.writeFileSync(filePath, JSON.stringify(file, null, 2), 'utf-8');
  }

  private loadBlocksSnapshot(): BlocksVersionSnapshot[] | null {
    const filePath = path.join(this.agentDir, 'blocks.json');
    if (!fs.existsSync(filePath)) return null;
    try {
      const parsed = JSON.parse(fs.readFileSync(filePath, 'utf-8')) as unknown;
      if (Array.isArray(parsed)) return parsed as BlocksVersionSnapshot[];
      return this.isBlocksDataFile(parsed) ? parsed.data.blocks : null;
    } catch {
      return null;
    }
  }

  private loadBlocksDataFile(): BlocksDataFile | null {
    const filePath = path.join(this.agentDir, 'blocks.json');
    if (!fs.existsSync(filePath)) return null;
    try {
      const parsed = JSON.parse(fs.readFileSync(filePath, 'utf-8')) as unknown;
      return this.isBlocksDataFile(parsed) ? parsed : null;
    } catch {
      return null;
    }
  }

  private isBlocksDataFile(value: unknown): value is BlocksDataFile {
    if (!value || typeof value !== 'object') return false;
    const candidate = value as { version?: unknown; createdAt?: unknown; updatedAt?: unknown; data?: unknown };
    if (typeof candidate.version !== 'string' || typeof candidate.createdAt !== 'string' || typeof candidate.updatedAt !== 'string') return false;
    if (!candidate.data || typeof candidate.data !== 'object') return false;
    return Array.isArray((candidate.data as { blocks?: unknown }).blocks);
  }

  private getNextVersion(snapshots: BlocksVersionSnapshot[]): number {
    if (snapshots.length === 0) return 1;
    return (snapshots[snapshots.length - 1]?.version ?? 0) + 1;
  }

  private loadFromDisk(): void {
    // 尝试从 Memory.md 解析 blocks
    const memoryMdPath = path.join(this.agentDir, 'Memory.md');
    if (fs.existsSync(memoryMdPath)) {
      const content = fs.readFileSync(memoryMdPath, 'utf-8');
      this.parseMemoryMd(content);
      if (this.blocks.size > 0 && !content.split('\n').some((line) => line.trim() === '# Memory')) {
        const backupPath = `${memoryMdPath}.legacy`;
        if (!fs.existsSync(backupPath)) fs.copyFileSync(memoryMdPath, backupPath);
        this.save();
      }
    }
  }

  /** 解析 Memory.md 格式的文本为 Block */
  private parseMemoryMd(content: string): void {
    for (const legacy of parseBlocksFromMarkdown(content).values()) {
      const block = createBlock({
        label: legacy.label,
        description: legacy.description,
        limit: legacy.limit,
        readOnly: legacy.readOnly,
      }, legacy.value);
      this.blocks.set(block.label, block);
    }
  }

  private initializeDefaults(definitions?: BlockDefinition[]): void {
    const defs = definitions ?? DEFAULT_BLOCKS;
    for (const def of defs) {
      if (!this.blocks.has(def.label)) {
        const block = createBlock(def);
        this.blocks.set(block.label, block);
      }
    }
    this.save();
  }
}
