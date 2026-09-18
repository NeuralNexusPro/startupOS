# Design：稳定 Agent system prompt 前缀

## 背景

当前 builders 返回单一字符串，动态 StateMemory 位于固定协议之前。Pi Agent Core 已有 `transformContext`，可以在不改写持久消息的前提下注入模型侧上下文。

## 目标与非目标

- 目标：稳定 system prompt、冻结 session context、可验证 hash。
- 非目标：实现缓存、每轮认知预取或新 Prompt Manager。

## 设计决策

1. 保留现有 layer builder，但组装结果拆为 `systemPrompt` 与 `sessionContext`；兼容入口可继续取得完整结果直到调用方切换。
2. 使用 Pi Agent Core 已有 `transformContext` 在模型边界注入一条受控 session context，不写入会话历史。
3. session context 在 Agent 实例生命周期内冻结；显式配置刷新时重建。每轮 recall 由后续 Task 追加。
4. 用 Node `crypto.createHash('sha256')` 计算 system prompt hash；无新依赖。
5. runtime environment 属于 session context；安全和权限策略属于稳定 system prompt。

## 恢复与并发

恢复使用相同 launcher 输入重建两个区域。每个 Agent 实例持有自己的冻结上下文，不使用全局可变变量。

## 安全

模型侧上下文使用固定标签且不允许覆盖 system 指令。权限变化优先于缓存收益，必须触发稳定 prompt 更新。

## 替代方案

- 把动态尾部继续拼在同一 system 字符串：部分 provider 的块缓存会整体失效，拒绝。
- 新建 PromptEnvelope Manager：现有 layers 和 transform hook 足够，拒绝。

## Subagent 实施边界

- Task worktree 可写：Pi Agent prompt builders、launcher/Agent 配置边界、共享 prompt 测试。
- 不得写：认知 Provider、Web/Desktop UI、协作 worker、持久化格式。

## 回滚

恢复单字符串 prompt 组装；会话文件没有新增字段。
