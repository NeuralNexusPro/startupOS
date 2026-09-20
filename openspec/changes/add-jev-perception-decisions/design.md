# Design：Jev 受限感知决策

## Context

动机见 `proposal.md`。当前 `PerceptionRouter` 已按 rule 执行 `match → authorize → ExecutionLease → TriggerExecutionPort → audit`；规则只含单个 target。`FileTargetAuthorizationPort` 已同时检查资产存在、`ExternalTriggerGrant`、connector/rule 范围和 Skill owner。Desktop Plugin Host 是真实事件路由与 channel execution 的装配点；Web 感知中心只管理配置和展示。

现有 `SettingsDialog` 的 Agent LLM 配置会进入 renderer state/localStorage 与 `user-config.json`，不满足 Jev API Key 的新安全边界，因此只复用页面入口与视觉结构，不复用这条凭据持久化路径。TypeSafe System One API 使用 Bearer key、`POST /v1/systemone`；Choice/Score 有 confidence/probabilities，Noul 只有 0–1 值。

## Goals / Non-Goals

**Goals:**

- 让 Jev 只在代码提供的授权候选内做概率决策。
- 把 0.8 边界、HITL、授权、lease、幂等和审计变成可测试的代码门禁。
- 在既有模型设置、规则和事件界面完成配置与人工恢复。
- 保持 direct 规则、Connector ACK、执行器和 Plugin SDK 行为兼容。

**Non-Goals:**

- 不让 Jev 生成内容、目标 ID、工具调用或执行参数。
- 不新建执行器、审批状态机、配置页面、数据库或 npm SDK 依赖。
- 不在本变更自动写入用户/项目认知；`retain_as_evidence` 只作为建议记录。
- 不解决现有 Agent LLM 凭据路径的历史安全债务，本变更只保证 Jev 凭据不复用该路径。

## Decisions

### 1. 使用可选 DecisionOrchestrator 插入既有 Router

`PerceptionRouter` 对 direct 规则走原分支；对 Jev 规则先由同一 `TargetAuthorizationPort` 逐个过滤候选，再调用可注入 `PerceptionDecisionPort`。只有策略输出最终 action 后才获取现有 lease 并调用同一 `TriggerExecutionPort`。

这样授权、工具 scope、执行上下文和结果回执只有一套。替代方案是建立 Jev executor 或让 Provider 返回工具调用，两者都会复制或绕过既有安全边界，故不采用。

### 2. 规则使用向后兼容联合类型

公共类型改为共享 base 加两种分支：缺失 `routingMode` 或 `direct` 时要求单 target；`jev` 时要求版本化 candidates。旧 JSON 继续合法，不执行读取时迁移。

候选包含两个保留 action（`ignore`、`notify_user`）和最多 20 个 `dispatch` target。target candidate key 由 kind/id 生成并与对象映射，Provider 从未获得可自由填写的资产 ID。规则保存、实际决策和人工解决三个边界均重做存在性/授权校验；UI 过滤只改善体验。

### 3. 固定五问目录并只用 route_target confidence 做自动阈值

目录版本 `1.0` 固定：`route_target` Choice、`urgency`/`risk` Score、`needs_hitl`/`retain_as_evidence` Noul。TypeSafe 官方说明 Noul 不携带 confidence，因此 `confidence > 0.8` 只解释为 `route_target.confidence`；`needs_hitl.noul >= 0.5` 保守地进入人工路径。

`urgency`/`risk` 用于展示与回执，不替代现有 Action Gate。`retain_as_evidence` 不直接写认知，因为 owner/确认与现有 cognition 接纳边界未在本 Story 中确认。

### 4. Jev adapter 使用原生 fetch 和严格响应解析

`packages/core/src/lib/integrations/jev/` 只依赖 Node/Web 标准 API 和 Layer 1 types。它构建 `{state, model, questions}`，使用 `AbortSignal.timeout` 控制 3 秒总预算，映射 401/422/429/529 和网络错误为安全错误码。429/529 最多一次有界退避，且不能延长总 deadline。

adapter 对 answer 类型、question keys、choice、probabilities、finite/range/sum 做精确验证。使用官方 SDK 会新增依赖且不减少业务校验，故首版不采用。

### 5. state 使用确定性脱敏投影

`perception-runtime/decision/state-builder` 复用现有敏感信息 redaction，再对文本做固定长度截断；actor/conversation 外部 ID 只以加盐哈希引用进入 state。附件仅传类型/数量等元数据，不传引用内容或字节；`rawPayloadRef` 只留在本地执行上下文。

该投影不调用 LLM，避免为了摘要引入第二次模型调用。代价是语义信息较少，但符合最小披露；若评估集证明不足，再单独评审更丰富的脱敏策略。

### 6. Provider 配置与 API Key 分离

