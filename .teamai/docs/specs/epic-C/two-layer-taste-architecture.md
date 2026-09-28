# Two-Layer TASTE Architecture - Technical Specification

**Version:** 1.0.0
**Author:** System Architect (CTO)
**Date:** 2026-03-16
**Status:** Draft - Pending PM Approval

---

## Executive Summary

This document defines the technical architecture for implementing a two-layer TASTE (Taste-Aware System for Embodied Experience) system:

1. **User TASTE** - OS-level global taste profile loaded at OS startup
2. **Project TASTE** - Project-specific taste profile loaded and merged when entering a project

The architecture builds upon the existing Epic C implementation and integrates with the pi-agent-core system.

---

## 1. Current Architecture Analysis

### 1.1 Existing Components

| Component | Location | Status | Notes |
|-----------|----------|--------|-------|
| TASTE Types | `src/types/taste.ts` | ✅ Complete | Supports `source: 'user' \| 'project' \| 'merged'` |
| TASTE Schema | `src/lib/taste/taste-schema.ts` | ✅ Complete | Core memory triplets |
| Merge Function | `src/types/taste.ts:mergeTASTEProfiles` | ⚠️ Needs Update | Uses union for delegated_domains |
| Culture Detection | `src/lib/features/culture/` | ✅ Complete | Onboarding dialogue |
| Project TASTE Sample | `data/taste/projects/.../profile.json` | ✅ Exists | Sample project profile |
| User TASTE Storage | `data/taste/users/{userId}/profile.json` | 🔲 Needed | User profile storage |

### 1.2 Existing Merge Function Analysis

The current `mergeTASTEProfiles` function in `src/types/taste.ts` has a discrepancy:

```typescript
// Current implementation (line 513-516)
delegated_domains: [
  ...new Set([
    ...userTASTE.symbiosis_boundary.delegated_domains,
    ...projectTASTE.symbiosis_boundary.delegated_domains,
  ]),
],
```

**Issue:** This uses **union** (set union), but per Product Designer's recommendation in `docs/specs/epic-C/taste-merge-strategy.md`, it should use **intersection** for safety reasons.

**Recommendation:** Change to intersection:
```typescript
delegated_domains: userTASTE.symbiosis_boundary.delegated_domains.filter(
  d => projectTASTE.symbiosis_boundary.delegated_domains.includes(d)
),
```

---

## 2. Two-Layer Architecture Design

### 2.1 Storage Structure

```
data/
├── taste/
│   ├── users/
│   │   └── {userId}/
│   │       ├── profile.json          # User TASTE
│   │       └── history/
│   │           └── {timestamp}.json  # Evolution history
│   └── projects/
│       └── {projectId}/
│           └── profile.json          # Project TASTE
```

### 2.2 Load Sequence

```
┌─────────────────────────────────────────────────────────────────┐
│                        OS Startup                               │
└─────────────────────────────────────────────────────────────────┘
                               │
                               ▼
                    ┌──────────────────────┐
                    │   Load User TASTE    │
                    │   (OS Global)        │
                    └──────────────────────┘
                               │
                               ▼
                    ┌──────────────────────┐
                    │   Active User TASTE  │
                    │   in Memory          │
                    └──────────────────────┘
                               │
         ┌─────────────────────┴─────────────────────┐
         │                                           │
         ▼                                           ▼
┌─────────────────┐                      ┌─────────────────────┐
│  No Project     │                      │  Enter Project      │
│  Context        │                      └─────────────────────┘
└─────────────────┘                                 │
                                                    ▼
                                         ┌─────────────────────┐
                                         │ Load Project TASTE  │
                                         └─────────────────────┘
                                                    │
                                                    ▼
                                         ┌─────────────────────┐
                                         │  Merge TASTE        │
                                         │  (User + Project)   │
                                         └─────────────────────┘
                                                    │
                                                    ▼
                                         ┌─────────────────────┐
                                         │ Active Merged TASTE │
                                         │ in Memory           │
                                         └─────────────────────┘
```

### 2.3 Component Architecture

