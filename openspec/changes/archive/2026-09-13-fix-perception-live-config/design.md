## Context
active Set仅存pluginId:connectorId；已运行ID直接跳过。重新provision保存停用，再在下一次5秒扫描前启用，使旧实例一直存活。UI单次load读到启动前健康状态且不再更新。
## Goals / Non-Goals
运行中配置变化在下一轮既有协调中生效；后台状态自动呈现。无需新事件总线、文件监听、配置框架或轮询服务。
## Decisions
运行时记住已应用的配置版本（包含updatedAt与有效配置，固定secretRef下重新绑定也应生效），变更先停旧再启动新。协调不得并发重复启动；stop与未完成启动保持一致。UI优先复用现有刷新机制，清理计时器、避免请求重叠、后台刷新不清除用户操作错误。
## Risks / Trade-offs
上游连接延迟不等于配置未生效；测试控制启动promise验证交错。配置未变不重启，停用后不因未完成启动复活。
## Migration Plan
父代理文档/集成；runtime子代理只Desktop Host与测试；UI子代理只Web状态展示与测试，各自Task worktree。完整回归与本地应用包验证后合并、归档、清理。
## Open Questions
用户确认主场景为首次新增后启用：必须验证后台下一轮启动和UI健康自动更新；重新绑定缺陷是独立回归一并修复。
