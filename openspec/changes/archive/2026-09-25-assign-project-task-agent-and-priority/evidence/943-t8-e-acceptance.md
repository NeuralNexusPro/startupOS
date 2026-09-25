# 943-T8-E Acceptance

- B07：handoff 递增 lease epoch 并失效旧 claim；旧 epoch 结果无法推进 WorkItem。
- 并发优先级：requestId/revision/cursor/epoch CAS 拒绝第二个过期写入，并保留未涉及字段。
- 未授权目标与迟到回执：候选来自冻结 contract/permissions；未知或未授权 Agent 零写入拒绝。
- Web 不乐观更新卡片或执行者，成功仅合并权威详情，失败保留筛选、详情、草稿、选择与焦点。
- 合并回归与三包 typecheck、lint、边界、自测、strict validation、diff check 均通过。
