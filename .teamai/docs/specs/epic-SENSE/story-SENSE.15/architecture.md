# SENSE.15 技术架构设计

## 1. 架构结论

Jev 作为 `perception-runtime` 的可注入决策端口，位于授权候选生成之后、`ExecutionLease` 之前。它不接触执行器、凭据存储实现或目标注册表。现有 direct 路由保持默认且不经过 Jev。

```text
Desktop/Web UI
  ├─ 现有模型设置 ──> Jev Provider summary / write-only credential
  └─ 感知规则/事件 ─> PerceptionManagementFacade / Desktop IPC
                              │
PerceptionRouter: match → authorize candidates → DecisionOrchestrator
                                              │
                         JevDecisionPort <── integrations/jev HTTP adapter
                                              │
                  policy gate → ExecutionLease → existing TriggerExecutionPort
                                              │
                      DecisionReceiptStore + PerceptionAuditStore
```

## 2. 模块与依赖

| 层级 | 路径 | 职责 |
|---|---|---|
| Layer 1 | `packages/core/src/lib/integrations/jev/` | HTTP 请求、超时、响应结构校验；只实现 `JevDecisionPort` |
| Layer 1 | `packages/core/src/types/perception.ts` | Provider、decision rule、receipt、port 公共类型 |
| Layer 2 | `packages/core/src/modules/perception-runtime/decision/` | 脱敏 state、候选目录、策略门、receipt store |
| Layer 2 | `packages/core/src/modules/perception-runtime/routing/perception-router.ts` | 在既有 match/authorize/lease/dispatch 链插入 decision orchestrator |
| Layer 2 | `packages/core/src/lib/features/perception/management-facade.ts` | 规则保存校验、待处理读取与人工决策用例 |
| Layer 3/4 | `packages/web/src/store`、`services`、`components/os/settings`、`components/os/sense-center` | 现有页面状态与交互适配 |
| Layer 5 | `packages/web/src/app/api/**` | 仅解析 Provider/规则请求并调用下层服务 |
| Layer 6 | `packages/desktop/src/main/services/` | safeStorage 凭据、Provider/人工选择 IPC、运行时装配 |

Core 不依赖 Web/Desktop；Jev integration 不依赖 `perception-runtime` 内部实现；API Route 不承载策略。未新增依赖包，使用 Node `fetch`、`AbortSignal.timeout` 与现有文件存储。

## 3. 公共数据契约

```typescript
interface JevProviderSummary {
  enabled: boolean;
  baseUrl: string;
  model: string;
  credentialConfigured: boolean;
  credentialSource?: 'environment' | 'secure-store';
  updatedAt?: string;
}

type PerceptionDecisionCandidate =
  | { key: 'ignore'; action: 'ignore' }
  | { key: 'notify_user'; action: 'notify_user' }
  | { key: string; action: 'dispatch'; target: PerceptionTriggerTarget };

interface JevDecisionRuleConfig {
  catalogVersion: '1.0';
  policyVersion: '1.0';
  candidates: PerceptionDecisionCandidate[];
}

type PerceptionTriggerRule = PerceptionRuleBase & (
  | { routingMode?: 'direct'; target: PerceptionTriggerTarget }
  | { routingMode: 'jev'; decision: JevDecisionRuleConfig }
);

interface JevDecisionReceipt {
  id: string;
  eventId: string;
  ruleId: string;
  catalogVersion: string;
  policyVersion: string;
  providerModel?: string;
  candidateKeys: string[];
  answers?: {
    routeTarget: { choice: string; confidence: number; probabilities: Record<string, number> };
    urgency: { score: number; confidence: number; probabilities: Record<string, number> };
    risk: { score: number; confidence: number; probabilities: Record<string, number> };
    needsHitl: number;
    retainAsEvidence: number;
  };
  threshold: 0.8;
  status: 'pending' | 'auto-executed' | 'user-executed' | 'ignored' | 'failed';
  reason?: string;
  selectedKey?: string;
  leaseId?: string;
  resultRef?: string;
  createdAt: string;
  updatedAt: string;
}
```

历史规则缺少 `routingMode` 时按 `direct` 解析，无批量迁移。Jev 规则最多 20 个目标候选；候选 key 由代码生成并做精确映射，不让模型构造资产 ID。

## 4. Jev 请求契约

请求为 `POST {normalizedBaseUrl}/v1/systemone`，Bearer 凭据仅在服务端 adapter 内加入。`state` 是确定性脱敏 JSON，包含 source/type/time、actor/conversation 哈希、经现有 redaction 截断的摘要、候选 key/标签和有效 tool scope；不含 secret、附件字节、`rawPayloadRef` 内容或完整原始 payload。

固定 questions：

- `route_target`: Choice；criteria 精确等于当次候选 key。
- `urgency`: Score；固定低/中/高三级描述。
- `risk`: Score；固定低/中/高三级描述。
- `needs_hitl`: Noul；`>= 0.5` 视为需要 HITL。
- `retain_as_evidence`: Noul；只写 receipt，不直接写认知。

