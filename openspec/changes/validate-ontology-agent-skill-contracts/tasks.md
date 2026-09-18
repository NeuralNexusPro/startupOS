# Tasks

## 1. Proposal 与 Story 门禁

- [x] 1.1 完成 ONT.6 六文件与 Proposal/spec/design/tasks；依赖：无；并行性：串行；写入范围：`docs/specs/epic-ONT/story-ONT.6/**`、Epic README、本 change；负责角色：Proposal 集成者；必需测试：OpenSpec strict、`git diff --check`；完成证据：2026-09-18 用户要求继续推进；strict validation 与 diff check 通过。

## 2. Core Contract Validator

- [x] 2.1 实现 flow DTO、单 contract ontology/facts/actions/重复/权限校验；依赖：1.1；并行性：串行；写入范围：ontology `types.ts`、`contract-validator.ts`、`index.ts`、定向测试；负责 subagent：Core Ontology Engineer；必需测试：Agent/Skill 正例与全部结构化拒绝；完成证据：Task commits `c9837a3`、`501debd`；ontology 41/41 与 Core TypeScript 通过。
- [x] 2.2 实现 flow node/edge 引用、生产消费兼容、external input 与 required input 连通性校验；依赖：2.1；并行性：串行（重叠文件）；写入范围：同一 Core 文件与测试；负责 subagent：Core Ontology Engineer；必需测试：边两端、断流、optional、纯函数用例；完成证据：8 个 contract-validator 用例含 NUL 键碰撞回归通过。

## 3. 集成与回归

- [x] 3.1 审查并合并 Core Task，运行 ontology 全量 Vitest、core TypeScript 和 diff check；依赖：2.2；并行性：串行；写入范围：Proposal Git 集成及必要修复；负责角色：Proposal 集成者；必需测试：全部通过；完成证据：Task 已合并；ontology 5 files/41 tests、Core TypeScript 与 diff check 通过。
- [x] 3.2 运行 `pnpm lint`、`pnpm lint:boundaries`、架构 self-test 和 OpenSpec strict；依赖：3.1；并行性：串行；写入范围：仅必要修复；负责角色：QA 验证；必需测试：零错误；完成证据：lint 0 error/2983 既有 warning；边界 884 文件 0 诊断；self-test 43×2；strict 通过。

## 4. 规格同步与交付

- [x] 4.1 更新 Story/Epic、AGENTS、changelog 与主 capability spec；依赖：3.2；并行性：串行；写入范围：对应文档、AGENTS、本 tasks、`openspec/specs/ontology-contract-validation/`；负责角色：Proposal 集成者；必需测试：strict 与 diff check；完成证据：Story/AGENTS/changelog 和主 spec 已同步，strict 通过。
- [ ] 4.2 合并到 `dev`、post-merge smoke、归档并清理 worktree/branch；依赖：4.1；并行性：串行；写入范围：Git/OpenSpec archive；负责角色：Integration Maintainer；必需测试：ontology Vitest、Core 编译、spec strict、状态审计；完成证据：merge/archive commit 和 worktree 清单。
