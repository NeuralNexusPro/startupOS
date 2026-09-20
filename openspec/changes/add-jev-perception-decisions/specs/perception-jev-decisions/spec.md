# Spec Delta

## Purpose

为感知事件提供受授权候选约束的 Jev 概率决策、严格 confidence/HITL 门禁、人工恢复和可追溯回执，同时保持现有直接路由与执行安全边界。

## ADDED Requirements

### Requirement: Jev Provider 必须安全配置

系统 SHALL 在现有模型配置界面提供独立 Jev Provider 配置，支持启停、`baseUrl`、`model` 和 API Key 单向提交；系统 MUST 仅向客户端返回凭据是否已配置及其安全来源，不得返回 API Key、密文或 secret reference。

#### Scenario: 保存并重新读取 Provider
- **WHEN** 用户提交合法 `baseUrl`、`model` 和 API Key 后重新打开模型配置
- **THEN** 系统 SHALL 显示非敏感配置及“凭据已配置”，API Key 输入保持为空且任何读取响应不含凭据内容

#### Scenario: 安全存储不可用
- **WHEN** 当前运行环境没有服务端 SecretProvider 或 Desktop 安全存储
- **THEN** 系统 MUST 以 `SECURE_STORAGE_UNAVAILABLE` 拒绝页面提交的 API Key，且不得退化为客户端或明文文件存储

#### Scenario: 环境凭据
- **WHEN** 服务端配置了 `TYPESAFE_API_KEY`
- **THEN** 系统 SHALL 将 Provider 标记为由环境凭据配置，同时不得把环境变量值返回客户端或写入审计

#### Scenario: 不安全 Base URL
- **WHEN** 用户提交非 HTTP(S)、嵌入凭据或生产环境可达本地/私网的 `baseUrl`
- **THEN** 系统 MUST 拒绝配置且不得发起网络请求

### Requirement: 决策规则只能声明合法候选

系统 SHALL 在感知中心现有触发规则界面提供 `direct` 与 `jev` 路由模式；Jev 模式 MUST 只接受当前存在、已启用外部触发授权且适用于当前 connector/rule 的项目、角色或 Skill。

#### Scenario: 创建 Jev 决策规则
- **WHEN** 用户为规则选择 Jev 模式
- **THEN** 系统 SHALL 只展示满足存在性和授权约束的候选，并允许用户从这些候选中多选

#### Scenario: 伪造未授权候选
- **WHEN** 客户端绕过界面提交未授权、已删除、重复或超限候选
- **THEN** 服务端 MUST 拒绝保存规则，且不得把该候选发送给 Jev

#### Scenario: 历史规则兼容
- **WHEN** 系统读取未声明路由模式的历史规则
- **THEN** 系统 SHALL 将其作为 `direct` 规则处理，不改写原文件且不调用 Jev

### Requirement: Jev 只能回答版本化问题目录

系统 MUST 使用版本化固定问题目录询问 `route_target`、`urgency`、`risk`、`needs_hitl` 与 `retain_as_evidence`；`route_target` 的选项 MUST 精确等于当次保留动作和授权候选 key，Jev 不得创建目标、工具或参数。

#### Scenario: 有效回答
- **WHEN** Jev 返回所有固定问题且 `route_target` 的 choice/probabilities 精确匹配请求候选
- **THEN** 系统 SHALL 记录模型版本、完整概率分布和问题/目录版本后再评估执行策略

#### Scenario: 目录外回答
- **WHEN** Jev 返回目录外 choice、缺失概率、非有限数值、越界数值或概率键不匹配
- **THEN** 系统 MUST 将响应标记为 `JEV_INVALID_RESPONSE`，不得获取执行租约或 dispatch

#### Scenario: 脱敏状态
- **WHEN** 系统构建 Jev state
- **THEN** state SHALL 只包含最小必要的来源、事件类型、时间、发送者/会话不可逆引用、受控摘要、候选与授权范围，不得包含凭据、附件字节或原始 payload

### Requirement: 自动执行必须通过严格门禁

