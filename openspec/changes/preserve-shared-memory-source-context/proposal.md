# Proposal

## Why

IM 消息的渠道、群／单聊、平台会话和发送者信息已经进入会话消息，但在逐轮记忆、跨会话提炼、证据和召回中丢失，导致共享记忆可能把不同沟通场景合并为无来源结论。现在必须保留可信来源，才能让角色共享记忆而不混淆身份、渠道和证据归属。

追溯信息：`epic-id: epic-SENSE`，`story-id: story-SENSE.12`，`task-id: SENSE12-T9`，`owner: Memory Core / Channel Runtime`，来源：[docs/specs/epic-SENSE/story-SENSE.12/memory-source-context-gap.md](../../../../docs/specs/epic-SENSE/story-SENSE.12/memory-source-context-gap.md)。

## What Changes

- 定义平台无关、可选且可持久化的 `CommunicationSource`，区分渠道、连接、群／单聊类型、平台会话、发送者、内部会话、消息标识和原始发生时间。
- 从可信 Channel 消息元数据把来源注入逐轮认知记录；正文中的伪造字段不能覆盖宿主来源。
- 跨会话读取按真实发生时间排序并保留记录自身的 session/message 标识，避免相同 `turnNumber` 混淆。
- Consolidator 为事实保留原始记录证据，禁止把所有 evidence 统一标成当前提炼会话和提炼时间。
- 召回及历史恢复向模型提供独立来源字段；长正文截断不得截掉来源。
- 兼容旧 JSON/JSONL 和非 IM 会话，未知来源显式缺省，不猜测、不重写旧记忆。

非目标：不隔离群聊和单聊的记忆库；不改变 Channel 授权、路由或会话绑定；不增加模型调用；不把平台 actorId 当作 OriginOS 用户 ID；不记录凭据、原始 HTTP 头或附件字节。

依赖：SENSE12-T8 已提供可信 `metadata.channel`；Memory Core 继续作为记忆事实源。本变更不新增第三方依赖或数据库。

上线：随 Core 与 Desktop 常规构建交付，旧记录按兼容读取继续可用。回滚时恢复旧读取链路并保留新增可选字段，避免删除或重写已产生的记忆数据。

## Capabilities

### New Capabilities

- `shared-memory-source-context`: 共享记忆从记录、提炼、证据、召回到历史恢复的可信沟通来源契约。

### Modified Capabilities

无。

## Impact

- Core：认知共享类型、Recall History Store、Consolidator、Memory Provider、runtime history 与 Agent 生命周期接线。
- 公共 API：新增可选来源 DTO；既有调用方保持兼容。
- 持久化：JSON/JSONL 记录增加可选版本化来源字段，不迁移或删除旧记录。
- IPC 与平台插件：不改协议；只消费现有 Channel message metadata。
- 打包：需要验证 Desktop 编译与 Agent Worker runtime 仍可加载相关模块。
