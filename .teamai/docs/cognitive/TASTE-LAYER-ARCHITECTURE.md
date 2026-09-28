# TASTE Layer Architecture Design

**Author:** Developer
**Status:** Design Phase
**Date:** 2026-03-05
**Path Decision:** Path B (Engineer Culture - monorepo)

---

## Overview

TASTE Layer 是 OriginOS 认知架构的核心层，负责：
1. **情境记忆存储** - 存储具身经验的三元组
2. **品味判断固化** - 将人类品味规范化为可操作结构
3. **文化层检测** - 冷启动时快速理解用户认知风格
4. **周期性蒸馏** - 从结构化记忆生成人类可读品味画像

---

## Team Consensus Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Path | Path B (monorepo) | Developer-first, existing infrastructure |
| Database | Native TS graph (MVP) → Neo4j (future) | Low initial cost, future scalability |
| Schema Validation | zod | Native TypeScript support |
| Testing | Vitest | Existing integration |
| Ownership Model | Progressive (Person → Role → Org) | Privacy → Transferability → Organization Asset |

---

## Module Structure

```
src/lib/taste/
├── index.ts                    # Public API exports
├── taste-schema.ts            # Core type definitions (zod schemas)
├── context-memory-db.ts       # Graph database implementation
├── culture-layer-detection.ts # Cold start culture detection
├── taste-distiller.ts         # Periodic distillation to TASTE.md
├── memory-decay.ts            # Memory decay and reinforcement
├── memory-graph.ts            # Simplified graph database (MVP)
├── tastes/
│   └── default-taste.md       # Default taste template
└── __tests__/
    ├── taste-schema.test.ts
    ├── context-memory-db.test.ts
    ├── culture-layer-detection.test.ts
    ├── taste-distiller.test.ts
    └── memory-decay.test.ts
```

---

## 1. TASTE Schema Design

### File: `src/lib/taste/taste-schema.ts`

```typescript
import { z } from 'zod';

// ============================================================================
// Core Zod Schemas
// ============================================================================

/**
 * Taste Context - 情境特征
 * 可复用的组合：domain × task_type × environment
 */
export const TasteContextSchema = z.object({
  context_features: z.object({
    domain: z.string(),
    user_type: z.string(),
    task_type: z.string(),
    environment: z.string(),
    time_context: z.string(),
    risk_level: z.enum(['low', 'medium', 'high']),
  }),
});

/**
 * Taste Judgment - 判断/行动
 */
export const TasteJudgmentSchema = z.object({
  judgment: z.object({
    type: z.enum(['decision', 'preference', 'boundary']),
    action: z.string(),
    rationale: z.string().optional(),
    confidence: z.number().min(0).max(1),
  }),
});

/**
 * Taste Feedback - 结果反馈
 */
export const TasteFeedbackSchema = z.object({
  feedback: z.object({
    outcome: z.enum(['positive', 'negative', 'neutral']),
    effectiveness: z.number().min(0).max(1),
    timestamp: z.string(), // ISO 8601
    iteration: z.number().int(),
    user_confirmation: z.boolean().optional(),
  }),
});

/**
 * Taste Memory - 完整情境记忆三元组
 */
export const TasteMemorySchema = z.object({
  id: z.string(),
  context: TasteContextSchema,
  judgment: TasteJudgmentSchema,
  feedback: TasteFeedbackSchema,
  decay_weight: z.number().min(0).max(1),
  reference_count: z.number().int().min(0),
  ownership: z.enum(['personal', 'role', 'organization']),
  created_at: z.string(),
  updated_at: z.string(),
});

// ============================================================================
// TASTE Profile (Distilled Output)
// ============================================================================

/**
 * 人类可读的品味画像（周期性蒸馏生成）
 */
export const TASTEProfileSchema = z.object({
  version: z.string(),
  generated_at: z.string(),
  summary: z.object({
    experience_topology: z.array(z.string()),
    taste_standards: z.record(z.object({
      positive_vibes: z.array(z.string()),
      negative_vibes: z.array(z.string()),
    })),
    tension_position: z.object({
      control_level: z.number().min(0).max(1),
      trust_level: z.number().min(0).max(1),
      intervention_threshold: z.number().min(0).max(1),
    }),
    symbiosis_boundary: z.object({
      delegated_domains: z.array(z.string()),
      reserved_domains: z.array(z.string()),
      contextual_triggers: z.array(z.string()),
    }),
  }),
  memory_stats: z.object({
    total_memories: z.number().int(),
    high_confidence_count: z.number().int(),
    avg_confidence: z.number().min(0).max(1),
    domains: z.array(z.string()),
  }),
});

// ============================================================================
// Culture Layer Detection (Cold Start)
// ============================================================================

/**
 * 文化层检测结果
 */
export const CultureLayerDetectionSchema = z.object({
  result: z.object({
    communication_style: z.enum([
      'direct-western',
      'indirect-eastern',
      'mixed',
      'ambiguous',
    ]),
    discourse_system: z.enum([
      'technical',
      'humanities',
      'business',
      'mixed',
    ]),
    value_orientation: z.enum([
      'efficiency-first',
      'relationship-first',
      'balanced',
      'conflict',
    ]),
    sensitivity_distribution: z.object({
      topics: z.record(z.string(), z.number().min(0).max(1)),
      depth_preference: z.number().min(0).max(1),
      risk_tolerance: z.number().min(0).max(1),
    }),
  }),
  confidence: z.number().min(0).max(1),
  sample_size: z.number().int(),
});

// ============================================================================
// Ownership Promotion (Progressive Model)
// ============================================================================

/**
 * 归属权提升条件
 */
export interface OwnershipPromotionCriteria {
  min_confidence: number;           // e.g., 0.9
  min_verification_count: number;   // e.g., 10
  min_cross_user_reuse: number;     // e.g., 5
  requires_manual_review: boolean;  // for high-risk operations
}

export const DEFAULT_PROMOTION_CRITERIA: OwnershipPromotionCriteria = {
  min_confidence: 0.9,
  min_verification_count: 10,
  min_cross_user_reuse: 5,
  requires_manual_review: false,
};

// ============================================================================
// Type Exports
// ============================================================================

export type TasteContext = z.infer<typeof TasteContextSchema>;
export type TasteJudgment = z.infer<typeof TasteJudgmentSchema>;
export type TasteFeedback = z.infer<typeof TasteFeedbackSchema>;
export type TasteMemory = z.infer<typeof TasteMemorySchema>;
export type TASTEProfile = z.infer<typeof TASTEProfileSchema>;
export type CultureLayerDetection = z.infer<typeof CultureLayerDetectionSchema>;
```

