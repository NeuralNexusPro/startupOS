# 两层 TASTE.md 架构技术评估报告

**评估人:** System Architect
**日期:** 2026-03-07
**状态:** 完成

---

## 架构概览

```
OriginOS TASTE 架构
├─ User TASTE (全局)
│  ├─ 加载时机: OS 使用过程中
│  ├─ 加载: pi-agent loop + CUI
│  └─ 存储: data/taste/users/{userId}/
│
└─ Project TASTE (项目)
   ├─ 加载时机: 进入项目后
   ├─ 加载: Project TASTE + User TASTE (融合)
   ├─ 隐形采集: 项目创建 Skill
   └─ 存储: data/taste/projects/{projectId}/

演进: 后台定时启动
```

---

## 1. Schema 设计评估

### 核心发现：现有 schema 已支持两层架构

现有 `src/lib/taste/taste-schema.ts` 的设计天然支持两层结构：

```typescript
// 现有schema已经包含context_features
context_features: {
  domain: string,        // 项目级区分
  user_type: string,    // 用户级区分
  task_type: string,
  environment: string,
  time_context: string,
  risk_level: 'low' | 'medium' | 'high'
}
```

**建议：两层 schema 应保持一致**

| 当前 schema 设计 | User TASTE | Project TASTE |
|----------------|------------|----------------|
| 结构 | ✅ 一致 | ✅ 一致 |
| domain 值空间 | OS 级域 | 项目级域 |
| 区分维度 | user_level 标识 | project_level 标识 |

### 融合规则设计

```typescript
/**
 * 推荐的融合策略：Contextual Override
 */
interface TasteFusionRules {
  // 1. 优先级：Project TASTE > User TASTE
  priority: 'project_overrides_user';

  // 2. 字段级覆盖规则
  fieldOverrides: {
    taste_standards: 'merge'; // 合并而非覆盖
    tension_position: 'project_takes_priority'; // 项目层偏好优先
    symbiosis_boundary: 'additive'; // 累加扩展
  };

  // 3. 冲突检测
  conflictResolution: {
    on_ambiguous_judgement: 'ask_user';
    on_conflicting_boundary: 'warn_and_use_project';
  };
}

/**
 * 融合实现
 */
class TasteFuser {
  fuse(userTaste: TASTEProfile, projectTaste: TASTEProfile): TASTEProfile {
    return {
      ...projectTaste, // Project TASTE 作为基础
      version: 'merged',
      summary: {
        experience_topology: [
          ...userTaste.summary.experience_topology,
          ...projectTaste.summary.experience_topology
        ].filter((v, i, a) => a.indexOf(v) === i), // 去重
        taste_standards: {
          ...userTaste.summary.taste_standards,
          ...projectTaste.summary.taste_standards
        },
        tension_position: projectTaste.summary.tension_position, // Project 优先
        symbiosis_boundary: {
          delegated_domains: [
            ...userTaste.summary.symbiosis_boundary.delegated_domains,
            ...projectTaste.summary.symbiosis_boundary.delegated_domains
          ].filter((v, i, a) => a.indexOf(v) === i),
          reserved_domains: [
            ...userTaste.summary.symbiosis_boundary.reserved_domains,
            ...projectTaste.summary.symbiosis_boundary.reserved_domains
          ].filter((v, i, a) => a.indexOf(v) === i),
          contextual_triggers: [
            ...userTaste.summary.symbiosis_boundary.contextual_triggers,
            ...projectTaste.summary.symbiosis_boundary.contextual_triggers
          ].filter((v, i, a) => a.indexOf(v) === i),
        }
      },
      memory_stats: {
        total_memories:
          userTaste.memory_stats.total_memories +
          projectTaste.memory_stats.total_memories,
        high_confidence_count:
          userTaste.memory_stats.high_confidence_count +
          projectTaste.memory_stats.high_confidence_count,
        avg_confidence: 0, // 重新计算
        domains: [
          ...userTaste.memory_stats.domains,
          ...projectTaste.memory_stats.domains
        ].filter((v, i, a) => a.indexOf(v) === i),
      }
    };
  }
}
```

### 架构优势

1. **单一 schema 降低维护复杂度**
2. **`domain` 字段天然实现层级分离**
3. **zod 验证统一保障类型安全**

### 潜在风险与缓解

| 风险 | 影响 | 缓解策略 |
|------|------|----------|
| Schema 分化导致重构成本高 | 高 | 早期设计 `scope` 字段（见下方） |

### 建议的 Schema 扩展

```typescript
export const TASTEProfileSchema = z.object({
  version: z.string().default('1.0.0'),
  scope: z.enum(['user', 'project', 'merged']).default('merged'), // 🆕 新增
  generated_at: z.string(),
  // ... 其余字段保持不变
});
```

