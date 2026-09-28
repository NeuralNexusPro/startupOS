# 需求规格 - Story 9.32

**Story:** Worker 结构化阻塞契约（report_block）
**Epic:** 9 — Multi-Agent 协作运行时
**最后更新:** 2026-07-20

---

## 用户故事

> 作为 Worker，当我缺信息或遇到决策点时，我希望通过结构化的 `report_block` 工具上报给 Supervisor，而不是用自然语言提问；这样 Supervisor 就能用机器可读的方式判定阻塞类型并做出决策。

---

## 功能需求

### A. WorkerBlock 类型定义（必须）

- [ ] 在 `src/modules/collaboration-runtime/session/types.ts` 新增：

```typescript
export type WorkerBlock =
  | { type: 'need_input'; missingFields: string[]; rationale: string; suggestedQuestion?: string }
  | { type: 'decision_required'; options: Array<{ id: string; label: string; impact?: string }>; rationale: string }
  | { type: 'conflict_detected'; conflictWith: string; conflictField: string; details: string }
  | { type: 'capability_missing'; missing: string; suggestedAgent?: string };

export interface WorkerBlockEvent {
  type: 'WORKER_BLOCK';
  workerId: string;
  dispatchId: string;
  block: WorkerBlock;
  timestamp: string;
}
```

### B. report_block 工具（必须）

- [ ] `agent-worker.mts` Worker 模式注入 `report_block(block: WorkerBlock)` 工具
- [ ] 工具语义：调用后 Worker 进程进入 `BLOCKED` 状态，**挂起但不销毁**（保留消息历史用于 resume）
- [ ] 工具 schema 用 zod 验证 block 字段；schema 校验失败返回错误，让 LLM 重试
- [ ] Worker `Agent.md` 模板更新使用说明：阻塞场景示例 + 反例（不要用自然语言提问）

### C. 运行时事件路由（必须）

- [ ] `report_block` 调用 → 运行时发出 `WORKER_BLOCK` 事件并 append 到 `events.jsonl`
- [ ] 事件路由到当前会话的 Supervisor（System 模式：常驻 Supervisor；Workflow 模式：在 9.35 之前暂时 fallback `failed`）
- [ ] Worker 子进程 `dispatchId` 加入 `blockedDispatches` map，待 Supervisor 后续 `dispatch_worker(workerId, ..., 补充参数)` 触发 resume

### D. 向后兼容（必须）

- [ ] 9.31 中 `HUMAN_REVIEW_REQUEST` → `WORKER_BLOCK{need_input}` 包装路径保留
- [ ] 历史 `events.jsonl` 中的 `HUMAN_REVIEW_REQUEST` 事件 UI 渲染为 deprecated 样式（灰色 + "legacy"标签）

---

## 验收标准

1. - [ ] 实证：构造一个故意缺参的 Worker，执行后产生 `WORKER_BLOCK` 事件，事件 payload 含完整 `block` 对象
2. - [ ] Schema 校验：传入非法 block（缺 type 字段）→ 工具返回错误，Worker 重试
3. - [ ] Worker BLOCKED 状态可被 9.33 的 `dispatch_worker` 重新激活并 resume 原始消息历史
4. - [ ] 单测覆盖 4 种 block 类型 + 1 种非法输入

---

## 边界条件

### 不在范围

- ❌ Supervisor 收到 WORKER_BLOCK 后的决策逻辑：见 9.33
- ❌ Workflow 模式下无 Supervisor 时的兜底：见 9.35

---

## 依赖关系

- **依赖**: 9.31（单前台契约）
- **被依赖**: 9.33（Supervisor HITL 决策器）依赖本 Story

---

## 范围

### 关键文件

| 操作 | 文件路径 |
|------|---------|
| MODIFY | `src/modules/collaboration-runtime/session/types.ts` |
| MODIFY | `src/modules/collaboration-runtime/sandbox/agent-worker.mts` |
| MODIFY | `src/lib/collaboration-runtime-bridge/event-mapper.ts` |
| MODIFY | `data/agents/{worker-template}/Agent.md`（模板示例） |
