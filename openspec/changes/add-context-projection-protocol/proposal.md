# Proposal

## 追溯信息

- epic-id：ONT
- story-id：ONT.7
- task-id：ONT7-T1
- owner：Architecture / Core
- 来源：`docs/specs/epic-ONT/story-ONT.7/README.md`

## Why

ONT.1 已统一业务语义对象，但运行时仍缺少一个公共协议来标识“哪个任务、哪个契约版本、哪些事实与决策、恢复到哪个检查点”。如果继续让 P2 和 collaboration-runtime 各自定义，会再次产生上下文串线和恢复语义不一致。

## What Changes

- 定义稳定的 decision、execution context、context snapshot、projection record 和 checkpoint reference DTO。
- context 身份显式绑定 project/task/session/branch/run/workItem/attempt、contract id/hash 与 ontology version。
- snapshot 只引用对象、事实、决策、来源、允许 Action 和检查点，不复制事实正文，也不成为第二事实源。
- projection record 支持 plan、goal、task、agent、skill、fact、decision、outcome、gap 九类最小记录。
- 通过 ontology feature 公共入口导出，并补齐正反类型样例。
- 不实现 projection 存储、append/query 服务、GraphRAG、调度或恢复执行。

## Capabilities

### New Capabilities

- `context-projection-protocol`：定义跨 P2 与运行时共享的语义上下文、投影记录和恢复检查点公共协议。

### Modified Capabilities

无。

## Impact

- packages：`packages/core`
- public API：`@originos/core/lib/features/ontology`
- persistence：无；后续 ONT.2/ONT.7 工作包实现
- IPC / packaging：无变化
- dependencies：不新增依赖

## 非目标

- 不读写 JSON/JSONL，不修改 EventStore。
- 不实现上下文解析、查询、权限校验、任务调度或自动恢复。
- 不把 projection、snapshot 或 checkpoint 定义为业务事实源。

## 依赖

- ONT1-T1 已完成的 canonical ontology、source 和 fact references。
- `docs/specs/epic-ONT/project-semantic-execution-plan.md` 的数据所有权与恢复边界。

## 上线方案

以新增公共类型随 core 发布；P2 和 collaboration-runtime 在后续 Story 中逐步消费。

## 回滚方案

删除新增类型、测试与文档即可；本 Task 不产生运行数据。
