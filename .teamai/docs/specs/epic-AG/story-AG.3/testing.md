# 测试策略 - Story AG.3

**Story:** `src/lib/*` 业务目录回归 `features/` + 循环依赖拆解
**Epic:** AG — 架构治理与围栏对齐
**最后更新:** 2026-07-17

---

## 测试策略

本 Story 的测试覆盖**循环依赖消除**、**物理迁移完整性**、**import 路径更新**和**运行时行为保持**四个维度。每个子目录迁移为独立 PR，每个 PR 必须独立通过全部验证。

### 测试前置条件

- AG.1 清场作业已完成
- AG.2 shared 层已建立
- 记录迁移前 `npm test` 基线和协作运行时 e2e 基线

---

## 验收测试用例

### TC-1: lib/ 顶层目录合规

**验证目标：** `src/lib/` 顶层仅剩合规目录

```bash
ls src/lib/
```

**预期结果：** 仅包含 `features/ integrations/ storage/ utils.ts hooks/ shared/`（外加可选 `animations/`），无其他业务子目录

---

### TC-2: 循环依赖清零

**验证目标：** 全仓无循环依赖

```bash
npx madge --circular src/
```

**预期结果：** 输出 `No circular dependency found`

---

### TC-3: 旧路径 import 清零

**验证目标：** 无任何 import 仍指向迁移前的旧路径

```bash
grep -rn "@/lib/agents\|@/lib/skills/[^i]\|@/lib/interview\|@/lib/ontology\|@/lib/project\|@/lib/sandbox\|@/lib/system\|@/lib/taste\|@/lib/api/" src/
```

**预期结果：** 无输出（0 条匹配）

---

### TC-4: features/agent re-export 清理

**验证目标：** `features/agent/index.ts` 不再 re-export skills 内部模块

**检查项：**
- `src/lib/features/agent/index.ts` 中无 `from '@/lib/skills/*'` 或 `from '@/lib/features/skills/*'` 的 re-export

---

### TC-5: skills/project-initialization 反向依赖解除

**验证目标：** `skills/project-initialization` 不再 import `@/lib/features/agent`

```bash
grep -rn "@/lib/features/agent" src/lib/features/skills/project-initialization/
```

**预期结果：** 无输出

---

### TC-6: TypeScript 编译通过

**验证目标：** 所有迁移和路径更新未引入类型错误

```bash
npx tsc --noEmit
```

**预期结果：** 0 error

---

### TC-7: 现有测试套件不退化

**验证目标：** 迁移未破坏运行时行为

```bash
npm test
```

**预期结果：** 通过率 ≥ 迁移前基线

---

### TC-8: 协作运行时核心 e2e 通过

**验证目标：** 迁移未影响协作运行时

**测试用例：**
1. HITL recovery
2. DAG execution
3. Supervisor mode
4. User message routing

**预期结果：** 全部 4 项通过

---

### TC-9: git mv 历史保留

**验证目标：** 每个迁移 PR 使用 `git mv` 而非 `mv`

**检查项：**
- PR diff 显示为 rename（非 delete + add）
- `git log --follow` 可追溯到迁移前的文件历史

---

### TC-10: CLAUDE.md 路径同步

**验证目标：** CLAUDE.md §目录结构规约 中引用的旧路径已由 AG.4 同步更新

**检查项：**
- CLAUDE.md 中无 `lib/agents/`、`lib/skills/`、`lib/ontology/` 等旧路径引用