系统 MUST 仅在 `route_target.confidence > 0.8`、choice 为有效候选、规则无需 HITL 且 `needs_hitl.noul < 0.5` 时自动处理该 choice；任何既有 Action Gate、tool scope 或授权拒绝仍拥有最终否决权。

#### Scenario: 高于阈值自动执行
- **WHEN** 有效 dispatch 候选的 confidence 为 0.81 且规则与 Jev 均无需 HITL
- **THEN** 系统 SHALL 在再次授权后获取既有 `ExecutionLease` 并通过既有执行端口 dispatch 一次

#### Scenario: 等于阈值不自动执行
- **WHEN** 有效候选的 confidence 等于 0.8
- **THEN** 系统 MUST 创建待人工选择状态，且不得自动 dispatch

#### Scenario: HITL 优先
- **WHEN** 规则要求 HITL 或 `needs_hitl.noul >= 0.5`
- **THEN** 系统 MUST 创建待人工选择状态，即使 `route_target.confidence` 为 1.0

#### Scenario: 忽略事件
- **WHEN** `ignore` 以高置信且无需 HITL 被选中
- **THEN** 系统 SHALL 将决策标记为已忽略并记录回执，且不得创建执行副作用

### Requirement: 不确定与失败必须显式交给用户

系统 SHALL 在感知中心现有事件记录中展示低置信、需 HITL、Provider 失败、无授权候选和响应无效的待处理决策，并允许用户选择仍合法的候选、忽略或在可恢复错误后重试；系统不得静默回退默认目标或猜测 ID。

#### Scenario: IM 低置信事件
- **WHEN** IM 来源事件的有效候选 confidence 小于或等于 0.8
- **THEN** 感知中心 SHALL 显示候选及概率供用户选择，且该事件不得自动路由

#### Scenario: Provider 暂时失败
- **WHEN** Jev 超时、限流、过载或返回安全可恢复错误
- **THEN** 系统 SHALL 失败关闭并显示安全错误码、人工候选与重试操作，不得显示供应商原始响应

#### Scenario: 人工选择前候选失效
- **WHEN** 用户选择的目标在提交前已删除或授权被撤销
- **THEN** 系统 MUST 拒绝执行、保留待处理状态并要求刷新候选

### Requirement: 决策与执行必须幂等可追溯

系统 SHALL 为每个 event/rule/目录版本生成稳定 decision receipt，记录候选、概率、阈值、HITL 原因、最终动作及 execution receipt 引用；所有副作用 MUST 复用既有 `ExecutionLease` 与 dispatch，审计不得成为授权或业务状态事实源。

#### Scenario: 重复事件投递
- **WHEN** 相同 event/rule 被重复路由
- **THEN** 系统 SHALL 恢复既有 decision/lease/result 回执，且不得重复调用 Jev 或重复 dispatch

#### Scenario: 重复人工提交
- **WHEN** 已解决决策收到重复或并发的人工选择请求
- **THEN** 系统 SHALL 返回首次完成的结果并拒绝产生第二次副作用

#### Scenario: 审计回放
- **WHEN** 用户查看自动执行、人工执行、忽略或失败的事件
- **THEN** 系统 SHALL 能从 event、rule、目录/策略版本、概率和最终动作追踪到 lease/resultRef，同时不得暴露 API Key、原始 payload 或未脱敏正文

### Requirement: Jev 故障不得破坏现有感知链

系统 SHALL 将 Jev 决策限制在启用该模式的规则内；Provider 停用、网络故障或配置更新不得阻塞 Connector ACK、direct 规则或其他 Connector。

#### Scenario: Provider 停用
- **WHEN** Jev Provider 被停用且 direct 与 Jev 规则同时命中事件
- **THEN** direct 规则 SHALL 保持原行为，Jev 规则 SHALL 进入可解释待处理状态

#### Scenario: 配置热更新
- **WHEN** 用户在某次 Jev 请求进行中更新 Provider 配置
- **THEN** 当前请求 SHALL 使用其启动快照完成或超时，下一次请求使用新配置且不得重启 Connector

#### Scenario: 决策超时
- **WHEN** Jev 未在配置的总时限内返回
- **THEN** 系统 MUST 在感知决策预算内失败关闭，Connector 接纳回执不得等待 Jev 完成
