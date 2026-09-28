# Two-Layer TASTE Architecture - Phase 1.5 Implementation Spec

**Version:** 1.1.0
**Author:** System Architect (CTO)
**Date:** 2026-03-16
**Status:** Ready for Implementation

---

## Executive Summary

This document provides the technical implementation specification for the Two-Layer TASTE system, addressing the four key challenges identified:

1. **数据结构** - Schema design for two-layer TASTE profiles
2. **pi-agent 集成** - Context-aware TASTE loading and merging
3. **演进机制** - Background evolution trigger conditions
4. **Phase 1.5** - Project-dimension TASTE implementation

---

## 1. Architecture Decision Record (ADR)

### ADR-001: Delegated Domains Merge Strategy

**Status:** Accepted
**Decision:** Use **intersection** for delegated_domains

**Rationale:**
- Safety-first: Only delegate tasks that BOTH user AND project agree on
- Principle of least surprise: User won't experience unexpected AI behavior in project context
- Aligns with "reserved domains union" (conservative approach)

**Implementation:**
```typescript
// src/types/taste.ts - Line 513-516
// BEFORE (Union - Less Safe):
delegated_domains: [
  ...new Set([
    ...userTASTE.symbiosis_boundary.delegated_domains,
    ...projectTASTE.symbiosis_boundary.delegated_domains,
  ]),
],

// AFTER (Intersection - Safer):
delegated_domains: userTASTE.symbiosis_boundary.delegated_domains.filter(
  d => projectTASTE.symbiosis_boundary.delegated_domains.includes(d)
),
```

### ADR-002: Evolution Trigger Conditions

**Status:** Accepted
**Decision:** Time-based + Signal-based hybrid approach

**Conditions:**
| Condition | Threshold | Action |
|-----------|-----------|--------|
| Min time since last evolution | 7 days | Required |
| New domains detected | ≥ 2 | Trigger |
| Preference shifts | ≥ 3 signals | Trigger |
| Trust level change | Δ ≥ 0.2 | Trigger |
| Accumulated interactions | ≥ 50 | Trigger |

### ADR-003: Cache Strategy

**Status:** Accepted
**Decision:** In-memory Map with TTL-based expiration

**Configuration:**
```typescript
const CACHE_CONFIG = {
  defaultTTL: 30 * 60 * 1000, // 30 minutes
  maxEntries: 100,            // Per user
  evictionPolicy: 'lru',      // Least Recently Used
};
```

### ADR-004: Storage Format

**Status:** Accepted
**Decision:** File-based JSON with atomic writes

**Rationale:**
- Simple to implement and debug
- Git-friendly for version control
- Easy backup and restore
- Sufficient for MVP scale

---

## 2. Implementation Tasks (Phase 1.5)

### Phase 1.5.1: Core Services (Priority: P0)

#### Task 1: Update Merge Function

**File:** `src/types/taste.ts`
**Change:** Update `mergeTASTEProfiles` function

```typescript
/**
 * Merge User TASTE and Project TASTE profiles
 * Project TASTE takes precedence for domain-specific preferences
 *
 * CRITICAL: Uses INTERSECTION for delegated_domains (safety)
 */
export function mergeTASTEProfiles(
  userTASTE: TASTEProfile,
  projectTASTE: TASTEProfile
): TASTEProfile {
  const now = new Date().toISOString();

  return {
    version: '1.0.0',
    id: `merged-${Date.now()}`,
    userId: userTASTE.userId,
    projectId: projectTASTE.projectId,
    createdAt: now,
    updatedAt: now,

    // Experience topology: merge and deduplicate
    experience_topology: [
      ...new Set([
        ...userTASTE.experience_topology,
        ...projectTASTE.experience_topology,
      ]),
    ],

    // Taste standards: Project overrides User for same domain
    taste_standards: {
      ...userTASTE.taste_standards,
      ...projectTASTE.taste_standards,
    },

    // Tension position: weighted average (Project 0.7, User 0.3)
    tension_position: {
      control_level:
        userTASTE.tension_position.control_level * 0.3 +
        projectTASTE.tension_position.control_level * 0.7,
      trust_level:
        userTASTE.tension_position.trust_level * 0.3 +
        projectTASTE.tension_position.trust_level * 0.7,
      intervention_threshold: projectTASTE.tension_position.intervention_threshold,
    },

    // Symbiosis boundary: INTERSECTION for delegated, UNION for reserved
    symbiosis_boundary: {
      // CRITICAL: Use intersection for safety
      delegated_domains: userTASTE.symbiosis_boundary.delegated_domains.filter(
        d => projectTASTE.symbiosis_boundary.delegated_domains.includes(d)
      ),
      // CONSERVATIVE: Reserve what EITHER wants reserved
      reserved_domains: [
        ...new Set([
          ...userTASTE.symbiosis_boundary.reserved_domains,
          ...projectTASTE.symbiosis_boundary.reserved_domains,
        ]),
      ],
      contextual_triggers: [
        ...new Set([
          ...userTASTE.symbiosis_boundary.contextual_triggers,
          ...projectTASTE.symbiosis_boundary.contextual_triggers,
        ]),
      ],
    },

    metadata: {
      source: 'merged',
      confidence: Math.max(
        userTASTE.metadata.confidence,
        projectTASTE.metadata.confidence
      ),
      evolution_count:
        userTASTE.metadata.evolution_count + projectTASTE.metadata.evolution_count,
      last_analysis_at: now,
    },

    memory_stats: {
      total_memories:
        (userTASTE.memory_stats?.total_memories ?? 0) +
        (projectTASTE.memory_stats?.total_memories ?? 0),
      high_confidence_count:
        (userTASTE.memory_stats?.high_confidence_count ?? 0) +
        (projectTASTE.memory_stats?.high_confidence_count ?? 0),
      avg_confidence:
        ((userTASTE.memory_stats?.avg_confidence ?? 0) +
          (projectTASTE.memory_stats?.avg_confidence ?? 0)) /
        2,
      domains: [
        ...new Set([
          ...(userTASTE.memory_stats?.domains ?? []),
          ...(projectTASTE.memory_stats?.domains ?? []),
        ]),
      ],
    },
  };
}
```

