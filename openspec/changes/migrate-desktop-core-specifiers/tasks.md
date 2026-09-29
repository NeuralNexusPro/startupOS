# AG.8-T2 实施工作包

本 Proposal 对应 Story AG.8-T2。编号是 Proposal 内部工作包，不是新增可独立交付的 Story Task。

## 1. 准备

- [x] 1.1 串行；依赖设计批准。编排角色确认基线（from 119/27 文件、动态 9、测试 26、唯一子路径 57、types 5 子路径中 4 个经 `export *` 可达、`types/ontology` 需 index 补 2 符号）、建立 Task worktree 与分支。证据：基线命令输出与分支创建记录。

## 2. core + 工具链（WP-1）

- [x] 2.1 串行，依赖 1.1。subagent 在 `packages/core/src/types/index.ts` 的 ontology 显式重导出行补 `OntologyEntity`、`OntologyRelation`（仅此一处 core 源码改动）；验证 `pnpm --filter @originos/core build`（或 type-check）0 error。证据：diff 与编译输出。

## 3. desktop 迁移（WP-2，依赖 2.1 的重导出）

- [x] 3.1 串行，依赖 2.1。subagent 按 design.md D2 映射规则迁移 27 个非测试文件的 119 处 `from` + 9 处动态/typeof import；替换数与基线逐文件对账；每文件 `tsc --noEmit` 快速反馈，全量 `pnpm --filter @originos/desktop build` 0 error。证据：替换对账表与编译输出。
- [x] 3.2 串行，依赖 3.1。同 subagent 迁移测试文件 26 处（desktop 24 + web 2）；验证受影响测试文件 lint 通过。证据：grep 清零输出。

## 4. error 升级与规约状态（WP-1 范围，串行依赖 3.1/3.2 清零）

- [x] 4.1 串行，依赖 3.2。subagent 将 `.eslintrc.cjs` `no-restricted-syntax` warn → error、`check-architecture-boundaries.cjs` checker severity 同步 error 并更新 message 指引、selfTest 增加 error 级断言；验证 `node scripts/check-architecture-boundaries.cjs --self-test` 通过、`pnpm lint:boundaries` 0 诊断非零退出语义正确（此时应全绿）。证据：self-test 与扫描输出。
- [x] 4.2 串行，依赖 4.1。文档角色更新 `AGENTS.md`「跨包相对路径检查」段落（warning → 已升 error，v2.6.4）与 Story AG.8 文档（implementation.md T2 完成态、testing.md 结果表）。证据：AGENTS.md diff。

## 5. 集成与验收

- [x] 5.1 串行，依赖 4.2。Task 分支已合并（f2b4818、5905cde，无冲突）。TC-1 grep 清零（desktop+web 0 行）；TC-2 self-test 51/51；TC-3 desktop build + web type-check 0 error（fresh worktree 需先构建感知插件，为已知前置）；TC-4 `build:app` exit 0（F1 staging 自动扩展：70 个消费说明符 / 130 条 exports 全部 resolve）+ electron-builder `--dir` 打包成功（core dist 449 文件入包）+ 打包产物启动冒烟（APP-RUNNING、0 MODULE_NOT_FOUND、[setup-data-root] 正确、renderer Ready 140ms、ChannelRuntime/SchedulerService 就绪）；TC-6 desktop 测试失败集合与基线零 delta（存量 6：email-provisioning ×5 + verify-windows-package ×1），web 425/425 通过（一次 ProjectTaskBoard 5s 超时经三重复跑确认为环境性 flake：单跑、主工作区、worktree 复跑均通过）；`openspec validate migrate-desktop-core-specifiers --strict` 通过。
- [ ] 5.2 串行，依赖 5.1。编排角色将 Proposal 分支合入 `refactor/arch-governance`（需用户授权），清理 task worktree；Story AG.8 README 状态更新；docs/changes 记录。证据：合并哈希与清理清单。