---

## 2. Context Memory Database

### File: `src/lib/taste/context-memory-db.ts`

```typescript
import { TasteMemory, TasteContext, TASTEProfile } from './taste-schema';
import { MemoryGraph } from './memory-graph';

/**
 * Context Memory Database
 *
 * MVP: Uses native TypeScript graph implementation
 * Future: Can migrate to Neo4j for distributed/scalable needs
 */
export class ContextMemoryDB {
  private graph: MemoryGraph;
  private eventLog: MemoryEvent[] = [];

  /**
   * 写入情境记忆
   *
   * 触发条件（AND）:
   * 1. 发生了决策（不只是信息查询）
   * 2. 结果有明确反馈（显式确认或隐式行为）
   * 3. 情境具有可复用性（这种组合以后还会出现）
   */
  async writeMemory(memory: TasteMemory): Promise<void> {
    // 验证写入条件
    if (!this.shouldWrite(memory)) {
      return;
    }

    // 检查是否已存在相似记忆
    const existing = await this.findSimilar(memory.context);
    if (existing.length > 0) {
      // 更新现有记忆的衰减权重
      await this.updateDecayWeight(existing[0].id, memory.feedback);
      this.logEvent({
        type: 'memory_reinforced',
        memory_id: existing[0].id,
        timestamp: Date.now(),
      });
    } else {
      // 创建新记忆
      await this.graph.addNode(memory);
      await this.graph.addContextRelations(memory);
      this.logEvent({
        type: 'memory_created',
        memory_id: memory.id,
        timestamp: Date.now(),
      });
    }
  }

  /**
   * 检索相关情境记忆
   *
   * 优先级：权重高 + 相关性高 + 最近验证
   */
  async retrieveMemories(
    context: TasteContext,
    options: {
      limit?: number;
      minDecayWeight?: number;
      maxAgeDays?: number;
    } = {}
  ): Promise<TasteMemory[]> {
    const {
      limit = 5,
      minDecayWeight = 0.3,
      maxAgeDays = 90,
    } = options;

    return await this.graph.query(context, {
      minDecayWeight,
      maxAge: `${maxAgeDays}d`,
      limit,
      sortBy: ['decay_weight', 'relevance', 'last_used'],
    });
  }

  /**
   * 周期性蒸馏：生成品味画像
   */
  async distillTasteProfile(): Promise<TASTEProfile> {
    const memories = await this.graph.queryAll({
      minDecayWeight: 0.5, // 只考虑有影响力的记忆
    });

    // 使用 LLM 蒸馏生成人类可读的画像
    const summary = await this.distillViaLLM(memories);

    return {
      version: '1.0.0',
      generated_at: new Date().toISOString(),
      summary,
      memory_stats: this.calculateMemStats(memories),
    };
  }

  /**
   * 归属权评估与提升
   */
  async evaluateOwnershipPromotion(
    memoryId: string,
    criteria: OwnershipPromotionCriteria
  ): Promise<{ shouldPromote: boolean; targetLevel: 'role' | 'organization' }> {
    const memory = await this.graph.getMemory(memoryId);

    const meetsConfidence = memory.decay_weight >= criteria.min_confidence;
    const meetsVerification = memory.reference_count >= criteria.min_verification_count;
    const meetsReuse = await this.getCrossUserReuse(memoryId) >= criteria.min_cross_user_reuse;

    if (meetsConfidence && meetsVerification && meetsReuse) {
      const targetLevel = memory.ownership === 'personal' ? 'role' : 'organization';
      return { shouldPromote: true, targetLevel };
    }

    return { shouldPromote: false, targetLevel: 'role' };
  }

  // ============================================================================
  // Private Methods
  // ============================================================================

  private shouldWrite(memory: TasteMemory): boolean {
    const isDecision = memory.judgment.judgment.type !== 'preference';
    const hasFeedback = memory.feedback.feedback.outcome !== 'neutral';
    const hasReuse = this.isReusableContext(memory.context);

    return isDecision && hasFeedback && hasReuse;
  }

  private isReusableContext(context: TasteContext): boolean {
    // 颗粒度适中：不是太细（具体实例）也不是太粗（通用情境）
    // 示例："前端组件重构" ✅ vs "这次客户说了什么" ❌
    const hasSpecificDomain = context.context_features.domain.length > 0;
    const hasTaskType = context.context_features.task_type.length > 0;
    return hasSpecificDomain && hasTaskType;
  }

  private async findSimilar(context: TasteContext): Promise<TasteMemory[]> {
    return await this.graph.findSimilar(context, { threshold: 0.7, limit: 3 });
  }

  private async updateDecayWeight(
    id: string,
    feedback: TasteFeedback
  ): Promise<void> {
    const current = await this.graph.getMemory(id);
    const feedbackFactor = feedback.feedback.outcome === 'positive' ? 0.1 : -0.05;
    const newWeight = Math.min(1, Math.max(0, current.decay_weight + feedbackFactor));

    await this.graph.updateDecayWeight(id, newWeight);
    await this.graph.incrementReferenceCount(id);
  }

  private async distillViaLLM(memories: TasteMemory[]): Promise<TASTEProfile['summary']> {
    // Implementation: Use Claude API via pi-agent-core
    // This will be integrated with existing agent infrastructure
    return {
      experience_topology: [],
      taste_standards: {},
      tension_position: {
        control_level: 0.5,
        trust_level: 0.5,
        intervention_threshold: 0.7,
      },
      symbiosis_boundary: {
        delegated_domains: [],
        reserved_domains: [],
        contextual_triggers: [],
      },
    };
  }

  private calculateMemStats(memories: TasteMemory[]): TASTEProfile['memory_stats'] {
    const total = memories.length;
    const highConfidence = memories.filter(m => m.decay_weight > 0.8).length;
    const avgConfidence = total > 0
      ? memories.reduce((sum, m) => sum + m.decay_weight, 0) / total
      : 0;
    const domains = [...new Set(memories.map(m => m.context.context_features.domain))];

    return {
      total_memories: total,
      high_confidence_count: highConfidence,
      avg_confidence,
      domains,
    };
  }

  private async getCrossUserReuse(memoryId: string): Promise<number> {
    // Track how many users have referenced this memory pattern
    return await this.graph.getCrossUserReferenceCount(memoryId);
  }

  private logEvent(event: MemoryEvent): void {
    this.eventLog.push(event);
  }
}

interface MemoryEvent {
  type: 'memory_created' | 'memory_reinforced' | 'memory_archived';
  memory_id: string;
  timestamp: number;
}
```

