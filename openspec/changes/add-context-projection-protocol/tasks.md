# Tasks

## 1. 规格基线

- [x] 1.1 完成 ONT7-T1 Story 六份文档与 OpenSpec artifacts；依赖：ONT1-T1；写入范围：`docs/specs/epic-ONT/story-ONT.7/` 和本 change；角色：Proposal owner；验证：OpenSpec strict validation；证据：`Change 'add-context-projection-protocol' is valid`。

## 2. Core 协议（串行）

- [x] 2.1 在隔离 Task worktree 由 ontology core subagent 增加 decision、execution context、snapshot、projection record 与 checkpoint DTO；依赖：1.1；写入范围：ontology feature `types.ts`；角色：ontology core subagent；验证：core TypeScript 编译；证据：Task commit `aa9c6608037a374bd4a36adb166e55e23fdef8f7`，core `tsc` 退出码 0。
- [x] 2.2 扩展现有类型样例，验证完整 context/checkpoint 正例及缺少 attempt/contract hash 的反例；依赖：2.1；写入范围：ontology 类型样例；角色：ontology core subagent；验证：显式 `tsc`；证据：正例及两个 `@ts-expect-error` 反例编译退出码 0。

## 3. 集成收口（串行）

- [x] 3.1 合并 Task commit 并运行 core/fixture 编译、`pnpm lint`、边界扫描、自测和 OpenSpec strict validation；依赖：2.1、2.2；写入范围：Proposal integration branch；角色：Proposal owner；证据：全部命令退出码 0；lint 为 2983 条既有 warning、0 error，879 文件边界扫描 0 诊断。
- [x] 3.2 核对 Story verification goal：公共出口可导入协议、旧类型无需修改、EventStore 与运行数据未变化；依赖：3.1；写入范围：Story/OpenSpec 状态；角色：Proposal owner；验证：diff 审查；证据：fixture 从 `../index` 导入；diff 仅含 ontology types、类型样例及文档。
- [x] 3.3 合并到 `dev`、归档 OpenSpec 并清理 Task/Proposal worktree 与分支；依赖：3.2；写入范围：git/OpenSpec；角色：Proposal owner；验证：git 状态、worktree 清单和归档 spec strict validation；证据：合并提交 `fb22984`，Task/Proposal worktree 与分支已清理；归档验证记录在后续提交。
