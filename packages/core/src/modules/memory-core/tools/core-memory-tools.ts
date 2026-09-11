/**
 * Core Memory Tools — Agent 编辑核心记忆的标准 API。
 *
 * Story M.5: core_memory_append, core_memory_replace, insert_memory_block, read_memory_block
 */

import { Memory } from '../core/memory';
import { BlockDefinition, createBlock } from '../core/block';

export class CoreMemoryTools {
  constructor(
    private memory: Memory,
    private readonly protectedLabels: ReadonlySet<string> = new Set(),
  ) {}

  private writeProtectionError(label: string): string | null {
    return this.protectedLabels.has(label)
      ? `Error: Block '${label}' is a legacy read-only block.`
      : null;
  }

  async core_memory_append(label: string, content: string): Promise<string> {
    const protectionError = this.writeProtectionError(label);
    if (protectionError) return protectionError;
    const block = this.memory.getBlock(label);
    if (!block) return `Error: Block '${label}' does not exist.`;
    if (block.readOnly) return `Error: Block '${label}' is read-only.`;
    const newValue = block.value + (block.value ? '\n' : '') + content;
    if (newValue.length > block.limit) {
      return `Error: Content exceeds block limit (${block.limit} chars). Current: ${block.value.length}, New: ${newValue.length}`;
    }
    this.memory.setBlock(label, newValue);
    return `Block '${label}' appended successfully.`;
  }

  async core_memory_replace(
    label: string,
    oldContent: string,
    newContent: string,
  ): Promise<string> {
    const protectionError = this.writeProtectionError(label);
    if (protectionError) return protectionError;
    const block = this.memory.getBlock(label);
    if (!block) return `Error: Block '${label}' does not exist.`;
    if (block.readOnly) return `Error: Block '${label}' is read-only.`;
    if (!block.value.includes(oldContent)) {
      return `Error: Old content not found in block '${label}'.`;
    }
    const newValue = block.value.replace(oldContent, newContent);
    if (newValue.length > block.limit) {
      return `Error: Content exceeds block limit (${block.limit} chars).`;
    }
    this.memory.setBlock(label, newValue);
    return `Block '${label}' replaced successfully.`;
  }

  async insert_memory_block(
    label: string,
    value: string,
    description?: string,
    limit?: number,
  ): Promise<string> {
    if (this.memory.getBlock(label)) {
      return `Error: Block '${label}' already exists.`;
    }
    const def: BlockDefinition = {
      label,
      description: description ?? 'Agent-created block',
      limit: limit ?? 2000,
    };
    createBlock(def); // validate
    this.memory.createBlock(def, value);
    return `Block '${label}' created successfully.`;
  }

  async read_memory_block(label: string): Promise<string> {
    const block = this.memory.getBlock(label);
    if (!block) return `Error: Block '${label}' does not exist.`;
    return block.value;
  }
}