---

## 3. Memory Graph (MVP Implementation)

### File: `src/lib/taste/memory-graph.ts`

```typescript
import { TasteMemory, TasteContext } from './taste-schema';

/**
 * Simplified Graph Database (MVP)
 *
 * Uses native TypeScript data structures:
 * - Map for nodes (O(1) lookup)
 * - Adjacency list for edges (O(1) neighbor access)
 *
 * Future migration path:
 * - Replace with Neo4j / Memgraph when scale requires
 * - Interface remains compatible
 */
export class MemoryGraph {
  private nodes: Map<string, TasteMemory> = new Map();
  private edges: Map<string, Set<string>> = new Map(); // adjacency list
  private contextIndex: Map<string, Set<string>> = new Map();

  /**
   * Add a node (memory) to the graph
   */
  async addNode(memory: TasteMemory): Promise<void> {
    this.nodes.set(memory.id, memory);

    // Index by context
    const contextKey = this.getContextKey(memory.context);
    if (!this.contextIndex.has(contextKey)) {
      this.contextIndex.set(contextKey, new Set());
    }
    this.contextIndex.get(contextKey)!.add(memory.id);
  }

  /**
   * Add context-based relations
   */
  async addContextRelations(memory: TasteMemory): Promise<void> {
    // Find similar contexts and create edges
    const similarIds = await this.findSimilarContexts(memory.context, 0.6);

    if (!this.edges.has(memory.id)) {
      this.edges.set(memory.id, new Set());
    }

    for (const similarId of similarIds) {
      if (similarId !== memory.id) {
        this.edges.get(memory.id)!.add(similarId);

        if (!this.edges.has(similarId)) {
          this.edges.set(similarId, new Set());
        }
        this.edges.get(similarId)!.add(memory.id); // undirected
      }
    }
  }

  /**
   * Query memories with filters
   */
  async query(
    context: TasteContext,
    options: {
      minDecayWeight?: number;
      maxAge?: string;
      limit?: number;
      sortBy?: string[];
    }
  ): Promise<TasteMemory[]> {
    const contextKey = this.getContextKey(context);
    const candidateIds = this.contextIndex.get(contextKey) || new Set();

    let results: TasteMemory[] = [];

    for (const id of candidateIds) {
      const memory = this.nodes.get(id);
      if (!memory) continue;

      // Apply filters
      if (options.minDecayWeight && memory.decay_weight < options.minDecayWeight) {
        continue;
      }

      if (options.maxAge) {
        const days = this.parseAge(options.maxAge);
        if (this.daysSince(memory.updated_at) > days) {
          continue;
        }
      }

      results.push(memory);
    }

    // Sort and limit
    results.sort((a, b) => {
      // Sort by decay weight (desc), then relevance, then last_used
      return b.decay_weight - a.decay_weight;
    });

    return results.slice(0, options.limit);
  }

  /**
   * Query all memories
   */
  async queryAll(options: {
    minDecayWeight?: number;
    maxAge?: string;
  } = {}): Promise<TasteMemory[]> {
    let results = Array.from(this.nodes.values());

    if (options.minDecayWeight) {
      results = results.filter(m => m.decay_weight >= options.minDecayWeight);
    }

    if (options.maxAge) {
      const days = this.parseAge(options.maxAge);
      results = results.filter(m => this.daysSince(m.updated_at) <= days);
    }

    return results;
  }

  /**
   * Find similar memories
   */
  async findSimilar(
    context: TasteContext,
    options: { threshold?: number; limit?: number }
  ): Promise<TasteMemory[]> {
    const contextKey = this.getContextKey(context);
    const candidateIds = this.contextIndex.get(contextKey) || new Set();

    return Array.from(candidateIds)
      .map(id => this.nodes.get(id)!)
      .filter(Boolean)
      .slice(0, options.limit);
  }

  /**
   * Get a specific memory
   */
  async getMemory(id: string): Promise<TasteMemory> {
    const memory = this.nodes.get(id);
    if (!memory) {
      throw new Error(`Memory not found: ${id}`);
    }
    return memory;
  }

  /**
   * Update decay weight
   */
  async updateDecayWeight(id: string, weight: number): Promise<void> {
    const memory = this.nodes.get(id);
    if (!memory) return;

    memory.decay_weight = Math.max(0, Math.min(1, weight));
    memory.updated_at = new Date().toISOString();
  }

  /**
   * Increment reference count
   */
  async incrementReferenceCount(id: string): Promise<void> {
    const memory = this.nodes.get(id);
    if (!memory) return;

    memory.reference_count++;
    memory.updated_at = new Date().toISOString();
  }

  /**
   * Traverse the graph from a starting node
   */
  async traverse(fromId: string, depth: number): Promise<TasteMemory[]> {
    const visited = new Set<string>([fromId]);
    const queue = [[fromId, 0]];
    const results: TasteMemory[] = [];

    while (queue.length > 0) {
      const [nodeId, currentDepth] = queue.shift()!;
      const memory = this.nodes.get(nodeId);

      if (memory) {
        results.push(memory);
      }

      if (currentDepth >= depth) continue;

      const neighbors = this.edges.get(nodeId) || new Set();
      for (const neighborId of neighbors) {
        if (!visited.has(neighborId)) {
          visited.add(neighborId);
          queue.push([neighborId, currentDepth + 1]);
        }
      }
    }

    return results;
  }

  /**
   * Get cross-user reference count
   */
  async getCrossUserReferenceCount(memoryId: string): Promise<number> {
    // MVP: Store simplified cross-user tracking
    // Implementation can be extended with full tracking system
    return 0;
  }

  // ============================================================================
  // Private Helpers
  // ============================================================================

  private getContextKey(context: TasteContext): string {
    const cf = context.context_features;
    return `${cf.domain}:${cf.task_type}:${cf.risk_level}`;
  }

  private async findSimilarContexts(context: TasteContext, threshold: number): Promise<string[]> {
    const targetKey = this.getContextKey(context);
    const results: string[] = [];

    // Simple exact match for MVP
    const matches = this.contextIndex.get(targetKey) || new Set();
    results.push(...Array.from(matches));

    // Future: Implement more sophisticated similarity matching
    // using embedding-based comparison

    return results;
  }

  private parseAge(age: string): number {
    const match = age.match(/^(\d+)d$/);
    return match ? parseInt(match[1], 10) : 90;
  }

  private daysSince(isoDate: string): number {
    const date = new Date(isoDate);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    return Math.floor(diffMs / (1000 * 60 * 60 * 24));
  }

  /**
   * Remove a node (for archiving)
   */
  async removeNode(id: string): Promise<void> {
    this.nodes.delete(id);

    // Remove edges
    const neighbors = this.edges.get(id) || new Set();
    for (const neighborId of neighbors) {
      this.edges.get(neighborId)?.delete(id);
    }
    this.edges.delete(id);

    // Remove from context index
    for (const [key, ids] of this.contextIndex.entries()) {
      ids.delete(id);
      if (ids.size === 0) {
        this.contextIndex.delete(key);
      }
    }
  }
}
```

