# 需求文档 - Story 9.35

**Story:** Workflow 模式 Lightweight Supervisor 兜底
**Epic:** 9 — Multi-Agent 协作运行时
**最后更新:** 2026-05-22

---

## 用户故事

> 作为用户，即使在没有显式 Supervisor 的 Workflow（纯 trigger DAG）模式下，当某个 Worker 需要我输入时，我仍然不希望被 Worker 直接打扰；运行时应该惰性挂载一个轻量 Supervisor 来承接 HITL。

---

## 功能需求

### A. Lightweight Supervisor 模板（必须）

- [ ] 新建 `data/agents/supervisor-lite/`（系统模板）：
  - `Agent.md`：极简身份（"你是 Workflow 模式的 HITL 中转代理，唯一职责是把 Worker 阻塞整合后转给用户，再把用户回复转回 Worker"）
  - `Tool.md`：工具白名单仅含 `escalate_to_human` / `wait_for_human` / `dispatch_worker`（限制 resume 同 worker） / `bb_get_artifact`
  - 不包含 Role.md / Memory.md / Knowledge.md / Patterns.md
- [ ] `agent-worker.mts` 新增 `supervisor-lite` 模式：跳过 7 层 prompt 中的 Layer 2/3/5（仅 Layer 1/4/6/7）

### B. 惰性挂载机制（必须）

- [ ] `executeMultiAgentDag()`（Workflow 路径）启动时**不** spawn Supervisor
- [ ] 检测到首个 `WORKER_BLOCK` 事件时：
  - spawn Lightweight Supervisor 子进程
  - 注入协作上下文（topology + 当前 dispatch 状态 + 触发 block 的 worker）
  - 路由 `WORKER_BLOCK` 到 Lightweight Supervisor
- [ ] 同一会话第二次起的 `WORKER_BLOCK` 复用已有 Lightweight Supervisor 子进程

### C. 生命周期与持久化（必须）

- [ ] 会话结束（DAG 完成 / 失败 / 用户取消）时销毁 Lightweight Supervisor 子进程
- [ ] **不**写入 `data/agents/supervisor-lite/Memory.md`（无状态中转）
- [ ] 决策日志仍写入 `sessionDir/supervisor/memory/decisions.jsonl`，便于事后审计

### D. 与 9.33 决策器的差异（必须）

- [ ] Lightweight Supervisor 只支持 2 种决策（不支持改派 / 拒绝）：
  - **C. 升级用户**（`escalate_to_human`）
  - **A. 自助补参**（仅在能从 `bb_get_artifact` 直接拿到时）
- [ ] 改派 / 拒绝由系统约定 fallback：
  - 改派需求 → 该任务标记 `failed`，附加原因"workflow mode does not support reassignment"
  - 拒绝 → 同上

### E. 配置开关（建议）

- [ ] `CollaborationRuntimeDeps` 新增 `enableLightweightSupervisor: boolean`（默认 true）
- [ ] 关闭时 Workflow 模式遇到 `WORKER_BLOCK` 直接 fallback `failed`，方便调试

---

## 验收标准

1. - [ ] 实证：构造一个 Workflow 模式拓扑（纯 trigger）+ 一个会缺参的 Worker，启动后：
   - 初始 events.jsonl 不出现 SUPERVISOR_AGENT_START
   - Worker 抛 WORKER_BLOCK 后 events.jsonl 出现 SUPERVISOR_AGENT_START（agentId='supervisor-lite'）
   - 最终用户在前台看到的发言者是 supervisor-lite，且消息含 mergedContext.onBehalfOf
2. - [ ] 第二个 Worker 阻塞复用已有 Lightweight Supervisor（无 SUPERVISOR_AGENT_START 二次事件）
3. - [ ] 会话结束 ps 中 supervisor-lite 子进程消失
4. - [ ] decisions.jsonl 含轻量 Supervisor 的决策记录
5. - [ ] 关闭 `enableLightweightSupervisor` → Worker 阻塞 → 任务 failed（不挂起也不冒泡到用户）

---

## 依赖关系

- **前置依赖：** Story 9.34（用户回复路由）
- **源依据：** [PRD-collaboration-product.md §FR-5](../PRD-collaboration-product.md) · [supervisor-agent.md §7.4](../../../design/supervisor-agent.md)

---

## 边界条件 / 不在范围

- ❌ 任务分解 / verifier（轻量 Supervisor 不做这些）
- ❌ Memory / Knowledge / Patterns 写入
- ❌ 多 Supervisor 共存（一会话仅一个）
