# 架构设计 - Story 9.35

**Story:** Workflow 模式 Lightweight Supervisor 兜底
**Epic:** 9 — Multi-Agent 协作运行时
**最后更新:** 2026-05-22

---

## 模块设计

### A. Lightweight Supervisor 模板

- [ ] 新建 `data/agents/supervisor-lite/`（系统模板）：
  - `Agent.md`：极简身份（"你是 Workflow 模式的 HITL 中转代理，唯一职责是把 Worker 阻塞整合后转给用户，再把用户回复转回 Worker"）
  - `Tool.md`：工具白名单仅含 `escalate_to_human` / `wait_for_human` / `dispatch_worker`（限制 resume 同 worker） / `bb_get_artifact`
  - 不包含 Role.md / Memory.md / Knowledge.md / Patterns.md
- [ ] `agent-worker.mts` 新增 `supervisor-lite` 模式：跳过 7 层 prompt 中的 Layer 2/3/5（仅 Layer 1/4/6/7）

### B. 惰性挂载机制

- [ ] `executeMultiAgentDag()`（Workflow 路径）启动时**不** spawn Supervisor
- [ ] 检测到首个 `WORKER_BLOCK` 事件时：
  - spawn Lightweight Supervisor 子进程
  - 注入协作上下文（topology + 当前 dispatch 状态 + 触发 block 的 worker）
  - 路由 `WORKER_BLOCK` 到 Lightweight Supervisor
- [ ] 同一会话第二次起的 `WORKER_BLOCK` 复用已有 Lightweight Supervisor 子进程

### C. 生命周期与持久化

- [ ] 会话结束（DAG 完成 / 失败 / 用户取消）时销毁 Lightweight Supervisor 子进程
- [ ] **不**写入 `data/agents/supervisor-lite/Memory.md`（无状态中转）
- [ ] 决策日志仍写入 `sessionDir/supervisor/memory/decisions.jsonl`，便于事后审计

### D. 与 9.33 决策器的差异

- [ ] Lightweight Supervisor 只支持 2 种决策（不支持改派 / 拒绝）：
  - **C. 升级用户**（`escalate_to_human`）
  - **A. 自助补参**（仅在能从 `bb_get_artifact` 直接拿到时）
- [ ] 改派 / 拒绝由系统约定 fallback：
  - 改派需求 → 该任务标记 `failed`，附加原因"workflow mode does not support reassignment"
  - 拒绝 → 同上

---

## 代码变更 / 关键文件

| 操作 | 文件路径 |
|------|---------|
| NEW | `data/agents/supervisor-lite/{Agent,Tool}.md` |
| MODIFY | `src/modules/collaboration-runtime/sandbox/agent-worker.mts`（supervisor-lite 模式分支） |
| MODIFY | `src/lib/collaboration-runtime-bridge/multi-agent-executor.ts`（惰性挂载） |
| MODIFY | `src/modules/collaboration-runtime/config.ts`（enableLightweightSupervisor） |