---

## 4. Culture Layer Detection

### File: `src/lib/taste/culture-layer-detection.ts`

```typescript
import { CultureLayerDetection, CultureLayerDetectionSchema } from './taste-schema';

/**
 * Culture Layer Detection (Cold Start)
 *
 * Quick detection of user's cognitive style during initial interactions.
 * This establishes the initial baseline (品位) before individual taste (品味) emerges.
 */

export class CultureLayerDetector {
  private minSampleSize = 5;
  private sampleBuffer: string[] = [];

  /**
   * Analyze initial conversation to detect culture layer
   */
  async detect(
    initialConversation: string[]
  ): Promise<CultureLayerDetection> {
    if (initialConversation.length < this.minSampleSize) {
      return {
        result: {
          communication_style: 'ambiguous',
          discourse_system: 'mixed',
          value_orientation: 'balanced',
          sensitivity_distribution: {
            topics: {},
            depth_preference: 0.5,
            risk_tolerance: 0.5,
          },
        },
        confidence: 0,
        sample_size: initialConversation.length,
      };
    }

    // Use LLM to analyze conversation
    const analysis = await this.analyzeConversation(initialConversation);

    return {
      result: analysis,
      confidence: this.calculateConfidence(initialConversation.length, this.minSampleSize),
      sample_size: initialConversation.length,
    };
  }

  /**
   * Add sample to buffer for incremental detection
   */
  addSample(text: string): void {
    this.sampleBuffer.push(text);
  }

  /**
   * Get current detection status
   */
  getStatus(): {
    isReady: boolean;
    currentSamples: number;
    requiredSamples: number;
  } {
    return {
      isReady: this.sampleBuffer.length >= this.minSampleSize,
      currentSamples: this.sampleBuffer.length,
      requiredSamples: this.minSampleSize,
    };
  }

  /**
   * Clear buffer
   */
  clear(): void {
    this.sampleBuffer = [];
  }

  // ============================================================================
  // Private Methods
  // ============================================================================

  private async analyzeConversation(
    conversation: string[]
  ): Promise<CultureLayerDetection['result']> {
    // Implementation: Use Claude API via pi-agent-core
    // Prompt template for culture detection

    const prompt = this.buildDetectionPrompt(conversation);
    const response = await this.callLLM(prompt);

    return this.parseDetectionResult(response);
  }

  private buildDetectionPrompt(conversation: string[]): string {
    return `Analyze the following conversation to detect the user's culture layer:

