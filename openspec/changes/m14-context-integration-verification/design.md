# Design：M.14 集成验证与架构文档收口

## 范围

本 change 不实现 capability，只编排 M14-T1 至 T5 的合并、验证、证据和归档。

## 验证决策

1. 运行各 Proposal 定向测试，再运行 Core/Web/Desktop build、lint、boundaries 和 self-test。
2. 使用固定匿名 fixture 比较全文移除前后的 system/session/recall 估算；真实 provider 只记录返回 usage。
3. 创建 Story verification goal“通过 Story M.14 中定义的全部测试 case”，自动化与人工项分别记录。
4. 只有门禁通过才更新 Story/Epic/AGENTS/changelog、同步 capability specs 并归档 changes。

## Subagent 实施边界

- QA subagent 只写测试证据和必要的测试修复；业务失败回到所属 Proposal worktree。
- Integration owner 负责 merge、冲突处理、主 capability 同步、归档与清理。

## 风险与回滚

若任一门禁失败，不合并或归档；已完成 Task commit 保留在隔离分支。文档状态提交可独立回滚。
