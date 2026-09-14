## Why
用户追加报告：定时任务通知进入角色或 Skill，恢复历史后继续发送报 CHANNEL_RUNTIME_FAILED。已复现旧会话缺少 projectContext.entryType 被映射为项目，中文业务 ID 触发项目校验。当前正在运行旧 /Applications 安装包，交付需提供新包。
## What Changes
- 保留显式入口元数据优先，从已保存的 agentType 兼容恢复旧入口类型及标准技能 ID。
- 增加真实 ingress 验证回归，保持项目及路径安全限制。
## Capabilities
### New Capabilities
- `restored-channel-target`: 旧会话发送的渠道目标兼容。
### Modified Capabilities
## Impact
Epic AG / Story AG.2 / Task AG2-T2。修改 Desktop 渠道展示适配和测试；不迁移数据，不修改 Core 校验器。用户本轮明确报告并要求处理通知/恢复问题，属于已授权修复的延续；据会话授权直接实施。
