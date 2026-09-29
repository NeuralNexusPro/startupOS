# AG.8-T2 实施工作包

本 Proposal 对应 Story AG.8-T2。编号是 Proposal 内部工作包，不是新增可独立交付的 Story Task。

## 1. 准备

- [ ] 1.1 串行；依赖设计批准。编排角色确认基线（from 119/27 文件、动态 9、测试 26、唯一子路径 57、types 5 子路径中 4 个经 `export *` 可达、`types/ontology` 需 index 补 2 符号）、建立 Task worktree 与分支。证据：基线命令输出与分支创建记录。

## 2. core + 工具链（WP-1）

- [ ] 2.1 串行，依赖 1.1。subagent 在 `packages/core/src/types/index.ts` 的 ontology 显式重导出行补 `OntologyEntity`、`OntologyRelation`（仅此一处 core 源码改动）；验证 `pnpm --filter @originos/core build`（或 type-check）0 error。证据：diff 与编译输出。

## 3. desktop 迁移（WP-2，依赖 2.1 的重导出）

- [ ] 3.1 串行，依赖 2.1。subagent 按 design.md D2 映射规则迁移 27 个非测试文件的 119 处 `from` + 9 处动态/typeof import；替换数与基线逐文件对账；每文件 `tsc --noEmit` 快速反馈，全量 `pnpm --filter @originos/desktop build` 0 error。证据：替换对账表与编译输出。
- [ ] 3.2 串行，依赖 3.1。同 subagent 迁移测试文件 26 处（desktop 24 + web 2）；验证受影响测试文件 lint 通过。证据：grep 清零输出。

## 4. error 升级与规约状态（WP-1 范围，串行依赖 3.1/3.2 清零）

- [ ] 4.1 串行，依赖 3.2。subagent 将 `.eslintrc.cjs` `no-restricted-syntax` warn → error、`check-architecture-boundaries.cjs` checker severity 同步 error 并更新 message 指引、selfTest 增加 error 级断言；验证 `node scripts/check-architecture-boundaries.cjs --self-test` 通过、`pnpm lint:boundaries` 0 诊断非零退出语义正确（此时应全绿）。证据：self-test 与扫描输出。
- [ ] 4.2 串行，依赖 4.1。文档角色更新 `AGENTS.md`「跨包相对路径检查」段落（warning → 已升 error，v2.6.4）与 Story AG.8 文档（implementation.md T2 完成态、testing.md 结果表）。证据：AGENTS.md diff。

## 5. 集成与验收

- [ ] 5.1 串行，依赖 4.2。集成 subagent 合并 Task 分支到 Proposal integration branch；执行 TC-1（grep 清零）、TC-2（self-test）、TC-3（双端编译）、TC-4（`build:app` + 打包冒烟 + 启动验证，复用 T1 F1 闭环）、TC-6（测试基线不回退）；`openspec validate migrate-desktop-core-specifiers --strict`。证据：各项输出摘要。
- [ ] 5.2 串行，依赖 5.1。编排角色将 Proposal 分支合入 `refactor/arch-governance`（需用户授权），清理 task worktree；Story AG.8 README 状态更新；docs/changes 记录。证据：合并哈希与清理清单。