#### Task 2: Create TasteMergeService

**File:** `src/lib/taste/services/TasteMergeService.ts` (NEW)

```typescript
/**
 * TasteMergeService
 *
 * Handles merging of User and Project TASTE profiles with configurable strategies.
 */
import type { TASTEProfile } from '@/types/taste';
import { mergeTASTEProfiles } from '@/types/taste';

export interface TASTEMergeConfig {
  experience_topology: {
    strategy: 'merge';
  };
  taste_standards: {
    strategy: 'project_priority';
  };
  tension_position: {
    strategy: 'weighted_average';
    weights: { user: number; project: number };
  };
  symbiosis_boundary: {
    delegated_domains: 'intersection' | 'union';
    reserved_domains: 'intersection' | 'union';
    contextual_triggers: 'merge';
  };
}

const DEFAULT_MERGE_CONFIG: TASTEMergeConfig = {
  experience_topology: { strategy: 'merge' },
  taste_standards: { strategy: 'project_priority' },
  tension_position: {
    strategy: 'weighted_average',
    weights: { user: 0.3, project: 0.7 },
  },
  symbiosis_boundary: {
    delegated_domains: 'intersection',
    reserved_domains: 'union',
    contextual_triggers: 'merge',
  },
};

export class TasteMergeService {
  private config: TASTEMergeConfig;

  constructor(config: Partial<TASTEMergeConfig> = {}) {
    this.config = { ...DEFAULT_MERGE_CONFIG, ...config };
  }

  /**
   * Merge User and Project TASTE profiles
   */
  merge(user: TASTEProfile, project: TASTEProfile | null): TASTEProfile {
    if (!project) {
      return user;
    }

    return mergeTASTEProfiles(user, project);
  }

  /**
   * Validate merge result
   */
  validateMergeResult(merged: TASTEProfile): boolean {
    // Validate required fields
    if (!merged.version || !merged.id || !merged.userId) {
      return false;
    }

    // Validate metadata
    if (merged.metadata.source !== 'merged') {
      return false;
    }

    // Validate tension position values
    const { control_level, trust_level, intervention_threshold } =
      merged.tension_position;
    if (
      control_level < 0 ||
      control_level > 1 ||
      trust_level < 0 ||
      trust_level > 1 ||
      intervention_threshold < 0 ||
      intervention_threshold > 1
    ) {
      return false;
    }

    return true;
  }
}

export const tasteMergeService = new TasteMergeService();
```

#### Task 3: Create TasteStorageService

**File:** `src/lib/taste/services/TasteStorageService.ts` (NEW)

