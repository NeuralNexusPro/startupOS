/**
 * Ontology feature public types
 * Includes the canonical ontology contract and interview session types.
 */

/**
 * Question type for interview
 */
export type QuestionType = 'text' | 'select' | 'multiselect' | 'textarea';

/** Current in-memory canonical ontology contract. Persistence codecs are versioned separately. */
export const CANONICAL_ONTOLOGY_SCHEMA_VERSION = '1.0.0' as const;

export type CanonicalOntologySchemaVersion = typeof CANONICAL_ONTOLOGY_SCHEMA_VERSION;
export type CanonicalValueType =
  | 'string'
  | 'number'
  | 'boolean'
  | 'date'
  | 'object'
  | 'array'
  | 'reference';

export interface CanonicalSourceReference {
  sourceType: 'interview' | 'manual' | 'import' | 'runtime';
  sourceId: string;
  sourceVersion?: string;
  locator?: string;
}

export interface CanonicalOntologyReference {
  ontologyId: string;
  ontologyVersion: string;
}

export interface CanonicalConceptReference extends CanonicalOntologyReference {
  conceptId: string;
}

export interface CanonicalFactReference extends CanonicalConceptReference {
  factTypeId: string;
  factId: string;
  factVersion: string;
}

export interface CanonicalDecisionReference extends CanonicalOntologyReference {
  decisionId: string;
  decisionVersion: string;
}

export interface CanonicalExecutionContextReference {
  contextInstanceId: string;
  projectId: string;
  taskId: string;
  sessionId: string;
  branchId: string;
  runId: string;
  workItemId: string;
  attemptId: string;
  contractId: string;
  contractHash: string;
  ontology: CanonicalOntologyReference;
}

export interface CanonicalCheckpointReference {
  contextInstanceId: string;
  attemptId: string;
  cursor: string;
  revision: number;
  leaseEpoch: number;
  createdAt: Date;
}

export interface CanonicalContextSnapshot {
  context: CanonicalExecutionContextReference;
  objectBindings: Record<string, string>;
  factRefs: CanonicalFactReference[];
  decisionRefs: CanonicalDecisionReference[];
  sourceRefs: CanonicalSourceReference[];
  allowedActionIds: string[];
  revision: number;
  checkpoint?: CanonicalCheckpointReference;
}

export type CanonicalContextProjectionKind =
  | 'plan'
  | 'goal'
  | 'task'
  | 'agent'
  | 'skill'
  | 'fact'
  | 'decision'
  | 'outcome'
  | 'gap';

export interface CanonicalContextProjectionRecord {
  id: string;
  kind: CanonicalContextProjectionKind;
  context: CanonicalExecutionContextReference;
  revision: number;
  factRefs?: CanonicalFactReference[];
  decisionRefs?: CanonicalDecisionReference[];
  sourceRefs?: CanonicalSourceReference[];
  payload?: Record<string, unknown>;
  createdAt: Date;
}

export interface CanonicalFactRecord {
  ref: CanonicalFactReference;
  value: Record<string, unknown>;
  source: CanonicalSourceReference;
  operationId: string;
  revision: number;
  acceptedAt: Date;
}

export interface CanonicalOperationRecord {
  operationId: string;
  actionId: string;
  status: 'intent' | 'accepted' | 'rejected' | 'unknown';
  expectedRevision: number;
  factRefs: CanonicalFactReference[];
  recordedAt: Date;
  metadata?: Record<string, unknown>;
}

export interface CanonicalMigrationRecord {
  migrationId: string;
  projectId: string;
  fromVersion: string;
  toVersion: string;
  status: 'started' | 'completed' | 'failed' | 'rolled_back';
  recordedAt: Date;
  metadata?: Record<string, unknown>;
}

