# TASTE 融合策略技术规范

**版本**: 1.0.0
**创建日期**: 2026-03-16
**作者**: Product Designer
**状态**: Draft → 待 Architect 审核

---

## 1. 概述

本文档定义了 User TASTE 和 Project TASTE 的融合策略，用于实现两层 TASTE 架构的核心功能。

### 1.1 两层架构

```
OriginOS TASTE 架构
├─ User TASTE (用户维度 - 全局)
│  ├─ 加载时机: OS 启动时
│  ├─ 数据来源: C.1 Onboarding 对话
│  └─ 存储: data/taste/users/{userId}/profile.json
│
└─ Project TASTE (项目维度 - 项目直觉)
   ├─ 加载时机: 进入项目后
   ├─ 加载方式: 与 User TASTE 融合
   ├─ 数据来源: C.5 项目创建访谈（隐形采集）
   └─ 存储: data/taste/projects/{projectId}/profile.json
```

### 1.2 融合原则

1. **项目上下文优先** - 在项目环境中，Project TASTE 覆盖 User TASTE 的同名设置
2. **谨慎委托** - 委托域取交集，确保安全
3. **保守保留** - 保留域取并集，保持用户控制
4. **加权平均** - 张力位置使用加权平均，Project 权重更高

---

## 2. 数据结构

### 2.1 TASTE Profile Schema

```typescript
interface TASTEProfile {
  version: string;
  createdAt: string;
  updatedAt: string;

  // 元数据
  metadata: {
    source: 'user' | 'project' | 'merged';
    confidence: number;
    evolution_count: number;
  };

  // 维度 1: 经验拓扑
  experience_topology: string[];

  // 维度 2: 品味标准
  taste_standards: {
    [domain: string]: {
      positive_vibes: string[];
      negative_vibes: string[];
    };
  };

  // 维度 3: 张力位置
  tension_position: {
    control_level: number;        // 0-1
    trust_level: number;          // 0-1
    intervention_threshold: number; // 0-1
  };

  // 维度 4: 共生边界
  symbiosis_boundary: {
    delegated_domains: string[];
    reserved_domains: string[];
    contextual_triggers: string[];
    control_level: number;        // 0-1
  };
}
```

### 2.2 融合配置 Schema

```typescript
interface TASTEMergeConfig {
  // 经验拓扑融合
  experience_topology: {
    strategy: 'merge';
    priority: 'none';  // 无优先级，合并所有
  };

  // 品味标准融合
  taste_standards: {
    strategy: 'project_priority';
    sameDomain: 'project_wins';  // 同领域时项目覆盖用户
    diffDomain: 'merge';         // 不同领域合并
  };

  // 张力位置融合
  tension_position: {
    strategy: 'weighted_average';
    weights: {
      user: 0.3;
      project: 0.7;  // 项目权重更高
    };
  };

  // 共生边界融合
  symbiosis_boundary: {
    delegated_domains: 'intersection';  // 委托域取交集（更谨慎）
    reserved_domains: 'union';          // 保留域取并集（更保守）
    contextual_triggers: 'merge';       // 触发器合并
    control_level: 'weighted_average';
  };
}
```

---

## 3. 融合算法

### 3.1 主融合函数

