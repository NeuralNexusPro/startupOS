## ADDED Requirements
### Requirement: 旧会话渠道目标兼容
系统 SHALL 在显式入口元数据缺失时使用持久化 agentType 识别已知角色、技能与助手入口，继续发送 SHALL 保持既有会话 ID 和项目存储位置。
#### Scenario: 旧角色与技能通知恢复
- **WHEN** 定时任务通知打开缺少 entryType/entryId 的旧角色或技能会话
- **THEN** 再次发送使用对应业务渠道目标并通过合法中文目录标识校验
#### Scenario: 显式元数据优先
- **WHEN** 会话同时存在显式入口元数据和不同的历史 agentType
- **THEN** 使用显式入口元数据
#### Scenario: 校验边界保持
- **WHEN** 目标包含非法路径片段或真实项目使用不合法项目 ID
- **THEN** 渠道仍拒绝该请求且不调用运行时