```
┌────────────────────────────────────────────────────────────────────────┐
│                           Application Layer                            │
├────────────────────────────────────────────────────────────────────────┤
│                                                                        │
│  ┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐    │
│  │   CUI Module    │    │ Project Module  │    │  Agent Module   │    │
│  │  (Onboarding)   │    │  (Creation)     │    │  (pi-agent)     │    │
│  └────────┬────────┘    └────────┬────────┘    └────────┬────────┘    │
│           │                      │                      │              │
└───────────┼──────────────────────┼──────────────────────┼──────────────┘
            │                      │                      │
            ▼                      ▼                      ▼
┌────────────────────────────────────────────────────────────────────────┐
│                         TASTE Service Layer                             │
├────────────────────────────────────────────────────────────────────────┤
│                                                                        │
│  ┌─────────────────────────────────────────────────────────────────┐  │
│  │                     TasteLoaderService                           │  │
│  │  - loadUserTASTE(userId)                                        │  │
│  │  - loadProjectTASTE(projectId)                                  │  │
│  │  - loadMergedTASTE(userId, projectId)                           │  │
│  │  - clearCache(userId, projectId?)                               │  │
│  └─────────────────────────────────────────────────────────────────┘  │
│                                                                        │
│  ┌─────────────────────────────────────────────────────────────────┐  │
│  │                     TasteMergeService                            │  │
│  │  - merge(userTASTE, projectTASTE) → MergedTASTE                 │  │
│  │  - validateMergeResult(merged) → boolean                        │  │
│  └─────────────────────────────────────────────────────────────────┘  │
│                                                                        │
│  ┌─────────────────────────────────────────────────────────────────┐  │
│  │                   TasteStorageService                            │  │
│  │  - saveUserTASTE(userId, profile)                               │  │
│  │  - saveProjectTASTE(projectId, profile)                         │  │
│  │  - getUserTASTEPath(userId) → string                            │  │
│  │  - getProjectTASTEPath(projectId) → string                      │  │
│  └─────────────────────────────────────────────────────────────────┘  │
│                                                                        │
│  ┌─────────────────────────────────────────────────────────────────┐  │
│  │                   TasteCacheManager                              │  │
│  │  - Cache Key: `${userId}:${projectId}`                          │  │
│  │  - Invalidation: TASTE update, project switch                   │  │
│  │  - TTL: Session lifetime                                         │  │
│  └─────────────────────────────────────────────────────────────────┘  │
│                                                                        │
└────────────────────────────────────────────────────────────────────────┘
            │
            ▼
┌────────────────────────────────────────────────────────────────────────┐
│                          Storage Layer                                  │
├────────────────────────────────────────────────────────────────────────┤
│                                                                        │
│  ┌─────────────────────────────────────────────────────────────────┐  │
│  │                     File System (JSON)                           │  │
│  │  - data/taste/users/{userId}/profile.json                        │  │
│  │  - data/taste/projects/{projectId}/profile.json                  │  │
│  │  - Atomic writes with temp file + rename                         │  │
│  │  - History tracking for evolution                                │  │
│  └─────────────────────────────────────────────────────────────────┘  │
│                                                                        │
└────────────────────────────────────────────────────────────────────────┘
```

---

## 3. Data Structures

### 3.1 TASTE Profile Schema (Updated)

```typescript
/**
 * TASTE Profile - Supports User, Project, and Merged profiles
 */
interface TASTEProfile {
  version: string;                    // Schema version
  id: string;                         // Unique profile ID
  userId?: string;                    // User ID (for User TASTE)
  projectId?: string;                 // Project ID (for Project TASTE)
  createdAt: string;                  // ISO timestamp
  updatedAt: string;                  // ISO timestamp

  // Dimension 1: Experience Topology
  experience_topology: string[];      // Domains with embodied judgment

  // Dimension 2: Taste Standards
  taste_standards: {
    [domain: string]: {
      positive_vibes: string[];       // What feels "right"
      negative_vibes: string[];       // What feels "wrong"
    };
  };

  // Dimension 3: Tension Position (ECO Balance)
  tension_position: {
    control_level: number;            // 0-1, higher = more control
    trust_level: number;              // 0-1, higher = more trust
    intervention_threshold: number;   // 0-1, when to intervene
  };

  // Dimension 4: Symbiosis Boundary
  symbiosis_boundary: {
    delegated_domains: string[];      // Tasks to delegate to AI
    reserved_domains: string[];       // Tasks to keep for human
    contextual_triggers: string[];    // Situations needing human
    control_level?: number;           // Project-specific override
  };

  // Metadata
  metadata: {
    source: 'user' | 'project' | 'merged';
    confidence: number;               // 0-1, detection confidence
    evolution_count: number;          // Number of updates
    derived_from_session?: string;    // Source session ID
    last_analysis_at?: string;        // Last LLM analysis timestamp
  };

  // Memory Statistics (for evolution tracking)
  memory_stats?: {
    total_memories: number;
    high_confidence_count: number;
    avg_confidence: number;
    domains: string[];
  };
}
```