```typescript
/**
 * 融合 User TASTE 和 Project TASTE
 * @param userTASTE User TASTE Profile
 * @param projectTASTE Project TASTE Profile
 * @returns 融合后的 TASTE Profile
 */
function mergeTASTE(
  userTASTE: TASTEProfile,
  projectTASTE: TASTEProfile
): TASTEProfile {
  return {
    version: '1.0.0',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),

    metadata: {
      source: 'merged',
      confidence: Math.max(
        userTASTE.metadata.confidence,
        projectTASTE.metadata.confidence
      ),
      evolution_count: userTASTE.metadata.evolution_count +
                       projectTASTE.metadata.evolution_count,
    },

    // 维度 1: 经验拓扑 - 合并去重
    experience_topology: mergeArrays(
      userTASTE.experience_topology,
      projectTASTE.experience_topology
    ),

    // 维度 2: 品味标准 - 项目优先
    taste_standards: mergeTasteStandards(
      userTASTE.taste_standards,
      projectTASTE.taste_standards
    ),

    // 维度 3: 张力位置 - 加权平均
    tension_position: mergeTensionPosition(
      userTASTE.tension_position,
      projectTASTE.tension_position,
      { user: 0.3, project: 0.7 }
    ),

    // 维度 4: 共生边界 - 交集/并集
    symbiosis_boundary: mergeSymbiosisBoundary(
      userTASTE.symbiosis_boundary,
      projectTASTE.symbiosis_boundary
    ),
  };
}
```

### 3.2 各维度融合函数

#### 3.2.1 经验拓扑融合

```typescript
/**
 * 经验拓扑融合：合并去重
 */
function mergeArrays(user: string[], project: string[]): string[] {
  return [...new Set([...user, ...project])];
}
```

**逻辑说明：**
- 合并两个数组
- 去除重复项
- 无优先级区分

#### 3.2.2 品味标准融合

```typescript
/**
 * 品味标准融合：项目优先
 */
function mergeTasteStandards(
  user: TASTEProfile['taste_standards'],
  project: TASTEProfile['taste_standards']
): TASTEProfile['taste_standards'] {
  const result = { ...user };

  for (const [domain, standards] of Object.entries(project)) {
    if (result[domain]) {
      // 同领域：项目覆盖用户
      result[domain] = {
        positive_vibes: standards.positive_vibes,
        negative_vibes: standards.negative_vibes,
      };
    } else {
      // 不同领域：添加到结果
      result[domain] = standards;
    }
  }

  return result;
}
```

**逻辑说明：**
- 用户品味标准作为基础
- 项目品味标准覆盖同领域设置
- 不同领域的品味标准合并

#### 3.2.3 张力位置融合

```typescript
/**
 * 张力位置融合：加权平均
 */
function mergeTensionPosition(
  user: TASTEProfile['tension_position'],
  project: TASTEProfile['tension_position'],
  weights: { user: number; project: number }
): TASTEProfile['tension_position'] {
  const { user: uw, project: pw } = weights;

  return {
    control_level: weightedAverage(
      user.control_level,
      project.control_level,
      uw,
      pw
    ),
    trust_level: weightedAverage(
      user.trust_level,
      project.trust_level,
      uw,
      pw
    ),
    intervention_threshold: project.intervention_threshold, // 项目优先
  };
}

function weightedAverage(
  userValue: number,
  projectValue: number,
  userWeight: number,
  projectWeight: number
): number {
  return userValue * userWeight + projectValue * projectWeight;
}
```

**逻辑说明：**
- `control_level`: 加权平均，Project 权重 0.7
- `trust_level`: 加权平均，Project 权重 0.7
- `intervention_threshold`: 项目优先（直接使用项目值）

#### 3.2.4 共生边界融合

```typescript
/**
 * 共生边界融合：交集/并集
 */
function mergeSymbiosisBoundary(
  user: TASTEProfile['symbiosis_boundary'],
  project: TASTEProfile['symbiosis_boundary']
): TASTEProfile['symbiosis_boundary'] {
  return {
    // 委托域：取交集（更谨慎）
    delegated_domains: intersection(
      user.delegated_domains,
      project.delegated_domains
    ),

    // 保留域：取并集（更保守）
    reserved_domains: union(
      user.reserved_domains,
      project.reserved_domains
    ),

    // 触发器：合并去重
    contextual_triggers: mergeArrays(
      user.contextual_triggers,
      project.contextual_triggers
    ),

    // 控制级别：加权平均
    control_level: weightedAverage(
      user.control_level,
      project.control_level,
      0.3,
      0.7
    ),
  };
}

function intersection(a: string[], b: string[]): string[] {
  return a.filter(item => b.includes(item));
}

function union(a: string[], b: string[]): string[] {
  return [...new Set([...a, ...b])];
}
```