```typescript
/**
 * TasteStorageService
 *
 * Handles file-based storage of TASTE profiles with atomic writes and history tracking.
 */
import { promises as fs } from 'fs';
import path from 'path';
import type { TASTEProfile } from '@/types/taste';
import { TASTEProfileSchema } from '@/types/taste';

export class TasteStorageService {
  private baseDir: string;

  constructor(baseDir: string = 'data/taste') {
    this.baseDir = baseDir;
  }

  /**
   * Get User TASTE file path
   */
  getUserTASTEPath(userId: string): string {
    return path.join(this.baseDir, 'users', userId, 'profile.json');
  }

  /**
   * Get Project TASTE file path
   */
  getProjectTASTEPath(projectId: string): string {
    return path.join(this.baseDir, 'projects', projectId, 'profile.json');
  }

  /**
   * Check if file exists
   */
  async exists(filePath: string): Promise<boolean> {
    try {
      await fs.access(filePath);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Read TASTE profile from file
   */
  async read(filePath: string): Promise<TASTEProfile> {
    const content = await fs.readFile(filePath, 'utf-8');
    const parsed = JSON.parse(content);
    return TASTEProfileSchema.parse(parsed);
  }

  /**
   * Write TASTE profile to file (atomic)
   */
  async write(filePath: string, profile: TASTEProfile): Promise<void> {
    const dir = path.dirname(filePath);
    await fs.mkdir(dir, { recursive: true });

    // Atomic write: temp file + rename
    const tempPath = `${filePath}.tmp`;
    await fs.writeFile(tempPath, JSON.stringify(profile, null, 2), 'utf-8');
    await fs.rename(tempPath, filePath);

    // Save to history
    await this.saveToHistory(filePath, profile);
  }

  /**
   * Save profile to history
   */
  private async saveToHistory(
    profilePath: string,
    profile: TASTEProfile
  ): Promise<void> {
    const historyDir = path.join(path.dirname(profilePath), 'history');
    await fs.mkdir(historyDir, { recursive: true });

    const historyPath = path.join(historyDir, `${Date.now()}.json`);
    await fs.writeFile(historyPath, JSON.stringify(profile, null, 2), 'utf-8');
  }

  /**
   * Save User TASTE
   */
  async saveUserTASTE(userId: string, profile: TASTEProfile): Promise<void> {
    const filePath = this.getUserTASTEPath(userId);
    const updatedProfile: TASTEProfile = {
      ...profile,
      userId,
      projectId: undefined,
      metadata: {
        ...profile.metadata,
        source: 'user',
        last_analysis_at: new Date().toISOString(),
      },
      updatedAt: new Date().toISOString(),
    };
    await this.write(filePath, updatedProfile);
  }

  /**
   * Save Project TASTE
   */
  async saveProjectTASTE(projectId: string, profile: TASTEProfile): Promise<void> {
    const filePath = this.getProjectTASTEPath(projectId);
    const updatedProfile: TASTEProfile = {
      ...profile,
      userId: undefined,
      projectId,
      metadata: {
        ...profile.metadata,
        source: 'project',
        last_analysis_at: new Date().toISOString(),
      },
      updatedAt: new Date().toISOString(),
    };
    await this.write(filePath, updatedProfile);
  }

  /**
   * Get history for a profile
   */
  async getHistory(
    type: 'user' | 'project',
    id: string,
    limit: number = 10
  ): Promise<TASTEProfile[]> {
    const baseDir =
      type === 'user'
        ? path.join(this.baseDir, 'users', id, 'history')
        : path.join(this.baseDir, 'projects', id, 'history');

    if (!(await this.exists(baseDir))) {
      return [];
    }

    const files = await fs.readdir(baseDir);
    const sortedFiles = files
      .filter(f => f.endsWith('.json'))
      .sort((a, b) => b.localeCompare(a))
      .slice(0, limit);

    const profiles: TASTEProfile[] = [];
    for (const file of sortedFiles) {
      const content = await fs.readFile(path.join(baseDir, file), 'utf-8');
      profiles.push(JSON.parse(content));
    }

    return profiles;
  }
}

export const tasteStorageService = new TasteStorageService();
```

#### Task 4: Create TasteCacheManager

**File:** `src/lib/taste/services/TasteCacheManager.ts` (NEW)

