## Why
用户要求未完成长任务关闭Agent/Skill窗口或退出应用后，再次进入能继续。入口默认新建会话丢失任务上下文；coordinator销毁未失效旧续跑代次，异步abort可能误写失败。
## What Changes
- 首次重新进入入口时从既有历史列表安全选择最近匹配的未完成任务会话，复用已有restore。
- 列表提供必要任务摘要，禁止通过逐个GET探测启动其他会话。
- 修复销毁后异步续跑写失败/继续派发；Skill恢复已有长任务时复用现有任务面板。
## Capabilities
### New Capabilities
- `unfinished-task-reopen`: 未完成任务重新进入与退出恢复。
### Modified Capabilities
## Impact
Epic9 / Story9.41 / Task9.41-T2。Core coordinator及测试；既有session列表摘要/types、AgentDialogContent/SkillDialog和测试。用户明确窗口关闭和整个应用退出均需支持。不新增任务引擎或Skill任务创建功能、不重放已完成步骤、不绕过等待确认。