Conversation:
${conversation.join('\n\n')}

Please provide analysis in JSON format:
{
  "communication_style": "direct-western | indirect-eastern | mixed | ambiguous",
  "discourse_system": "technical | humanities | business | mixed",
  "value_orientation": "efficiency-first | relationship-first | balanced | conflict",
  "sensitivity_distribution": {
    "topics": { "topic": sensitivity_score },
    "depth_preference": 0-1,
    "risk_tolerance": 0-1
  }
}

Analysis criteria:
- Communication style: Direct/explicit (western) vs indirect/implicative (eastern)
- Discourse system: Technical jargon vs narrative/explanatory vs business-focused
- Value orientation: Efficiency/speed vs relationship/harmony vs balanced
- Sensitivity: Which topics generate more emotional/invested responses
- Depth preference: Prefers deep analysis vs quick summaries
- Risk tolerance: Comfort level with uncertainty and change`;
  }

  private async callLLM(prompt: string): Promise<string> {
    // Use pi-agent-core's LLM integration
    // This will be implemented with existing agent infrastructure
    return '{}';
  }

  private parseDetectionResult(response: string): CultureLayerDetection['result'] {
    try {
      const parsed = JSON.parse(response);
      return CultureLayerDetectionSchema.parse(parsed);
    } catch (error) {
      // Fallback to defaults if parsing fails
      return {
        communication_style: 'ambiguous',
        discourse_system: 'mixed',
        value_orientation: 'balanced',
        sensitivity_distribution: {
          topics: {},
          depth_preference: 0.5,
          risk_tolerance: 0.5,
        },
      };
    }
  }

  private calculateConfidence(currentSize: number, minSize: number): number {
    if (currentSize < minSize) return 0;
    // Confidence increases with sample size, caps at 0.9
    return Math.min(0.9, 0.5 + (currentSize - minSize) * 0.05);
  }
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Create a culture detector instance
 */
export function createCultureDetector(): CultureLayerDetector {
  return new CultureLayerDetector();
}

/**
 * Detect culture layer from a single interaction
 * (for real-time, low-latency detection)
 */
export async function quickDetect(
  singleInteraction: string
): Promise<Partial<CultureLayerDetection['result']>> {
  // Lightweight detection using sentiment/structure analysis
  // without LLM call for faster feedback

  const words = singleInteraction.split(/\s+/);
  const avgWordLength = words.reduce((sum, w) => sum + w.length, 0) / words.length;
  const hasQuestionMarks = singleInteraction.includes('?');
  const hasEmojis = /[\u{1F600}-\u{64FFF}]/u.test(singleInteraction);

  return {
    communication_style: avgWordLength > 5 ? 'direct-western' : 'indirect-eastern',
    // Other fields require more context
  };
}
```