```typescript
/**
 * TasteCacheManager
 *
 * In-memory cache for TASTE profiles with TTL-based expiration.
 */
import type { TASTEProfile } from '@/types/taste';

export interface CacheEntry {
  profile: TASTEProfile;
  timestamp: number;
}

export class TasteCacheManager {
  private cache: Map<string, CacheEntry> = new Map();
  private ttl: number;
  private maxEntries: number;

  constructor(options?: { ttl?: number; maxEntries?: number }) {
    this.ttl = options?.ttl ?? 30 * 60 * 1000; // 30 minutes default
    this.maxEntries = options?.maxEntries ?? 100;
  }

  /**
   * Generate cache key
   */
  private getKey(userId: string, projectId?: string): string {
    return projectId ? `${userId}:${projectId}` : `user:${userId}`;
  }

  /**
   * Get cached profile
   */
  get(userId: string, projectId?: string): TASTEProfile | null {
    const key = this.getKey(userId, projectId);
    const entry = this.cache.get(key);

    if (!entry) {
      return null;
    }

    // Check TTL
    if (Date.now() - entry.timestamp > this.ttl) {
      this.cache.delete(key);
      return null;
    }

    return entry.profile;
  }

  /**
   * Set cached profile
   */
  set(userId: string, projectId: string | undefined, profile: TASTEProfile): void {
    const key = this.getKey(userId, projectId);

    // Evict oldest if at capacity
    if (this.cache.size >= this.maxEntries) {
      const oldestKey = this.cache.keys().next().value;
      if (oldestKey) {
        this.cache.delete(oldestKey);
      }
    }

    this.cache.set(key, {
      profile,
      timestamp: Date.now(),
    });
  }

  /**
   * Delete cached profile
   */
  delete(userId: string, projectId?: string): boolean {
    const key = this.getKey(userId, projectId);
    return this.cache.delete(key);
  }

  /**
   * Clear all cache for a user
   */
  clearUser(userId: string): void {
    for (const key of this.cache.keys()) {
      if (key.startsWith(`${userId}:`) || key === `user:${userId}`) {
        this.cache.delete(key);
      }
    }
  }

  /**
   * Clear all cache
   */
  clear(): void {
    this.cache.clear();
  }

  /**
   * Get cache statistics
   */
  getStats(): {
    size: number;
    maxEntries: number;
    ttl: number;
    entries: Array<{ key: string; age: number }>;
  } {
    const now = Date.now();
    return {
      size: this.cache.size,
      maxEntries: this.maxEntries,
      ttl: this.ttl,
      entries: Array.from(this.cache.entries()).map(([key, entry]) => ({
        key,
        age: now - entry.timestamp,
      })),
    };
  }
}

export const tasteCacheManager = new TasteCacheManager();
```

#### Task 5: Update TasteLoader

**File:** `src/lib/taste/taste-loader.ts` (UPDATE)

The existing `TasteLoader` class should be updated to use the new services:

```typescript
// Add imports
import { tasteStorageService } from './services/TasteStorageService';
import { tasteMergeService } from './services/TasteMergeService';
import { tasteCacheManager } from './services/TasteCacheManager';

// Update loadTASTE method to use services
async loadTASTE(context: {
  userId: string;
  projectId?: string;
}): Promise<TASTEProfile | null> {
  const { userId, projectId } = context;

  // Check cache first
  const cached = tasteCacheManager.get(userId, projectId);
  if (cached) {
    return cached;
  }

  // Load User TASTE
  const userTASTE = await this.loadUserTASTE(userId);

  // If no projectId, return User TASTE directly
  if (!projectId) {
    return userTASTE;
  }

  // Load Project TASTE
  const projectTASTE = await this.loadProjectTASTE(projectId);

  // If no Project TASTE, return User TASTE directly
  if (!projectTASTE) {
    return userTASTE;
  }

  // If no User TASTE but Project TASTE exists, return Project TASTE
  if (!userTASTE) {
    return projectTASTE;
  }

  // Merge User and Project TASTE
  const merged = tasteMergeService.merge(userTASTE, projectTASTE);

  // Cache result
  tasteCacheManager.set(userId, projectId, merged);

  return merged;
}
```

---

## 3. pi-agent Integration

### 3.1 TasteContextBuilder Service

**File:** `src/lib/taste/context/TasteContextBuilder.ts` (NEW)