---

## 2. pi-agent 集成评估

### 现有 pi-agent 架构支持

根据 `src/lib/integrations/pi-agent/store.ts` 分析，现有的 `ProjectContext` 已经包含必要的上下文：

```typescript
interface ProjectContext {
  projectId: string;
  ontologyId?: string;
  currentPath?: string;
  projectName?: string;
  userId?: string;  // ✅ userId 字段已存在
}
```

### 实现方案：新增 TasteLoadingMiddleware

```typescript
/**
 * src/lib/integrations/pi-agent/middleware/taste-loader.ts
 *
 * 负责上下文感知的 TASTE 加载与融合
 */
import { TASTEProfile, TasteFuser } from '@/lib/taste';

export class TasteLoadingMiddleware {
  constructor(
    private userTasteDb: UserTasteDB,  // data/taste/users/{userId}/
    private projectTasteDb: ProjectTasteDB  // data/taste/projects/{projectId}/
  ) {}

  /**
   * 加载融合的 TASTE Profile
   */
  async loadMergedTaste(
    userId: string,
    projectId: string
  ): Promise<TASTEProfile | null> {
    try {
      const [userTaste, projectTaste] = await Promise.all([
        this.userTasteDb.getProfile(userId).catch(() => null),
        this.projectTasteDb.getProfile(projectId).catch(() => null)
      ]);

      if (!userTaste && !projectTaste) {
        return null;
      }

      if (!userTaste) {
        return projectTaste!;
      }

      if (!projectTaste) {
        return userTaste;
      }

      // 融合两层 TASTE
      const fuser = new TasteFuser();
      return fuser.fuse(userTaste, projectTaste);
    } catch (error) {
      console.error('[TasteLoadingMiddleware] Failed to load taste profile:', error);
      return null;
    }
  }

  /**
   * 实时更新 TASTE Profile（用于隐式触发）
   */
  async updateTasteFromFeedback(
    memory: TasteMemory,
    scope: 'user' | 'project'
  ): Promise<void> {
    const db = scope === 'user' ? this.userTasteDb : this.projectTasteDb;
    await db.addMemory(memory);
  }
}
```

### 集成到 pi-agent Store

```typescript
/**
 * src/lib/integrations/pi-agent/store.ts (扩展)
 */
import { TasteLoadingMiddleware } from './middleware/taste-loader';
import type { TASTEProfile } from '@/lib/taste';

export interface PiAgentStore {
  // === 现有状态 ===
  agent: OriginOSAgent | null;
  isInitialized: boolean;
  isRunning: boolean;
  sessionId: string | null;
  projectContext: ProjectContext | null;

  // === 🆕 TASTE 相关状态 ===
  /**
   * 融合后的 TASTE Profile
   */
  fusedTasteProfile: TASTEProfile | null;

  /**
   * TASTE 加载状态
   */
  isTasteLoading: boolean;

  // === 现有 Actions ===
  initialize: (sessionId: string, projectContext: ProjectContext, variables: Record<string, string>) => Promise<void>;
  sendMessage: (message: string) => Promise<void>;
  // ... 其他现有方法

  // === 🆕 TASTE 相关 Actions ===
  /**
   * 加载 TASTE Profile
   */
  loadTasteProfile: () => Promise<void>;

  /**
   * 更新 TASTE（从反馈）
   */
  updateTasteFromFeedback: (memory: TasteMemory, scope: 'user' | 'project') => Promise<void>;
}
```

### 系统提示词注入

```typescript
/**
 * src/lib/integrations/pi-agent/system/prompt.ts (扩展)
 */
import type { TASTEProfile } from '@/lib/taste';

export function buildSystemPromptWithTaste(
  variables: SystemPromptVariables,
  tasteProfile: TASTEProfile | null
): string {
  const base = ORIGINOS_SYSTEM_PROMPT.replace(/{(\w+)}/g, (_match, key): string => {
    const value = variables[key as keyof SystemPromptVariables];
    return value ?? `{${key}}`;
  });

  if (!tasteProfile) {
    return base;
  }

  const tasteSection = formatTasteForPrompt(tasteProfile);

  return `${base}\n\n## User Taste Profile\n${tasteSection}`;
}

