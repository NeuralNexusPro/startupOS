## Why

OriginOS 当前只有用户主动会话和时间调度，没有统一的外部感知入口。邮箱、企业微信、飞书和钉钉事件无法经过一致的验签、归一化、去重、授权与路由后触发 Project、RoleAgent 或 Skill，平台适配若直接落在 API Route 还会破坏现有架构围栏。

追溯信息：`epic-id: epic-SENSE`，来源：`docs/specs/epic-SENSE/README.md`。

## What Changes

- 新增版本化 PerceptionEvent 和 Connector Contract。
- 新增 Webhook Gateway 与邮箱长驻轮询边界。
- 新增企业微信、飞书、钉钉 Connector，分别声明入站事件和出站回复能力。
- 新增 Trigger Rule、目标授权、幂等 lease、重试、dead-letter 和审计。
- 将事件安全路由到 Project、RoleAgent 或 Skill；复用现有 Agent Session/Task Runtime，不建立第二套执行器。
- 将 scheduler 限定为 poll/retry 时间驱动，将 neural-channel 限定为内部通信。

## Capabilities

### New Capabilities

- `external-perception-runtime`: 外部事件接入、归一化、防御、去重、规则匹配、授权、租约与路由。
- `perception-connectors`: Email、企业微信、飞书、钉钉的统一 Connector Contract 和平台适配。

### Modified Capabilities

- `scheduler`: 提供 Connector poll/retry 计划，但不理解平台 payload。
- `agent-session-task-runtime`: 接收已授权的 perception trigger provenance，并保持既有执行和证据门禁。

## Impact

- Core：新增 `packages/core/src/modules/perception-runtime/` 和平台无关协议类型。
- Integrations：新增 `packages/core/src/lib/integrations/perception/` 平台适配。
- Web：新增薄 Webhook API Route。
- Desktop/Service：新增邮箱与长驻 Connector supervisor。
- 数据：新增 `data/perception/`，继续使用 DataFile/JSONL，不引入数据库。
- 安全：新增 secret reference、验签、重放防护、内容防御、速率限制和审计。

