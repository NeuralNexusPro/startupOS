# 架构设计 - Story P2.6

**Story:** SOP I/O 契约（本体数据流）
**Epic:** P2 - AI 解决方案设计
**最后更新:** 2026-05-18

---

## 技术需求

### 涉及文件

```
src/types/solution.ts              # 新增 SkillIOContract, SOPStepIO
src/types/skill.ts                 # SkillMetadata 增加 inputContract/outputContract
skills/solution-design/SKILL.md    # Stage 2.5 扩展 I/O 契约生成
```

---

## 数据结构

### Skill 级 I/O 契约（solution.ts）

```typescript
// Skill 级 I/O 契约
export interface SkillInputContract {
  requires: Array<{
    objectType: string;
    minCount?: number;
    fields?: string[];
  }>;
}

export interface SkillOutputContract {
  produces: Array<{
    objectType: string;
    fields: string[];
    replaces?: boolean;
  }>;
}
```

### SOP 步骤级 I/O（solution.ts）

```typescript
// SOP 步骤级 I/O
export interface SOPStepIO {
  input: {
    source: 'ontology' | 'previous-step' | 'user';
    objects: Array<{
      type: string;
      operation: 'read' | 'query' | 'validate';
      filter?: string;
      fromStep?: string;
    }>;
  };
  output: {
    objects: Array<{
      type: string;
      operation: 'create' | 'update' | 'calculate';
      cardinality: 'one' | 'many';
    }>;
  };
}
```

### AgentSkill 扩展（solution.ts）

```typescript
export interface AgentSkill {
  // ... 现有字段 ...
  ontologyObjects: Record<string, string[]>;  // 改为 Record 格式
  inputContract?: SkillInputContract;         // 新增
  outputContract?: SkillOutputContract;       // 新增
  sopIO?: SOPStepIO;                          // 新增
}
```

### SkillMetadata 扩展（skill.ts）

```typescript
export interface SkillMetadata {
  // ... 现有字段 ...
  reads?: string[];    // 保留向后兼容
  writes?: string[];   // 保留向后兼容
  inputContract?: SkillInputContract;   // 新增
  outputContract?: SkillOutputContract; // 新增
}
```

---

## 模块设计

### 数据流验证规则

| 规则 | 条件 | 动作 |
|------|------|------|
| 连通性 | 步骤 N 的 `requires` 无来源 | 标记断链错误 |
| 类型匹配 | `produces` 的 `objectType` 与 `requires` 不一致 | 标记类型不匹配 |
| 字段覆盖 | `produces.fields` 不包含 `requires.fields` | 标记字段不足 |
| 循环依赖 | SOP DAG 中存在环 | 标记循环依赖 |

---

## 代码变更

### 实施步骤

1. 在 `src/types/solution.ts` 中新增 `SkillInputContract`、`SkillOutputContract`、`SOPStepIO` 接口
2. 扩展 `AgentSkill` 接口，添加 `inputContract`、`outputContract`、`sopIO` 字段
3. 将 `ontologyObjects` 格式从 `string[]` 改为 `Record<string, string[]>`
4. 在 `src/types/skill.ts` 中扩展 `SkillMetadata`，添加 `inputContract`、`outputContract` 字段
5. 更新 `skills/solution-design/SKILL.md`，在 Stage 2.5 中添加 I/O 契约生成逻辑
6. 确保所有新字段为 optional，保持向后兼容
7. 运行 `npx tsc --noEmit` 确认无编译错误
