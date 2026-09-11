# Epic AG: 架构治理与围栏对齐（Architecture Governance）

**Epic 编号:** AG（Architecture Governance）
**Epic 名称:** OriginOS 架构治理与围栏对齐
**优先级:** 🔴 Critical（阻塞 Epic 9 Phase 3 / Epic C 后续 Story 的强制门禁）
**状态:** 🚧 In Progress（AG5-T1 检查器完成，存量治理与其他任务待实施）
**创建日期:** 2026-05-31
**源依据:**
- `.understand-anything/intermediate/tour.json`（12 步导览，已验证当前分层）
- `.understand-anything/intermediate/architecture-layers.json`（10 层文件级归属）
- [CLAUDE.md v2.4.0](../../../CLAUDE.md) — 强制架构围栏
- 仓库扫描事实（grep / ls / 死路径检索，2026-05-31 静态盘点）

---

## 📋 概述

本 Epic 是一次**针对 CLAUDE.md 架构围栏的还债治理**。在 Epic 9（多 Agent 协作运行时）实施过程中，为了赶 Phase 1+2 进度，多个 Story 临时穿透了模块围栏；Epic C / Epic 0 也在 `src/lib/` 下散落了多个不在 `features/` 中的业务子目录。这些偏离已在 Story 9.27 中部分清偿，但仍残留以下硬性违规：

### 当前违规事实（2026-05-31 静态盘点）

| 类别 | 数量 / 路径 | 围栏依据 |
|------|------------|---------|
| **模块越界 import** | 11 处（`src/modules/**` → `@/lib/**` 或 `@/components/**`） | CLAUDE.md §模块依赖规约 #9 / 禁止事项 #9 |
| **死路径残留** | `agent-context-writer.ts:6` import `@/lib/collaboration-runtime-bridge/...`（目录已删） | CLAUDE.md §代码层面禁止 #5（未处理引用） |
| **服务层自我标注 deprecated** | `src/lib/collaboration-runtime-service/index.ts` 整文件 `@deprecated` | CLAUDE.md §禁止事项 — 未清理的 dead code |
| **`src/lib/` 业务目录散落** | `agents/ animations/ api/ collaboration-runtime-service/ interview/ ontology/ project/ sandbox/ skills/ system/ taste/`（11 个非 `features/` 目录） | CLAUDE.md §目录规则 #3「业务功能层 lib/features/」 |
| **跨 feature 内部循环依赖** | `lib/features/agent/index.ts` 重导出 `lib/skills/*`，而 `lib/skills/project-initialization/index.ts:9` 反向 import `@/lib/features/agent` | CLAUDE.md §依赖规则 4「Feature 之间必须通过 index.ts」+ §禁止双向依赖 |
| **组件分层不实现** | `src/components/atoms/` 不存在、`molecules/` 仅 2 文件、`organisms/CommandInterface.tsx` 死代码 | CLAUDE.md §组件分层「atoms/molecules/organisms」 |
| **`any` 类型预算溢出** | `src/lib/**` 非测试 `: any \| as any \| <any>` ≈ 115 处；`src/modules/**` ≈ 102 处 | CLAUDE.md §代码层面禁止 #1「禁止 any 类型」 |
| **缺少自动化围栏检查** | 无 ESLint `no-restricted-imports` 全局规则、无 dead-code 工具、无 `any` 预算门 | CLAUDE.md §依赖验证「npm run lint 自动检查依赖违规」 |

### 已被本治理覆盖的目标

1. **修复模块越界与死路径**（→ Story AG.1 + AG.2）
2. **把 `src/lib/` 的业务子目录迁回 `features/`，并打破 `features/agent ↔ skills/*` 循环**（→ Story AG.3）
3. **修订 CLAUDE.md 组件分层条款，把现实合法化或规整化**（→ Story AG.4）
4. **加自动化围栏（ESLint 边界规则 + dead-code 工具 + any 预算）**（→ Story AG.5）