```typescript
/**
 * TasteContextBuilder
 *
 * Builds agent context from TASTE profiles for pi-agent integration.
 */
import type { TASTEProfile } from '@/types/taste';
import { getTasteLoader } from '../taste-loader';

export interface AgentContext {
  taste: TASTEProfile;
  userId: string;
  projectId?: string;
  systemPrompt: string;
}

export class TasteContextBuilder {
  /**
   * Build agent context with TASTE
   */
  async buildContext(params: {
    userId: string;
    projectId?: string;
  }): Promise<AgentContext> {
    const loader = getTasteLoader();
    const taste = await loader.loadTASTE(params);

    // If no TASTE found, create default
    const profile = taste ?? this.createDefaultProfile(params.userId);

    return {
      taste: profile,
      userId: params.userId,
      projectId: params.projectId,
      systemPrompt: this.buildSystemPrompt(profile, params.projectId),
    };
  }

  /**
   * Build system prompt from TASTE profile
   */
  private buildSystemPrompt(taste: TASTEProfile, projectId?: string): string {
    const sections: string[] = [];

    // Header
    sections.push(`# 用户品味档案`);
    if (projectId) {
      sections.push(`_当前项目上下文已加载，品味偏好已根据项目环境调整。_`);
    }
    sections.push('');

    // Experience Topology
    if (taste.experience_topology.length > 0) {
      sections.push(`## 经验领域`);
      sections.push(taste.experience_topology.map(d => `- ${d}`).join('\n'));
      sections.push('');
    }

    // Taste Standards
    if (Object.keys(taste.taste_standards).length > 0) {
      sections.push(`## 品味标准`);
      for (const [domain, std] of Object.entries(taste.taste_standards)) {
        sections.push(`### ${domain}`);
        if (std.positive_vibes.length > 0) {
          sections.push(`✓ ${std.positive_vibes.join('、')}`);
        }
        if (std.negative_vibes.length > 0) {
          sections.push(`✗ ${std.negative_vibes.join('、')}`);
        }
        sections.push('');
      }
    }

    // Tension Position
    sections.push(`## 协作偏好`);
    sections.push(`- 控制级别: ${(taste.tension_position.control_level * 100).toFixed(0)}%`);
    sections.push(`- 信任级别: ${(taste.tension_position.trust_level * 100).toFixed(0)}%`);
    sections.push(`- 介入阈值: ${(taste.tension_position.intervention_threshold * 100).toFixed(0)}%`);
    sections.push('');

    // Symbiosis Boundary
    const delegated = taste.symbiosis_boundary.delegated_domains;
    const reserved = taste.symbiosis_boundary.reserved_domains;

    if (delegated.length > 0 || reserved.length > 0) {
      sections.push(`## 委托边界`);
      sections.push(`- 可委托: ${delegated.length > 0 ? delegated.join('、') : '无'}`);
      sections.push(`- 需保留: ${reserved.length > 0 ? reserved.join('、') : '全部'}`);
      sections.push('');
    }

    sections.push(`请根据上述品味档案调整你的行为和建议方式。`);

    return sections.join('\n');
  }

  /**
   * Create default TASTE profile for new users
   */
  private createDefaultProfile(userId: string): TASTEProfile {
    return {
      version: '1.0.0',
      id: `taste-default-${userId}`,
      userId,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
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
      metadata: {
        source: 'user',
        confidence: 0.5,
        evolution_count: 0,
      },
    };
  }
}

export const tasteContextBuilder = new TasteContextBuilder();
```

### 3.2 Integration with AgentManager

**File:** `src/lib/integrations/pi-agent/agent-manager.ts` (UPDATE)

Add TASTE context injection to agent creation:

```typescript
import { tasteContextBuilder } from '@/lib/taste/context/TasteContextBuilder';
import { tasteCacheManager } from '@/lib/taste/services/TasteCacheManager';

// In getOrCreateAgent method:
async getOrCreateAgent(
  sessionId: string,
  projectId: string,
  options?: {
    userId?: string;
    systemPrompt?: string;
    agentType?: string;
  }
): Promise<OriginOSAgent> {
  const userId = options?.userId ?? 'default';

  // Load TASTE context
  const tasteContext = await tasteContextBuilder.buildContext({
    userId,
    projectId,
  });

  const agent = createOriginOSAgent({
    sessionId,
    systemPrompt: options?.systemPrompt ?? tasteContext.systemPrompt,
    variables: {
      projectId,
      projectName: options?.agentType || 'Agent Session',
      userId,
      tasteProfile: JSON.stringify(tasteContext.taste),
    },
  });

  // ... rest of implementation
}

// Add method to switch project context
async switchProject(
  sessionId: string,
  userId: string,
  fromProjectId: string | null,
  toProjectId: string | null
): Promise<void> {
  // Clear old cache
  if (fromProjectId) {
    tasteCacheManager.delete(userId, fromProjectId);
  }

  // Agent will load new TASTE on next interaction
  // Optionally: rebuild agent with new context
}
```

---

## 4. Evolution Mechanism

### 4.1 Evolution Service

**File:** `src/lib/taste/services/TasteEvolutionService.ts` (NEW)

```typescript
/**
 * TasteEvolutionService
 *
 * Handles background evolution of TASTE profiles based on accumulated signals.
 */
import type { TASTEProfile } from '@/types/taste';
import { tasteStorageService } from './TasteStorageService';
import { getTasteLoader } from '../taste-loader';
import { tasteCacheManager } from './TasteCacheManager';

export interface EvolutionSignals {
  newDomains: string[];
  preferenceShifts: Array<{
    domain: string;
    type: 'positive' | 'negative';
    oldValue: string[];
    newValue: string[];
  }>;
  trustChanges: Array<{
    delta: number;
    timestamp: string;
  }>;
  interactionCount: number;
  timeSinceLastEvolution: number;
}