### 3.2 Merge Configuration

```typescript
interface TASTEMergeConfig {
  experience_topology: {
    strategy: 'merge';              // Always merge, dedupe
  };

  taste_standards: {
    strategy: 'project_priority';   // Project overrides same domain
    sameDomain: 'project_wins';
    diffDomain: 'merge';
  };

  tension_position: {
    strategy: 'weighted_average';
    weights: {
      user: 0.3;
      project: 0.7;
    };
    intervention_threshold: 'project_priority';  // Project takes lead
  };

  symbiosis_boundary: {
    delegated_domains: 'intersection';  // SAFETY: Only both-agreed
    reserved_domains: 'union';          // CONSERVATIVE: Any reserved
    contextual_triggers: 'merge';
    control_level: 'weighted_average';
  };
}
```

---

## 4. Service Implementation

### 4.1 TasteLoaderService

```typescript
// src/lib/taste/services/TasteLoaderService.ts

export class TasteLoaderService {
  private cacheManager: TasteCacheManager;
  private storageService: TasteStorageService;
  private mergeService: TasteMergeService;

  /**
   * Load TASTE based on context
   */
  async loadTASTE(context: {
    userId: string;
    projectId?: string;
  }): Promise<TASTEProfile> {
    const { userId, projectId } = context;

    // No project: return User TASTE only
    if (!projectId) {
      return this.loadUserTASTE(userId);
    }

    // Check cache
    const cacheKey = `${userId}:${projectId}`;
    const cached = this.cacheManager.get(cacheKey);
    if (cached) {
      return cached;
    }

    // Load and merge
    const [user, project] = await Promise.all([
      this.loadUserTASTE(userId),
      this.loadProjectTASTE(projectId),
    ]);

    const merged = this.mergeService.merge(user, project);

    // Cache result
    this.cacheManager.set(cacheKey, merged);

    return merged;
  }

  /**
   * Load User TASTE with fallback
   */
  private async loadUserTASTE(userId: string): Promise<TASTEProfile> {
    const path = this.storageService.getUserTASTEPath(userId);

    if (await this.storageService.exists(path)) {
      return this.storageService.read(path);
    }

    // Return default profile for new users
    return this.createDefaultUserTASTE(userId);
  }

  /**
   * Load Project TASTE with fallback
   */
  private async loadProjectTASTE(projectId: string): Promise<TASTEProfile | null> {
    const path = this.storageService.getProjectTASTEPath(projectId);

    if (await this.storageService.exists(path)) {
      return this.storageService.read(path);
    }

    return null;  // No project TASTE yet
  }

  /**
   * Handle project switch
   */
  async switchProject(
    userId: string,
    fromProjectId: string | null,
    toProjectId: string | null
  ): Promise<TASTEProfile> {
    // Clear old cache
    if (fromProjectId) {
      this.cacheManager.delete(`${userId}:${fromProjectId}`);
    }

    // Load new context
    return this.loadTASTE({ userId, projectId: toProjectId ?? undefined });
  }
}
```

### 4.2 TasteMergeService

