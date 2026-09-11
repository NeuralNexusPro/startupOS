import path from 'node:path';
import { CognitionBank } from './bank';
import { MemoryConsolidator, type ConsolidationResult, type MemoryConsolidatorDeps } from './core/consolidator';

export type MemoryConsolidationEntryType = 'project' | 'solution' | 'agent' | 'role-agent' | 'skill';

export interface ConsolidateOwnedMemoryInput {
  dataRoot: string;
  entryType: MemoryConsolidationEntryType;
  entryId: string;
  userId?: string;
  sessionId?: string;
}

const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;

/** Core-owned consolidation use case shared by Web and Electron boundaries. */
export async function consolidateOwnedMemory(
  input: ConsolidateOwnedMemoryInput,
  deps?: MemoryConsolidatorDeps,
): Promise<ConsolidationResult> {
  if (!SAFE_ID.test(input.entryId)) throw new Error(`Invalid memory owner id: ${input.entryId}`);
  if (input.entryType === 'skill') {
    return {
      consolidated: false,
      changes: [],
      reason: 'standalone skills do not own persistent cognition',
      stableMemory: [],
      patterns: [],
      knowledgeCandidates: [],
    };
  }

  const ownerScope = input.entryType === 'project' || input.entryType === 'solution' ? 'project' : 'agent';
  const collection = ownerScope === 'project' ? 'projects' : 'agents';
  const ownerDirectory = path.join(input.dataRoot, collection, input.entryId);
  const userBank = new CognitionBank({
    scope: 'user',
    ownerId: input.userId ?? 'default',
    dataRoot: input.dataRoot,
  });
  const ownerBank = new CognitionBank({
    scope: ownerScope,
    ownerId: input.entryId,
    dataRoot: input.dataRoot,
    ownerDirectory,
  });
  return new MemoryConsolidator(
    ownerDirectory,
    input.sessionId ?? 'default',
    deps,
    { userBank, ownerBank },
  ).consolidate();
}
