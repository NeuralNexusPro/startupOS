## 1. Story 与 Proposal 门禁

- [x] 1.1 完成 ONT.4 六文件、Epic 清单和中文 OpenSpec artifacts；依赖：无；写入范围：`docs/specs/epic-ONT/`、本 change；角色：Proposal 集成；测试：OpenSpec strict validation；证据：校验输出和文档 diff。串行。

## 2. Core Validator 实现

- [x] 2.1 实现 canonical ontology 唯一性、层级与交叉引用校验；依赖：1.1；写入范围：`packages/core/src/lib/features/ontology/`；角色：`ont4-core` subagent；测试：合法 fixture、重复 ID、缺失/错误归属引用；证据：commit 与定向测试。串行。
- [x] 2.2 实现 ontology identity/version、Action/Concept、状态与权限门控并公共导出；依赖：2.1；写入范围：同 2.1；角色：同一 `ont4-core` subagent；测试：各稳定拒绝码、成功和无副作用；证据：commit、Vitest、core tsc。串行。

## 3. 集成与完成

- [x] 3.1 合并 subagent Task 分支并审查 API、错误码、输入不变性和范围；依赖：2.2；写入范围：Proposal 集成分支；角色：Proposal 集成；测试：定向 Vitest、core tsc；证据：merge commit 与 review。串行。
- [x] 3.2 运行 `pnpm lint`、`pnpm lint:boundaries`、架构 self-test、OpenSpec strict validation 和 Story 测试矩阵，回填证据；依赖：3.1；写入范围：文档与任务清单；角色：Proposal 集成；证据：命令输出。串行。
- [ ] 3.3 合并 Proposal 到 `dev`、同步主 spec、归档 change，并清理 Proposal/Task worktree 与分支；依赖：3.2；写入范围：Git 与 OpenSpec；角色：Proposal 集成；证据：dev/归档 commit 和 worktree 列表。串行。