响应必须包含且只解析已知 answer；Choice/Score 概率键精确匹配、值在 `[0,1]`、总和容差合法。Noul 官方无 confidence，因此自动执行阈值只应用于 `route_target.confidence`。

## 5. 决策策略与状态流

| 条件 | 结果 |
|---|---|
| 无授权目标候选 | 不调用 Jev，receipt `pending/NO_AUTHORIZED_CANDIDATE` |
| Provider 停用/失败/响应非法 | 不 dispatch，receipt `pending` 并记录安全原因 |
| choice 不在候选目录 | `JEV_INVALID_RESPONSE`，不 dispatch |
| `confidence <= 0.8` 或非有限值 | `pending/LOW_CONFIDENCE` |
| `rule.execution.requireHitl` 或 `needs_hitl >= 0.5` | `pending/HITL_REQUIRED` |
| choice=`notify_user` | 复用通知能力并保持 `pending`，用户仍选择最终动作 |
| choice=`ignore` 且门禁通过 | receipt `ignored`，无执行 lease |
| 有效 dispatch choice 且全部门禁通过 | 获取 lease，调用既有 execution，关联 resultRef |

人工选择时使用同一 `decisionId` 作为 lease attempt key。receipt 已解决时返回原结果；选择变化不创建第二 lease。授权与目标存在性在人工提交时重查，避免陈旧 UI 越权。

## 6. 状态所有者与持久化

| 状态 | 事实源 |
|---|---|
| Provider 非敏感配置 | `data/model-providers/jev.json`（DataFile） |
| Desktop API Key | `safeStorage` 加密记录，文件权限 0600；配置仅保存 opaque ref |
| 决策规则 | 既有 `data/perception/rules/` |
| 决策回执/待处理状态 | `data/perception/decisions/{decisionId}.json`（DataFile） |
| 执行幂等 | 既有 `data/perception/leases/` |
| 追溯 | 既有 `data/perception/audit/events.jsonl`，只存安全字段与 receipt ref |

`DecisionReceiptStore` 是人工待处理状态的唯一事实源；audit 只追踪，不参与授权。Provider 配置更新采用原子文件写入，进行中的请求使用启动时快照，下一请求读取新版本。

## 7. API / IPC 契约

| 操作 | 输入 | 输出/错误 |
|---|---|---|
| `GET jev-provider` | 无 | `JevProviderSummary`，绝不含 key/ref |
| `PUT jev-provider` | `{enabled,baseUrl,model,apiKey?}` | summary；空 key 保留；安全存储不可用时报 `SECURE_STORAGE_UNAVAILABLE` |
| `DELETE jev-provider/credential` | 显式确认 | 清除安全凭据并返回 summary |
| `PATCH save-rule` | direct/jev rule | 服务端重新校验 candidate existence/grant/connector，错误 `DECISION_CANDIDATE_NOT_AUTHORIZED` |
| `POST resolve-decision` | `{decisionId,candidateKey}` | 既有或新 execution receipt；失效/已解决结构化返回 |
| `POST retry-decision` | `{decisionId}` | 更新同一 receipt；不绕过授权或 HITL |

Electron 通过新增窄 IPC channel 调用主进程服务；Web API Route 仅在部署提供安全 SecretProvider 时允许写凭据。所有端点限制 body 大小、校验 URL，并禁止将供应商原始错误透传客户端。

## 8. 安全、性能、可观测性与恢复

- `baseUrl` 是 SSRF 边界：生产只允许 HTTPS；解析后拒绝嵌入凭据、非 HTTP(S)、本地/私网地址，开发显式允许 loopback。
- API Key 不进入 Zustand/localStorage、React draft 回读、用户配置 JSON、日志或 audit。
- Jev 调用 3 秒总超时；429/529 最多一次有界退避；超时即失败关闭。Connector ACK 仍在事件持久化后完成，不等待 Jev。
- 新增安全审计动作：`decision.requested`、`decision.pending`、`decision.resolved`、`decision.failed`，detail 仅含版本、候选 key、confidence、原因和 receipt ref。
- 回滚：停用 Provider 和 Jev 规则即可停止新决策；direct 规则不受影响。代码回滚保留未知可选字段和 decision receipts，不删除审计或执行回执。

## 9. 替代方案与规约证明

- 纯规则无法解决模糊路由，否决。
- 通用 LLM 规划并执行可发明目标/参数且难以审计，否决。
- 独立决策服务或新配置页会重复授权、执行与 UI，否决。
- Jev 直接返回工具调用会绕过 Action Gate，否决。

本设计符合 AGENTS.md 的目录、单向依赖、文件存储、API Route 薄边界和感知插件边界；若实施新增上述数据路径，需同步更新 AGENTS.md 与 `docs/changes/`。
