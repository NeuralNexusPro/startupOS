# Tasks

## 1. Core 权威投影

- [x] 1.1 `943-T3-A`（串行；依赖：Proposal strict validation；角色：Core project subagent；写入：Task Runtime 公共类型、project source/board 与定向测试）增加可选版本化 projectMetadata，并聚合同项目 Run/WorkItem 的 Agent、状态、产物和恢复摘要；验证旧任务兼容、项目隔离、WorkItem 完成不推进 Task、1000 条 fixture 仍按 50 分页。证据：portable commit `cdc9c1581a72f485a08b9e9c43315c7eaa452d00` 已集成；定向 12/12、project feature 31/31、组合回归 37/37 与 Core typecheck 通过。

## 2. Web 分页与筛选

- [x] 2.1 `943-T3-B`（串行；依赖：1.1；角色：Web task board subagent；写入：project task board service/UI 与组件测试）实现 cursor 加载更多、taskId/revision 合并、文本+Agent+优先级组合筛选、执行徽标和详情字段；验证草稿/选择保留、无 cursor 禁用和旧任务“未设置”。完成证据：看板使用权威 cursor 追加并按 `taskId`/revision 去重，组合筛选和选择在分页期间保持；运行状态、恢复能力、优先级、Agent、产物与语义引用均来自 Core 投影；2026-09-25 Web 定向 2 files/11 tests、Web typecheck 与 diff check 通过。

## 3. 验收

- [x] 3.1 `943-T3-C`（串行；依赖：2.1；角色：Integration owner；写入：evidence 与 Story 文档）执行 B09、B12 的 Core/组件/性能证据及相关回归，运行三包 typecheck、lint、边界、自测、diff check 与 strict validation，更新 Story 状态但不提前关闭 B01–B14。完成证据：`evidence/943-t3-c-acceptance.md`；Core 12/12、Web 13/13、三包 typecheck、lint、边界 919/0、自测 43×2、diff check 与 strict validation 均通过。
