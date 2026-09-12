## Why
用户报告 Agent/Skill 回到历史会话发送后没有回复。取消IPC仅removeAgent，destroy未abort，旧流仍持有会话串行队列，符合关闭后旧任务继续执行的日志。
## What Changes
接通既有渠道取消与底层Agent终止，确保切换会话释放旧流；真实IPC与串行队列回归先红后绿。
## Capabilities
### New Capabilities
- `restored-session-cancellation`: 历史会话切换的运行取消。
### Modified Capabilities
## Impact
Epic AG / Story AG.2 / Task AG2-T3。Desktop取消边界、必要Core销毁及测试。沿用户已授权历史会话无响应修复继续；不改模型配置，不扩展独立记忆整理或历史消息数组兼容问题。