---

## 5. Taste Distiller

### File: `src/lib/taste/taste-distiller.ts`

```typescript
import { TASTEProfile, TasteMemory } from './taste-schema';
import { ContextMemoryDB } from './context-memory-db';

/**
 * Taste Periodic Distillation
 *
 * Converts structured memory database into human-readable TASTE.md
 * This creates the "curvature" of the taste manifold
 */
export class TasteDistiller {
  private db: ContextMemoryDB;
  private outputPath: string;
  private schedule: 'weekly' | 'biweekly' | 'monthly' = 'weekly';

  constructor(db: ContextMemoryDB, outputPath: string) {
    this.db = db;
    this.outputPath = outputPath;
  }

  /**
   * Execute distillation cycle
   */
  async distill(): Promise<TASTEProfile> {
    console.log('[TasteDistiller] Starting distillation cycle...');

    // 1. Retrieve influential memories
    const memories = await this.db.queryAll({ minDecayWeight: 0.5 });

    console.log(`[TasteDistiller] Processing ${memories.length} memories...`);

    // 2. Use LLM to distill into profile
    const profile = await this.generateProfile(memories);

    // 3. Write to TASTE.md
    await this.writeToTasteMD(profile);

    // 4. Update agent system prompt
    await this.updateAgentPrompt(profile);

    return profile;
  }

  /**
   * Update distillation schedule
   */
  setSchedule(schedule: 'weekly' | 'biweekly' | 'monthly'): void {
    this.schedule = schedule;
  }

  /**
   * Get next scheduled time
   */
  getNextScheduleTime(): Date {
    const now = new Date();
    const days = {
      weekly: 7,
      biweekly: 14,
      monthly: 30,
    };

    now.setDate(now.getDate() + days[this.schedule]);
    now.setHours(0, 0, 0, 0);
    return now;
  }

  // ============================================================================
  // Private Methods
  // ============================================================================

  private async generateProfile(memories: TasteMemory[]): Promise<TASTEProfile> {
    const prompt = this.buildDistillationPrompt(memories);

    // Use Claude API (via pi-agent-core)
    const response = await this.callLLM(prompt);

    return this.parseProfile(response, memories);
  }

  private buildDistillationPrompt(memories: TasteMemory[]): string {
    return `You are a taste analyst. Extract the user's taste profile from the following situational memories.

