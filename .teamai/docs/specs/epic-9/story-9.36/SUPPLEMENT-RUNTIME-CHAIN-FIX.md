＃ Story 9.36 补充说明：多 Agent 协同运行时链路修复计划

**日期：** 2026-05-23
**状态：** Draft — 待实施
**适用范围：** 基于真实失败会话 `cs-1779504441028-t4m7ji` 的链路诊断，补全 README + SUPPLEMENT-PROJECT-CONTEXT-BLACKBOARD 中尚未落地的运行时行为。

---

## 1. 背景：失败会话诊断

### 实际事件时间线（events.jsonl 摘录）

```
02:49:09  USER_INPUT「创建一个新项目」 → supervisor
02:49:13  AGENT_START supervisor   (7 agents / 9 edges)
02:49:21  SUPERVISOR_TOOL_CALL dispatch_worker → project-config
02:49:23  AGENT_START project-config
02:49:25..41  project-config 连发 7 次 ask_user_question  ← 无人回答（mock 回声）
02:50:58  AGENT_END project-config
02:50:58  SUPERVISOR_WORKER_COMPLETE × 2
[之后整条链路冻结：无后续 SUPERVISOR_TOOL_CALL / AGENT_START / dispatch_worker]
```

### 期望链路（Story 9.36 README）

```
USER_INPUT
  → Supervisor 规划
  → dispatch_worker（写 swarm$tasks$<id> 到 Blackboard）
  → Worker 执行
     ├─ ask_user_question → HITL_PENDING → 前端展示 → 用户回答 → 恢复
     └─ 完成 → upstreamResults.writeUpstreamOutput() 写 upstream$<agentId>$output
  → SUPERVISOR_WORKER_COMPLETE
  → Supervisor 读取 worker 产出（Blackboard）
  → 继续 dispatch_worker(下游 agent) 或 run_verifier
  → ...
  → 全部完成 / finish
```

### Blackboard 现状（blackboard.json）

仅写入了 `project$context$<projectId>$<agentId>$*` 共享上下文，**完全缺失**：
- `swarm$tasks$*`（DAG 任务记录）
- `upstream$<agentId>$output`（上游产出）
- `swarm$messages$*` / `swarm$artifacts$*`

---

## 2. 严查出的 4 个断点

| # | 断点 | 证据 | 违反的 9.36 章节 |
|---|------|------|------------------|
| **A** | Supervisor 单次派发后停止迭代，未派发下游 agent | 全局仅 1 次 SUPERVISOR_TOOL_CALL；6 个下游 agent 未启动 | M3 Supervisor 应持续 loop 直到 DAG 完成 |
| **B** | HITL 链路完全失效：worker `ask_user_question` 立即被「回声 mock」假装回答 | tool_result 内容是 question YAML 本身 | README §HITL：HITL_PENDING → 前端响应 → resume |
| **C** | Worker 输出未写入 Blackboard | blackboard.json 无 `upstream$*` 键 | SUPPLEMENT-PROJECT-CONTEXT-BLACKBOARD 补全 1 |
| **D** | DAG 任务未持久化到 Blackboard | blackboard.json 无 `swarm$tasks$*` 键 | M2 命名约定 + M4 DagExecutor.persistTask |

> 982 MESSAGE_SENT 事件是流式 token 片段，被 SseEventEmitter 过滤是正常行为，不是 bug。

---

## 3. 修复方案（按优先级）

### P0 — Supervisor 迭代循环 + Upstream 回灌（断点 A + C）

**目标：** 让 supervisor 在 worker 完成后能继续派发下游 agent，直到 DAG 全部完成。

**改动文件：**
- `src/lib/collaboration-runtime-bridge/multi-agent-executor.ts`
- `src/modules/collaboration-runtime/session/upstream-results.ts`（确认已实例化）

**实施要点：**
1. 在 supervisor 主循环中，收到 `SUPERVISOR_WORKER_COMPLETE` 后：
   - 调用 `extractAgentOutput(events)` 拿到 worker 文本产出（依赖前一轮 turn_end ASSISTANT_MESSAGE 修复）
   - 调用 `upstreamResults.writeUpstreamOutput(agentId, agentName, output)` 写入 Blackboard
   - 把产出作为 `dispatch_worker` 工具的 tool_result，喂回 supervisor agent 的下一轮 `run()`
2. Supervisor 持续生成下一个 `dispatch_worker` / `wait_workers` / `run_verifier`，直到调用 `finish` 或 DAG 中所有节点 status='completed'
3. 设置最大迭代次数（如 50）+ 超时（如 30 min）防失控
4. 验证 `extractAgentOutput()` 真的能拿到非空文本

**验收：**
- [ ] 失败会话场景重跑：7 个 agent 至少能依次启动 / dispatch
- [ ] Blackboard 中能看到 `upstream$project-config$output`、`upstream$design-data-import$output` …
- [ ] events.jsonl 中 `SUPERVISOR_TOOL_CALL` ≥ DAG 节点数

---

### P1 — HITL 真正接入前端（断点 B）

**目标：** worker 调用 `ask_user_question` 时挂起，等用户真正回答后再 resume。

**改动文件：**
- `src/modules/collaboration-runtime/sandbox/agent-worker.mts`（截获工具调用）
- `src/lib/collaboration-runtime-bridge/multi-agent-executor.ts`（事件桥接 / IPC）
- `src/app/api/collaboration/sessions/[id]/hitl-answer/route.ts`（**新建**）
- `src/components/collaboration/*`（事件查看器渲染 HITL UI）

