## Why
用户报告历史Agent/Skill会话发送后无回复。已实证一个历史Role会话模型402错误被吞：错误捕获位于可选空回复重试开关之后，默认关闭时prompt误报成功；既有真实Agent用例已红。
## What Changes
将模型失败捕获从可选空回复重试开关分离，确保关闭重试也能向调用方和UI报告失败，保留原模型配置。
## Capabilities
### New Capabilities
- `agent-model-error-reporting`: 模型失败无条件向调用方报告。
### Modified Capabilities
## Impact
Epic AG / Story AG.2 / Task AG2-T3。Core Agent错误捕获及必要回归。用户授权继续修复无回复；不改模型、不处理独立取消/记忆整理/消息数组问题。Skill具体实例仍待关联，不将所有无回复统一归因。