```typescript
// src/lib/taste/services/TasteMergeService.ts

export class TasteMergeService {
  private config: TASTEMergeConfig = DEFAULT_MERGE_CONFIG;

  /**
   * Merge User and Project TASTE profiles
   */
  merge(user: TASTEProfile, project: TASTEProfile | null): TASTEProfile {
    // No project TASTE: return user TASTE
    if (!project) {
      return user;
    }

    return {
      version: '1.0.0',
      id: `merged-${Date.now()}`,
      userId: user.userId,
      projectId: project.projectId,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),

      // Dimension 1: Merge + deduplicate
      experience_topology: this.mergeArrays(
        user.experience_topology,
        project.experience_topology
      ),

      // Dimension 2: Project priority for same domain
      taste_standards: this.mergeTasteStandards(
        user.taste_standards,
        project.taste_standards
      ),

      // Dimension 3: Weighted average
      tension_position: this.mergeTensionPosition(
        user.tension_position,
        project.tension_position,
        this.config.tension_position.weights
      ),

      // Dimension 4: Intersection for safety
      symbiosis_boundary: this.mergeSymbiosisBoundary(
        user.symbiosis_boundary,
        project.symbiosis_boundary
      ),

      metadata: {
        source: 'merged',
        confidence: Math.max(
          user.metadata.confidence,
          project.metadata.confidence
        ),
        evolution_count:
          user.metadata.evolution_count + project.metadata.evolution_count,
      },

      memory_stats: this.mergeMemoryStats(
        user.memory_stats,
        project.memory_stats
      ),
    };
  }

  /**
   * Merge experience topology (deduplicate)
   */
  private mergeArrays(user: string[], project: string[]): string[] {
    return [...new Set([...user, ...project])];
  }

  /**
   * Merge taste standards (project priority)
   */
  private mergeTasteStandards(
    user: TASTEProfile['taste_standards'],
    project: TASTEProfile['taste_standards']
  ): TASTEProfile['taste_standards'] {
    const result = { ...user };

    for (const [domain, standards] of Object.entries(project)) {
      // Project overrides same domain
      result[domain] = standards;
    }

    return result;
  }

  /**
   * Merge tension position (weighted average)
   */
  private mergeTensionPosition(
    user: TASTEProfile['tension_position'],
    project: TASTEProfile['tension_position'],
    weights: { user: number; project: number }
  ): TASTEProfile['tension_position'] {
    const { user: uw, project: pw } = weights;

    return {
      control_level: this.weightedAverage(
        user.control_level,
        project.control_level,
        uw,
        pw
      ),
      trust_level: this.weightedAverage(
        user.trust_level,
        project.trust_level,
        uw,
        pw
      ),
      // Intervention threshold: project takes priority
      intervention_threshold: project.intervention_threshold,
    };
  }

  /**
   * Merge symbiosis boundary
   * CRITICAL: Uses intersection for delegated_domains (safety)
   */
  private mergeSymbiosisBoundary(
    user: TASTEProfile['symbiosis_boundary'],
    project: TASTEProfile['symbiosis_boundary']
  ): TASTEProfile['symbiosis_boundary'] {
    return {
      // SAFETY: Only delegate what BOTH agree on
      delegated_domains: this.intersection(
        user.delegated_domains,
        project.delegated_domains
      ),

      // CONSERVATIVE: Reserve what EITHER wants reserved
      reserved_domains: this.union(
        user.reserved_domains,
        project.reserved_domains
      ),

      // Merge triggers
      contextual_triggers: this.mergeArrays(
        user.contextual_triggers,
        project.contextual_triggers
      ),

      // Weighted average for control level
      control_level: this.weightedAverage(
        user.control_level ?? 0.5,
        project.control_level ?? 0.5,
        0.3,
        0.7
      ),
    };
  }

  private weightedAverage(
    userValue: number,
    projectValue: number,
    userWeight: number,
    projectWeight: number
  ): number {
    return userValue * userWeight + projectValue * projectWeight;
  }

  private intersection(a: string[], b: string[]): string[] {
    return a.filter(item => b.includes(item));
  }

  private union(a: string[], b: string[]): string[] {
    return [...new Set([...a, ...b])];
  }

  private mergeMemoryStats(
    user?: TASTEProfile['memory_stats'],
    project?: TASTEProfile['memory_stats']
  ): TASTEProfile['memory_stats'] {
    return {
      total_memories: (user?.total_memories ?? 0) + (project?.total_memories ?? 0),
      high_confidence_count:
        (user?.high_confidence_count ?? 0) + (project?.high_confidence_count ?? 0),
      avg_confidence:
        ((user?.avg_confidence ?? 0) + (project?.avg_confidence ?? 0)) / 2,
      domains: [...new Set([...(user?.domains ?? []), ...(project?.domains ?? [])])],
    };
  }
}
```