**逻辑说明：**
- `delegated_domains`: 取交集，只委托两者都同意的领域
- `reserved_domains`: 取并集，保留任一方要求保留的领域
- `contextual_triggers`: 合并去重
- `control_level`: 加权平均

**⚠️ 注意：与现有代码的差异**

现有代码 `src/types/taste.ts` 中的 `mergeTASTEProfiles` 函数对 `delegated_domains` 使用了并集：
```typescript
// 现有代码（需要修改）
delegated_domains: [...new Set([...user.delegated_domains, ...project.delegated_domains])],
```

**建议修改为：**
```typescript
// 推荐实现（更安全）
delegated_domains: user.delegated_domains.filter(d => project.delegated_domains.includes(d)),
```

**理由：** Architect 在 `TASTE_ARCH_ASSESSMENT.md` 中明确指出：
> delegated_domains: Union (More delegated = more contextual flexibility)

但 Product Designer 建议使用交集，理由是：
1. 更安全：只委托用户和项目都同意的领域
2. 更谨慎：避免在项目环境中自动执行用户未预期的操作
3. 符合"保留域取并集"的对偶原则

**最终决策：** 请 Architect 和 PM 确认使用交集还是并集。

---

## 4. 融合时机

### 4.1 加载流程

```typescript
class TasteLoader {
  private mergedCache: Map<string, TASTEProfile> = new Map();

  /**
   * 加载 TASTE（根据上下文）
   */
  async loadTASTE(context: {
    userId: string;
    projectId?: string;
  }): Promise<TASTEProfile> {
    const { userId, projectId } = context;

    // 无项目：仅加载 User TASTE
    if (!projectId) {
      return await this.loadUserTASTE(userId);
    }

    // 有项目：检查缓存
    const cacheKey = `${userId}:${projectId}`;
    if (this.mergedCache.has(cacheKey)) {
      return this.mergedCache.get(cacheKey)!;
    }

    // 加载并融合
    const [user, project] = await Promise.all([
      this.loadUserTASTE(userId),
      this.loadProjectTASTE(projectId),
    ]);

    const merged = mergeTASTE(user, project);

    // 缓存结果
    this.mergedCache.set(cacheKey, merged);

    return merged;
  }

  /**
   * 加载 User TASTE
   */
  private async loadUserTASTE(userId: string): Promise<TASTEProfile> {
    const path = `data/taste/users/${userId}/profile.json`;
    return await fs.readJSON(path);
  }

  /**
   * 加载 Project TASTE
   */
  private async loadProjectTASTE(projectId: string): Promise<TASTEProfile> {
    const path = `data/taste/projects/${projectId}/profile.json`;
    return await fs.readJSON(path);
  }

  /**
   * 清除缓存（项目切换时）
   */
  clearCache(userId: string, projectId?: string): void {
    if (projectId) {
      this.mergedCache.delete(`${userId}:${projectId}`);
    } else {
      // 清除所有该用户的缓存
      for (const key of this.mergedCache.keys()) {
        if (key.startsWith(userId)) {
          this.mergedCache.delete(key);
        }
      }
    }
  }
}
```

### 4.2 生命周期事件

| 事件 | 行为 | TASTE 状态 |
|------|------|-----------|
| OS 启动 | 加载 User TASTE | User only |
| 进入项目 | 加载 Project TASTE → 融合 | Merged |
| 切换项目 | 清除缓存 → 加载新 Project → 融合 | Merged (new) |
| 退出项目 | 清除缓存 | User only |
| User TASTE 更新 | 清除所有缓存 → 重新融合 | Merged |
| Project TASTE 更新 | 清除对应缓存 → 重新融合 | Merged |

---

## 5. 与 pi-agent 集成

