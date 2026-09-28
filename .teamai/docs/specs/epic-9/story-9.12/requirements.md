# 需求定义 - Story 9.12

**Story:** UI — 协作查看器
**Epic:** 9 — Multi-Agent 协作运行时
**最后更新:** 2026-07-17

---

## 用户故事

> 作为用户，我希望在界面上实时看到多 Agent 协作的执行过程，包括事件时间线、Agent 活动状态和黑板数据，这样我能了解协作进度并及时干预。

---

## 功能需求

1. **事件时间线** — 按时间排序展示 RuntimeEvent，按类型着色
2. **SSE 实时更新** — 连接 `/api/collaboration/sessions/[id]/events`，实时接收事件
3. **Agent 活动卡片** — 显示每个 Agent 当前状态（thinking / tool_call / complete / fail）
4. **黑板状态简视图** — 显示 sharedData 摘要和任务队列状态
5. **重连不丢事件** — 使用 Last-Event-ID 支持断线重连

## 边界条件

- SSE 连接后实时显示事件
- Agent 活动卡片状态正确（thinking → tool_call → complete/fail）
- 断线重连后不丢失事件（Last-Event-ID）
- 事件按类型着色（thinking=blue, tool_call=yellow, complete=green, fail=red）
- 响应式布局正常

## 验收标准

- [ ] SSE 连接后实时显示事件
- [ ] Agent 活动卡片状态正确（thinking → tool_call → complete/fail）
- [ ] 断线重连后不丢失事件（Last-Event-ID）
- [ ] 事件按类型着色（thinking=blue, tool_call=yellow, complete=green, fail=red）
- [ ] 响应式布局正常

## 依赖关系

- [设计文档 §12.1 协作过程可视化](../../design/multi-agent-runtime.md#121-协作过程可视化)
- [设计文档 §12.2 运行指标](../../design/multi-agent-runtime.md#122-运行指标)