### 4.3 TasteStorageService

```typescript
// src/lib/taste/services/TasteStorageService.ts

import { promises as fs } from 'fs';
import path from 'path';

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
    return JSON.parse(content) as TASTEProfile;
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
    const path = this.getUserTASTEPath(userId);
    const updatedProfile = {
      ...profile,
      userId,
      projectId: undefined,
      metadata: {
        ...profile.metadata,
        source: 'user' as const,
        last_analysis_at: new Date().toISOString(),
      },
      updatedAt: new Date().toISOString(),
    };
    await this.write(path, updatedProfile);
  }

  /**
   * Save Project TASTE
   */
  async saveProjectTASTE(projectId: string, profile: TASTEProfile): Promise<void> {
    const path = this.getProjectTASTEPath(projectId);
    const updatedProfile = {
      ...profile,
      userId: undefined,
      projectId,
      metadata: {
        ...profile.metadata,
        source: 'project' as const,
        last_analysis_at: new Date().toISOString(),
      },
      updatedAt: new Date().toISOString(),
    };
    await this.write(path, updatedProfile);
  }
}
```

### 4.4 TasteCacheManager

```typescript
// src/lib/taste/services/TasteCacheManager.ts

export class TasteCacheManager {
  private cache: Map<string, { profile: TASTEProfile; timestamp: number }> = new Map();
  private ttl: number;  // milliseconds

  constructor(ttl: number = 30 * 60 * 1000) {  // 30 minutes default
    this.ttl = ttl;
  }

  /**
   * Get cached profile
   */
  get(key: string): TASTEProfile | null {
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
  set(key: string, profile: TASTEProfile): void {
    this.cache.set(key, {
      profile,
      timestamp: Date.now(),
    });
  }

  /**
   * Delete cached profile
   */
  delete(key: string): boolean {
    return this.cache.delete(key);
  }

  /**
   * Clear all cache for a user
   */
  clearUser(userId: string): void {
    for (const key of this.cache.keys()) {
      if (key.startsWith(`${userId}:`)) {
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
}
```

---

## 5. pi-agent Integration

### 5.1 Context Injection

The TASTE profile is injected into the pi-agent context when creating or accessing an agent session.

```typescript
// src/lib/integrations/pi-agent/context/TasteContextBuilder.ts

export class TasteContextBuilder {
  private loader: TasteLoaderService;

  /**
   * Build agent context with TASTE
   */
  async buildContext(params: {
    userId: string;
    projectId?: string;
  }): Promise<AgentContext> {
    const taste = await this.loader.loadTASTE(params);

    return {
      taste,
      userId: params.userId,
      projectId: params.projectId,
      systemPrompt: this.buildSystemPrompt(taste),
    };
  }

  /**
   * Build system prompt from TASTE profile
   */
  private buildSystemPrompt(taste: TASTEProfile): string {
    const sections: string[] = [];

    // Experience Topology
    if (taste.experience_topology.length > 0) {
      sections.push(`## 经验领域\n${taste.experience_topology.map(d => `- ${d}`).join('\n')}`);
    }

    // Taste Standards
    if (Object.keys(taste.taste_standards).length > 0) {
      const standards = Object.entries(taste.taste_standards)
        .map(([domain, std]) => {
          const pos = std.positive_vibes.length > 0
            ? `  ✓ ${std.positive_vibes.join('、')}`
            : '';
          const neg = std.negative_vibes.length > 0
            ? `  ✗ ${std.negative_vibes.join('、')}`
            : '';
          return `### ${domain}\n${pos}\n${neg}`.trim();
        })
        .join('\n\n');
      sections.push(`## 品味标准\n${standards}`);
    }

    // Tension Position
    sections.push(`## 协作偏好
- 控制级别: ${(taste.tension_position.control_level * 100).toFixed(0)}%
- 信任级别: ${(taste.tension_position.trust_level * 100).toFixed(0)}%
- 介入阈值: ${(taste.tension_position.intervention_threshold * 100).toFixed(0)}%`);

    // Symbiosis Boundary
    const delegated = taste.symbiosis_boundary.delegated_domains;
    const reserved = taste.symbiosis_boundary.reserved_domains;

    if (delegated.length > 0 || reserved.length > 0) {
      sections.push(`## 委托边界
- 可委托: ${delegated.length > 0 ? delegated.join('、') : '无'}
- 需保留: ${reserved.length > 0 ? reserved.join('、') : '全部'}`);
    }

    return `# 用户品味档案\n\n${sections.join('\n\n')}\n\n请根据上述品味档案调整你的行为和建议方式。`;
  }
}
```

### 5.2 Agent Manager Integration

```typescript
// Updated agent-manager.ts integration

