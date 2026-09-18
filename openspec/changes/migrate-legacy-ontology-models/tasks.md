## 1. Story 与 Proposal 门禁

- [x] 1.1 完成 ONT.3 六文件、Epic 清单和中文 OpenSpec artifacts；依赖：无；写入范围：`docs/specs/epic-ONT/`、本 change；角色：Proposal 集成；测试：`openspec validate --strict`；证据：校验输出和文档 diff。串行。

## 2. Core 迁移实现

- [ ] 2.1 实现旧模型解析、确定性转换、dry-run 和只读兼容投影；依赖：1.1；写入范围：`packages/core/src/lib/features/ontology/`；角色：`ont3-core` subagent；测试：定向 Vitest、core tsc；证据：commit、测试输出。串行。
- [ ] 2.2 实现安全路径、原始字节备份、迁移审计、存在性拒绝及受版本保护的回滚；依赖：2.1；写入范围：同 2.1；角色：同一 `ont3-core` subagent；测试：成功、越界、已有目标、回滚和已修改拒绝；证据：commit、测试输出。串行。

## 3. 集成与完成

- [ ] 3.1 将 subagent Task 分支合并到 Proposal 分支并审查源码、公共导出与测试；依赖：2.2；写入范围：Proposal 集成分支；角色：Proposal 集成；测试：定向 Vitest、core tsc；证据：merge commit 与 review 记录。串行。
- [ ] 3.2 运行 `pnpm lint`、`pnpm lint:boundaries`、架构 self-test、OpenSpec strict validation 和 Story 测试矩阵，回填完成证据；依赖：3.1；写入范围：文档与任务清单；角色：Proposal 集成；证据：全部命令输出。串行。
- [ ] 3.3 合并 Proposal 到 `dev`，归档 OpenSpec change，并清理 Proposal/Task worktree 与已合并分支；依赖：3.2；写入范围：Git 集成与 OpenSpec archive；角色：Proposal 集成；证据：dev/归档 commit 与 worktree 列表。串行。
