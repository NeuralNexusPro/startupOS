# 需求 - Story 9.37

**Story:** HITL 直连与协作链路扁平化
**Epic:** Epic 9 — Multi-Agent 协作运行时
**最后更新:** 2026-07-20

---

## 用户故事

> 作为用户，当某个 Worker 需要我输入时，我希望系统能立即把问题转给我并把我的回复立即送回 Worker，不应该因为 Supervisor 没有及时调用 `escalate_to_human` 而卡住。同时，作为开发者，我希望协作链路足够短、易于排障。

---

## 背景与问题

### 当前 HITL 链路（共 9 跳）

```
Worker.ask_user_question
  → emit HITL_ESCALATE                              [worker 子进程]
  → captureWorkerEvent.记录 pendingHitl             [bridge]
  → notifyWorkerCompletion 触发 wait_workers 提前返回 [bridge]
  → wait_workers result 含 worker_hitl_request      [supervisor LLM 拿到]
  → Supervisor LLM 决策调用 escalate_to_human       [LLM, 不可靠]
  → SUPERVISOR_TOOL_CALL → handleSupervisorToolCall [bridge]
  → emit HUMAN_REVIEW_REQUEST                       [SSE]
  → 用户回复 → resumeSupervisorHitl                  [bridge]
  → Supervisor LLM 决策调用 resume_worker            [LLM, 不可靠]
  → spawner.get(workerId).resume(answer)            [子进程 stdin]
```

### 已知缺陷

1. **依赖 LLM 决策两次**（escalate_to_human、resume_worker），prompt 规则缺失或被忽略时直接卡死
2. **链路过长**：bridge 层、supervisor 子进程、LLM、用户、bridge 层、supervisor 子进程、LLM、bridge 层、worker 子进程
3. **service 层 + bridge 层职责重叠**：两者都在做"驱动 DAG + 转发事件"，叠加了一层不必要的间接
4. **HITL 响应延迟**：每多一跳，最终用户感知延迟增加 0.5–2s（取决于 LLM 决策速度）

---

## 目标

1. **HITL 直连**：Worker 阻塞 → 直接 emit `HUMAN_REVIEW_REQUEST` → 用户回复 → 直接 `worker.resume()`，Supervisor 不再参与 HITL 中转
2. **链路扁平化**：合并 service / bridge 层，统一收敛到 `src/modules/collaboration-runtime/`
3. **HITL 响应时延 ≤ 200ms**（用户回复到 Worker 收到 stdin）

---

## 范围

### A. HITL 直连（核心，必须）

#### A.1 Bridge 层 HITL 路由表

- [ ] 在 `executeSupervisorDag()` 内部维护 `hitlChannelByWorker: Map<workerId, { resume: (reply: string) => Promise<void>; question: string; onBehalfOf: string }>`
- [ ] `captureWorkerEvent` 收到 `HITL_ESCALATE`(workerId) 时：
  - 直接构造 `HUMAN_REVIEW_REQUEST` 并 emit（`onBehalfOf: workerId`）
  - 把 `worker.resume` 注册到 `hitlChannelByWorker[workerId]` 和 `hitlResumerRegistry[sessionId]`
  - **不再** 触发 `notifyWorkerCompletion`，**不再** 让 Supervisor 的 `wait_workers` 提前返回
- [ ] `resumeSupervisorHitl(sessionId, reply)` 优先级：先查 `hitlChannelByWorker`（直连 worker），fallback 到 supervisor 自身的 `escalate_to_human` 挂起态

#### A.2 Supervisor Prompt 简化

- [ ] 删除 `executeSupervisorDag` 初始 prompt 中的【HITL 中转规则】段落（第 1655-1658 行）
- [ ] 删除 `wait_workers` 返回值中的 `worker_hitl_request` 字段（不再需要 supervisor 介入）
- [ ] 保留 `escalate_to_human` 工具：仅用于 supervisor 自己（如 dispatch 决策不确定）需要问用户时

#### A.3 Worker HITL_ESCALATE 携带元数据

- [ ] `agent-worker.mts` 中 `ask_user_question` 替代实现，emit `HITL_ESCALATE` 时携带：
  - `workerId`（已有）
  - `question`、`options`、`multiSelect`（已有）
  - `onBehalfOfName`（worker 在 manifest 中的 name，前端展示用）
- [ ] 子进程 stdin `resume` 命令保持不变

#### A.4 前端 onBehalfOf 解析

- [ ] `MultiAgentLauncher.tsx` `resolveAgentName` 已存在，本 Story 无改动
- [ ] 验证 HITL bubble 显示 `代 {workerName} 询问`

---

### B. Service / Bridge 层合并（结构优化，必须）

#### B.1 目标结构

```
src/modules/collaboration-runtime/
  ├── facade/                          ← 新增（替代 src/lib/collaboration-runtime-service/）
  │   ├── session-store.ts             ← 会话状态机 + JSON 持久化
  │   ├── event-bus.ts                 ← SSE client 注册表 + 事件分发
  │   ├── hitl-router.ts               ← HITL 直连路由表（A.1）
  │   └── index.ts                     ← createSession / executeSession / sendMessageToSupervisor
  └── engine/                          ← 现有 (DAG / Supervisor / Conflict 等)
      └── supervisor-dag.ts            ← 从 src/lib/collaboration-runtime-bridge/multi-agent-executor.ts 迁入
```

#### B.2 删除目录

- [ ] `src/lib/collaboration-runtime-service/` → 移至 `src/modules/collaboration-runtime/facade/`
- [ ] `src/lib/collaboration-runtime-bridge/` → 内容拆分：
  - `multi-agent-executor.ts` → `src/modules/collaboration-runtime/engine/supervisor-dag.ts`
  - `project-context-writer.ts` → `src/modules/collaboration-runtime/engine/agent-context-writer.ts`

#### B.3 API Route 调整

- [ ] `src/app/api/collaboration/sessions/route.ts` 等仅改 import 路径，行为不变
- [ ] 保留 facade 的公共导出函数签名（`createSession` / `executeSession` / `sendMessageToSupervisor` / `subscribeToEvents` / `getEvents` 等），减少调用点改动

---

### C. 可观测性增强（必须）

- [ ] HITL 链路打点：
  - `HITL_ESCALATE` 入站时间戳
  - `HUMAN_REVIEW_REQUEST` emit 时间戳
  - 用户回复到达时间戳
  - `worker.resume` 完成时间戳
- [ ] 写入 `data/projects/{projectId}/collaboration-sessions/{sessionId}/hitl-trace.jsonl`
- [ ] 新增 metric `hitl.roundtrip.ms`（用户回复 → worker resume 完成）

---

## 后续扩展（不在本 Story）

- 9.38: HITL UI 增强（多个 Worker 同时阻塞时的多卡片展示）
- 9.39: HITL 超时与默认行为（用户长时间未回复时 worker 自动 fail / use default）
- 9.40: facade 层抽象稳定后引入插件机制（自定义协议、自定义协调工具）

---

## 相关文档

- [PRD-collaboration-product.md §FR-5](../PRD-collaboration-product.md)
- 现有实现 `src/lib/collaboration-runtime-bridge/multi-agent-executor.ts`
