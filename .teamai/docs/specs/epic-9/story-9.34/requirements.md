# 需求文档 - Story 9.34

**Story:** 用户回复路由收敛到 Supervisor
**Epic:** 9 — Multi-Agent 协作运行时
**最后更新:** 2026-05-22

---

## 用户故事

> 作为协作运行时的设计者，我希望删除"用户回复直接 resume Worker"的代码路径：用户消息永远进入 Supervisor 消息历史，由 Supervisor 决定后续如何回到 Worker。

---

## 功能需求

### A. 路由分支删除（必须）

- [ ] 移除 `executeMultiAgentDag()` 中根据 sessionId 直接 resume Worker 的代码分支
- [ ] 移除 `waitingProcs` map 中以 `workerId` 为键的注册路径；保留以 `supervisorId` 为键的单例路径
- [ ] HITL `resume` 注册表收敛为 `Map<sessionId, SupervisorResumeHandle>`，禁止 Worker 自行注册

### B. 用户消息接入 Supervisor（必须）

- [ ] `POST /api/collaboration/sessions/[id]/messages`：
  - 用户消息附加到 Supervisor 消息历史
  - 如 Supervisor 处于 `escalated` 等待用户状态 → `resume()` Supervisor 子进程
  - 否则作为新一轮 user prompt 触发 Supervisor `prompt()`
- [ ] Worker 重新激活仅通过 Supervisor 工具调用 `dispatch_worker(workerId, ..., 补充参数)` 完成

### C. 事件流标注（必须）

- [ ] 用户消息进入 Supervisor 时 emit `USER_REPLY_TO_SUPERVISOR` 事件，payload 含 `inReplyToBlockId`（如有）
- [ ] UI 时间线显示用户消息时附加"→ Supervisor"标签

### D. 兼容性扫描（必须）

- [ ] grep `messages/route.ts` / `multi-agent-executor.ts` 中的 `targetWorkerId` / `to !== 'supervisor'` 等代码路径，全部删除
- [ ] 现存 events.jsonl 中标识为 `to: workerId` 的历史用户消息：迁移脚本不需要，UI 仅渲染兼容

---

## 验收标准

1. - [ ] 全代码库不再存在"用户消息 → 直接 resume Worker"的路径（grep + 单测）
2. - [ ] 实证：用户回复后 events.jsonl 出现 `USER_REPLY_TO_SUPERVISOR`，紧接着 Supervisor `dispatch_worker`，Worker 恢复执行
3. - [ ] Supervisor 自身处于 escalated 时用户回复 → Supervisor 进程 resume 而非 prompt（保留消息历史）
4. - [ ] 单测：注入 Workflow 模式 + 用户消息 + Supervisor 不存在 → 返回明确错误（不静默丢失）

---

## 依赖关系

- **前置依赖：** Story 9.33（Supervisor 决策器）
- **源依据：** [PRD-collaboration-product.md §FR-4](../PRD-collaboration-product.md)

---

## 边界条件 / 不在范围

- ❌ Workflow 模式 Lightweight Supervisor 兜底：见 9.35（本 Story 完成后才能在 Workflow 模式启用 HITL）