**实施要点：**
1. `agent-worker.mts` 在工具拦截层识别 `ask_user_question`：
   - 发出 `HITL_PENDING` 事件（含 toolCallId、question、options）
   - **不立即返回 tool_result**，挂起当前 agent.run() 的 Promise（保存 resolve 句柄到 pending map）
2. 删除当前的「YAML 回声 mock」（位于工具默认实现或测试桩中）
3. 新建 `POST /api/collaboration/sessions/:id/hitl-answer` 路由：
   - body：`{ toolCallId, answer }`
   - 通过 IPC 把 answer 注入挂起的 agent，触发 resolve(toolResult)
4. SSE 把 `HITL_PENDING` 推到前端，渲染 question/options UI；提交答案调用上述 API
5. Agent 时间线显示 `WAITING_FOR_USER` 状态

**验收：**
- [ ] `ask_user_question` 不再被 mock 自动回答
- [ ] 前端能看到 question 并提交答案
- [ ] 提交答案后 worker 继续执行

---

### P2 — Blackboard Swarm Schema 落地（断点 C + D）

**目标：** 完成 SUPPLEMENT-PROJECT-CONTEXT-BLACKBOARD 中未落地的命名约定。

**改动文件：**
- `src/modules/collaboration-runtime/engine/dag-executor.ts`
- `src/modules/collaboration-runtime/session/memory-keys.ts`（已存在，需扩展）
- `src/lib/collaboration-runtime-bridge/multi-agent-executor.ts`

**实施要点：**
1. `DagExecutor.dispatch(task)` 派发前写 `swarm$tasks$<taskId>`：
   ```typescript
   { taskId, status: 'pending', assignedTo, goal, acceptanceCriteria, createdAt }
   ```
2. Worker 启动时更新 `status='running'`；完成时更新 `status='completed'` + `completedAt` + `outputKey: upstream$<agentId>$output`
3. `buildAgentPrompt` 走 `UpstreamResults.readUpstreamOutput()`（Blackboard），不再读内存 Map（确认 SUPPLEMENT 补全 1 真的被使用）
4. 在 Supervisor prompt 中追加「查询 Blackboard」工具，让它能主动读 `swarm$tasks$*` 状态

**验收：**
- [ ] 每个派发的 worker 都对应一条 `swarm$tasks$*` 记录
- [ ] 任务状态流转 pending → running → completed 可观测
- [ ] `buildAgentPrompt` 单测：upstream 文本完全来自 Blackboard

---

### P3 — 产品交互层（UX）

**目标：** 让用户能看到 supervisor plan、当前 active worker、待回答 HITL，不再「卡死黑屏」。

**改动文件：**
- `src/components/collaboration/EventTimeline.tsx`
- `src/components/collaboration/SupervisorPanel.tsx`（**新建**）
- `src/components/collaboration/HitlPanel.tsx`（**新建**）

**实施要点：**
1. 协作查看器顶部新增 Supervisor 面板：
   - 展示 DAG 拓扑图（节点 + 当前状态颜色）
   - 当前 active worker + 进度
   - Supervisor 最近一次 plan / dispatch 理由
2. HITL 待回答队列：高亮显示，点击进入回答 UI
3. 时间线事件新增图标：`SUPERVISOR_TOOL_CALL` / `HITL_PENDING` / `WAITING_FOR_USER`

**验收：**
- [ ] 用户能在 UI 中看到 7 个 agent 的执行进度
- [ ] HITL 出现时有明显视觉提示
- [ ] 失败/卡住的 agent 有错误标识

---

## 4. 实施顺序

```
P0 (打通主干) → P1 (HITL) → P2 (Blackboard schema) → P3 (UX)
```

P0 是阻塞所有下游 agent 的根因，必须先做。P1 与 P0 可并行（不同代码路径）。P2 是 P0 的持久化补强。P3 在 P0~P2 完成后做。

---

## 5. 风险与注意事项

1. **Supervisor 死循环**：迭代必须有最大次数 + 超时 + finish 工具收口
2. **HITL 死锁**：用户长时间不回答时需有超时降级（如 5 分钟后自动取消并回错给 supervisor）
3. **Blackboard 写入冲突**：`swarm$tasks$*` 由多个 worker 并发写时需走 append-only 事件而非 in-place 覆盖
4. **向后兼容**：UpstreamResults 已经从 Map 改为 Blackboard，注意确认 SUPPLEMENT-PROJECT-CONTEXT-BLACKBOARD 补全 1 已生效，避免双写

---

## 6. 验收总清单

- [ ] P0：失败会话场景重跑能完整跑通 7 个 agent
- [ ] P0：Blackboard 含 `upstream$<agentId>$output` × N
- [ ] P1：`ask_user_question` 真实由用户回答
- [ ] P1：HITL API 路由可用，前端 UI 渲染正确
- [ ] P2：Blackboard 含 `swarm$tasks$*` 状态流转记录
- [ ] P2：`buildAgentPrompt` 单测通过（Blackboard 读取）
- [ ] P3：协作查看器展示 supervisor 状态 + HITL 面板
- [ ] 所有 Story 9.36 既有测试仍通过（34/34）

---

## 7. 变更记录

| 日期 | 变更内容 | 变更人 |
|------|---------|--------|
| 2026-05-23 | 基于失败会话 `cs-1779504441028-t4m7ji` 诊断，新增 P0~P3 修复计划 | AI |