function formatTasteForPrompt(profile: TASTEProfile): string {
  const sections: string[] = [];

  // Experience Topology
  if (profile.summary.experience_topology.length > 0) {
    sections.push('### Experience Topology');
    sections.push(`Domains where I have embodied judgment: ${profile.summary.experience_topology.join(', ')}`);
  }

  // Taste Standards
  if (Object.keys(profile.summary.taste_standards).length > 0) {
    sections.push('### Taste Standards');
    Object.entries(profile.summary.taste_standards).forEach(([domain, standards]) => {
      sections.push(`#### ${domain}`);
      sections.push(`Feels right: ${standards.positive_vibes.join('; ')}`);
      sections.push(`Feels wrong: ${standards.negative_vibes.join('; ')}`);
    });
  }

  // Symbiosis Boundary
  sections.push('### Symbiosis Boundary');
  if (profile.summary.symbiosis_boundary.delegated_domains.length > 0) {
    sections.push(`You can handle: ${profile.summary.symbiosis_boundary.delegated_domains.join(', ')}`);
  }
  if (profile.summary.symbiosis_boundary.reserved_domains.length > 0) {
    sections.push(`I handle personally: ${profile.summary.symbiosis_boundary.reserved_domains.join(', ')}`);
  }

  return sections.join('\n\n');
}
```

### 结论：无需新增 hook

- **现有机制足够：** `agent.subscribe()` 已经支持事件驱动
- **推荐集成点：** 在 `initialize()` 方法中加载 TASTE Profile
- **系统提示词注入：** 在每次 `prompt()` 前注入当前的 TASTE Profile

---

## 3. 演进机制设计

### 触发信号设计

```typescript
/**
 * TasteEvolutionTriggers
 */
interface TasteEvolutionTriggers {
  // 1. 显式触发（用户主动）
  explicit: {
    on_taste_edit: boolean;
    on_profile_update: boolean;
  };

  // 2. 隐式触发（系统后台）
  implicit: {
    on_feedback_accumulation: {
      threshold: number;  // e.g., 50 positive/negative feedbacks
    };
    on_confidence_shift: {
      delta: number;  // e.g., avg_confidence changes by > 0.2
    };
    on_domain_expansion: {
      new_domains: number;  // e.g., >3 new domains added
    };
  };

  // 3. 定时触发
  scheduled: {
    user_taste: 'weekly' | 'biweekly' | 'monthly';
    project_taste: 'weekly' | 'biweekly' | 'monthly';
  };
}

/**
 * 默认触发配置
 */
const DEFAULT_TRIGGERS: TasteEvolutionTriggers = {
  explicit: {
    on_taste_edit: true,
    on_profile_update: true,
  },
  implicit: {
    on_feedback_accumulation: { threshold: 50 },
    on_confidence_shift: { delta: 0.2 },
    on_domain_expansion: { new_domains: 3 },
  },
  scheduled: {
    user_taste: 'weekly',
    project_taste: 'monthly',
  },
};
```

### 演进频率建议

| 层级 | 推荐频率 | 理由 |
|------|----------|------|
| User TASTE | 每周 | 全局品味变化较慢，不需要频繁演化 |
| Project TASTE | 每月 | 项目级品味随项目进展阶段性变化 |
| 融合层 | 实时 | 每次交互时重新计算 |

### 冲突检测规则

```typescript
/**
 * 冲突检测接口
 */
interface Conflict {
  type: 'boundary' | 'standards' | 'tension';
  severity: 'low' | 'medium' | 'high';
  message: string;
  resolution: 'warn' | 'ask_user' | 'project_wins' | 'user_wins';
}

/**
 * 冲突检测器
 */
class ConflictDetector {
  detect(userTaste: TASTEProfile, projectTaste: TASTEProfile): Conflict[] {
    const conflicts: Conflict[] = [];

    // 1. Boundary 冲突检测
    conflicts.push(...this.detectBoundaryConflicts(userTaste, projectTaste));

    // 2. Standards 冲突检测
    conflicts.push(...this.detectStandardsConflicts(userTaste, projectTaste));

    // 3. Tension 冲突检测
    conflicts.push(...this.detectTensionConflicts(userTaste, projectTaste));

    return conflicts;
  }

  private detectBoundaryConflicts(userTaste: TASTEProfile, projectTaste: TASTEProfile): Conflict[] {
    const conflicts: Conflict[] = [];

    // 用户委托但项目保留的领域
    const userDelegate = new Set(userTaste.summary.symbiosis_boundary.delegated_domains);
    const projectReserved = new Set(projectTaste.summary.symbiosis_boundary.reserved_domains);

    userDelegate.forEach(domain => {
      if (projectReserved.has(domain)) {
        conflicts.push({
          type: 'boundary',
          severity: 'high',
          message: `Conflict: User delegates "${domain}" but Project reserves it`,
          resolution: 'ask_user',
        });
      }
    });

    return conflicts;
  }