export interface CanonicalDomain {
  id: string;
  name: string;
  description: string;
  icon?: string;
  color?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface CanonicalConcept {
  id: string;
  domainId: string;
  name: string;
  type: string;
  attributes: Record<string, unknown>;
  description?: string;
  propertyIds?: string[];
  sourceRefs?: CanonicalSourceReference[];
  createdAt: Date;
  updatedAt: Date;
}

export interface CanonicalInstance {
  id: string;
  conceptId: string;
  data: Record<string, unknown>;
  stateId?: string;
  sourceRefs?: CanonicalSourceReference[];
  createdAt: Date;
  updatedAt: Date;
}

export interface CanonicalProperty {
  id: string;
  conceptId: string;
  name: string;
  valueType: CanonicalValueType;
  required: boolean;
  description?: string;
  referenceConceptId?: string;
  metadata?: Record<string, unknown>;
}

export interface CanonicalRelation {
  id: string;
  name: string;
  sourceConceptId: string;
  targetConceptId: string;
  cardinality: 'one-to-one' | 'one-to-many' | 'many-to-one' | 'many-to-many';
  description?: string;
  metadata?: Record<string, unknown>;
}

export interface CanonicalBusinessState {
  id: string;
  conceptId: string;
  name: string;
  initial?: boolean;
  terminal?: boolean;
  description?: string;
}

export interface CanonicalStateTransition {
  id: string;
  conceptId: string;
  name: string;
  fromStateId: string;
  toStateId: string;
  actionId?: string;
  ruleIds?: string[];
}

export interface CanonicalFactType {
  id: string;
  conceptId: string;
  name: string;
  propertyIds: string[];
  description?: string;
}

export interface CanonicalRule {
  id: string;
  name: string;
  kind: 'invariant' | 'precondition' | 'postcondition' | 'derivation' | 'permission';
  expression: unknown;
  severity: 'error' | 'warning' | 'info';
  description?: string;
}

export interface CanonicalAction {
  id: string;
  name: string;
  conceptId: string;
  inputFactTypeIds: string[];
  outputFactTypeIds: string[];
  fromStateIds?: string[];
  toStateId?: string;
  ruleIds?: string[];
  permissions?: string[];
  metadata?: Record<string, unknown>;
}

export interface CanonicalDomainEvent {
  id: string;
  name: string;
  conceptId: string;
  factTypeId: string;
  actionId?: string;
  description?: string;
}

export interface CanonicalProjection {
  id: string;
  name: string;
  sourceFactTypeIds: string[];
  targetConceptId: string;
  propertyMappings: Record<string, string>;
  description?: string;
}

export interface CanonicalOntology {
  id: string;
  projectId: string;
  name: string;
  schemaVersion: CanonicalOntologySchemaVersion;
  version: string;
  domains: CanonicalDomain[];
  concepts: CanonicalConcept[];
  instances: CanonicalInstance[];
  properties: CanonicalProperty[];
  relations: CanonicalRelation[];
  businessStates: CanonicalBusinessState[];
  transitions: CanonicalStateTransition[];
  factTypes: CanonicalFactType[];
  rules: CanonicalRule[];
  actions: CanonicalAction[];
  events: CanonicalDomainEvent[];
  projections: CanonicalProjection[];
  sourceRefs?: CanonicalSourceReference[];
  metadata?: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

export interface CanonicalInputFact {
  factType: CanonicalConceptReference & { factTypeId: string };
  required: boolean;
}

export interface CanonicalOutputFact {
  factType: CanonicalConceptReference & { factTypeId: string };
  required: boolean;
}

export interface CanonicalActionBinding {
  actionId: string;
  concept: CanonicalConceptReference;
}

export interface CanonicalAgentContract {
  agentId: string;
  ontology: CanonicalOntologyReference;
  inputs: CanonicalInputFact[];
  outputs: CanonicalOutputFact[];
  actions: CanonicalActionBinding[];
  permissions: string[];
}

export interface CanonicalSkillContract {
  skillId: string;
  ontology: CanonicalOntologyReference;
  inputs: CanonicalInputFact[];
  outputs: CanonicalOutputFact[];
  actions: CanonicalActionBinding[];
  permissions: string[];
}

export interface CanonicalValidationIssue {
  code: string;
  message: string;
  path?: string;
  severity: 'error' | 'warning';
  reference?: CanonicalOntologyReference | CanonicalConceptReference | CanonicalFactReference;
}

export interface CanonicalValidationResult {
  valid: boolean;
  issues: CanonicalValidationIssue[];
}

export interface CanonicalActionValidationInput {
  ontology: CanonicalOntology;
  ontologyId: string;
  ontologyVersion: string;
  actionId: string;
  conceptId: string;
  currentStateId?: string;
  permissions: readonly string[];
}

export interface CanonicalFactQuery {
  projectId: string;
  ontologyId: string;
  ontologyVersion: string;
  conceptId?: string;
  factTypeId?: string;
  latestOnly?: boolean;
}

export type CanonicalFactQueryResult =
  | { ok: true; facts: CanonicalFactRecord[] }
  | { ok: false; issues: CanonicalValidationIssue[] };

export interface CanonicalActionOutputDraft {
  factId: string;
  factTypeId: string;
  value: Record<string, unknown>;
  source: CanonicalSourceReference;
}

export interface CanonicalActionSubmission {
  projectId: string;
  ontologyId: string;
  ontologyVersion: string;
  operationId: string;
  actionId: string;
  conceptId: string;
  currentStateId?: string;
  permissions: readonly string[];
  inputFactRefs: readonly CanonicalFactReference[];
  outputs: readonly CanonicalActionOutputDraft[];
  expectedRevision: number;
  audit?: Record<string, unknown>;
}

export type CanonicalActionSubmissionResult =
  | { ok: true; receipt: CanonicalOperationRecord & { status: 'accepted' } }
  | { ok: false; issues: CanonicalValidationIssue[] };

/**
 * Single interview question
 */
export interface InterviewQuestion {
  id: string;
  question: string;
  type: QuestionType;
  options?: string[];
  required: boolean;
  placeholder?: string;
  helpText?: string;
}

/**
 * Answer to a question
 */
export interface QuestionAnswer {
  questionId: string;
  answer: string | string[];
  timestamp: number;
}

/**
 * Interview session status
 */
export type InterviewStatus = 'not_started' | 'in_progress' | 'completed' | 'skipped';

/**
 * Interview session
 */
export interface InterviewSession {
  id: string;
  projectId: string;
  questions: InterviewQuestion[];
  answers: Record<string, QuestionAnswer>;
  currentQuestionIndex: number;
  status: InterviewStatus;
  createdAt: string; // ISO 8601
  updatedAt: string; // ISO 8601
  completedAt?: string; // ISO 8601
}

/**
 * Interview session with metadata for storage
 */
export interface InterviewSessionData {
  version: string;
  createdAt: string;
  updatedAt: string;
  data: InterviewSession;
}

/**
 * Core interview questions (required)
 */
export const CORE_QUESTIONS: InterviewQuestion[] = [
  {
    id: 'work_domain',
    question: '你的工作领域是什么？',
    type: 'text',
    required: true,
    placeholder: '例如：软件开发、市场营销、产品设计...',
    helpText: '这将帮助系统理解您的工作背景'
  },
  {
    id: 'work_mode',
    question: '你的工作模式是什么？',
    type: 'select',
    required: true,
    options: [
      '全职工作',
      '自由职业',
      '远程工作',
      '混合模式',
      '创业',
      '其他'
    ],
    helpText: '选择最符合您当前工作状态的选项'
  },
  {
    id: 'main_tasks',
    question: '主要任务有哪些？',
    type: 'textarea',
    required: true,
    placeholder: '请列出您日常的主要工作任务...',
    helpText: '详细描述可以帮助系统更好地理解您的需求'
  }
];

/**
 * Additional optional questions
 */
export const OPTIONAL_QUESTIONS: InterviewQuestion[] = [
  {
    id: 'tools_used',
    question: '你经常使用的工具或软件有哪些？',
    type: 'multiselect',
    required: false,
    options: [
      '代码编辑器（VS Code、IntelliJ 等）',
      '项目管理工具（Jira、Trello 等）',
      '设计工具（Figma、Sketch 等）',
      '办公软件（Office、Google Docs 等）',
      '沟通工具（Slack、Teams 等）',
      '其他'
    ]
  },
  {
    id: 'team_size',
    question: '你的团队规模是？',
    type: 'select',
    required: false,
    options: ['个人', '2-5人', '6-20人', '21-50人', '50人以上']
  },
  {
    id: 'goals',
    question: '你希望 OriginOS 帮助你解决什么问题？',
    type: 'textarea',
    required: false,
    placeholder: '描述您希望通过 OriginOS 达成的目标...',
    helpText: '这将帮助我们为您提供更好的个性化体验'
  }
];

/**
 * Get all interview questions (core + optional)
 */
export function getAllInterviewQuestions(): InterviewQuestion[] {
  return [...CORE_QUESTIONS, ...OPTIONAL_QUESTIONS];
}

/**
 * Get core questions only
 */
export function getCoreQuestions(): InterviewQuestion[] {
  return [...CORE_QUESTIONS];
}
