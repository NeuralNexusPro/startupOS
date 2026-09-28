# 测试 - Story 9.37

**Story:** HITL 直连与协作链路扁平化
**Epic:** Epic 9 — Multi-Agent 协作运行时
**最后更新:** 2026-07-20

---

## 测试策略

### D. 测试

- [ ] 单元：`hitl-router.test.ts` — 验证 `HITL_ESCALATE` 直接 emit `HUMAN_REVIEW_REQUEST`，不经过 Supervisor
- [ ] 单元：`session-store.test.ts` — 验证 facade 合并后会话状态机不变
- [ ] 集成：`hitl-direct.integration.test.ts`
  - 启动 supervisor + 1 个 worker
  - Worker 调用 `ask_user_question`
  - 验证：前端 SSE 在 200ms 内收到 `HUMAN_REVIEW_REQUEST`
  - 用户回复
  - 验证：worker stdin 在 200ms 内收到 resume
  - 验证：supervisor 全程未消费 `escalate_to_human` / `resume_worker`
- [ ] E2E：扩展 `scripts/test-collaboration-e2e.mjs` 增加 HITL 场景

---

## 验收标准

### 功能性

- [ ] Worker 调用 `ask_user_question` 后，前端在 ≤ 200ms 内显示 HITL 输入框（不依赖 Supervisor LLM 决策）
- [ ] 用户回复后，Worker 在 ≤ 200ms 内收到 stdin resume
- [ ] Supervisor 全程未调用 `escalate_to_human` / `resume_worker`（`hitl-trace.jsonl` 验证）
- [ ] 多个 Worker 同时 HITL 时，bridge 按 workerId 正确路由，互不干扰
- [ ] Supervisor 自身 escalate_to_human（无 worker 上下文）路径仍可工作

### 结构性

- [ ] `src/lib/collaboration-runtime-service/` 删除
- [ ] `src/lib/collaboration-runtime-bridge/` 删除
- [ ] 所有 API Route import 路径迁移完成
- [ ] `npm run lint` 0 error
- [ ] `npm run typecheck` 0 error

### 可观测性

- [ ] `hitl-trace.jsonl` 包含 4 个时间戳节点
- [ ] `metrics.json` 含 `hitl.roundtrip.ms` 字段
- [ ] 链路 P50 ≤ 400ms，P95 ≤ 800ms（不含用户思考时间）