### 5.1 上下文注入

```typescript
interface AgentContext {
  taste: TASTEProfile;
  userId: string;
  projectId?: string;
  // ... 其他上下文
}

class AgentContextManager {
  private tasteLoader: TasteLoader;

  async buildContext(
    userId: string,
    projectId?: string
  ): Promise<AgentContext> {
    const taste = await this.tasteLoader.loadTASTE({ userId, projectId });

    return {
      taste,
      userId,
      projectId,
    };
  }
}
```

### 5.2 pi-agent Prompt 注入

```typescript
function buildAgentPrompt(context: AgentContext): string {
  const { taste, projectId } = context;

  // 根据 TASTE 构建 prompt
  const tasteContext = formatTASTEForPrompt(taste);

  return `
你是一个智能助手，服务于用户。

## 用户品味档案

${tasteContext}

${projectId ? `当前项目上下文已加载，品味偏好已根据项目环境调整。` : ''}

请根据上述品味档案调整你的行为和建议方式。
`;
}

function formatTASTEForPrompt(taste: TASTEProfile): string {
  return `
### 经验领域
${taste.experience_topology.join('、')}

### 品味标准
${Object.entries(taste.taste_standards)
  .map(([domain, std]) =>
    `- ${domain}:\n  ✓ ${std.positive_vibes.join('、')}\n  ✗ ${std.negative_vibes.join('、')}`
  )
  .join('\n')}

### 协作偏好
- 控制级别: ${(taste.tension_position.control_level * 100).toFixed(0)}%
- 信任级别: ${(taste.tension_position.trust_level * 100).toFixed(0)}%
- 介入阈值: ${(taste.tension_position.intervention_threshold * 100).toFixed(0)}%

### 委托边界
- 可委托: ${taste.symbiosis_boundary.delegated_domains.join('、') || '无'}
- 需保留: ${taste.symbiosis_boundary.reserved_domains.join('、') || '全部'}
`;
}
```

---

## 6. 测试场景

### 6.1 单元测试

```typescript
describe('mergeTASTE', () => {
  it('should merge experience_topology', () => {
    const user = createMockTASTE({
      experience_topology: ['web-dev', 'api-design'],
    });
    const project = createMockTASTE({
      experience_topology: ['api-design', 'database'],
    });

    const merged = mergeTASTE(user, project);

    expect(merged.experience_topology).toEqual(
      expect.arrayContaining(['web-dev', 'api-design', 'database'])
    );
    expect(merged.experience_topology.length).toBe(3);
  });

  it('should prioritize project taste_standards in same domain', () => {
    const user = createMockTASTE({
      taste_standards: {
        'web-dev': {
          positive_vibes: ['clean-code'],
          negative_vibes: ['complexity'],
        },
      },
    });
    const project = createMockTASTE({
      taste_standards: {
        'web-dev': {
          positive_vibes: ['velocity'],
          negative_vibes: ['over-engineering'],
        },
      },
    });

    const merged = mergeTASTE(user, project);

    expect(merged.taste_standards['web-dev']).toEqual({
      positive_vibes: ['velocity'],
      negative_vibes: ['over-engineering'],
    });
  });

  it('should calculate weighted average for tension_position', () => {
    const user = createMockTASTE({
      tension_position: {
        control_level: 0.8,
        trust_level: 0.6,
        intervention_threshold: 0.7,
      },
    });
    const project = createMockTASTE({
      tension_position: {
        control_level: 0.4,
        trust_level: 0.8,
        intervention_threshold: 0.3,
      },
    });

    const merged = mergeTASTE(user, project);

    // control_level: 0.8 * 0.3 + 0.4 * 0.7 = 0.52
    expect(merged.tension_position.control_level).toBeCloseTo(0.52);
    // trust_level: 0.6 * 0.3 + 0.8 * 0.7 = 0.74
    expect(merged.tension_position.trust_level).toBeCloseTo(0.74);
    // intervention_threshold: project wins
    expect(merged.tension_position.intervention_threshold).toBe(0.3);
  });

  it('should use intersection for delegated_domains', () => {
    const user = createMockTASTE({
      symbiosis_boundary: {
        delegated_domains: ['doc-gen', 'code-formatting', 'testing'],
        reserved_domains: ['architecture'],
        contextual_triggers: [],
        control_level: 0.5,
      },
    });
    const project = createMockTASTE({
      symbiosis_boundary: {
        delegated_domains: ['doc-gen', 'code-formatting'],
        reserved_domains: ['database-schema'],
        contextual_triggers: [],
        control_level: 0.7,
      },
    });

    const merged = mergeTASTE(user, project);

    expect(merged.symbiosis_boundary.delegated_domains).toEqual(
      ['doc-gen', 'code-formatting']
    );
  });

  it('should use union for reserved_domains', () => {
    const user = createMockTASTE({
      symbiosis_boundary: {
        delegated_domains: [],
        reserved_domains: ['architecture'],
        contextual_triggers: [],
        control_level: 0.5,
      },
    });
    const project = createMockTASTE({
      symbiosis_boundary: {
        delegated_domains: [],
        reserved_domains: ['database-schema'],
        contextual_triggers: [],
        control_level: 0.7,
      },
    });

    const merged = mergeTASTE(user, project);

    expect(merged.symbiosis_boundary.reserved_domains).toEqual(
      expect.arrayContaining(['architecture', 'database-schema'])
    );
  });
});
```

