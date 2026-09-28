# 架构设计 - Story 9.34

**Story:** 用户回复路由收敛到 Supervisor
**Epic:** 9 — Multi-Agent 协作运行时
**最后更新:** 2026-05-22

---

## 模块设计

### A. 路由分支删除

- [ ] 移除 `executeMultiAgentDag()` 中根据 sessionId 直接 resume Worker 的代码分支
- [ ] 移除 `waitingProcs` map 中以 `workerId` 为键的注册路径；保留以 `supervisorId` 为键的单例路径
- [ ] HITL `resume` 注册表收敛为 `Map<sessionId, SupervisorResumeHandle>`，禁止 Worker 自行注册

### B. 用户消息接入 Supervisor

- [ ] `POST /api/collaboration/sessions/[id]/messages`：
  - 用户消息附加到 Supervisor 消息历史
  - 如 Supervisor 处于 `escalated` 等待用户状态 → `resume()` Supervisor 子进程
  - 否则作为新一轮 user prompt 触发 Supervisor `prompt()`
- [ ] Worker 重新激活仅通过 Supervisor 工具调用 `dispatch_worker(workerId, ..., 补充参数)` 完成

### C. 事件流标注

- [ ] 用户消息进入 Supervisor 时 emit `USER_REPLY_TO_SUPERVISOR` 事件，payload 含 `inReplyToBlockId`（如有）
- [ ] UI 时间线显示用户消息时附加"→ Supervisor"标签

---

## 代码变更 / 关键文件

| 操作 | 文件路径 |
|------|---------|
| MODIFY | `src/lib/collaboration-runtime-bridge/multi-agent-executor.ts` |
| MODIFY | `src/app/api/collaboration/sessions/[id]/messages/route.ts` |
| MODIFY | `src/modules/collaboration-runtime/session/types.ts`（新事件类型） |
