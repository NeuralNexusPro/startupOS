# Epic SENSE: 感知层与外部事件触发器

**Epic 编号:** SENSE  
**Epic 名称:** Perception Layer & External Event Triggers  
**优先级:** 🔴 Critical  
**状态:** 🟠 In Progress
**创建日期:** 2026-08-28  
**Owner:** OriginOS Runtime Team

## 概述

OriginOS 当前主要依赖用户在界面中主动发起会话，`scheduler` 只能产生时间事件，`neural-channel` 只承担内部通信。产品缺少统一的外部感知层，无法从邮箱、企业微信、飞书、钉钉等上游持续接收事件、判断触发条件并安全地唤醒 Project、RoleAgent 或 Skill。

本 Epic 建立独立的 `perception-runtime`：外部 Connector 负责收取、验签和解析平台事件；运行时负责归一化、去重、策略匹配、权限判断、目标路由、执行租约和审计。平台原始 payload 不得直接进入 Agent prompt，也不得由 Next.js API Route 承担业务决策。

## 核心目标

1. 为邮箱与 IM 平台建立统一 Connector Contract。
2. 将平台事件转换成版本化 `PerceptionEvent`，保留最小必要 provenance。
3. 通过声明式 Trigger Rule 将事件路由到 Project、RoleAgent 或 Skill。
4. 对外部输入实施验签、重放防护、幂等、权限、速率限制和内容防御。
5. 支持失败重试、dead-letter、审计与人工停用，不因单个 Connector 故障阻塞其他来源。
6. 为未来接入日历、RSS、文件监控和其他 SaaS 事件保留扩展边界。

## 非目标

- 不把 `neural-channel` 改造成互联网接入网关。
- 不把 `scheduler` 改造成平台 Connector；scheduler 只负责轮询计划和延迟重试。
- 不在本 Epic 内实现通用 iPaaS 或任意用户脚本执行。
- 不允许外部消息绕过 Agent/Skill 权限、HITL 或 workspace 边界。
- 首期不承诺读取所有群聊消息；具体能力取决于平台应用权限与事件订阅模式。

## 架构边界

```text
Email / WeCom / Feishu / DingTalk
             │
             ▼
Connector Boundary
验签 · 解密 · 拉取 · 平台 ACK
             │
             ▼
Perception Runtime (core module)
normalize → defend → dedupe → match → authorize → lease
             │
       ┌─────┼─────────┐
       ▼     ▼         ▼
    Project RoleAgent Skill
       │     │         │
       └─────┴─────────┘
             ▼
     Agent Session / Task Runtime
```

### 分层约束

- `packages/web/src/app/api/perception/**`：只处理 HTTP、平台握手、原始请求上限和响应映射。
- `packages/desktop/src/main/services/`：托管邮箱轮询与桌面长驻 Connector supervisor。
- `packages/core/src/lib/integrations/perception/`：平台协议解析、验签与发送适配，不依赖业务 feature。
- `packages/core/src/modules/perception-runtime/`：事件归一化、规则匹配、幂等、租约、审计与路由。
- `packages/core/src/lib/features/`：配置管理和面向产品的服务 facade。
- `packages/core/src/modules/scheduler/`：仅提供 poll/retry 的时间调度能力。

## 统一事件模型

```typescript
interface PerceptionEventV1 {
  id: string;
  source: 'email' | 'wecom' | 'feishu' | 'dingtalk';
  sourceEventId: string;
  connectorId: string;
  type: 'message.received' | 'mention.received' | 'mail.received' | 'action.invoked';
  occurredAt: string;
  receivedAt: string;
  actor: { externalId: string; displayName?: string };
  conversation?: { externalId: string; kind: 'direct' | 'group' | 'thread' };
  content: { text?: string; subject?: string; attachmentRefs?: string[] };
  provenance: { tenantExternalId?: string; rawPayloadRef: string };
}
```

原始 payload 单独进入有界 inbox，不直接拼入 prompt。附件先经过类型、大小和恶意内容检查，只向 Agent 暴露受控引用。

## Trigger Rule

