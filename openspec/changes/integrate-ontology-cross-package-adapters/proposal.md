# Proposal

## 追溯信息

- **epic-id：** ONT
- **story-id：** ONT.8
- **task-id：** ONT8-T1
- **owner：** Architecture / Core / Web / Desktop / QA
- **来源：** `docs/specs/epic-ONT/story-ONT.8/`

## Why

ONT.1–ONT.7 已形成 canonical ontology、存储、迁移、校验、OSDK、契约校验与 context projection 的公共能力，但 Web API、Desktop IPC 和跨 Epic 运行链路尚未通过同一契约完成联合验收。ONT.8 需要以薄适配器贯通这些既有能力，并用真实持久化与进程故障注入证明访谈、方案发布、任务执行、看板和恢复不会产生双写事实源、版本漂移或重复副作用。

## What Changes

- 新增 ONT 公共应用服务作为 Web 与 Desktop 的共同调用面，复用既有 ontology public API，不在边界层复制转换、Validator、Action Gate 或恢复逻辑。
- 新增等价的 Next.js API route 与 Electron IPC/preload 适配，统一请求、成功回执与结构化错误语义，并在进入 core 前完成项目身份、路径和输入校验。
- 接通 P2.8 发布契约、9.42 Run/WorkItem、9.43 项目任务投影与 ONT facts/actions/context references，始终使用精确 ontology version、contract hash、revision、attempt 和 lease epoch。
- 建立覆盖 Web 与 Desktop、Windows x64、macOS x64/arm64 的联合验收夹具和故障注入矩阵，验证中断恢复、迟到提交、幂等回执、旧项目兼容及可重建投影。
- 以现有 Epic 路线图 E01–E16 为完整验收集；缺少 P2.8、9.42 或 9.43 的已实施公共边界时 fail closed，不用 mock success 宣称完成。

### 非目标

- 不重新设计 ONT.1–ONT.7 schema/API，不新增数据库、图数据库、外部服务或第二套任务/运行状态。
- 不在 Web route、Desktop service 或 preload 中实现业务规则，也不直接解析、修改 `pi-tasks` 私有状态或 ONT JSONL。
- 不实现 P2.8、9.42、9.43 各自尚未交付的业务能力，不把本 Proposal 作为其替代实现。
- 不引入新的 UI 框架、通用 transport 框架或跨平台测试 DSL。

## Capabilities

### New Capabilities

- `ontology-cross-package-integration`: 规定 Web API、Desktop IPC、公共应用服务与端到端联合验收之间的契约等价性、依赖边界、恢复门禁和平台矩阵。

### Modified Capabilities

无。ONT.1–ONT.7 与 `pi-task-public-command-adapter` 的既有规范作为前置契约被消费，不在本变更中修改其需求。

## Impact

- **Packages：** `packages/core` 新增或扩展 ONT 应用服务/public exports；`packages/web` 仅增加 API 边界；`packages/desktop` 仅增加 IPC、preload 和打包适配；相关测试分布在各自包内。
- **Public APIs：** 新增版本化的跨包请求/响应 DTO 与应用服务入口；Web 和 Desktop 必须映射为等价语义。
- **Persistence：** 只通过 `CanonicalOntologyStore`、OSDK、P2.8 契约存储、9.42 runtime ledger 与 pi-tasks 公共边界访问各自事实源；无新数据根、无双写。
- **IPC / packaging：** 增加显式 channel 与 preload allowlist，并验证 development、Windows x64、macOS x64/arm64 的模块解析和运行恢复。
- **依赖：** ONT.1–ONT.7 已有公共能力；实施和最终验收还依赖 P2.8、9.42、9.43 对应公共边界完成。缺失依赖时只允许返回结构化 unavailable，不允许兼容性旁路。
- **上线：** 先合入 core 服务与契约测试，再接 Web/Desktop 薄适配，最后执行真实项目与打包矩阵；全部门禁通过后才启用正式入口。
- **回滚：** 回退本 Proposal 的 adapters、application service 与测试接线即可；既有 canonical ontology、facts、operations、Task/Run ledger 均不迁移、不删除，旧项目保持原读取路径。