async getOrCreateAgent(
  sessionId: string,
  projectId: string,
  options?: {
    userId: string;       // Now required for TASTE loading
    systemPrompt?: string;
    agentType?: string;
  }
): Promise<OriginOSAgent> {
  // Load TASTE context
  const tasteContext = await this.tasteContextBuilder.buildContext({
    userId: options?.userId ?? 'default',
    projectId,
  });

  const agent = createOriginOSAgent({
    sessionId,
    systemPrompt: options?.systemPrompt ?? tasteContext.systemPrompt,
    variables: {
      projectId,
      projectName: options?.agentType || 'Agent Session',
      tasteProfile: tasteContext.taste,
    },
  });

  // ... rest of implementation
}
```

---

## 6. Evolution Mechanism

### 6.1 Background Evolution Trigger

TASTE profiles evolve based on:

1. **Explicit Feedback**: User confirms/rejects AI suggestions
2. **Implicit Feedback**: User behavior patterns (accept rate, edit rate)
3. **Periodic Distillation**: Background job analyzes accumulated signals

### 6.2 Evolution Service

```typescript
// src/lib/taste/services/TasteEvolutionService.ts

export class TasteEvolutionService {
  private loader: TasteLoaderService;
  private storage: TasteStorageService;

  /**
   * Trigger evolution check for user
   */
  async evolveUserTASTE(userId: string): Promise<{
    evolved: boolean;
    changes?: Partial<TASTEProfile>;
  }> {
    const profile = await this.loader.loadUserTASTE(userId);

    // Check evolution conditions
    const signals = await this.collectEvolutionSignals(userId);

    if (!this.shouldEvolve(profile, signals)) {
      return { evolved: false };
    }

    // Perform evolution
    const evolved = await this.performEvolution(profile, signals);

    // Save updated profile
    await this.storage.saveUserTASTE(userId, evolved);

    return { evolved: true, changes: evolved };
  }

  /**
   * Collect signals for evolution
   */
  private async collectEvolutionSignals(userId: string): Promise<EvolutionSignals> {
    // Query accumulated feedback and interactions
    // This would integrate with the memory graph
    return {
      newDomains: [],
      preferenceShifts: [],
      trustChanges: [],
      timeSinceLastEvolution: 0,
    };
  }

  /**
   * Check if evolution should occur
   */
  private shouldEvolve(
    profile: TASTEProfile,
    signals: EvolutionSignals
  ): boolean {
    const minEvolutionInterval = 7 * 24 * 60 * 60 * 1000; // 7 days
    const timeSinceUpdate = Date.now() - new Date(profile.updatedAt).getTime();

    return (
      timeSinceUpdate >= minEvolutionInterval &&
      signals.newDomains.length + signals.preferenceShifts.length > 0
    );
  }
}
```

---

## 7. API Endpoints

### 7.1 TASTE Management API

```typescript
// GET /api/taste/user/:userId
// Get User TASTE profile

// PUT /api/taste/user/:userId
// Update User TASTE profile

// GET /api/taste/project/:projectId
// Get Project TASTE profile

// PUT /api/taste/project/:projectId
// Update Project TASTE profile

// GET /api/taste/merged?userId=X&projectId=Y
// Get merged TASTE profile