每条规则至少包含 source、event type、过滤条件、目标、执行模式、权限策略、去重窗口和失败策略。目标可以是 Project、RoleAgent 或 Skill；Standalone Skill 由事件触发时只获得本次事件上下文，不自动拥有长期认知。Project/RoleAgent 内的 Skill 继承调用方 ownership。

## Stories

| Story | 标题 | 优先级 | 依赖 | 状态 |
|---|---|---|---|---|
| **SENSE.1** | PerceptionEvent、Connector Contract 与本地 Inbox | Critical | 无 | ✅ Complete |
| **SENSE.2** | Webhook Gateway：验签、解密、去重、重放防护与 ACK | Critical | SENSE.1 | ✅ Complete |
| **SENSE.3** | Email Connector：IMAP/Provider 拉取、游标与附件引用 | High | SENSE.1 | ✅ Complete |
| **SENSE.4** | 企业微信应用/机器人 Connector | High | SENSE.2 | ✅ Complete |
| **SENSE.5** | 飞书应用机器人与事件订阅 Connector | High | SENSE.2 | ✅ Complete |
| **SENSE.6** | 钉钉应用机器人与事件订阅 Connector | High | SENSE.2 | ✅ Complete |
| **SENSE.7** | Trigger Rule、目标授权与 Agent/Project/Skill 路由 | Critical | SENSE.1–6 | ✅ Complete |
| **SENSE.8** | 重试、Dead Letter、审计、可观测性与连接管理 | High | SENSE.7 | ✅ Complete |
| **SENSE.9** | 感知中心产品入口 | High | SENSE.8 | ✅ Complete |
| **SENSE.10** | Mail Connector Provisioning 与 Desktop 轮询闭环 | Critical | SENSE.3、SENSE.8、SENSE.9 | ✅ Complete |
| **SENSE.11** | 企业微信 Connector Provisioning 与运行闭环 | Critical | SENSE.2、SENSE.4、SENSE.8、SENSE.9 | ✅ Complete |
| **SENSE.12** | Perception Plugin Host 与 Connector 插件化迁移 | Critical | SENSE.1–11 | 🚧 In Progress |

## 数据目录

```text
data/perception/
├── connectors/          # DataFile；只保存非敏感配置和 secret reference
├── rules/               # 版本化 Trigger Rules
├── inbox/               # 归一化前的有界 payload 引用
├── events/              # PerceptionEvent DataFile/JSONL
├── leases/              # 幂等执行租约
├── dead-letter/         # 达到重试上限的事件
└── audit/               # 脱敏审计记录
```

密钥、App Secret、邮箱密码和 token 不得明文写入上述目录；Desktop 使用系统安全存储，Web/Server 使用环境或 secret provider reference。

## 关键验收门禁

- 相同平台事件重复投递不会重复启动 Agent/Task。
- 签名无效、时间窗过期、来源未授权的事件在业务路由前被拒绝。
- Connector ACK 与长耗时 Agent 执行解耦，平台回调不等待 Agent 完成。
- Standalone Skill 不因外部触发创建持久 Knowledge/Pattern；继承场景按调用方 ownership 路由。
- Connector 故障、速率限制或单事件毒化不会阻塞其他 Connector。
- 所有外部触发均可追溯到 connector、规则、目标、执行 lease 和最终结果。
- API Route 无业务规则；core 不反向依赖 web/desktop；所有 JSON 符合 DataFile 规约。

## 风险与决策

| 风险 | 决策 |
|---|---|
| 群机器人 Webhook 与事件订阅能力混淆 | 每个平台 Connector 分开声明 inbound event 与 outbound reply capability |
| 外部输入诱导 Agent 越权 | 规则绑定固定目标和工具 scope；高风险动作进入 HITL |
| 重复/乱序事件 | sourceEventId + connectorId 幂等键，保留 occurredAt/receivedAt |
| Next.js serverless 不适合长轮询 | 邮箱轮询由 Desktop/Service supervisor 托管 |
| 敏感信息进入日志或记忆 | 入站防御、payload 引用、字段级脱敏，默认不进入长期认知 |
