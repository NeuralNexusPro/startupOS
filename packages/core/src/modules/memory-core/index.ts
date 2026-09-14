/**
 * Memory Core — 统一导出。
 *
 * Epic M: Memory Core 记忆核心
 */

// Core
export type { Block, BlockMetadata, BlockDefinition, LegacyMemoryBlock } from './core/block';
export {
  DEFAULT_BLOCKS,
  createBlock,
  validateBlock,
  toLegacyBlock,
  fromLegacyBlock,
  serializeBlock,
  deserializeBlock,
} from './core/block';

export { Memory, parseBlocksFromMarkdown, type CompileOptions, type BlocksVersionSnapshot } from './core/memory';
export { MemoryCore, type MemoryOwnershipContext } from './core/memory-core';
export { MemoryConsolidator, type ConsolidationResult } from './core/consolidator';
export {
  consolidateOwnedMemory,
  type ConsolidateOwnedMemoryInput,
  type MemoryConsolidationEntryType,
} from './consolidation-service';

// Archival
export { ArchivalMemory, type ArchivalEntry, type ArchivalSearchResult, type SearchOptions } from './archival/archival-memory';
export { embeddingEngine, cosineSimilarity, quantizeInt8, dequantizeFloat32, normalizeVector, zeros } from './archival/embedding';
export { HNSWIndex, type HNSWIndexOptions } from './archival/hnsw-index';

// Recall
export { RecallMemory, type RecallSearchResult } from './recall/recall-memory';
export { HistoryStore, type TurnRecord, type RecallEntry } from './recall/history-store';

// Tools
export { CoreMemoryTools } from './tools/core-memory-tools';
export { ArchivalMemoryTools } from './tools/archival-memory-tools';

// Session / Provider
export { MemoryProvider, type KnowledgeCandidateBatch } from './session/memory-provider';
export { EnhancedPatternProvider } from './session/enhanced-pattern-provider';

// Pattern Ingest (M.7)
export {
  extractPrincipleFromToolResults,
  ingestPatternToArchival,
  ingestReflectionToArchival,
  migratePatternsToArchival,
  type PatternIngestEntry,
} from './archival/pattern-ingest';

// Hindsight-inspired scoped cognition banks (M.12)
export * from './bank';
