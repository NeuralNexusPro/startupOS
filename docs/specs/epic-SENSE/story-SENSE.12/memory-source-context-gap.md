# SENSE12-T9：共享记忆的沟通来源元数据缺口

- **状态：待修复（Open，未实施、未验收）**
- **记录日期：2026-09-14**
- **来源：用户确认“作为一个缺口记录下来，需要修复”**
- **关联：SENSE12-T8、Epic M（Memory Core）**

## 问题与影响

IM入口已把原文、渠道和发送者交给模型，并写入会话消息metadata.channel，但这些信息尚未作为结构化来源贯穿逐轮记忆、提炼、证据、召回和历史恢复。用户实测中，角色共享Memory.md将群聊和单聊的问候累计为“四次wecom ping”，未保留各次沟通的会话区别。该缺口会导致场景混淆、身份归属不清、证据引用错误；它可能影响第三方视角回复，不能把元数据修复等同于模型回复效果已验证。

**已确认产品约束：记忆继续共享，不按群聊／单聊拆分记忆库；会话历史仍须区分群聊与单聊。**

## 已确认的断点

| 环节 | 当前缺口 | 源码位置（仓库根相对路径） |
|---|---|---|
| 逐轮记录 | TurnCognitiveData/TurnRecord无独立沟通来源；渠道信息仅可能存在于userMessage文本 | packages/core/src/lib/shared/cognitive/types.ts；packages/core/src/modules/memory-core/recall/history-store.ts |
| 跨会话读取 | readAll合并多个会话的记录，记录自身没有sessionId，且按各会话局部turnNumber排序 | packages/core/src/modules/memory-core/recall/history-store.ts |
| 记忆提炼 | 输入仅含轮次和正文，没有保证携带结构化来源 | packages/core/src/modules/memory-core/core/consolidator.ts |
| 证据归属 | 跨会话提炼时evidence()统一使用当前this.sessionId作为sourceId，并使用提炼时间作为observedAt | packages/core/src/modules/memory-core/core/consolidator.ts |
| 召回 | 返回轮次与截断摘要，来源可能被截掉或省略 | packages/core/src/modules/memory-core/recall/recall-memory.ts；packages/core/src/modules/memory-core/session/memory-provider.ts |
| 历史恢复 | mapPersistedMessagesForRuntime只恢复正文，未消费metadata.channel | packages/core/src/lib/integrations/pi-agent/core/runtime-history.ts |

## 修复要求

1. 复用并统一现有渠道字段，在逐轮记录及记忆证据中保留结构化来源：origin（如wecom）、connectorId、conversationKind（direct/group/thread）、conversationId、actorId、可用actorDisplayName、OriginOS内部sessionId、可追溯messageId及原始发生时间。平台会话ID与内部sessionId必须区分；字段命名和共享类型位置在实施设计中确定。
2. 来源由可信宿主上下文提供，不依赖模型从正文猜测；用户正文中的伪造JSON不得覆盖宿主来源。平台actorId不自动等同于OriginOS用户ID。
3. 记忆继续跨会话共享和召回。每条事实、观察或摘要保留原始证据引用；多个来源共同支持一个结论时保留多个引用，不统一改成提炼任务所在会话。单一来源重复不自动等同于独立证据。
4. 从记录、提炼到召回／模型输入均保留来源，不能只落盘或写日志。Memory.md可保留可读摘要，但不得成为来源信息的唯一事实源。
5. 跨会话记录按真实时间组织，以sessionId和消息／记录标识区分，不将不同会话相同turnNumber视为同一轮或用于全局时间排序。
6. 兼容旧记录。可从可信消息metadata或明确的历史文件归属补回已知字段；无法可靠恢复的来源标为未知，不从正文猜测，不静默删除或重写用户记忆。
7. 保持规则授权、插件边界和诊断脱敏；渠道凭据、平台原始HTTP头等不进入记忆来源字段。非IM记忆保持兼容。

## 验收条件（全部待执行）

- [ ] 同一角色、同一发送者分别在企微群聊和单聊发言：记忆共享可召回，两条记录各自保留正确会话类型、会话ID及发送者。
- [ ] 多连接、不同群成员及相同外部ID交错输入：连接和身份归属无串线；缺失显示名不推断。
- [ ] 逐轮记录落盘后重启，提炼、召回及历史恢复仍向模型提供原来源；长正文截断不截掉独立来源字段。
- [ ] 多会话都有turnNumber=1时，记录不混淆；按原始发生时间处理，证据sourceId/observedAt正确对应原记录。
- [ ] 一条摘要引用多个会话时保留各自证据；不把提炼任务当前sessionId赋给所有来源。
- [ ] 旧格式读取、未知来源及伪造正文来源字段有回归覆盖，原历史和共享记忆不被删除。
- [ ] 原群与单聊人工复测，核对角色能够识别当前发言人及沟通场景；模型措辞效果与结构化元数据验收分别记录。

本记录是待修复项，不代表实现、测试包或远端发布已包含修复。SENSE12-T8的入口自动化结果不能作为本缺口的完成依据。