export interface EvolutionConfig {
  minEvolutionIntervalDays: number;
  minNewDomains: number;
  minPreferenceShifts: number;
  minTrustDelta: number;
  minInteractions: number;
}

const DEFAULT_EVOLUTION_CONFIG: EvolutionConfig = {
  minEvolutionIntervalDays: 7,
  minNewDomains: 2,
  minPreferenceShifts: 3,
  minTrustDelta: 0.2,
  minInteractions: 50,
};

export class TasteEvolutionService {
  private config: EvolutionConfig;

  constructor(config: Partial<EvolutionConfig> = {}) {
    this.config = { ...DEFAULT_EVOLUTION_CONFIG, ...config };
  }

  /**
   * Check if evolution should occur
   */
  shouldEvolve(profile: TASTEProfile, signals: EvolutionSignals): boolean {
    const minInterval = this.config.minEvolutionIntervalDays * 24 * 60 * 60 * 1000;
    const timeSinceUpdate = Date.now() - new Date(profile.updatedAt).getTime();

    // Must meet minimum time interval
    if (timeSinceUpdate < minInterval) {
      return false;
    }

    // Must have sufficient signals
    const hasNewDomains = signals.newDomains.length >= this.config.minNewDomains;
    const hasPreferenceShifts =
      signals.preferenceShifts.length >= this.config.minPreferenceShifts;
    const hasTrustChange = signals.trustChanges.some(
      c => Math.abs(c.delta) >= this.config.minTrustDelta
    );
    const hasInteractions = signals.interactionCount >= this.config.minInteractions;

    return hasNewDomains || hasPreferenceShifts || hasTrustChange || hasInteractions;
  }

  /**
   * Perform evolution
   */
  async evolve(
    profile: TASTEProfile,
    signals: EvolutionSignals
  ): Promise<TASTEProfile> {
    const evolved: TASTEProfile = {
      ...profile,
      id: `taste-${Date.now()}`,
      updatedAt: new Date().toISOString(),
      metadata: {
        ...profile.metadata,
        evolution_count: profile.metadata.evolution_count + 1,
        last_analysis_at: new Date().toISOString(),
      },
    };

    // Add new domains
    if (signals.newDomains.length > 0) {
      evolved.experience_topology = [
        ...new Set([...profile.experience_topology, ...signals.newDomains]),
      ];
    }

    // Apply preference shifts
    for (const shift of signals.preferenceShifts) {
      if (!evolved.taste_standards[shift.domain]) {
        evolved.taste_standards[shift.domain] = {
          positive_vibes: [],
          negative_vibes: [],
        };
      }

      if (shift.type === 'positive') {
        evolved.taste_standards[shift.domain].positive_vibes = shift.newValue;
      } else {
        evolved.taste_standards[shift.domain].negative_vibes = shift.newValue;
      }
    }

    // Update trust level
    if (signals.trustChanges.length > 0) {
      const avgDelta =
        signals.trustChanges.reduce((sum, c) => sum + c.delta, 0) /
        signals.trustChanges.length;
      evolved.tension_position.trust_level = Math.min(
        1,
        Math.max(0, profile.tension_position.trust_level + avgDelta)
      );
    }

    return evolved;
  }

  /**
   * Trigger evolution for user
   */
  async evolveUserTASTE(userId: string): Promise<{
    evolved: boolean;
    profile?: TASTEProfile;
    changes?: Partial<TASTEProfile>;
  }> {
    const loader = getTasteLoader();
    const profile = await loader.loadUserTASTE(userId);

    if (!profile) {
      return { evolved: false };
    }

    // Collect signals (placeholder - would integrate with memory graph)
    const signals = await this.collectEvolutionSignals(userId);

    if (!this.shouldEvolve(profile, signals)) {
      return { evolved: false };
    }

    // Perform evolution
    const evolved = await this.evolve(profile, signals);

    // Save updated profile
    await tasteStorageService.saveUserTASTE(userId, evolved);

    // Clear cache
    tasteCacheManager.clearUser(userId);

    return {
      evolved: true,
      profile: evolved,
      changes: {
        experience_topology: evolved.experience_topology,
        taste_standards: evolved.taste_standards,
        tension_position: evolved.tension_position,
      },
    };
  }

  /**
   * Collect evolution signals (placeholder)
   */
  private async collectEvolutionSignals(userId: string): Promise<EvolutionSignals> {
    // TODO: Integrate with memory graph and interaction history
    return {
      newDomains: [],
      preferenceShifts: [],
      trustChanges: [],
      interactionCount: 0,
      timeSinceLastEvolution: 0,
    };
  }
}