### 不在本 Epic 范围

- Epic 9 Phase 3 高级特性（9.19、9.20、9.21、9.22、9.23）
- Epic C Pattern 机制后续优化
- 任何对 Pi Agent 行为语义的修改（仅做模块边界调整，不动语义）
- 业务功能补全 / Bug 修复 / UX 改造

---

## 🎯 Epic 目标

### 核心目标

1. **零越界 import** — `src/modules/**` 不再 import `@/lib/**` 或 `@/components/**`
2. **零死路径** — 所有 `import` 指向真实存在的目录与符号
3. **业务逻辑回归 `lib/features/`** — `src/lib/` 顶层只保留 `features/ integrations/ storage/ utils/ hooks/`
4. **打破已知循环依赖** — `features/agent ↔ skills/project-initialization` 链路重组
5. **CLAUDE.md 与现实一致** — 组件分层条款修订到当前合理且可执行的版本
6. **CI 自动拦截再发生** — ESLint 边界规则、dead-code 检查、`any` 预算检查全部接入 lint / CI

### 成功标准

- ✅ `grep -rn "from ['\"]@/lib" src/modules/` 输出 `0`
- ✅ `grep -rn "from ['\"]@/components" src/modules/` 输出 `0`
- ✅ `npx tsc --noEmit` 0 error（含 `src/modules/**`、`src/lib/**`、`src/components/**`、`src/app/**`）
- ✅ `npm run lint` 0 error（含新增的 `no-restricted-imports` 边界规则）
- ✅ `src/lib/` 顶层目录仅剩 `features/ integrations/ storage/ utils/ hooks/`（其他业务子目录全部迁移或删除）
- ✅ `src/lib/features/agent/index.ts` 不再 re-export `@/lib/skills/*`，`features/agent ↔ skills/*` 循环消除
- ✅ CI 接入 ts-prune（或 knip）的 dead-code 检查，新引入未使用导出 = build fail
- ✅ `any` 预算（`tsconfig.json` 的 `noImplicitAny=true` + 自定义脚本统计）：本 Epic 完成后 `src/modules/**` 非测试文件 `any` ≤ 30，`src/lib/**` 非测试文件 `any` ≤ 60；后续每个 PR 不得增加

---

## 🔗 前置依赖

| 依赖内容 | 来源 Epic / Story | 状态 |
|---------|------------------|------|
| Story 9.27 ARCH-RT-01/02（`bridge/` → `integrations/` 改名） | Epic 9 Story 9.27 | ✅ Complete |
| Story 9.27 ARCH-RT-09（`src/lib/collaboration-runtime-bridge/` 删除） | Epic 9 Story 9.27 | ✅ Complete |
| Story 9.38（`collaboration-runtime-service` 标 deprecated） | Epic 9 Story 9.38 | ✅ Complete |
| `.understand-anything` 项目扫描 | 项目内置扫描器 | ✅ Available |

### 被本 Epic 阻塞 / 解阻塞的下游

| 模块 | 关系 |
|------|------|
| Epic 9 Phase 3（9.19 Queen-Led / 9.20 HNSW / 9.21 Pool） | 依赖本 Epic 完成围栏修复，否则在已劣化模块边界上叠加复杂度 |
| Epic C Pattern 机制后续优化（C.10+） | 依赖 `lib/features/` 单向依赖恢复 |
| 任何新增 module（如 `memory-core`、未来的 `cognitive-runtime`） | 依赖 ESLint `no-restricted-imports` 默认规则到位 |

---

## 📝 Stories 列表

