import type { CanonicalSkillContract } from "./ontology-contract";
/**
 * Skill System Types for pi-agent-core
 *
 * Defines the types for the composite skill system that allows
 * skills to orchestrate other skills and communicate with each other.
 */

/**
 * Skill type enum
 */
export enum SkillType {
  SIMPLE = 'simple',       // Single-purpose skill
  COMPOSITE = 'composite', // Skill that orchestrates other skills
}

/**
 * Skill 级输入/输出契约（复用 solution.ts 定义）
 */
import type { SkillInputContract, SkillOutputContract } from './solution';

/**
 * Skill metadata interface
 */
export interface SkillMetadata {
  /** Exact semantic declaration; validated only at the publishing boundary. */
  contract?: CanonicalSkillContract;
  /** Unique skill identifier */
  name: string;
  /** Display name */
  displayName?: string;
  /** Human-readable description */
  description: string;
  /** Skill type */
  type: SkillType;
  /** Version */
  version: string;
  /** Priority level for routing */
  priority?: 'low' | 'medium' | 'high' | 'critical';
  /** Other skills this skill depends on */
  dependencies?: string[];
  /** Ontology types this skill reads (legacy, use inputContract) */
  reads?: string[];
  /** Ontology types this skill writes (legacy, use outputContract) */
  writes?: string[];
  /** Input contract — what ontology data this skill expects */
  inputContract?: SkillInputContract;
  /** Output contract — what ontology data this skill produces */
  outputContract?: SkillOutputContract;
  /** Precondition checks */
  preconditions?: string[];
  /** Postcondition guarantees */
  postconditions?: string[];
}

/**
 * Loaded skill with handler function
 */
export interface LoadedSkill {
  metadata: SkillMetadata;
  handler: (context: SkillContext) => Promise<SkillResult>;
}

/**
 * Execution context for a skill
 */
export interface SkillContext {
  /** Session ID */
  sessionId: string;
  /** Agent session data */
  session: {
    projectContext: {
      projectId: string;
      projectName: string;
      [key: string]: unknown;
    };
    messages: unknown[];
    [key: string]: unknown;
  };
  /** User input */
  input: {
    message?: string;
    data?: Record<string, unknown>;
  };
  /** Tool calls that can be made */
  tools: SkillTools;
  /** Configuration options */
  config?: Record<string, unknown>;
  /** Skill context data */
  skillData?: Record<string, unknown>;
}

/**
 * Tools available to skills
 */
export interface SkillTools {
  /**
   * Create ontology entity
   */
  createEntity?: (type: string, properties: Record<string, unknown>) => Promise<unknown>;

  /**
   * Update ontology entity
   */
  updateEntity?: (entityId: string, properties: Record<string, unknown>) => Promise<unknown>;

  /**
   * Create relation between entities
   */
  createRelation?: (fromId: string, relType: string, toId: string, properties?: Record<string, unknown>) => Promise<unknown>;

  /**
   * Query ontology entities
   */
  queryEntities?: (type: string, where: Record<string, unknown>) => Promise<unknown[]>;

  /**
   * Get related entities
   */
  getRelated?: (entityId: string, relType: string, direction?: 'outgoing' | 'incoming' | 'both') => Promise<unknown[]>;

  /**
   * Call another skill
   */
  callSkill?: (skillName: string, input: unknown) => Promise<SkillResult>;
}

/**
 * Result from skill execution
 */
export interface SkillResult {
  /** Whether the skill completed successfully */
  success: boolean;
  /** Response message/content */
  message?: string;
  /** Data output from the skill */
  data?: unknown;
  /** Entities created by the skill */
  entitiesCreated?: unknown[];
  /** Relations created by the skill */
  relationsCreated?: unknown[];
  /** Error details if failed */
  error?: {
    code: string;
    message: string;
    details?: unknown;
  };
  /** Next phase to transition to (for multi-step skills) */
  nextPhase?: string;
  /** Whether the skill execution is complete */
  complete?: boolean;
}

/**
 * Skill registry for managing loaded skills
 */
export interface SkillRegistry {
  /** Get a skill by name */
  get(skillName: string): LoadedSkill | undefined;
  /** Register a skill */
  register(skill: LoadedSkill): void;
  /** Unregister a skill */
  unregister(skillName: string): void;
  /** List all registered skills */
  list(): LoadedSkill[];
  /** Check if a skill is registered */
  has(skillName: string): boolean;
}

/**
 * Skill router for determining which skill to use
 */
export interface SkillRouter {
  /** Route a request to the appropriate skill */
  route(request: SkillRoutingRequest): Promise<LoadedSkill | null>;

  /** Register a routing rule */
  registerRule(rule: SkillRoutingRule): void;
}

/**
 * Request for skill routing
 */
export interface SkillRoutingRequest {
  /** Agent type to use */
  agentType?: string;
  /** User intent (optional) */
  intent?: string;
  /** Input message */
  message?: string;
  /** Current context */
  context?: {
    sessionId: string;
    phase?: string;
    [key: string]: unknown;
  };
}

/**
 * Routing rule for skill selection
 */
export interface SkillRoutingRule {
  /** Condition to match */
  condition: (request: SkillRoutingRequest) => boolean;
  /** Skill name to route to when condition matches */
  skillName: string;
  /** Priority (higher = matched first) */
  priority?: number;
}

/**
 * Tool call result from agent execution
 */
export interface ToolCallResult {
  toolCallId: string;
  result: unknown;
  success: boolean;
  error?: string;
}

/**
 * Agent execution result with tool results
 */
export interface AgentExecutionResult {
  success: boolean;
  message?: string;
  content?: string;
  toolResults?: ToolCallResult[];
  nextPhase?: string;
  complete?: boolean;
  metadata?: Record<string, unknown>;
}

// ============================================================================
// Re-export ontology types for convenience
// ============================================================================

// These should match the types in @/types/ontology
export interface OntologyEntity {
  id: string;
  type: string;
  properties: Record<string, unknown>;
  created: string;
  updated: string;
}

export interface OntologyRelation {
  from: string;
  rel: string;
  to: string;
  properties?: Record<string, unknown>;
}
