# Tasks

## 1. Proposal 与 Story 门禁

- [x] 1.1 完成 ONT.5 六文件、Proposal/spec/design/tasks 并通过 strict validation；依赖：无；并行性：串行；写入范围：`docs/specs/epic-ONT/story-ONT.5/**`、`docs/specs/epic-ONT/README.md`、本 change；负责角色：Proposal 集成者；必需测试：`npx -y @fission-ai/openspec validate implement-ontology-facts-actions-api --strict`、`git diff --check`；完成证据：2026-09-18 用户要求继续推进；strict validation 与 `git diff --check` 通过。

## 2. Core OSDK 实施

- [x] 2.1 实现公共请求/结果类型、facts 查询、latest 选择和引用门控；依赖：1.1；并行性：串行；写入范围：`packages/core/src/lib/features/ontology/types.ts`、`ontology-osdk.ts`、`index.ts`、定向测试；负责 subagent：Core Ontology Engineer；必需测试：版本/类型过滤/latest 正反例 Vitest 与 core TypeScript 编译；完成证据：Task commit `86c3f48`，ontology 33/33 与 core TypeScript 通过。
- [x] 2.2 实现 Action Gate、输入/输出/revision 校验、operation 指纹、intent 恢复、accepted 回执与审计 metadata；依赖：2.1；并行性：串行（与 2.1 重叠写入）；写入范围：`packages/core/src/lib/features/ontology/ontology-osdk.ts`、types 与同一测试文件；负责 subagent：Core Ontology Engineer；必需测试：写入前拒绝、幂等、冲突、部分恢复、Rule 拒绝和审计用例；完成证据：Task commit `86c3f48`，7 个 OSDK 用例通过。

## 3. 集成审查与回归

- [x] 3.1 审查并合并 Core Task commit 到 Proposal 分支，执行 ontology 全量 Vitest、core TypeScript 编译和 `git diff --check`；依赖：2.2；并行性：串行；写入范围：Proposal Git 集成和必要的同范围修复；负责角色：Proposal 集成者；必需测试：ontology 测试目录全部通过、core 编译通过；完成证据：Task 已合并；ontology 4 files/33 tests、core TypeScript 与 diff check 通过。
- [x] 3.2 执行 `pnpm lint`、`pnpm lint:boundaries`、架构 self-test 和 OpenSpec strict validation；依赖：3.1；并行性：串行；写入范围：仅必要修复；负责角色：QA 验证；必需测试：全部命令零错误；完成证据：lint 0 error/2983 既有 warning；边界 883 文件 0 诊断；self-test 43×2；strict validation 通过。

## 4. 规格同步与交付

- [x] 4.1 更新 ONT.5/Epic 状态、测试证据、AGENTS 公共边界和 `docs/changes/changelog.md`，同步 capability spec；依赖：3.2；并行性：串行；写入范围：对应文档、AGENTS、本 change tasks 和 `openspec/specs/ontology-facts-actions-api/`；负责角色：Proposal 集成者；必需测试：strict validation、链接与 diff 审查；完成证据：主 capability spec 已同步，Story/AGENTS/changelog 已更新，strict validation 通过。
- [x] 4.2 合并 Proposal 到 `dev`，复跑定向 smoke，归档 change 并清理本 Proposal/Task worktree 与分支；依赖：4.1；并行性：串行；写入范围：Git refs/worktree、OpenSpec archive；负责角色：Integration Maintainer；必需测试：post-merge ontology Vitest、core 编译、strict validation、主工作区状态审计；完成证据：dev merge `82a047f`；post-merge ontology 33/33、core 编译与 strict validation 通过；归档与清理随最终归档提交完成。