| Story | 标题 | 优先级 | 工时 | 状态 |
|-------|------|--------|------|------|
| **AG.1** | 死代码与死路径清理 | 🔴 Critical | 1–2 天 | 📋 Planning |
| **AG.2** | 模块边界修复（DI 接口扩展 + UI 下沉 + shared 层） | 🔴 Critical | 3–4 天 | 📋 Planning |
| **AG.3** | `src/lib/` 业务目录回归 `features/` + 循环依赖拆解 | 🟠 High | 3–5 天 | 📋 Planning |
| **AG.4** | 组件分层条款修订（CLAUDE.md + 现状对齐） | 🟠 High | 1 天 | 📋 Planning |
| **AG.5** | 自动化围栏（ESLint 边界 + dead-code 工具 + any 预算 + CI 接入） | 🟡 Medium | 2 天 | 🚧 In Progress（AG5-T1 完成） |

### 可选追加（用户后续决策）

| Story | 标题 | 备注 |
|-------|------|------|
| **AG.6**（可选） | `collaboration-runtime/facade` 与 `collaboration-runtime-service` 合并 | 依赖 AG.2 完成；用户曾倾向「先延后」 |
| **AG.7**（可选） | Module 内部 `facade ↔ session/engine` 子层边界规整 | 依赖 AG.5 lint 规则可表达内部边界 |

> AG.6 / AG.7 暂不在本 Epic 必做范围；如需启用，单独追加 Story 即可。

---

## 🚨 关键决策点（本 Epic 假设的默认选项）

> 用户尚未对以下 5 项决策做明确回复，Epic 按以下默认值推进。如需变更，对应 Story 内会留出 ALT 段落说明 fallback 路径。

| # | 决策 | 默认假设 | Fallback |
|---|------|---------|---------|
| 1 | 组件分层（atoms/molecules/organisms）是否继续坚持？ | **不坚持，修订 CLAUDE.md 合法化按业务域分组（os/skills/solution/...）** | Story AG.4 ALT-A：补齐 atoms/，把现有按域分组的组件按粒度拆 |
| 2 | `src/lib/*` 业务目录迁移节奏 | **AG.3 增量迁移，每子目录一个 PR，伴随 codemod 与 git 历史保留** | ALT-B：一次性大迁移 + 单 PR 切换（仅在 Story 内部协商） |
| 3 | 跨模块共享类型放哪里？ | **新增 `src/lib/shared/`（仅类型 + 接口，无实现），独立于 `features/` 与 `integrations/`，并在 CLAUDE.md 增补条款**（用户决议 2026-05-31） | ALT-C：复用 `src/types/`，在其下分子目录承载 |
| 4 | UI 模块（`MultiAgentLauncher` / `CollaborationViewer`）是否合并到 `src/components/os/`？ | **暂不合并，保留 `src/modules/collaboration-runtime/ui/` 豁免，但通过 shared 层取消对 `@/components/ui/*` 的直接 import** | ALT-D：UI 全量迁移到 `src/components/`（影响 import 范围更大，留待后续 Epic 决定） |
| 5 | Epic 编号 | **使用 `epic-AG`（Architecture Governance）字母后缀，与 epic-T / epic-C / epic-M 一致** | 用户可改为数字编号（如 `epic-10`）；只需重命名目录，文档结构不变 |

---

## 🏗️ 实施策略

### 串行 vs 并行

```
AG.1 (死代码清理)
  └─► AG.2 (模块边界修复)
       └─► AG.3 (lib/* → features/ 迁移 + 循环依赖)
            └─► AG.5 (自动化围栏接入 — 等迁移落地后再接 ESLint，避免阻塞迁移本身)

AG.4 (CLAUDE.md 修订) — 独立分支，可与 AG.1/AG.2/AG.3 并行起草，但合入需在 AG.3 落地后
```

### 按 Story 拆分原则

- **AG.1** 仅删除（reversible 风险最低）→ 优先完成，作为后续 Story 的清场
- **AG.2** 接口扩展 + import 路径替换（中风险）→ 在 AG.1 后立即开展
- **AG.3** 物理移动 + 改 import（高风险）→ 增量迁移、每个子目录单独 PR、保留 git mv 历史
- **AG.4** 文档变更（低风险）→ 与代码变更同节奏 PR，避免文档与现实再次背离
- **AG.5** 工具接入（低风险，但易引入大量噪音）→ 放在最后，先以 warning 接入，跑两周后升级 error

