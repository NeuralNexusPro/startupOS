# 架构设计 - Story AG.3

**Story:** `src/lib/*` 业务目录回归 `features/` + 循环依赖拆解
**Epic:** AG — 架构治理与围栏对齐
**最后更新:** 2026-07-17

---

## 概述

将 `src/lib/` 顶层散落的 11 个业务目录迁移到 `lib/features/` 下，并先于物理迁移解除 `features/agent ↔ skills/project-initialization` 的循环依赖。每个子目录迁移为独立 PR，使用 `git mv` 保留 git 历史。

---

## A. 循环依赖拆解（先于物理迁移）

- [ ] **A-1** 解除 `src/lib/features/agent/index.ts` 对 `@/lib/skills/*` 的 re-export
  - 当前问题：
    - `features/agent/index.ts` re-export `skillRegistry / skillExecutor / agentDecisionMaker / ProjectInitializationSkill` 等
    - `skills/project-initialization/index.ts:9` 反向 import `@/lib/features/agent` 取 `agentSessionService`
    - 形成 `features/agent ↔ skills/project-initialization` 循环
  - 处理顺序：
    1. 把 `skills/project-initialization` 改为通过 shared（AG.2 引入）或显式 props 取得 `agentSessionService`，断掉反向 import
    2. 等迁移完成后（A-2~A-9 任意时刻），把 `features/agent/index.ts` 中的 re-export 删除，迁移所有外部 import 直接走 `@/lib/features/skills`
- [ ] **A-2** 跑 `npx madge --circular src/` 确认输出 `No circular dependency found`

---

## B. 物理迁移（每子目录单独 PR）

- [ ] **B-1** `lib/agents/` → `lib/features/agent/`
  - 比对旧 `lib/agents/project-agent.ts` 与新 `lib/integrations/pi-agent/project-agent/`
  - 若旧实现已被新实现替代 → 删除旧文件
  - 若仍被 API route / hook 引用 → 改 import 路径或合并到 features/agent
  - **使用 `git mv`**，保留历史
- [ ] **B-2** `lib/skills/` → `lib/features/skills/`
  - 子目录：`registry/`、`executor/`、`decision/`、`project-initialization/`
  - 处理 `executor.ts:import '../skills/decision'` 这类直接相对 import → 改通过 `index.ts` 公共 API
- [ ] **B-3** `lib/interview/` → 与 `lib/features/interview/` 合并
  - 比对两份实现，去重
  - 若旧 `lib/interview/` 仅是早期原型 → 删除
- [ ] **B-4** `lib/ontology/` → `lib/features/ontology/`
  - 同时合并 `lib/features/ontology-data-store/`（重命名为 `data-store/` 子模块）
- [ ] **B-5** `lib/project/` → `lib/features/project/`
- [ ] **B-6** `lib/sandbox/` → 评估归属：
  - 若是协作运行时配套 → 合并到 `src/modules/collaboration-runtime/sandbox/`（可能已存在）
  - 若是通用沙箱抽象 → `lib/features/sandbox/`
- [ ] **B-7** `lib/system/` → `lib/features/system/`
- [ ] **B-8** `lib/taste/` → `lib/features/taste/`（与 Epic T 协调，确保不破坏其进行中 Story）
- [ ] **B-9** `lib/api/` → `lib/features/api-clients/`（更名）
- [ ] **B-10** `lib/animations/` → 评估：
  - 若仅是 token / 常量 → 留 `lib/animations/` 作为基础设施
  - 若含 React 组件 / hook → 迁 `lib/features/animations/` 或 `src/components/`

---

## C. 每个子目录迁移 PR 必含的检查

- [ ] **C-1** 用 `git mv` 而不是 `mv`，保留历史
- [ ] **C-2** 每个目录迁移完成后跑 `tsc --noEmit` 验证
- [ ] **C-3** 跑 `grep -rn "@/lib/{old-path}" src/` 确认 import 路径全部更新
- [ ] **C-4** 跑 `npm test` + 相关 e2e（按子目录映射对应测试集）

---

## D. 跨 feature 直接 import 整改

- [ ] **D-1** 在迁移完成后 grep `from ['\"]@/lib/features/.*/(?!index)` 找出所有跨 feature 内部直接 import（绕过 index.ts 的）
- [ ] **D-2** 改为通过对应 feature 的 `index.ts` 公共 API
- [ ] **D-3** 若 feature 没暴露所需 API → 评估是否补暴露（公共 API 扩展），而不是直接打洞

---

## 技术细节

### 迁移命令模板（每个子目录一份 PR 的标准操作）

```bash
# 1. 用 git mv 保留历史
git mv src/lib/{old}/ src/lib/features/{new}/

# 2. 全局替换 import 路径
# 使用 ts-morph 或 vscode 的 search-and-replace；以下是 sed 示例（备选）
grep -rln "@/lib/{old}" src/ docs/ | xargs sed -i '' 's|@/lib/{old}|@/lib/features/{new}|g'

# 3. 验证
npx tsc --noEmit
npm run lint
npm test

# 4. 检查残余引用
grep -rn "@/lib/{old}" src/ docs/  # 应该为 0
```

### 推荐 codemod 工具

- **ts-morph**：编程式重命名 import，自动处理 re-export
- **jscodeshift**：批量转换
- **VS Code multi-cursor**：交互式确认

### 循环依赖打破示例

```typescript
// 处理前：lib/skills/project-initialization/index.ts:9
import { agentSessionService } from '@/lib/features/agent';  // ⟲ 循环

// 方案 1（推荐）：依赖注入
export class ProjectInitializationSkill {
  constructor(private deps: { agentSessionService: AgentSessionService }) {}
}

// 调用方负责注入：
import { agentSessionService } from '@/lib/features/agent';
import { ProjectInitializationSkill } from '@/lib/features/skills/project-initialization';
const skill = new ProjectInitializationSkill({ agentSessionService });

// 方案 2（次选）：通过 shared 共享接口
// src/lib/shared/agent/session-service.ts
export interface AgentSessionService { ... }

// project-initialization 仅 import 接口
import type { AgentSessionService } from '@/lib/shared/agent';
```
