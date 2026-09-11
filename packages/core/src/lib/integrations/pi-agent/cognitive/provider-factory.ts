import {
  MemoryCore,
  MemoryProvider,
  migrateLegacyUserSignals,
  type MemoryOwnershipContext,
  type ObservationContext,
} from '../../../../modules/memory-core';
import { KnowledgeProvider } from './knowledge-provider';
import { PatternProvider } from './pattern';
import { createAutoModel } from '../server-config';

export interface OwnedCognitiveProviderBundle {
  memoryCore: MemoryCore;
  memoryProvider: MemoryProvider;
  knowledgeProvider: KnowledgeProvider;
  patternProvider: PatternProvider;
  observationContext: ObservationContext;
}

export function createOwnedCognitiveProviders(
  ownership: MemoryOwnershipContext,
  observationContext: ObservationContext,
): OwnedCognitiveProviderBundle {
  if (!observationContext.persistent || observationContext.owner.scope === 'session') {
    throw new Error('Owned cognitive providers require a persistent agent or project owner');
  }
  if (
    observationContext.owner.scope !== ownership.ownerScope ||
    observationContext.owner.ownerId !== ownership.ownerId
  ) {
    throw new Error('Observation context does not match memory ownership');
  }
  const memoryCore = new MemoryCore(ownership);
  if (memoryCore.userCognition) {
    migrateLegacyUserSignals({
      ownerDirectory: ownership.ownerDirectory ?? ownership.workingDirectory,
      ownerScope: ownership.ownerScope,
      ownerId: ownership.ownerId,
      userBank: memoryCore.userCognition,
    });
  }
  const knowledgeProvider = new KnowledgeProvider(ownership.ownerDirectory ?? ownership.workingDirectory);
  const patternProvider = new PatternProvider(ownership.ownerDirectory ?? ownership.workingDirectory, memoryCore.archival);
  const memoryProvider = new MemoryProvider(memoryCore, ownership.sessionId ?? 'default', knowledgeProvider, {
    context: observationContext,
    consumers: { knowledge: knowledgeProvider, pattern: patternProvider },
  }, { createAutoModel });
  return { memoryCore, memoryProvider, knowledgeProvider, patternProvider, observationContext };
}
