# Proposal

## Why

P2.8 已具备执行契约的类型、确定性编译和不可变文件存储，但产品没有正式的检查、发布、精确读取和新版本入口，导致访谈形成的语义上下文无法由用户确认后稳定交给 9.42 与 ONT.8 消费。必须完成设计态发布闭环，才能关闭 ONT 跨包执行主线。

可追溯信息：Epic `P2`；Story `P2.8`；Task `P28-T1`；Owner `Solution Design / Core / Web`；来源 `docs/specs/epic-P2/story-P2.8/`。

## What Changes

- 在 Core 提供项目级执行契约发布应用服务，装配 canonical ontology、confirmed solution version、编译器和不可变 contract store。
- 提供薄 Web API 与解决方案设计界面入口，支持发布前检查、发布、精确读取、撤销和创建新版本提示。
- 将 `DesignGap` 分类展示并关联节点或字段；存在阻断项、草稿版本、旧本体引用或缺失 verifier 时拒绝发布。
- 发布结果展示中文状态、`contractId`、solution version 和 `contractHash`，已发布版本保持只读。
- 补齐 P2.5/P2.6/P2.7、9.42 consumer 与 ONT.8 的联合自动化验证及性能证据。

非目标：不启动多 Agent Run，不实现 Worker 调度或 Evidence 写入；不自动迁移不完整 legacy manifest；不在 Web route 复制编译、校验或存储逻辑。

依赖：ONT.1/3/6/7 公共 API、P2.5 版本状态、P2.6 I/O 契约、P2.7 topology、现有 `SolutionExecutionContractStore`。

上线：随 `0.4.x` 桌面版本启用；旧方案继续可读，但只有通过本入口发布的 approved contract 可启动新 Run。回滚时移除 UI/API 入口，已发布不可变契约继续保留并可精确读取。

## Capabilities

### New Capabilities

- `solution-execution-contract-publishing`: 设计态执行契约的严格检查、不可变发布、精确读取、撤销和用户可见状态。

### Modified Capabilities

无。

## Impact

- Packages：`packages/core` solution/project features、`packages/web` solution components/services/API routes，必要时由 Desktop 复用同一 Core service。
- Public APIs：新增发布应用服务 DTO；继续复用唯一 `SolutionExecutionContract` 与 ontology validator。
- Persistence：仅写入现有 `data/projects/{projectId}/solutions/contracts/` JSON 文件，不新增事实源或数据库。
- IPC / Packaging：不新增平台协议；桌面 renderer 通过现有 Next API 使用相同 Core 服务，发布包需包含新增运行时代码。