Situational Memories (JSON):
${JSON.stringify(memories.slice(0, 20), null, 2)}

(Note: Showing first 20 memories for brevity)

Please generate a taste profile in this JSON format:
{
  "summary": {
    "experience_topology": [
      "Domain where user has embodied judgment",
      "Another domain"
    ],
    "taste_standards": {
      "domain_name": {
        "positive_vibes": [
          "What feels right in this domain",
          "Another positive vibe"
        ],
        "negative_vibes": [
          "What feels distorted in this domain",
          "Another negative vibe"
        ]
      }
    },
    "tension_position": {
      "control_level": 0-1,
      "trust_level": 0-1,
      "intervention_threshold": 0-1
    },
    "symbiosis_boundary": {
      "delegated_domains": [
        "Tasks user trusts agent to handle"
      ],
      "reserved_domains": [
        "Tasks user insists on handling personally"
      ],
      "contextual_triggers": [
        "Situations requiring human intervention"
      ]
    }
  }
}

Analysis guidelines:
1. Experience topology: Identify domains where user has consistent judgment patterns
2. Taste standards: Extract patterns of "right" vs "wrong" feelings without over-analyzing rationale
3. Tension position: Infer control/trust preferences from confidence levels and intervention patterns
4. Symbiosis boundary: Distinguish tasks user consistently delegates vs reserves for themselves

Remember: Taste is embodied intuition, not explicit reasoning. Focus on "what feels right/wrong"`;
  }

  private async callLLM(prompt: string): Promise<string> {
    // Integrate with pi-agent-core's agent system
    // For now, return mock response
    return '{}';
  }

  private parseProfile(
    response: string,
    memories: TasteMemory[]
  ): TASTEProfile {
    try {
      const parsed = JSON.parse(response);
      return TASTEProfileSchema.parse({
        ...parsed,
        version: '1.0.0',
        generated_at: new Date().toISOString(),
        memory_stats: this.calculateStats(memories),
      });
    } catch (error) {
      // Fallback: Generate default profile
      return this.generateDefaultProfile(memories);
    }
  }

  private generateDefaultProfile(memories: TasteMemory[]): TASTEProfile {
    const domains = [...new Set(memories.map(m => m.context.context_features.domain))];

    return {
      version: '1.0.0',
      generated_at: new Date().toISOString(),
      summary: {
        experience_topology: domains,
        taste_standards: {},
        tension_position: {
          control_level: 0.5,
          trust_level: 0.5,
          intervention_threshold: 0.7,
        },
        symbiosis_boundary: {
          delegated_domains: [],
          reserved_domains: [],
          contextual_triggers: [],
        },
      },
      memory_stats: this.calculateStats(memories),
    };
  }

  private calculateStats(memories: TasteMemory[]): TASTEProfile['memory_stats'] {
    const total = memories.length;
    const highConfidence = memories.filter(m => m.decay_weight > 0.8).length;
    const avgConfidence = total > 0
      ? memories.reduce((sum, m) => sum + m.decay_weight, 0) / total
      : 0;
    const domains = [...new Set(memories.map(m => m.context.context_features.domain))];

    return {
      total_memories: total,
      high_confidence_count: highConfidence,
      avg_confidence: avgConfidence,
      domains,
    };
  }

  private async writeToTasteMD(profile: TASTEProfile): Promise<void> {
    const markdown = this.formatAsTasteMD(profile);

    // Write to file system
    // Implementation uses Node.js fs module
  }

  private formatAsTasteMD(profile: TASTEProfile): string {
    `# TASTE: Human-Agent Symbiosis Layer