### 风险与回滚

| 风险 | 触发条件 | 回滚路径 |
|------|---------|---------|
| 大规模 import 重写引入运行时回归 | AG.2 / AG.3 替换 import | 每个 PR 必须含 `npm test` + `npm run lint` + `tsc` 三项 ✅；分目录提交便于精准 revert |
| `lib/features/agent` 重组打断会话能力 | AG.3 拆解循环 | 在拆分 PR 前为 `agentSessionService` 增加冒烟测试覆盖；拆分后跑回归 |
| ESLint 规则启用后大量 lint error 阻塞日常开发 | AG.5 直接 error 级 | 先 warning 模式跑 2 周，跑通后升 error；CI 仅在 PR diff 范围内拦截 |
| CLAUDE.md 修订与正在进行的其他 Epic 冲突 | AG.4 修订时 Epic 9 Phase 3 同步推进 | AG.4 修订前先 ping 各 Epic 负责人，文档变更只增条款不删条款 |

---

## ✅ 验收门禁

本 Epic 全部 Story 完成后，必须通过以下门禁才能 close：

1. - [ ] **零越界 import** — `grep -rn "from ['\"]@/lib" src/modules/ | wc -l` = `0`；`grep -rn "from ['\"]@/components" src/modules/ | wc -l` = `0`
2. - [ ] **零死路径** — `npx tsc --noEmit` 0 error；ts-prune（或 knip）0 unresolved 引用
3. - [ ] **`src/lib/` 顶层目录收敛** — 仅剩 `features/ integrations/ storage/ utils/ hooks/`（外加可选的 `shared/`）
4. - [ ] **零循环依赖** — `madge --circular src/` 输出 `No circular dependency found`
5. - [ ] **CLAUDE.md 与现实一致** — Component layering / shared 层 / Epic AG 决策记录已写入 CLAUDE.md
6. - [ ] **自动化围栏到位** — ESLint `no-restricted-imports` 配置生效；CI 跑 ts-prune；`any` 预算脚本接入 CI
7. - [ ] **`any` 预算达标** — `src/modules/**` 非测试 `any` ≤ 30；`src/lib/**` 非测试 `any` ≤ 60
8. - [ ] **changelog 已更新** — `docs/changes/changelog.md` 追加本 Epic 完成条目，CLAUDE.md 升版本号

---

## 📚 相关文档

- [CLAUDE.md（v2.4.0）](../../../CLAUDE.md) — 当前架构围栏全文
- [.understand-anything/intermediate/tour.json](../../../.understand-anything/intermediate/tour.json) — 12 步项目导览
- [.understand-anything/intermediate/architecture-layers.json](../../../.understand-anything/intermediate/architecture-layers.json) — 10 层文件归属
- [Epic 9 Story 9.27 — 协作运行时架构治理](../epic-9/story-9.27/README.md) — 同类治理的先例与残留项
- [Epic 9 README](../epic-9/README.md) — 模块边界豁免说明（collaboration-runtime）

---

## 🔄 变更历史

| 日期 | 变更内容 | 变更人 |
|------|---------|--------|
| 2026-05-31 | Epic AG 初始化 — 基于 .understand-anything 静态扫描 + CLAUDE.md 围栏审查 | AI |

---

## 📊 当前事实快照（2026-05-31 静态扫描）

> 用于本 Epic 实施过程中对照基线，每个 Story 完成后追加增量数据。

### 模块越界 import（11 处）