  private detectStandardsConflicts(userTaste: TASTEProfile, projectTaste: TASTEProfile): Conflict[] {
    const conflicts: Conflict[] = [];

    // 检查同一领域下的相反标准
    const userStandards = userTaste.summary.taste_standards;
    const projectStandards = projectTaste.summary.taste_standards;

    Object.keys(userStandards).forEach(domain => {
      if (projectStandards[domain]) {
        const userPositive = new Set(userStandards[domain].positive_vibes);
        const projectNegative = new Set(projectStandards[domain].negative_vibes);

        userPositive.forEach(vibe => {
          if (projectNegative.has(vibe)) {
            conflicts.push({
              type: 'standards',
              severity: 'medium',
              message: `Conflict: User likes "${vibe}" in ${domain}, but Project dislikes it`,
              resolution: 'warn',
            });
          }
        });
      }
    });

    return conflicts;
  }

  private detectTensionConflicts(userTaste: TASTEProfile, projectTaste: TASTEProfile): Conflict[] {
    const conflicts: Conflict[] = [];

    const userControl = userTaste.summary.tension_position.control_level;
    const projectControl = projectTaste.summary.tension_position.control_level;

    // control_level 差异 > 0.3 视为冲突
    if (Math.abs(userControl - projectControl) > 0.3) {
      conflicts.push({
        type: 'tension',
        severity: 'low',
        message: `Tension mismatch: User control level ${userControl.toFixed(2)}, Project ${projectControl.toFixed(2)}`,
        resolution: 'project_wins',
      });
    }

    return conflicts;
  }
}
```

---

## 4. 技术架构图

```
┌─────────────────────────────────────────────────────────────┐
│                     OriginOS UI (CUI)                       │
└─────────────────────────┬───────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────────┐
│                  pi-agent Store                              │
│  ┌─────────────────────────────────────────────────────┐   │
│  │  TasteLoadingMiddleware (新增)                       │   │
│  │  - loadMergedTaste(userId, projectId)               │   │
│  │  - fuseTaste(userProfile, projectProfile)           │   │
│  │  - updateTasteFromFeedback(memory, scope)           │   │
│  └─────────────────────────────────────────────────────┘   │
└─────────────────────────┬───────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────────┐
│                  TASTE Layer (lib/taste)                    │
│  ┌────────────────┬────────────────────────────────────────┐ │
│  │  User TASTE    │  Project TASTE                          │ │
│  │  data/taste/   │  data/taste/projects/{projectId}/      │ │
│  │  users/{id}/   │                                         │ │
│  ├────────────────┼────────────────────────────────────────┤ │
│  │ ContextMemoryDB│ ContextMemoryDB                        │ │
│  │ TasteDistiller │ TasteDistiller                         │ │
│  │ ConflictDetector (新增)                                 │ │
│  └────────────────┴────────────────────────────────────────┘ │
└─────────────────────────┬───────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────────┐
│                  pi-agent Core                                   │
│  系统提示词注入 TASTE Profile → 影响决策                    │
└─────────────────────────────────────────────────────────────┘
```

---

## 5. 优先级排序

基于复杂度与价值的权衡：

| 优先级 | 任务 | 复杂度 | 价值 |
|--------|------|--------|------|
| P0 | Schema 统一与 scope 字段添加 | ⭐ | ⭐⭐⭐⭐ |
| P1 | TasteLoadingMiddleware 实现 | ⭐⭐ | ⭐⭐⭐⭐⭐ |
| P2 | 系统提示词注入集成 | ⭐⭐ | ⭐⭐⭐⭐ |
| P3 | 冲突检测规则 | ⭐⭐⭐ | ⭐⭐⭐ |
| P4 | 演进触发系统 | ⭐⭐⭐ | ⭐⭐ |

---

## 6. 潜在风险与缓解策略

| 风险 | 影响 | 缓解策略 |
|------|------|----------|
| Schema 分化导致重构成本高 | 高 | 早期设计 `scope` 字段，预留扩展空间 |
| 融合规则过于复杂 | 中 | 从 Override 策略开始，逐步演进 |
| 演进频率不当导致性能问题 | 低 | 增量更新 + 缓存机制 |
| 项目间品味污染 | 中 | 严格的 boundary 检查与隔离 |

---

## 总结

### 核心评估结论

1. **Schema 一致**：现有设计支持，建议添加 `scope` 字段明确层级
2. **pi-agent 集成**：通过新增 Middleware 实现，无需破坏性修改
3. **演进机制**：建议从显式触发 + 定时触发开始，逐步加入隐式触发

### 推荐实施路径

1. **Phase 1** (Week 1-2): Schema 统一 + Middleware 实现
2. **Phase 2** (Week 3-4): 系统提示词注入 + 基本融合规则
3. **Phase 3** (Week 5-6): 冲突检测 + 演进触发系统

### 下一步行动

- [ ] PM 确认两层架构的业务价值
- [ ] Developer 开始 P0 和 P1 任务
- [ ] Architect 提供详细的接口设计文档
