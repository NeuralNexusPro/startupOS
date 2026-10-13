# Spec Delta: agent-ontology-tools

## Purpose

将 Agent 本体写工具（结构层与实例层）收敛到 canonical authoring 通道，拒绝未迁移项目的静默写入，并将 Web legacy 写路由只读化，消除双事实源写入面。

## ADDED Requirements

### Requirement: Agent 本体写工具必须经 canonical authoring 提交
Agent 工具 `create_domain`/`create_concept`/`create_instance`/`update_instance`/`delete_instance` SHALL 通过 `CanonicalOntologyAuthoringService` 提交对应命令（含 `instance.*`），MUST 携带真实工具调用上下文的 operationId 与审计来源，且不得再调用 legacy `ontology-data-store` 的写函数。

#### Scenario: Supervisor 会话创建概念
- **WHEN** Agent 在已有 canonical 快照的项目中调用 `create_concept`
- **THEN** canonical 快照 SHALL 更新且 legacy `ontology.json` 内容 MUST 保持不变

#### Scenario: 审计来源可追溯
- **WHEN** 任一 Agent 写工具提交成功
- **THEN** authoring JSONL SHALL 记录该命令的 operationId 与 `agent-tool` 审计来源

### Requirement: 未迁移项目必须显式拒绝写入
当项目尚无 canonical 快照时，Agent 写工具 MUST 返回结构化 `MIGRATION_REQUIRED` 错误并保持零写入；不得触发自动迁移或写 legacy 文件。

#### Scenario: 旧项目无 canonical 快照
- **WHEN** Agent 对未迁移项目调用任一写工具
- **THEN** 工具 SHALL 返回 `MIGRATION_REQUIRED` 结构化错误且 legacy 与 canonical 文件均不变化

### Requirement: 写入冲突与校验失败必须结构化返回
工具层 SHALL 将 authoring 的 `REVISION_CONFLICT`、`OPERATION_CONFLICT` 与 validator issues 映射为结构化工具错误；revision 冲突 MAY 自动以新 revision 重试一次，超过后 MUST 返回冲突错误。

#### Scenario: 并发写入冲突
- **WHEN** 工具提交时 `expectedRevision` 已过期
- **THEN** 工具 SHALL 以最新 revision 自动重试一次，重试仍冲突时返回 `REVISION_CONFLICT`

### Requirement: 只读工具在已迁移项目读取 canonical
`query_ontology`/`search_ontology`/`list_concepts`/`get_concept_schema`/`get_instance`/`query_instances` 等只读工具 SHALL 在项目存在 canonical 快照时读取 canonical 数据，且 MUST 保持既有响应形状与查询参数语义；无 canonical 时维持 legacy 只读行为。

#### Scenario: 已迁移项目查询实例
- **WHEN** 项目存在 canonical 快照且 Agent 调用 `query_instances`
- **THEN** 工具 SHALL 返回 canonical 实例数据且响应形状与既有调用方兼容

### Requirement: Web legacy 写路由必须拒绝写方法
`/api/ontology-data/*` 的写方法（POST/PUT/PATCH/DELETE）SHALL 返回结构化 `CANONICAL_EDIT_UNAVAILABLE` 响应（HTTP 405），生产源码 MUST 不再包含针对 legacy 本体文件的写入代码路径；GET 只读行为 MUST 保持。

#### Scenario: 直接调用 Web 写接口
- **WHEN** 客户端对 `/api/ontology-data/instances` 发起 POST
- **THEN** 服务端 SHALL 返回 `CANONICAL_EDIT_UNAVAILABLE` 且不产生任何文件写入副作用

#### Scenario: 生产源码写路径清零
- **WHEN** 对生产源码执行 legacy 写函数消费面静态检查
- **THEN** Agent 工具与 Web API 中 MUST 零命中（store 内部实现与测试除外）
