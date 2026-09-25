# ONT.8 E2E 与恢复证据

**执行日期：** 2026-09-25  
**分支：** `0.4.x`

## 自动化结果

| 范围 | 命令摘要 | 结果 |
|---|---|---|
| Core E2E / persistence / recovery | `vitest` 运行 solution contract/store、ontology OSDK/migration、cross-package contract/service/recovery、project task source/board、collaboration ledger、Task Runtime coordinator | 11 files / 87 tests passed |
| Web contract / parity / board | `vitest` 运行 cross-package route、Web/Desktop parity、task board service/UI | 4 files / 22 tests passed |
| Desktop IPC / preload | `vitest` 运行 ontology IPC 与 preload allowlist | 2 files / 12 tests passed |
| Development module smoke | `pnpm --filter @originos/desktop build && pnpm --filter @originos/desktop verify:ontology-runtime` | passed |

测试使用临时 data root 和真实 `CanonicalOntologyStore`、`CanonicalOntologyOSDK`、`SolutionExecutionContractStore`、`CollaborationExecutionStore` 文件边界。Action、facts、operations、Run、WorkItem 与恢复回执均由公共 API 写入；transport 测试复用同一规范化请求矩阵。

## E01–E16 映射

| ID | 自动化证据 | 状态 |
|---|---|---|
| E01 | `contract-execution.test.ts` 的双任务/契约冻结用例验证 ontology version、contract hash、interview source 与 WorkItem binding | Passed |
| E02 | `execution-contract.test.ts` 拒绝未确认方案、拓扑/Verifier/I/O/权限/来源缺口且不返回契约 | Passed |
| E03 | `contract-execution.test.ts` 在上游未完成时拒绝下游，Worker/Verifier/Evidence 调用均为 0 | Passed |
| E04 | 同一 Agent 的两个 Task 产生独立 Run、WorkItem、input refs 和 ledger | Passed |
| E05 | v2 发布后持久化 v1 Run 仍加载 v1 hash/version | Passed |
| E06 | OSDK revision/operation conflict 与 WorkItem request/payload conflict 用例 | Passed |
| E07 | failed/placeholder verifier 不写 Evidence、不完成 WorkItem | Passed |
| E08 | `ontology-work-item-recovery.test.ts` 在 Action accepted、Evidence 前中断，重启只补 Evidence；fact/attempt 唯一 | Passed |
| E09 | pause/cancel recovery 用例证明暂停不自启、取消不复活 | Passed |
| E10 | unknown Evidence receipt 返回人工核对且不自动重放 | Passed |
| E11 | 新 lease 后旧 epoch receipt 被拒绝且不覆盖当前 attempt | Passed |
| E12 | `project-task-source.test.ts` 并发控制只有一个 revision 被接纳 | Passed |
| E13 | verifier/Evidence Gate 用例证明未通过证据时 Task/WorkItem 不完成 | Passed |
| E14 | Task source 每次从持久 Session 重建索引；损坏权威状态返回 unavailable；恢复不重做 Action | Passed |
| E15 | project scope、ontology reference、FactType 与 transport 敏感错误测试 | Passed |
| E16 | 1000 Task fixture 仅返回 50 条一页，两页查询与索引重建低于 500ms | Passed |

## 故障注入边界

- intent/worker receipt 后重启：只继续 verifier/Evidence，Worker 不重放。
- ontology Action accepted 后 Evidence 失败：operation/fact 保持唯一，恢复只登记缺失 Evidence。
- Evidence 回执未知：保持 `verifying`/人工核对，不生成幽灵完成。
- pause/cancel 后恢复：不自动执行。
- 旧 lease epoch：结构化拒绝。

## 平台状态

Development module resolution、preload allowlist 与 IPC contract 已通过。真实 Windows x64、macOS x64、macOS arm64 包由增强后的 `verify-windows-package.js` / `verify-mac-package.js` 检查 ONT service、WorkItem recovery、collaboration ledger、IPC protocol 和 Desktop adapter；对应实际构建结果在 platform evidence 中分别记录，未运行前保持 Pending。
