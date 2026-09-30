# refactor-agent-core 实施任务

对应 Story AG.10 Task AG10-T5。应用源码必须在 subagent Task worktree 实施（规约强制），本 Proposal 主 worktree 仅做规格、编排、集成。

## 1. subagent 实施包（串行，单一写入范围）

- [ ] 1.1 **WP-1 agent.ts 拆分实施**（角色：实施 subagent；依赖：无；写入范围：`packages/core/src/lib/integrations/pi-agent/core/agent.ts` + 同目录新建 3 文件 `agent-internals.ts` / `agent-completion.ts` / `agent-factory.ts`；串行——全部改动同一文件族，不可并行）
  - 按 design.md D1 清单移动：模块级 helper → `agent-internals.ts`（逐字）；completion 常量/类型 + 4 方法体 → `agent-completion.ts`（D3 ctx 变换，唯一非逐字）；工厂 → `agent-factory.ts`（逐字）。
  - 主类保留：字段/constructor/initialize/事件路由/生命周期/执行/set-get API + 4 个 completion 薄委托（可见性不变）+ 3 个公共工厂符号 re-export（`SessionData`/`CreateOriginOSAgentParams`/`createOriginOSAgent`）。
  - `SyntheticSystemMessage`/`SyntheticUserMessage` 主类 2 处构造点（applyLoopProtection / queueFollowUp）改为从 `./agent-completion` 导入。
  - 每个新文件顶部一句话职责注释（FR-3）；agent.ts 顶部补单句职责注释。
  - 必需测试：TC-1 / TC-2 / TC-3 / TC-4 / TC-6（命令见 testing.md 与本文件第 2 节）。

## 2. 验证（依赖 1.1）

- [ ] 2.1 TC-1 符号不变：拆分前后公共导出清单 diff 为空（`AgentCompletionPolicy`/`AgentExecutionOptions`/`OriginOSAgent`/`SessionData`/`CreateOriginOSAgentParams`/`createOriginOSAgent`）；消费方 import specifier 零变化（5 处包内生产导入 `./core/agent`、15 处测试导入/vi.mock（`store.test.ts` mock `"./core/agent.js"`、hooks 测试 mock `"../../core/agent.js"`、`agent.test.ts` 导入 `../agent` 等）、1 处 desktop side-effect 导入 `agent-worker-runtime-deps.ts`）。
- [ ] 2.2 TC-2 双端编译：`pnpm --filter @originos/web build`、`pnpm --filter @originos/desktop build` 0 error；`node scripts/expand-core-exports.cjs --verify` 通过（core exports 条目 `./lib/integrations/pi-agent/core/agent` target 不变）。
- [ ] 2.3 TC-3 测试基线：core agent 相关测试全绿——`agent.test.ts`（88 用例）、`completion-guard`、`completion-judge`、`agent-token-estimate`、`runtime-history-restore`、`store.test.ts`、hooks 4 测试；web/desktop 测试通过数 ≥ 基线（web 425/425、desktop 182/182）。
- [ ] 2.4 TC-4 循环检查：`npx madge --circular packages/core/src --extensions ts,tsx` ≤ 基线 12；`core/` 新增 3 文件无环。
- [ ] 2.5 TC-5 模块冒烟：`node scripts/check-architecture-boundaries.cjs`（或 `pnpm lint:boundaries`）无新增诊断；web dev 启动冒烟（agent 工厂经 store 消费，wiring 由 web build 静态导出覆盖）。
- [ ] 2.6 TC-6 行数达标：`wc -l` 新文件 ≤ 600；`agent.ts` 预期 ≤ 1500（1600 备用上限）。

## 3. 集成（依赖 2.x 全部通过）

- [ ] 3.1 Story AG.10 文档回写：testing.md TC-1~TC-6 结果（T5 行）、README 状态更新。
- [ ] 3.2 `openspec validate refactor-agent-core --strict` 通过（evidence 回填后复验）。
- [ ] 3.3 docs/changes 全量流水 + 版本归档；本任务不改架构围栏，AGENTS.md 预期不动。
- [ ] 3.4 Proposal 分支合并入 `refactor/arch-governance`（需用户显式授权），清理 Task/Proposal worktree。