export const tasteEvolutionService = new TasteEvolutionService();
```

---

## 5. API Endpoints

### 5.1 TASTE Management API

**File:** `src/app/api/taste/user/[userId]/route.ts` (NEW)

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { getTasteLoader } from '@/lib/taste/taste-loader';
import { tasteStorageService } from '@/lib/taste/services/TasteStorageService';
import { TASTEProfileSchema } from '@/types/taste';

/**
 * GET /api/taste/user/[userId]
 * Get User TASTE profile
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { userId: string } }
) {
  const loader = getTasteLoader();
  const profile = await loader.loadUserTASTE(params.userId);

  if (!profile) {
    return NextResponse.json({ error: 'User TASTE not found' }, { status: 404 });
  }

  return NextResponse.json({ profile });
}

/**
 * PUT /api/taste/user/[userId]
 * Update User TASTE profile
 */
export async function PUT(
  request: NextRequest,
  { params }: { params: { userId: string } }
) {
  const body = await request.json();

  // Validate
  const profile = TASTEProfileSchema.parse(body);

  // Save
  await tasteStorageService.saveUserTASTE(params.userId, profile);

  return NextResponse.json({ success: true, profile });
}
```

**File:** `src/app/api/taste/project/[projectId]/route.ts` (NEW)

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { getTasteLoader } from '@/lib/taste/taste-loader';
import { tasteStorageService } from '@/lib/taste/services/TasteStorageService';
import { TASTEProfileSchema } from '@/types/taste';

/**
 * GET /api/taste/project/[projectId]
 * Get Project TASTE profile
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { projectId: string } }
) {
  const loader = getTasteLoader();
  const profile = await loader.loadProjectTASTE(params.projectId);

  if (!profile) {
    return NextResponse.json({ error: 'Project TASTE not found' }, { status: 404 });
  }

  return NextResponse.json({ profile });
}

/**
 * PUT /api/taste/project/[projectId]
 * Update Project TASTE profile
 */
export async function PUT(
  request: NextRequest,
  { params }: { params: { projectId: string } }
) {
  const body = await request.json();

  // Validate
  const profile = TASTEProfileSchema.parse(body);

  // Save
  await tasteStorageService.saveProjectTASTE(params.projectId, profile);

  return NextResponse.json({ success: true, profile });
}
```

**File:** `src/app/api/taste/merged/route.ts` (NEW)

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { getTasteLoader } from '@/lib/taste/taste-loader';

/**
 * GET /api/taste/merged?userId=X&projectId=Y
 * Get merged TASTE profile
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const userId = searchParams.get('userId');
  const projectId = searchParams.get('projectId');

  if (!userId) {
    return NextResponse.json({ error: 'userId required' }, { status: 400 });
  }

  const loader = getTasteLoader();
  const profile = await loader.loadTASTE({
    userId,
    projectId: projectId ?? undefined,
  });

  if (!profile) {
    return NextResponse.json({ error: 'TASTE profile not found' }, { status: 404 });
  }

  return NextResponse.json({ profile });
}
```

---

## 6. Testing Strategy

### 6.1 Unit Tests

**File:** `src/lib/taste/services/__tests__/TasteMergeService.test.ts`

