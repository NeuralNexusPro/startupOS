# SENSE.15 需求与验收

## 1. 需求来源与边界

来源为 Multica Issue ARCH-210 及其已确认方案。Jev 是受限决策层，不生成内容、不授予权限、不创建资产、不直接执行工具；它只回答代码预先定义的 `Choice`、`Score`、`Noul` 问题。TypeSafe 官方协议为 `POST {baseUrl}/v1/systemone`、Bearer API Key、默认模型 `jev-latest`；`Choice`/`Score` 返回概率分布和 confidence，`Noul` 只返回 0–1 值。

## 2. 功能需求

### R1 Jev Provider 配置

- 现有模型配置页增加独立的「Jev 决策模型」区域，不把 Jev 混入 Agent 主 LLM 选择。
- 支持启停、`baseUrl`、`model`（默认 `jev-latest`）和 API Key 单向提交。
- GET/IPC 只返回 `credentialConfigured` 与凭据来源，不返回 API Key、密文或 secret reference。
- Jev API Key 只使用 Desktop 系统安全存储。无安全存储时拒绝页面写入，不允许退化为明文 JSON 或环境变量。

### R2 决策规则

- 现有触发规则支持 `direct`（兼容默认）与 `jev` 两种路由模式。
- Jev 模式只展示并保存已存在、已启用 `ExternalTriggerGrant` 且允许当前 connector/rule 的候选目标。
- 首版固定问题目录：`route_target`、`urgency`、`risk`、`needs_hitl`、`retain_as_evidence`，带版本号。
- `route_target` 的选项由保留动作 `ignore`、`notify_user` 和经授权候选目标组成；模型不能提交目录外 ID、参数或工具。

### R3 决策与执行门禁

- 在 Jev 调用前逐个执行目标存在性与 `TargetAuthorization` 校验；空候选不调用 Jev。
- 自动执行必须同时满足：`route_target` 为有效候选、`confidence > 0.8`、`rule.execution.requireHitl === false`、`needs_hitl.noul < 0.5`。
- `confidence === 0.8`、缺失/非法 confidence、`needs_hitl.noul >= 0.5`、Provider 异常或规则要求 HITL 均进入人工选择。
- 任何副作用前再次校验授权并获取现有 `ExecutionLease`；重复请求恢复既有回执，不重复 dispatch。
- `risk` 与 `urgency` 只辅助展示和审计；现有 Action Gate、工具 scope 和风险规则继续拥有最终否决权。

### R4 人工选择与异常恢复

- 待处理决策显示在感知中心现有「事件记录」，不新增页面；IM 来源同样必须显示。
- 用户可选择仍合法的候选、选择忽略，或在 Provider 暂时失败时重试决策。
- 选择提交时重新校验候选存在性、授权、HITL 和已解决状态；失效候选不可执行。
- 不得静默选择最高概率之外的目标、回退默认目标或猜测资产 ID。

### R5 回执、审计与隐私

- 持久化 `eventId`、`ruleId`、目录/问题/策略版本、候选键、完整概率分布、阈值、选择结果、HITL 原因、人工决策和 execution receipt 引用。
- Jev state 采用确定性脱敏投影：来源、事件类型、时间、发送者/会话哈希、受控摘要、候选和授权范围；不发送附件字节、凭据、原始 payload 或未脱敏正文。
- 审计和前端错误只使用安全错误码；API Key 不进入浏览器持久化、事件、日志、回执或测试 fixture。

## 3. 验收标准

### AC1：安全配置 Provider

**Given** 用户打开现有模型配置页  
**When** 保存 Jev `baseUrl`、`model` 与 API Key  
**Then** 页面仅显示“凭据已配置”，刷新与重启后仍不回显明文  
**And** 非敏感配置与安全凭据分离保存；缺少安全存储时返回 `SECURE_STORAGE_UNAVAILABLE`。

### AC2：只产生合法候选

**Given** 项目 A 已存在并授权，角色 B 未授权，Skill C 已删除  
**When** 用户编辑 Jev 决策规则并保存  
**Then** 只有项目 A 可作为目标候选  
**And** 伪造 API 请求包含 B/C 时服务端以 `DECISION_CANDIDATE_NOT_AUTHORIZED` 拒绝。

### AC3：严格阈值自动执行

**Given** 有效候选的 `route_target.confidence` 分别为 0.81、0.80  
**When** 规则无需 HITL 且 `needs_hitl.noul < 0.5`  
**Then** 0.81 路径获取租约并执行一次，0.80 路径只生成待人工选择  
**And** 当规则或 Jev 要求 HITL 时，即使 confidence 为 1.0 也不自动执行。

### AC4：失败关闭与人工恢复

**Given** Jev 超时、401/422、429/529、响应字段非法或候选在选择前失效  
**When** 事件进入决策链或用户提交选择  
**Then** 不自动 dispatch，事件记录展示安全原因与可用恢复操作  
**And** 重试/重复点击不产生重复执行。

### AC5：可回放审计

**Given** 决策最终自动执行、人工选择、忽略或失败  
**When** 用户查看事件详情或审计记录  
**Then** 可从 event、rule、Jev 回答、阈值、最终动作追踪到 lease/resultRef  
**And** 记录中不含 API Key、原始 payload、附件字节或未脱敏正文。

### AC6：兼容现有规则

**Given** 未声明 `routingMode` 的历史规则  
**When** 升级后接收匹配事件  
**Then** 仍按 `direct` 规则执行，数据无需迁移  
**And** Jev Provider 停用不影响 direct 规则、Connector ACK 或已有重试链。

## 4. 边界与非功能需求

- Jev 决策总时限默认 3 秒，必须在 5 秒感知决策预算内失败关闭；429/529 最多一次有界退避且受同一总时限约束。
- 单规则最多 20 个授权目标候选；超限拒绝保存，避免请求膨胀。
- 概率键必须与发送候选精确一致，值有限、位于 `[0,1]` 且总和在容差内；否则响应无效。
- Provider 配置热更新后用于下一次决策，不中断已发出的调用。
- 不新增数据库、后端框架、通用审批系统、认知写入器或第三个配置页面。

## 5. 依赖与待评审建议

前置依赖：SENSE.7 的授权/路由、SENSE.8 的 lease/audit、SENSE.9 的感知中心、SENSE.12 的 Desktop Host。  
待评审建议：首版不执行 `create_cognition_candidate`；`retain_as_evidence` 仅作为决策回执字段展示，未来如需写回必须复用 owner-aware cognition API 并单独评审。
