# Tasks

## 1. 公共契约（串行）

- [x] 1.1 ONT7-T2 core 实施角色在独立 Task branch/worktree 中增加 projection query/resolver 输入与结果类型；依赖：Proposal 已批准；写入范围：`packages/core/src/lib/features/ontology/types.ts`；必需测试：core TypeScript 编译；完成证据：提交哈希与编译输出。

## 2. OSDK 查询与解析（串行）

- [x] 2.1 同一 core 实施角色扩展既有 `CanonicalOntologyOSDK`，实现 project/ontology/version 门控、execution identity/kind/revision 精确过滤和确定性 latest 语义；依赖：1.1；写入范围：`packages/core/src/lib/features/ontology/ontology-osdk.ts`；必需测试：projection query 正反例；完成证据：提交哈希与定向 Vitest 输出。
- [x] 2.2 同一 core 实施角色实现单条 projection resolver，对 canonical ontology 与 facts 做全字段精确引用校验，任一失败不返回部分结果；依赖：2.1；写入范围：`packages/core/src/lib/features/ontology/ontology-osdk.ts`；必需测试：成功、缺失、跨版本、错误归属和只读保证；完成证据：提交哈希与定向 Vitest 输出。

## 3. 测试与公共出口（串行）

- [x] 3.1 core 实施角色扩展现有 ontology OSDK 测试，覆盖跨 task/work item/attempt 隔离、latest tie-break、稳定顺序、结构化错误和 JSONL 无写入；依赖：2.2；写入范围：`packages/core/src/lib/features/ontology/__tests__/ontology-osdk.test.ts`；必需测试：该文件全部通过；完成证据：用例清单与 Vitest 输出。
- [x] 3.2 core 实施角色确认新增类型和方法由 ontology `index.ts` 公共入口可用且无需新增转发层；依赖：3.1；写入范围：仅在确有缺口时修改 `packages/core/src/lib/features/ontology/index.ts`；必需测试：core TypeScript 编译；完成证据：公共入口导入样例或现有星号导出说明。

## 4. 集成收口（串行）

- [x] 4.1 Proposal owner 合并 Task commit 后运行 core `tsc`、ontology 定向 Vitest、`pnpm lint`、`pnpm lint:boundaries`、架构 self-test、OpenSpec strict validation 与 `git diff --check`；依赖：3.2；写入范围：Proposal integration branch；完成证据：全部命令退出码与既有 warning 说明。
- [x] 4.2 Proposal owner 核对 Story verification goal：查询不串 context、latest 可复现、resolver fail closed、持久化无变化且下游未提前接线；依赖：4.1；写入范围：Story/OpenSpec 验证记录；完成证据：逐项验收结果。
- [ ] 4.3 Proposal owner 将验证通过的 Proposal 合并到约定基线，归档 OpenSpec，并清理 Task/Proposal worktree 与分支；依赖：4.2；写入范围：git/OpenSpec；完成证据：合并提交、归档 strict validation 与 worktree 清单。
