# IM原始消息透传与感知路由边界

- epic-id: SENSE
- story-id: SENSE.12
- task-id: SENSE12-T8
- owner: OriginOS Team
- 来源：docs/specs/epic-SENSE/story-SENSE.12/README.md；2026-09-14用户反馈群聊第三方视角，并明确“事件只做规则判断，原始信息交给处理插件”
- 状态：已获用户批准（2026-09-14“开始”及“继续”），本地实施与自动化验收完成；真实IM人工复测待用户执行

## Why

实际企微回复把成员的催促解释为待分析的感知事件，并给出代拟稿。代码和本机日志确认两次改写：Perception路由添加事件/规则/HITL包装，Channel运行时再次添加渠道封套。用户要求感知事件只控制是否路由，命中后原始消息交由目标Agent/Skill自行处理。

## What Changes

- 三个IM的事件仍用于规则匹配、授权、目标与会话定位；不把事件或规则说明写进目标的用户消息。
- 原始正文与发送者ID/可用显示名、会话ID/类型、来源、附件引用组成完整消息交给目标及模型；会话正文不改写，发送者不能只留在审计。模型边界仅编码完整消息，不增加分析任务。
- 同时移除IM的感知文本包装和渠道prompt封套，不额外强加“如何回复”的提示词或输出过滤；目标按自己的角色/Skill处理。
- 无回复句柄也不把原始聊天改写成事件分析任务；原有实际投递及失败判断保持真实。

## Capabilities

### New Capabilities
- im-direct-reply-context：IM原始消息透传与控制元数据分离。

### Modified Capabilities
无。既有流式投递、独立日志、文件回复及授权职责不变。

## Impact

影响Core channel-runtime/runtime-adapter、perception路由及对应测试；通过可选actorDisplayName/conversationKind补齐元数据，并写入会话metadata。无新依赖、数据库、平台SDK或IPC；不改变邮件等非IM调用。依赖现有事件、回复句柄和会话绑定。

非目标：修改角色定义、强制回复模板、增加模型改写、清空历史或删除记忆。新旧会话每轮走相同透传路径，无存储迁移。上线随应用包交付，回滚代码保留原数据；历史错误推断可能仍影响模型，须在原会话人工复测，不能把字符串相等测试当成模型回复效果保证。
