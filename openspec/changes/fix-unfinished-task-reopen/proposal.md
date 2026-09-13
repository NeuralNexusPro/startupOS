## Why
用户明确要求：关闭窗口或退出应用后，回到原历史会话，看到未完成长任务并点击继续。Skill历史窗口缺已有任务面板；coordinator销毁未失效旧续跑代次，异步abort可能误写失败。
## What Changes
- 在原历史会话恢复后复用已有任务Hook/面板及继续操作，保留原taskId与已完成步骤。
- 修复销毁后异步续跑误写失败或继续派发。
## Capabilities
### New Capabilities
- `unfinished-task-reopen`: 历史会话未完成任务继续与退出恢复。
### Modified Capabilities
## Impact
Epic9 / Story9.41 / Task9.41-T2。Core coordinator及测试、Web Skill历史任务展示与必要共享TaskCard测试。不自动选择历史、不扩展历史列表摘要或任务创建功能。