Generated: ${new Date(profile.generated_at).toLocaleString()}

## Experience Topology
${profile.summary.experience_topology.map(d => `- **${d}**: ${d}`).join('\n')}

## Taste Standards
${Object.entries(profile.summary.taste_standards).map(([domain, standards]) => `
### ${domain}
**What feels right:**
${standards.positive_vibes.map(v => `- ${v}`).join('\n')}

**What feels wrong:**
${standards.negative_vibes.map(v => `- ${v}`).join('\n')}
`).join('\n')}

## Tension Position
- Control Level: ${(profile.summary.tension_position.control_level * 100).toFixed(0)}%
- Trust Level: ${(profile.summary.tension_position.trust_level * 100).toFixed(0)}%
- Intervention Threshold: ${(profile.summary.tension_position.intervention_threshold * 100).toFixed(0)}%

## Symbiosis Boundary
### Delegated Domains (agent handles)
${profile.summary.symbiosis_boundary.delegated_domains.map(d => `- ${d}`).join('\n')}

### Reserved Domains (human handles)
${profile.summary.symbiosis_boundary.reserved_domains.map(d => `- ${d}`).join('\n')}

### Contextual Triggers (requires human)
${profile.summary.symbiosis_boundary.contextual_triggers.map(t => `- ${t}`).join('\n')}

---
Last updated: ${profile.generated_at}`;
  }

  private async updateAgentPrompt(profile: TASTEProfile): Promise<void> {
    // Inject taste profile into agent system prompt
    // This reinforces the "curvature" for agent behavior
  }
}

// Type imports
import { TASTEProfileSchema } from './taste-schema';
```

---

## 6. Public API Exports

### File: `src/lib/taste/index.ts`

```typescript
// Core types
export * from './taste-schema';

// Database
export { ContextMemoryDB } from './context-memory-db';

// Graph
export { MemoryGraph } from './memory-graph';

// Culture detection
export {
  CultureLayerDetector,
  createCultureDetector,
  quickDetect,
} from './culture-layer-detection';

// Distillation
export { TasteDistiller } from './taste-distiller';
```

---

## Implementation Priority

| Module | Priority | Phase | Dependencies |
|--------|----------|-------|--------------|
| `taste-schema.ts` | P0 | Phase 1 | None |
| `memory-graph.ts` | P0 | Phase 1 | `taste-schema.ts` |
| `context-memory-db.ts` | P0 | Phase 1 | `memory-graph.ts` |
| `culture-layer-detection.ts` | P0 | Phase 1 | `taste-schema.ts` |
| `taste-distiller.ts` | P1 | Phase 2 | `context-memory-db.ts` |
| `memory-decay.ts` | P2 | Phase 3 | `context-memory-db.ts` |

---

## Testing Strategy

```typescript
// src/lib/taste/__tests__/taste-schema.test.ts
// - Zod schema validation tests
// - Type guard tests

// src/lib/taste/__tests__/memory-graph.test.ts
// - Node CRUD operations
// - Edge creation and traversal
// - Similarity queries
// - Decay weight updates

// src/lib/taste/__tests__/context-memory-db.test.ts
// - Write conditions (decision + feedback + reusability)
// - Retrieve with filters
// - Similar memory merging
// - Profile distillation

// src/lib/taste/__tests__/culture-layer-detection.test.ts
// - Conversation analysis
// - Incremental detection
// - Confidence calculation

// src/lib/taste/__tests__/taste-distiller.test.ts
// - Profile generation
// - TASTE.md formatting
// - System prompt injection
```

---

## Future Considerations

1. **Database Migration Path**
   - MVP: MemoryGraph (native TS)
   - Phase 2: Consider Neo4j for distributed deployment
   - Interface abstraction ensures minimal code changes

2. **Cross-User Taste Sharing**
   - Role-level ownership model
   - Permission controls for taste inheritance
   - Anonymization for privacy

3. **Taste Evolution Tracking**
   - Versioning of TASTE.md
   - Diff visualization for taste changes
   - Rollback capabilities

4. **Integration with Agent System**
   - TASTE profile as system prompt component
   - Real-time taste feedback loop
   - Agent behavior adaptation based on taste alignment

---

**Document Status:** Complete - Ready for Implementation Review
