# AG.8-T1 实施工作包

本 Proposal 唯一对应 Story AG.8-T1。以下编号是内部工作包，不是新增可独立交付的 Story Task。当前均未实施。

## 1. lint 防线

- [ ] 1.1 串行；依赖设计批准。编排角色核对基线（`grep -rEn "from ['\"](\.\./)+(\.\./)?core/src/" packages/desktop/src packages/web/src --include="*.ts" --include="*.tsx" | grep -v "__tests__\|\.test\."` 输出 123 处 / 30 文件；side-effect 21 处于 agent-worker-runtime-deps.ts），建立 Proposal integration branch `proposal/add-cross-package-specifier-imports` 与 subagent Task worktree；范围为本 Proposal 文档。证据：分支/worktree 建立命令与基线数字。
- [ ] 1.2 串行，依赖 1.1。工具链 subagent 在 `.eslintrc.cjs` 与 `scripts/check-architecture-boundaries.cjs` 范围新增 3 条 zones 规则（desktop/web/perception-plugins → core/src，warning）与 selfTest 正反例（invalid：from / side-effect / import type 三形态相对穿 core；valid：`@originos/core/lib/paths`）；验证 `node scripts/check-architecture-boundaries.cjs --self-test` 通过、`pnpm lint:boundaries` 报出存量违规且数量与基线一致。证据：warning 基线数字留档。
- [ ] 1.3 串行，依赖 1.2。核心 subagent 在同一 worktree 迁移 spike 文件：`setup-data-root.ts`（1 处）、`main.ts`（3 处）、`agent-worker-runtime-deps.ts`（21 处 side-effect，同步更新文件头注释）；统一改为 `@originos/core/...` 说明符，不改任何导出符号与逻辑；验证 `pnpm --filter @originos/desktop build` 0 error。证据：tsc 通过输出与 diff。

## 2. 产物验证

- [ ] 2.1 串行，依赖 1.3。核心 subagent 执行 `pnpm desktop:build:app` 打包并检查 `dist-electron/desktop/src/main/setup-data-root.js` 的 require 形态与产物启动；启动正常且无 `MODULE_NOT_FOUND` → 结论写入 Story architecture.md C-1；说明符字面量残留且无法加载 → 按 F1/F2 预案实施并留证。证据：require 形态摘录、启动日志关键行。
- [ ] 2.2 串行，依赖 2.1。文档角色把 spike 结论（产物解析机制、Fallback 决策）同步回 Story AG.8 architecture.md/implementation.md，并记录 warning 基线到 tasks.md；执行 `openspec validate add-cross-package-specifier-imports --strict`。证据：strict validation 通过输出。

## 3. 集成与验收

- [ ] 3.1 串行，依赖 2.2。集成 subagent 合并 Task 分支到 Proposal integration branch，处理冲突（限本 Story 受影响文件）；执行 Story testing.md TC-2/TC-3/TC-4、`pnpm lint`（确认无新增 error）、`pnpm lint:boundaries`、`node scripts/check-architecture-boundaries.cjs --self-test`、`pnpm test` 基线不回退。证据：各项命令输出摘要。
- [ ] 3.2 串行，依赖 3.1。编排角色将 Proposal 分支合入发布线（需用户授权），清理本任务 worktree（确认成果已保存且无人使用）；Story AG.8 README 状态更新。证据：合并提交哈希与清理清单。