```text
src/modules/collaboration-runtime/ui/MultiAgentLauncher.tsx:6   → @/components/ui/chat-message
src/modules/collaboration-runtime/ui/MultiAgentLauncher.tsx:7   → @/components/ui/chat-input-bar
src/modules/collaboration-runtime/ui/MultiAgentLauncher.tsx:8   → @/lib/hooks/use-file-upload
src/modules/collaboration-runtime/ui/CollaborationViewer.tsx:20 → @/components/ui/chat-message
src/modules/collaboration-runtime/facade/session-store.ts:25    → @/lib/integrations/pi-agent/persistent-agent
src/modules/collaboration-runtime/engine/supervisor-dag.ts:30   → @/lib/integrations/pi-agent/server-config
src/modules/collaboration-runtime/engine/agent-context-writer.ts:6 → @/lib/collaboration-runtime-bridge/project-context-writer  # 死路径
src/modules/memory-core/core/consolidator.ts:11                 → @/lib/integrations/pi-agent/server-config
src/modules/memory-core/adapter.ts:9                            → @/lib/integrations/pi-agent/cognitive/types
src/modules/memory-core/session/enhanced-pattern-provider.ts:11 → @/lib/integrations/pi-agent/cognitive/types
src/modules/memory-core/session/memory-provider.ts:8            → @/lib/integrations/pi-agent/cognitive/types
```

### `src/lib/` 顶层目录现状

```text
src/lib/
├── agents/                          # ⚠️ 业务，应迁入 features/agent/（与现有 features/agent 合并）
├── animations/                      # ⚠️ 工具/资源，归属待定（utils/ 或 features/）
├── api/                             # ⚠️ 业务客户端，应迁入 features/
├── collaboration-runtime-service/   # ⚠️ 整文件 @deprecated，需评估清理或保留薄壳
├── features/                        # ✅ 合规（agent / culture / interview / ontology-data-store）
├── hooks/                           # ✅ 合规（基础设施层）
├── integrations/                    # ✅ 合规（pi-agent 等）
├── interview/                       # ⚠️ 业务，与 features/interview 重叠或重复
├── ontology/                        # ⚠️ 业务，应迁入 features/ontology
├── project/                         # ⚠️ 业务，应迁入 features/project
├── sandbox/                         # ⚠️ 业务，应迁入 features/sandbox 或 modules/
├── skills/                          # ⚠️ 业务（含 registry/executor/decision/project-initialization），应迁入 features/skills
├── storage/                         # ✅ 合规（基础设施层）
├── system/                          # ⚠️ 业务，归属待定
├── taste/                           # ⚠️ 业务，应迁入 features/taste（或与 Epic T 合并归口）
└── utils.ts                         # ✅ 合规
```

### `src/components/` 顶层目录现状

```text
src/components/
├── framework/                       # 业务域分组
├── interview/                       # 业务域
├── molecules/                       # 仅 2 个文件（ChatInput.tsx, MessageList.tsx），分层未实现
├── organisms/                       # 仅 1 个文件（CommandInterface.tsx），且为死代码候选
├── os/                              # 业务域分组（桌面 OS）
├── project/                         # 业务域
├── sandbox/                         # 业务域
├── skills/                          # 业务域
├── solution/                        # 业务域
├── taste/                           # 业务域
├── ui/                              # 基础 UI 组件（shadcn 风格）
└── window/                          # 业务域

# 缺：atoms/  → CLAUDE.md 写明的分层并未实现
```

### 已确认的循环依赖（feature 层）

```text
src/lib/features/agent/index.ts
  └─ re-export ← @/lib/skills/registry, /executor, /project-initialization, /decision
       └─ @/lib/skills/project-initialization/index.ts:9
            └─ import ← @/lib/features/agent  ⟲ 循环
```

### `any` 预算现状（非测试文件）

```text
src/lib/**     ≈ 115 处
src/modules/** ≈ 102 处
合计           ≈ 217 处
```


## 2026-09-11 首轮治理

AG.5 拆出 AG5-T1：修正现有 Monorepo 架构检查。提案 `fix-monorepo-boundary-lint` 已批准并完成检查器实现；新增 [34 条存量基线](story-AG.5/lint-baseline.md)。AG.1 历史目标多数已消失，本轮不重复删除；不以此声明 AG.1 全部验收通过。其他 Story 状态保持待重新核实。
