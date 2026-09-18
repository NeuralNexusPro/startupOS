# Tasks

## 1. 规格基线

- [x] 1.1 完成 ONT1-T1 的 Story 六份文档与 OpenSpec proposal/spec/design/tasks；依赖：无；写入范围：`docs/specs/epic-ONT/story-ONT.1/`、本 change 目录；角色：Proposal owner；验证：`openspec validate define-canonical-ontology-schema --strict`；证据：`Change 'define-canonical-ontology-schema' is valid`。

## 2. Core 公共模型（串行）

- [ ] 2.1 在隔离 Task worktree 由 ontology core subagent 向 `packages/core/src/lib/features/ontology/types.ts` 增加 canonical schema version、三层模型、业务状态、事实/Action/Event/Projection 与 Agent/Skill contract DTO；依赖：1.1；写入范围：ontology feature 类型文件；角色：ontology core subagent；验证：core TypeScript 编译；证据：Task commit 和编译输出。
- [ ] 2.2 在同一 Task worktree 增加最小正反类型样例，确认必需稳定引用可编译且缺失字段被 TypeScript 拒绝；依赖：2.1；写入范围：ontology feature 测试文件；角色：ontology core subagent；验证：仓库既有测试/类型检查命令；证据：通过输出。

## 3. 集成与收口（串行）

- [ ] 3.1 合并 Task commit 到 Proposal integration branch 并运行 `pnpm lint`、`pnpm lint:boundaries`、架构检查器 self-test 和相关 core 检查；依赖：2.1、2.2；写入范围：Proposal integration branch；角色：Proposal owner；证据：全部命令退出码为 0，或记录与本变更无关的既有失败。
- [ ] 3.2 核对 Story verification goal：公共出口可导入 canonical 类型、旧类型调用方无需修改、无运行数据变化；依赖：3.1；写入范围：Story/OpenSpec 状态文档；角色：Proposal owner；验证：diff 审查与定向编译；证据：验收项勾选及验证记录。
- [ ] 3.3 执行 OpenSpec strict validation，合并 Proposal branch 到 `dev`，确认只保留用户既有未提交修改并清理 Task/Proposal worktree 与临时分支；依赖：3.2；写入范围：git 集成状态；角色：Proposal owner；验证：`git status`、`git worktree list` 和合并提交；证据：最终 commit id。
