# Design

## Context

动机见 [proposal.md](./proposal.md)。Channel Runtime 已把可信 IM 字段保存在用户消息的 `metadata.channel`，但逐轮认知事件只传正文，Memory Core 的 JSONL 记录、证据与召回结果也没有来源。`HistoryStore.readAll()` 目前按会话局部 `turnNumber` 排序，Consolidator 则把历史证据统一标记成构造它时的 `sessionId` 和当前时间。历史恢复同样只恢复正文。

实现受以下约束：记忆库继续按角色或项目共享；本地 JSON/JSONL 是状态事实源；不新增模型调用和依赖；旧记录必须原位可读；Channel 插件、Desktop 和 Web 不得成为 Memory Core 的反向依赖。

## Goals / Non-Goals

**Goals:**

- 用一个 Layer 0 可选 DTO 贯穿会话消息、逐轮记录、证据、召回和历史恢复。
- 记录来源来自可信宿主元数据，并在跨会话排序和证据归属中使用记录自身的标识与时间。
- 保持旧数据、非 IM 调用和现有存储格式兼容。

**Non-Goals:**

- 不按群聊、单聊或发送者拆分共享记忆。
- 不改变感知规则、授权、会话绑定、插件协议或用户身份体系。
- 不依赖模型解析来源，不重写既有 `Memory.md` 或 JSONL。

## Decisions

### 1. 在共享认知类型中定义扁平的可选来源 DTO

`packages/core/src/lib/shared/cognitive/types.ts` 定义 `CommunicationSource`。它包含 `origin`、`connectorId`、`conversationKind`、`conversationId`、`actorId`、`actorDisplayName`、`sessionId`、`messageId` 和 `observedAt`；IM 字段均可选，`sessionId`、记录标识和时间在新逐轮记录中由宿主补齐。`TurnCognitiveData`、Recall 记录和 `EvidenceRef` 通过可选字段复用该 DTO。

选择共享类型是因为 Channel Runtime、Pi Agent 集成与 Memory Core 都可以单向依赖 Layer 0。备选方案是在各模块复制类型或让 Memory Core 依赖 Channel Runtime；前者会漂移，后者违反 AGENTS.md 的依赖方向，因此不采用。

### 2. 会话消息是当前轮来源的可信入口

Channel Runtime 将入站 `id` 和 `receivedAt` 与现有 `metadata.channel` 一起持久化。Agent 生命周期在 `message_end`/`turn_end` 链路读取运行时用户消息关联的持久化元数据，构造当前轮 `CommunicationSource`；正文只作为正文处理。非 IM 轮次仍记录内部 `sessionId`、消息标识与消息时间，未知 IM 字段不补值。

备选方案是在编码给模型的 JSON 正文中反向解析来源。该内容属于不可信用户输入且会被截断或改写，无法作为状态事实源，因此不采用。

### 3. JSONL 保持包裹格式，只增加可选字段

Recall 条目新增可选 `source`。新记录写入 `timestamp` 和来源；读取旧记录时仅从 JSONL 文件名确定内部 `sessionId`，其余未知字段不猜测。跨文件读取按 `timestamp` 排序，再以 `sessionId`、`messageId` 或稳定记录键和 `turnNumber` 破同值，避免局部轮次冲突。

备选方案是一次性迁移全部历史文件。迁移会重写用户数据且无法恢复未知来源，本变更采用兼容读取。

### 4. 证据从具体 Recall 条目生成

Consolidator 给模型的每条历史记录附带稳定来源标签，并要求提炼指令引用支持它的标签。合法标签映射回具体 Recall 条目；缺少或非法引用的模型指令不进入结构化 Cognition Bank，仍可沿用现有可读 Memory block 行为。工具经验和确定性候选直接从所属 Recall 条目构造 evidence。证据 ID 由原始来源与业务键生成，`sourceId`、`observedAt` 和新增来源 DTO 均取自原记录。

多个标签会产生多个 evidence，交给现有 Cognition Bank 的去重/合并逻辑保存。备选方案是为每个结论附加最近 50 轮全部证据；这会错误放大独立证据数量，因此不采用。

### 5. 召回与历史恢复使用同一来源编码器

Core 提供一个纯函数把 `CommunicationSource` 编码为短小、独立于正文的模型上下文。Recall 输出在摘要前添加来源；运行时恢复对带 `metadata.channel` 的历史用户消息复用现有 Channel JSON 结构，并补充消息标识、时间与内部会话标识。当前入站提示也使用相同字段集合，避免首次运行与恢复后的语义不同。

来源块独立生成，正文长度限制只作用于正文。备选方案是把来源拼到摘要末尾；长文本截断会再次丢失来源，因此不采用。

### 6. 数据所有权、安全、并发和性能

Agent session 文件拥有原始消息元数据，Memory Core JSONL 拥有逐轮记忆来源，Cognition Bank 拥有最终证据引用；日志不是事实源。只保存已允许的标识字段，不保存凭据、HTTP 头或附件字节。平台 `actorId` 不映射为全局用户。

每个会话继续写自己的 JSONL，跨会话读取为现有的小规模文件扫描与内存排序，复杂度不变。来源对象随记录一次写入，不引入锁或跨进程共享状态。相同时间的稳定排序保证不同进程重启后结果一致。

### 7. 架构和 subagent 实施边界

所有应用源码变更位于 `packages/core`：共享类型位于 Layer 0；Pi Agent/Channel 只向下依赖共享类型；Memory Core 消费共享类型，不依赖 Web、Desktop 或插件。API route、生成目录和插件包不修改，符合 AGENTS.md 的目录与单向依赖规则。

应用源码由一个实现 subagent 在独立 Task worktree 中完成，写入范围限定为 `packages/core/src/lib/shared/cognitive/`、`packages/core/src/lib/integrations/pi-agent/`、`packages/core/src/modules/channel-runtime/`、`packages/core/src/modules/memory-core/` 及对应测试。Proposal integration worktree 只负责规格、合并与验证，避免并发写入重叠。

## Risks / Trade-offs

- [运行时事件可能不携带持久化 metadata] → Agent 生命周期以 session 中最后一条对应用户消息为可信补充来源，并用自动化测试覆盖首次运行和恢复。
- [模型遗漏或伪造提炼来源标签] → 只接受本次输入表中存在的标签；无合法标签时不写结构化 Cognition Bank。
- [旧记录时间缺失] → 保持原有可读性，并使用包裹文件的可信创建时间；完全缺失时采用确定性回退，不伪造平台发生时间。
- [来源文本增加 token] → 使用固定紧凑字段，只对实际存在字段编码，不增加模型调用。

## Migration Plan

1. 先发布可选类型和兼容读取，新写入记录开始携带来源。
2. 运行 Memory Core、Channel Runtime、Pi Agent 恢复测试以及架构边界检查。
3. 使用企微群聊与单聊进行人工验收，分别记录结构化来源结果和模型措辞结果。
4. 回滚时恢复旧读取和模型编码逻辑；新增可选字段留在 JSON/JSONL 中，由旧读取器忽略，不删除或重写用户数据。
