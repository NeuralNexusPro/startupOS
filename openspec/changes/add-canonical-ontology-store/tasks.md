# Tasks

## 1. 规格基线

- [x] 1.1 完成 ONT2-T1 Story 与 OpenSpec artifacts；依赖：ONT1-T1、ONT7-T1；写入范围：Story 与本 change；角色：Proposal owner；验证：strict validation；证据：`Change 'add-canonical-ontology-store' is valid`。

## 2. Core Store（串行）

- [ ] 2.1 隔离 Task worktree 中定义 fact/operation/migration record 并实现 canonical store；依赖：1.1；写入范围：ontology feature；角色：ontology core subagent；验证：core tsc；证据：Task commit。
- [ ] 2.2 添加最小 Vitest，覆盖原子快照、Date、并发 JSONL、截断/损坏、路径和 operation latest；依赖：2.1；写入范围：ontology tests；角色：ontology core subagent；验证：定向 Vitest；证据：测试输出。

## 3. 集成收口（串行）

- [ ] 3.1 合并 Task commit并运行定向测试、core tsc、lint、边界扫描、自测和 strict validation；依赖：2.1、2.2；角色：Proposal owner；验证：命令退出码；证据：验证记录。
- [ ] 3.2 核对旧 store/运行数据未改，更新 Story 状态与变更记录；依赖：3.1；角色：Proposal owner；验证：diff review；证据：文档记录。
- [ ] 3.3 合并 `dev`、归档 OpenSpec、清理 Task/Proposal worktree 与分支；依赖：3.2；角色：Proposal owner；验证：git/worktree/spec；证据：最终提交。
