# solution-session-start Specification

## Purpose
TBD - created by archiving change fix-solution-session-start. Update Purpose after archive.
## Requirements
### Requirement: 项目内解决方案技能安全发送
系统 SHALL 允许持久化项目与入口身份均完全匹配的项目内 Skill 发送消息，并保留归属隔离。
#### Scenario: 合法项目内解决方案
- **WHEN** 请求的 projectId、entryType、entryId 与保存的解决方案技能身份一致
- **THEN** 归属校验通过并启动流式回复
#### Scenario: 不同项目或入口
- **WHEN** 项目或入口与保存身份不一致
- **THEN** 拒绝访问
#### Scenario: 旧技能会话
- **WHEN** 会话缺少显式入口元数据
- **THEN** 保持原有推导与验证，不凭请求扩大权限

### Requirement: 解决方案启动与失败可见
系统 SHALL 自动发送开场、支持后续流式交互，并显示初始化或发送失败。
#### Scenario: 首次打开与继续发送
- **WHEN** 解决方案会话初始化完成
- **THEN** 自动开场仅发送一次，后续用户消息使用流式接口
#### Scenario: 启动或发送失败
- **WHEN** 初始化或发送拒绝
- **THEN** 窗口显示失败信息，不静默等待