// POST /api/taste/evolve/:userId
// Trigger TASTE evolution
```

---

## 8. Migration Path

### 8.1 Phase 1: Infrastructure (Current)

- [x] TASTE types with `source` field
- [x] Merge function (needs update for intersection)
- [x] User TASTE storage path
- [x] Project TASTE storage path
- [x] Culture Detection Service

### 8.2 Phase 1.5: Services

- [ ] TasteLoaderService
- [ ] TasteMergeService (update existing merge logic)
- [ ] TasteStorageService
- [ ] TasteCacheManager
- [ ] TasteContextBuilder

### 8.3 Phase 2: Integration

- [ ] Update AgentManager to inject TASTE
- [ ] Update CUI to load merged TASTE
- [ ] Add TASTE evolution triggers
- [ ] Add API endpoints

### 8.4 Phase 3: Evolution

- [ ] Background evolution job
- [ ] Signal collection from interactions
- [ ] Automatic profile updates

---

## 9. Testing Strategy

### 9.1 Unit Tests

```typescript
describe('TasteLoaderService', () => {
  it('should load user TASTE only when no project');
  it('should merge TASTE when project provided');
  it('should cache merged result');
  it('should clear cache on project switch');
});

describe('TasteMergeService', () => {
  it('should merge experience_topology (dedupe)');
  it('should prioritize project taste_standards');
  it('should use weighted average for tension_position');
  it('should use INTERSECTION for delegated_domains');
  it('should use UNION for reserved_domains');
  it('should handle missing project TASTE');
});

describe('TasteStorageService', () => {
  it('should save user TASTE to correct path');
  it('should save project TASTE to correct path');
  it('should create history on save');
  it('should handle atomic writes');
});

describe('TasteCacheManager', () => {
  it('should cache and retrieve profiles');
  it('should respect TTL');
  it('should clear user-specific cache');
});
```

### 9.2 Integration Tests

```typescript
describe('Two-Layer TASTE Integration', () => {
  it('should load merged TASTE in agent context');
  it('should invalidate cache on TASTE update');
  it('should switch TASTE on project change');
});
```

---

## 10. Performance Considerations

| Operation | Target Latency | Strategy |
|-----------|---------------|----------|
| Load User TASTE | < 10ms | File read + JSON parse |
| Load Project TASTE | < 10ms | File read + JSON parse |
| Merge TASTE | < 5ms | In-memory calculation |
| Total Load | < 50ms | Parallel load + cache |
| Cache Hit | < 1ms | Map lookup |

---

## 11. Security Considerations

1. **User Isolation**: Each user's TASTE is stored in isolated directory
2. **Atomic Writes**: Prevent corruption with temp file + rename
3. **Validation**: All TASTE profiles validated against schema before save
4. **History**: All changes tracked in history for audit

---

## 12. Open Questions

1. **Delegated Domains Strategy**: Should we use intersection (safer) or union (more flexible)?
   - **Recommendation**: Use intersection for MVP, can add user preference later

2. **Evolution Frequency**: How often should TASTE profiles evolve?
   - **Recommendation**: Minimum 7 days, or on significant signal accumulation

3. **Merge Strategy Customization**: Should users be able to customize merge weights?
   - **Recommendation**: Not for MVP, consider in Phase 3

---

## Appendix A: File Locations

```
src/lib/taste/
├── index.ts                      # Public exports
├── taste-schema.ts               # Core types (existing)
├── types.ts                      # TASTEProfile types
├── services/
│   ├── index.ts                  # Service exports
│   ├── TasteLoaderService.ts     # Load/merge service
│   ├── TasteMergeService.ts      # Merge logic
│   ├── TasteStorageService.ts    # File operations
│   ├── TasteCacheManager.ts      # In-memory cache
│   └── TasteEvolutionService.ts  # Evolution triggers
├── context/
│   └── TasteContextBuilder.ts    # Agent context injection
└── __tests__/
    ├── TasteLoaderService.test.ts
    ├── TasteMergeService.test.ts
    ├── TasteStorageService.test.ts
    └── TasteCacheManager.test.ts
```

---

**Document Status:** Complete - Ready for Team Review
**Next Steps:**
1. PM approval on architecture decisions
2. Developer implementation kickoff
3. QA test case preparation
