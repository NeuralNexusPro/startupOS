## Context
restore ownership 检查允许旧会话缺少入口元数据，但 UI 渠道映射仅看 entryType；两者不一致。
## Goals / Non-Goals
修复旧数据的继续发送；不重写数据，不放宽所有权及项目 ID 校验。
## Decisions
显式 entryType/entryId 优先。仅元数据缺失时依据已存 agentType 推导已知角色/技能/助手类型；技能只移除标准 skill- 前缀。真实项目保持原分支。实现前搜索所有映射调用方及仓库既有 helper，优先复用。
## Risks / Trade-offs
未知 agentType 继续原项目分支；不猜测路径或内容。新增元数据优先测试避免旧字段覆盖新字段。
## Migration Plan
无需迁移。独立 subagent Task 实施，父代理集成、验证、编译、合并与归档。
## Open Questions
无实施阻塞；实际用户会话内容不参与测试。
