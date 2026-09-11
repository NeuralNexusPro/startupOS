/**
 * MemoryCore — 三层记忆统一门面。
 *
 * Story M.6: 一个类管理 Core + Archival + Recall 三层记忆。
 */

import { BlockDefinition } from '../core/block';
import { Memory } from '../core/memory';
import { ArchivalMemory as ArchivalMemoryImpl } from '../archival/archival-memory';
import { RecallMemory } from '../recall/recall-memory';
import { CoreMemoryTools } from '../tools/core-memory-tools';
import { ArchivalMemoryTools } from '../tools/archival-memory-tools';
import { CognitionBank } from '../bank';
import type { CognitionScope } from '../bank';

export interface MemoryOwnershipContext {
  ownerScope: Exclude<CognitionScope, 'user'>;
  ownerId: string;
  userId?: string;
  dataRoot: string;
  workingDirectory: string;
  ownerDirectory?: string;
  sessionId?: string;
}

export class MemoryCore {
  readonly agentDir: string;
  readonly memory: Memory;
  readonly archival: ArchivalMemoryImpl;
  readonly recall: RecallMemory;
  readonly coreTools: CoreMemoryTools;
  readonly archivalTools: ArchivalMemoryTools;
  readonly ownership: MemoryOwnershipContext | null;
  readonly userCognition: CognitionBank | null;
  readonly ownerCognition: CognitionBank | null;

  constructor(
    owner: string | MemoryOwnershipContext,
    sessionId: string = 'default',
    definitions?: BlockDefinition[],
  ) {
    this.ownership = typeof owner === 'string' ? null : owner;
    this.agentDir = typeof owner === 'string' ? owner : owner.workingDirectory;
    const resolvedSessionId = typeof owner === 'string' ? sessionId : (owner.sessionId ?? sessionId);
    this.memory = new Memory(this.agentDir, definitions);
    this.archival = new ArchivalMemoryImpl(this.agentDir);
    this.recall = new RecallMemory(this.agentDir, resolvedSessionId);
    this.coreTools = new CoreMemoryTools(
      this.memory,
      this.ownership ? new Set(['human']) : undefined,
    );
    this.archivalTools = new ArchivalMemoryTools(this.archival);
    this.userCognition = this.ownership
      ? new CognitionBank({ scope: 'user', ownerId: this.ownership.userId ?? 'default', dataRoot: this.ownership.dataRoot })
      : null;
    this.ownerCognition = this.ownership
      ? new CognitionBank({
          scope: this.ownership.ownerScope,
          ownerId: this.ownership.ownerId,
          dataRoot: this.ownership.dataRoot,
          ownerDirectory: this.ownership.ownerDirectory,
        })
      : null;
  }

  async initialize(): Promise<void> {
    // Archival and Recall already load in constructor
  }

  async shutdown(): Promise<void> {
    await Promise.all([
      this.memory.save(),
      this.archival.persist(),
    ]);
  }
}
