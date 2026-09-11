/**
 * 认知系统模块（Epic C）统一导出
 */

export { CognitiveManager } from './manager';
export { PracticeLogger } from './practice-logger';
export { KnowledgeProvider } from './knowledge-provider';
export { KnowledgeIngest } from './knowledge-ingest';
export { PatternProvider } from './pattern/index';
export { createOwnedCognitiveProviders } from './provider-factory';
export type { OwnedCognitiveProviderBundle } from './provider-factory';
export { UnifiedOntology } from './unified-ontology';
export { RuleEngine } from './rule-engine';
export type { CognitiveProvider, TurnCognitiveData, PrefetchResult } from './types';
export type {
  Entity,
  Attribute,
  Relation,
  Rule,
  RuleExpression,
  TypeSchema,
  AttributeSchema,
  AttributeValueType,
  RuleType,
  RuleSeverity,
  UnifiedOntologyInit,
  ValidationResult,
  RuleViolation,
  QueryFilter,
} from './unified-ontology';
export type {
  MemoryBlock,
  DefaultBlockDef,
  SleepTask,
  SleepTaskType,
  SleepTrigger,
  SleepTaskEntry,
} from './types';
export {
  DEFAULT_BLOCKS,
} from './types';
export {
  SleepComputeScheduler,
  createConsolidateTask,
  createKnowledgeTask,
  createPatternTask,
  createUpdateBlockTask,
} from './sleep-compute';
export type { RuleEngineResult, AgentRulePrompt } from './rule-engine';
