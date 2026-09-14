## Context

原始IM消息已经由平台插件解析成PerceptionEventV1，包含正文、actor、conversation和来源。当前perceptionText把正文变成感知任务，buildRuntimeInput再添加渠道分析封套；目标看到的不是成员原话。用户明确了边界：感知事件只负责路由判断，处理目标接收原始信息。

## Goals / Non-Goals

目标：正文经路由及持久化保持原样；正文、发送者ID/可用显示名、会话ID/类型、来源和附件引用作为完整消息到达目标及模型输入。目标仍按自身角色或Skill处理，不由感知层替目标定义业务意图。

非目标：增加直接回复模式的提示词、平台特殊话术、输出过滤、额外模型调用、记忆迁移。既有非IM流程不在本次重构范围。

## Decisions

1. Perception路由对三类IM将event.content.text直接映射到message.content.text，不调用perceptionText。此选择不依赖能否投递；回复句柄是否有效只决定投递路径。规则ID、HITL/授权结果、事件ID继续用于已有路由、审计和控制流。
2. Channel runtime移除IM分析封套；模型输入边界复用JSON.stringify编码完整消息对象（text、sender.id/displayName、conversation.id/kind、origin、attachmentRefs），复用Worker字符串协议。原文在text字段逐字符保留，发送者字段同时对模型可见；编码不是事件任务或回复指令。内容按既有user角色输入，正文不能伪造外层身份或提升授权。
3. 保留ChannelInboundMessage已有字段，增加可选actorDisplayName/conversationKind，从event.actor.displayName和conversation.kind映射；不猜测缺失姓名。不会把平台原始HTTP头或凭据交给模型，也不复制平台SDK数据结构。附件和发送者/会话元数据写入会话消息metadata，恢复后能追溯每条消息的实际发言人，不拼入正文。
4. 复用现有会话绑定与Worker prompt字符串传递，新建/恢复会话每轮同样生效，不增加全局状态、系统prompt改写或IPC。处理范围是共享Core入口，无需四平台各自实现一套。

替代方案：只改路由仍残留运行时封套；追加“直接回复”指令继续改写原消息；改角色或过滤输出会掩盖入口问题。选择两处共享入口透传，保持目标能力自主。

依赖保持Desktop/Web → Core modules → integrations/storage/shared/types，平台插件无需反向依赖。若修改可选公共字段，同步AGENTS；不增加I/O或模型调用。规则匹配和授权不能因正文透传被跳过。

## Risks / Trade-offs

历史中已有第三方分析且日志显示写入工作记忆 → 不静默删除用户资产；原会话人工复测，若仍有影响再提供具体证据处理。
模型仍可能按原角色生成分析 → 自动化只证明入口原文及边界；人工用普通问候/催促与明确代拟请求分别验收，不保证固定措辞。
只移除IM封套 → 非IM调用保持兼容并由回归测试证明；其他感知源是否采用同样原文边界需独立确认。

## Migration Plan

用户于2026-09-14批准实施，随后提供替换旧流程的新AGENTS；相互依赖的入口、gateway metadata及测试在当前工作区直接实施，同步Story/AGENTS/changes并验证实际包。无数据迁移；发布按授权执行，回滚不删除会话或记忆。

## Open Questions

无阻塞产品选择。用户所说的处理插件在现有代码中对应规则目标Agent/Skill；渠道插件继续负责协议解析及投递。实际IM复测由用户操作，自动化不发真实平台消息。
