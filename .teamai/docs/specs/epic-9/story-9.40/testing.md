# 测试策略 - Story 9.40

**Story:** 协作 UI 体验优化 — 多 HITL 并发 + 消息流对齐
**Epic:** 9 — Multi-Agent 协作运行时
**最后更新:** 2026-05-22

---

## 测试用例

### 多 HITL 并发

- [ ] 两个 Worker 同时发出 HITL_ESCALATE，UI 显示两个独立 HITL 卡片
- [ ] 分别回复两个卡片，两个 Worker 各自收到正确的 resume
- [ ] 一个 Worker resume 后其卡片消失，另一个卡片保持

### Coordination 折叠

- [ ] 连续 3 条以上 coordination 事件默认折叠为摘要
- [ ] 点击展开显示完整列表
- [ ] 折叠不影响 HITL、文本消息的正常渲染

### 任务分隔线

- [ ] 用户发送第二个目标时，消息流出现分隔线
- [ ] 分隔线显示目标前 40 字和时间