非敏感配置使用 `data/model-providers/jev.json` DataFile；公开摘要只含 enabled/baseUrl/model/credentialConfigured/source。Desktop adapter 用 Electron `safeStorage` 加密 API Key 并以 0600 文件保存，非敏感配置只保存 opaque ref；服务端优先从 `TYPESAFE_API_KEY` 或部署 SecretProvider 解析。

模型设置页通过独立 service/IPC 调用该能力，不把 Jev 放入 `LLMProviderType`，也不经过 settingsStore 的 localStorage 路径。空 key 意味保留；删除凭据是单独确认操作。没有安全 provider 时写入失败，不降级明文。

`baseUrl` 在保存与使用时校验：生产仅 HTTPS，禁止 URL userinfo、非 HTTP(S)、loopback/私网解析目标；开发 loopback 需要显式环境允许。adapter 在规范化 base 后追加 `/v1/systemone`。

### 7. DecisionReceipt 是待处理事实源，Audit 只做追踪

`DecisionReceiptStore` 使用稳定 id（eventId/ruleId/catalogVersion 的 hash）和现有 AtomicDataFileStore，路径 `data/perception/decisions/`。receipt 保存候选 key、完整概率、版本、阈值、状态、reason、人工/自动选择、lease/resultRef，不保存 state 原文或 key。

人工选择和自动 dispatch 都用 decision id 作为现有 lease attempt key。单 Desktop 主进程内先检查 receipt 终态再 acquire；lease acquired=false 时恢复既有结果。这样重复事件、重复按钮和重试不会产生第二次副作用。审计新增 decision actions，但 authorization 从不读取 audit。

### 8. 人工解决必须回到 Desktop 运行时装配

自动路由在 Desktop Host 内拥有 channel execution。事件页提交人工选择时，通过窄 IPC 调用同一 Desktop service；它加载 event/rule/receipt，重新授权，获取同一 lease，再调用同一 execution port。Next.js API Route 不能自行构造 executor；非 Electron 环境若没有等价 runtime port，则返回 `RUNTIME_UNAVAILABLE`。

`notify_user` 复用现有 system notification，仅提示并保持 receipt pending；通知失败只记录安全诊断，不改变 pending 事实。用户最终选择仍在现有感知事件页完成。

### 9. UI 保持两个入口

`SettingsDialog` 增加独立 Jev section；`RuleWizard` 增加 direct/Jev 选择与授权候选多选；`SenseCenter` 的既有 events trace 增加 decision stage。没有新 tab 或页面。Provider 配置页不参与事件页 5 秒轮询；事件页按现有刷新生命周期带回 pending receipts，保持 `perception-form-state` 不变。

### 10. 依赖方向与 subagent 写入边界

依赖保持 `desktop/web → core features/modules → integrations/storage/types`。Core 不导入 Web/Desktop，Jev integration 不导入 module，API Route 只解析/映射。

获批后建议工作包：

- W1：只写 core types 与 `integrations/jev`。
- W2：只写 Provider config、Desktop safeStorage/IPC、settings service/UI。
- W3：只写 `perception-runtime/decision`、router 与 core tests；可与 W2 并行。
- W4：在 W2/W3 后写 Desktop Host 装配与人工解决 IPC。
- W5：写 RuleWizard/SenseCenter/store 与组件测试，可在契约冻结后与 W4 并行。
- W6：串行集成、Story/AGENTS/changes、回归和证据。

重叠文件（public type、IPC protocol、package export）由 W1 定义后冻结，后续工作包只消费；若必须修改，串行回主集成分支处理。

## Risks / Trade-offs

- [可配置 baseUrl 造成 SSRF] → 双重 URL 校验、生产 HTTPS、禁止 userinfo/私网并限制重定向。
- [模型 confidence 未校准] → 首版固定保守阈值、100 条脱敏评估集、全量概率留档；调阈值需新评审。
- [授权在决策后撤销] → 自动执行前和人工提交时重新授权，Action Gate 保持最终否决。
- [外部 Provider 延迟影响路由] → ACK 与决策解耦、3 秒总 deadline、失败关闭、人工恢复。
- [单进程文件事务吞吐有限] → 个人用户 MVP 复用原子 DataFile/lease；只有测得并发瓶颈后再引入更强事务。
- [保留动作语义有限] → 首版只提供 ignore/notify/dispatch；不为未确认认知动作搭脚手架。
- [旧版本无法理解 Jev rule] → 默认关闭、先发布 reader/validator；回滚时停用 Jev 规则并保留证据。

## Migration Plan

1. 先发布兼容联合类型、store reader 和默认关闭 Provider，不改写历史规则。
2. 发布 secure config、adapter、decision orchestrator 与 Desktop runtime 装配。
3. 发布规则/事件交互，用合成事件与评估集验证后才启用真实规则。
4. 实施新增数据路径时同步更新 AGENTS.md 与 `docs/changes/`。
5. 回滚时停用 Provider/Jev 规则并恢复 direct；保留 receipts、audit、leases，禁止删除追溯证据。