```typescript
import { describe, it, expect } from 'vitest';
import { TasteMergeService } from '../TasteMergeService';
import { createTASTEProfile } from '@/types/taste';

describe('TasteMergeService', () => {
  const service = new TasteMergeService();

  it('should merge experience_topology with deduplication', () => {
    const user = createTASTEProfile({
      userId: 'user-1',
      experience_topology: ['web-dev', 'api-design'],
    });
    const project = createTASTEProfile({
      projectId: 'project-1',
      experience_topology: ['api-design', 'database'],
    });

    const merged = service.merge(user, project);

    expect(merged.experience_topology).toContain('web-dev');
    expect(merged.experience_topology).toContain('api-design');
    expect(merged.experience_topology).toContain('database');
    expect(merged.experience_topology.length).toBe(3);
  });

  it('should prioritize project taste_standards', () => {
    const user = createTASTEProfile({
      userId: 'user-1',
      taste_standards: {
        'web-dev': {
          positive_vibes: ['clean-code'],
          negative_vibes: ['complexity'],
        },
      },
    });
    const project = createTASTEProfile({
      projectId: 'project-1',
      taste_standards: {
        'web-dev': {
          positive_vibes: ['velocity'],
          negative_vibes: ['over-engineering'],
        },
      },
    });

    const merged = service.merge(user, project);

    expect(merged.taste_standards['web-dev'].positive_vibes).toEqual(['velocity']);
    expect(merged.taste_standards['web-dev'].negative_vibes).toEqual(['over-engineering']);
  });

  it('should use weighted average for tension_position', () => {
    const user = createTASTEProfile({
      userId: 'user-1',
      tension_position: {
        control_level: 0.8,
        trust_level: 0.6,
        intervention_threshold: 0.7,
      },
    });
    const project = createTASTEProfile({
      projectId: 'project-1',
      tension_position: {
        control_level: 0.4,
        trust_level: 0.8,
        intervention_threshold: 0.3,
      },
    });

    const merged = service.merge(user, project);

    // control_level: 0.8 * 0.3 + 0.4 * 0.7 = 0.52
    expect(merged.tension_position.control_level).toBeCloseTo(0.52);
    // trust_level: 0.6 * 0.3 + 0.8 * 0.7 = 0.74
    expect(merged.tension_position.trust_level).toBeCloseTo(0.74);
    // intervention_threshold: project wins
    expect(merged.tension_position.intervention_threshold).toBe(0.3);
  });

  it('should use INTERSECTION for delegated_domains', () => {
    const user = createTASTEProfile({
      userId: 'user-1',
      symbiosis_boundary: {
        delegated_domains: ['doc-gen', 'code-formatting', 'testing'],
        reserved_domains: ['architecture'],
        contextual_triggers: [],
      },
    });
    const project = createTASTEProfile({
      projectId: 'project-1',
      symbiosis_boundary: {
        delegated_domains: ['doc-gen', 'code-formatting'],
        reserved_domains: ['database-schema'],
        contextual_triggers: [],
      },
    });

    const merged = service.merge(user, project);

    expect(merged.symbiosis_boundary.delegated_domains).toEqual([
      'doc-gen',
      'code-formatting',
    ]);
  });

  it('should use UNION for reserved_domains', () => {
    const user = createTASTEProfile({
      userId: 'user-1',
      symbiosis_boundary: {
        delegated_domains: [],
        reserved_domains: ['architecture'],
        contextual_triggers: [],
      },
    });
    const project = createTASTEProfile({
      projectId: 'project-1',
      symbiosis_boundary: {
        delegated_domains: [],
        reserved_domains: ['database-schema'],
        contextual_triggers: [],
      },
    });

    const merged = service.merge(user, project);

    expect(merged.symbiosis_boundary.reserved_domains).toContain('architecture');
    expect(merged.symbiosis_boundary.reserved_domains).toContain('database-schema');
    expect(merged.symbiosis_boundary.reserved_domains.length).toBe(2);
  });

  it('should return user profile when project is null', () => {
    const user = createTASTEProfile({ userId: 'user-1' });

    const merged = service.merge(user, null);

    expect(merged).toBe(user);
  });
});
```

---

## 7. Implementation Checklist

### Phase 1.5.1: Core Services
- [ ] Update `mergeTASTEProfiles` to use intersection for delegated_domains
- [ ] Create `TasteMergeService`
- [ ] Create `TasteStorageService`
- [ ] Create `TasteCacheManager`
- [ ] Update `TasteLoader` to use new services
- [ ] Write unit tests for all services

### Phase 1.5.2: pi-agent Integration
- [ ] Create `TasteContextBuilder`
- [ ] Update `AgentManager` for TASTE injection
- [ ] Add project switch handling
- [ ] Write integration tests

### Phase 1.5.3: API Endpoints
- [ ] Create `/api/taste/user/[userId]` endpoints
- [ ] Create `/api/taste/project/[projectId]` endpoints
- [ ] Create `/api/taste/merged` endpoint
- [ ] Write API tests

### Phase 1.5.4: Evolution
- [ ] Create `TasteEvolutionService`
- [ ] Define signal collection strategy
- [ ] Add evolution API endpoint
- [ ] Write evolution tests

---

## 8. Performance Targets

| Operation | Target Latency | Implementation |
|-----------|---------------|----------------|
| Load User TASTE | < 10ms | File read + JSON parse |
| Load Project TASTE | < 10ms | File read + JSON parse |
| Merge TASTE | < 5ms | In-memory calculation |
| Total Load (cached) | < 1ms | Map lookup |
| Total Load (uncached) | < 50ms | Parallel read + merge |

---

## 9. Security Considerations

1. **User Isolation**: Each user's TASTE stored in isolated directory
2. **Atomic Writes**: Temp file + rename prevents corruption
3. **Schema Validation**: All profiles validated before save
4. **History Tracking**: All changes tracked for audit

---

**Document Status:** Ready for Implementation
**Next Steps:**
1. Developer creates implementation tasks
2. QA prepares test cases
3. Implementation begins after task assignment
