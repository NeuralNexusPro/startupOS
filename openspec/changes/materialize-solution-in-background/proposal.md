# Proposal

## Why

当前解决方案确认会在单轮 Agent 对话中同时写入方案清单、多个 Agent 工程文件和全部 Skill，任一空响应、上下文耗尽或文件写入失败都会留下难以恢复的半成品。需要将文件物化从交互会话中拆出，形成可断点恢复但不进入用户任务看板的内部后台任务。

可追溯信息：epic-id `P2`；story-id `P2.10`；task-id `P2.10-T1`；owner `Codex`；来源 `docs/specs/epic-P2/story-P2.10/README.md`。

## What Changes

- 在方案确认后创建内部后台物化任务，冻结三份版本化方案清单及其内容摘要。
- 将 Agent、Skill 和最终验证拆为独立幂等步骤，持久化状态、尝试次数、错误原因和产物路径。
- 应用重启或会话退出后恢复未完成步骤，不重复覆盖已经验证的产物。
- Skill 步骤按 `project-skill-creator` 约束生成，并补齐真实可达的 `references/ontology-tools.md`。
- 后台任务只通过解决方案状态接口暴露摘要，不写入项目任务看板、协作 Run 或业务 WorkItem。
- 非目标：不改变多 Agent 项目任务语义，不新增数据库，不把生成目录作为源码实现入口。

## Capabilities

### New Capabilities
- `solution-background-materialization`: 已确认解决方案的后台、可恢复、不可见看板的 Agent/Skill 物化能力。

### Modified Capabilities

## Impact

- 影响 `packages/core` 的 solution/project 服务、JSON 文件持久化与后台运行协调。
- 影响解决方案确认边界及其 Agent 工具；Web 只消费轻量任务状态，不新增任务看板卡片。
- 依赖现有方案三文件契约和 Agent/Skill 创建模板；不新增第三方依赖、数据库或 IPC 协议。
- 上线方案：先允许显式启动后台物化并保留现有文件读取兼容，再切换 solution-design 的 Stage 4 指令。
- 回滚方案：停止创建新后台任务并恢复旧 Stage 4 指令；任务 JSON 和已经生成的文件可保留，只读兼容。