### 6.2 集成测试

```typescript
describe('TasteLoader', () => {
  it('should load user TASTE only when no project', async () => {
    const loader = new TasteLoader();
    const taste = await loader.loadTASTE({ userId: 'user-1' });

    expect(taste.metadata.source).toBe('user');
  });

  it('should merge TASTE when project provided', async () => {
    const loader = new TasteLoader();
    const taste = await loader.loadTASTE({
      userId: 'user-1',
      projectId: 'project-1',
    });

    expect(taste.metadata.source).toBe('merged');
  });

  it('should cache merged result', async () => {
    const loader = new TasteLoader();

    await loader.loadTASTE({ userId: 'user-1', projectId: 'project-1' });
    await loader.loadTASTE({ userId: 'user-1', projectId: 'project-1' });

    // 验证只读取了一次
    expect(fs.readJSON).toHaveBeenCalledTimes(2); // user + project
  });

  it('should clear cache on project switch', async () => {
    const loader = new TasteLoader();

    await loader.loadTASTE({ userId: 'user-1', projectId: 'project-1' });
    loader.clearCache('user-1', 'project-1');
    await loader.loadTASTE({ userId: 'user-1', projectId: 'project-1' });

    // 验证重新读取
    expect(fs.readJSON).toHaveBeenCalledTimes(4); // 2 * (user + project)
  });
});
```

---

## 7. 性能考虑

### 7.1 缓存策略

- **内存缓存**: 当前活跃用户的融合结果
- **缓存键**: `{userId}:{projectId}`
- **失效条件**: TASTE 更新、项目切换

### 7.2 性能指标

| 操作 | 目标延迟 | 实现方式 |
|------|---------|---------|
| 加载 User TASTE | < 10ms | 文件读取 + JSON 解析 |
| 融合计算 | < 5ms | 内存计算 |
| 总体加载 | < 50ms | 缓存 + 并行读取 |

---

## 8. 变更历史

| 日期 | 版本 | 变更内容 | 变更人 |
|-----|-----|---------|-------|
| 2026-03-16 | 1.0.0 | 初始版本 - 融合策略技术规范 | Product Designer |

---

## 9. 审核状态

- [x] Product Designer 设计完成
- [ ] Architect 技术可行性审核
- [ ] Developer 实现确认
- [ ] QA 测试验收

---

**文档位置**: `docs/specs/epic-C/taste-merge-strategy.md`
