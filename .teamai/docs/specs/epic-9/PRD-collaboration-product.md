---
title: 多 Agent 协作运行时 — 产品需求文档（PRD）
version: 1.0.0
date: 2026-05-22
status: draft
owner: Archersado
related:
  - docs/design/multi-agent-runtime.md
  - docs/design/supervisor-agent.md
  - docs/design/dag-hitl-decision-standard.md
  - docs/specs/epic-9/README.md
---

# 多 Agent 协作运行时 — 产品需求文档（PRD）

## 0. TL;DR

在多 Agent 协作模式下，**用户只与 Supervisor 一个 Agent 对话**。Worker 不直接面对用户，缺信息时通过结构化阻塞契约向 Supervisor 报备；用户的所有回复永远注入 Supervisor 会话。这是产品默认形态，也是架构强约束。

---

## 1. 背景与问题

### 1.1 现状

当前（Story 9.27/9.28/9.29 之后）协作运行时已具备：

- Workflow（DAG）/ System（黑板）两种执行模式
- Supervisor 路径接通（`executeSupervisorDag`，9.28）
- HITL 链路在 Workflow 路径恢复（9.27）

但实证项目 `proj-1778321075425-gmv0zt4h8`（21 轮 LLM / 0 工件产出）暴露了一个**职责边界问题**，而不仅是 Supervisor 协调能力不够：

```
events.jsonl 中能观察到：
  - Supervisor 在向用户问问题
  - project-config Worker 也在向用户问问题
  - naming-reviewer Worker 也在向用户问问题
→ 系统不知道用户回复到底应该送给谁、恢复谁、推进哪条 DAG
```

### 1.2 根因

Worker 与用户之间存在**直连通路**：

- Worker 工具集中包含 `ask_user_question`
- Worker `HUMAN_REVIEW_REQUEST` 事件被运行时直接转发给用户
- 用户回复时，运行时通过 sessionId 直接 resume 对应 Worker

这导致：

1. **用户心智混乱**：多个 Agent 同时向同一个对话窗口发问，分不清在回复谁
2. **路由不可判定**：用户回复"叫 OriginOS 数字化交付审查"时，到底是 project-config 想要的"项目名称"，还是 naming-reviewer 想要的"被审查项目名"？
3. **HITL 状态机失控**：多个 Worker 同时 waiting，barrier 无法收敛
4. **决策权下放给执行单元**：审批、确认、优先级调整这类决策天然属于协调层，不该让 Worker 临场判定

---

## 2. 产品愿景

### 2.1 单前台 Agent 模型

```
┌──────────┐  唯一对话入口  ┌────────────┐
│  User    │ ◄────────────► │ Supervisor │
└──────────┘                 └─────┬──────┘
                                   │ dispatch / 结构化阻塞
                                   ▼
                  ┌───────────┬──────────┬───────────┐
                  │ Worker A  │ Worker B │ Worker C  │
                  └───────────┴──────────┴───────────┘
                  （Worker 之间不直连用户，缺信息→Supervisor）
```

**核心原则：**

1. **用户只有一个对话伙伴** — Supervisor 是协作会话期间用户在前台看到的唯一 Agent
2. **Worker 是纯执行单元** — 输入：明确任务 + 验收标准 + 上游产出；输出：业务工件 + 结构化阻塞
3. **Supervisor 统一承接决策** — 任务分解、需求澄清、HITL 询问、冲突仲裁、结果汇总
4. **HITL 路由唯一可判定** — 用户回复永远进 Supervisor 会话，由 Supervisor 决定如何回到 Worker

### 2.2 与现状产品的对比

| 用户场景 | 现状 | 目标 |
|---------|------|------|
| 启动协作会话 | 看到 7 个 Agent 名字 | 只看到 Supervisor，背后 Agent 列表收到 "guest list" 区域 |
| 缺信息提问 | 多个 Worker 同时发问 | 永远是 Supervisor 在问；问题已经被 Supervisor 整合（一次问完，不是每个 Worker 各问一遍） |
| 用户回复 | 系统不知道送给谁 | 永远送给 Supervisor，再由 Supervisor 决定是否补参重派 Worker |
| 审批 / 确认 | Worker 直接发起 | Supervisor 发起，含汇总上下文 |
| 看协作进度 | 时间线扁平，发言者混杂 | 时间线分两层：用户↔Supervisor 主线 + Supervisor↔Worker 内部活动可折叠 |

---

## 3. 用户故事

### US-1：项目启动澄清（主路径）

> 作为用户，当我让协作团队"创建数字化交付审查项目"时，我希望只回答一次"项目名称、主项号、编号"，而不是被 7 个 Agent 轮流提问相同信息。

**验收：**
- 用户消息进入后，Supervisor 在 `decomposing` 阶段识别必需信息缺口，**一次性合并提问**
- 用户回答后，Supervisor 将参数分发给各 Worker，Worker 自动开始执行
- 整个会话中用户只看到 Supervisor 的发言，看不到 Worker 的提问

### US-2：执行中阻塞（Worker 缺信息）

> 作为用户，当某个 Worker（如 naming-reviewer）需要补充信息时，我希望由 Supervisor 整合后再问我，而不是 Worker 直接打断对话。

**验收：**
- Worker 调用 `report_block` 工具，抛出结构化阻塞 `{type: 'need_input', missing_fields: ['命名规则'], rationale: '...'}`
- Supervisor 收到阻塞后**先尝试自助解决**（查黑板、查上游 artifact、按经验补参重派）
- 自助不能解决时再 `escalate_to_human`，并附带"为什么 Worker 需要它 + 我已经知道什么"的整合说明
- 整个过程用户感知到的发言者只有 Supervisor

### US-3：冲突仲裁

> 作为用户，当两个 Worker 对同一份数据产出矛盾结论时（如命名审查通过 vs 三维一致性审查不通过），我希望 Supervisor 整合冲突再来找我决策，而不是两个 Worker 各发一次。

**验收：**
- Worker 抛出 `decision_required` 或 `conflict_detected` 类型阻塞
- Supervisor 汇总冲突上下文（两份产出 + 冲突字段）后单点提问
- 用户决策注入 Supervisor 会话，Supervisor 再 `dispatch_worker(..., 决策结果)` 推进

### US-4：纯执行（无 HITL，理想路径）

> 作为用户，当 Supervisor 拿到的初始目标已经足够明确时，我希望从派发到产出全程不被打扰。

**验收：**
- Supervisor 决策"无需澄清"，直接进入 `dispatching`
- 所有 Worker 各干各的，过程事件可观测但不在前台对话窗口冒泡
- 会话结束时 Supervisor 输出 `finalReport.md` 总结

### US-5：Workflow（纯 DAG）模式下的 HITL 兜底

> 作为用户，即使在没有显式 Supervisor 的 Workflow 协作（纯 trigger 拓扑）中，当某个 Worker 需要我输入时，我仍然不希望被 Worker 直接打扰。

**验收（实现策略 A，确认见 §5.3）：**
- Workflow 模式遇到首个 Worker `report_block` 时，运行时**临时挂载一个轻量 Supervisor**
- 轻量 Supervisor 仅承担"承接阻塞 / 提问用户 / 回写参数 / resume Worker"四项工作，不做任务分解
- 用户视角与 System 模式一致：永远在与 Supervisor 对话

---

## 4. 功能需求

### FR-1：单前台 Agent 强约束

| 编号 | 需求 |
|------|------|
| FR-1.1 | 协作会话启动时，运行时**必须** spawn 一个 Supervisor 子进程作为前台 Agent |
| FR-1.2 | Worker 工具白名单**禁止**包含 `ask_user_question` 及任何直接面向用户的工具 |
| FR-1.3 | 运行时**拒绝** Worker 子进程产生的 `HUMAN_REVIEW_REQUEST` 事件直接到达用户层；必须先经过 Supervisor 仲裁 |
| FR-1.4 | UI 前台对话窗口的 `from` 字段在 Supervisor 模式下**永远**是 `supervisor` |
| FR-1.5 | 用户消息的 `to` 路由**永远**指向当前会话的 Supervisor |

### FR-2：Worker 结构化阻塞契约

Worker 不再用自然语言提问表达阻塞，改用结构化契约：

```typescript
type WorkerBlock =
  | { type: 'need_input'; missingFields: string[]; rationale: string; suggestedQuestion?: string }
  | { type: 'decision_required'; options: Array<{ id: string; label: string; impact?: string }>; rationale: string }
  | { type: 'conflict_detected'; conflictWith: string /* workerId */; conflictField: string; details: string }
  | { type: 'capability_missing'; missing: string; suggestedAgent?: string };
```

| 编号 | 需求 |
|------|------|
| FR-2.1 | Worker 沙箱注入 `report_block(block: WorkerBlock)` 工具 |
| FR-2.2 | `report_block` 调用后 Worker 进程进入 `BLOCKED` 状态，挂起但不销毁（保留消息历史） |
| FR-2.3 | 运行时把 `WORKER_BLOCK` 事件路由给当前 Supervisor，不向用户层冒泡 |
| FR-2.4 | Worker 不得通过自由文本"暗示"阻塞（如以问号结尾），但向后兼容：若检测到则运行时自动包装为 `need_input` 类型阻塞 |

### FR-3：Supervisor HITL 决策器

Supervisor 收到 `WORKER_BLOCK` 后必须显式决策，决策路径有四：

| 决策 | 场景 | 工具 |
|------|------|------|
| **A. 自助补参** | 信息能从黑板 / 上游 artifact 拿到 | `bb_get_artifact` + `dispatch_worker(workerId, ...)` |
| **B. 改派** | 该信息属于另一个 Agent 的职责 | `dispatch_worker(otherWorkerId, ...)` |
| **C. 升级用户** | 必须用户决策 | `escalate_to_human(question, mergedContext)` |
| **D. 拒绝** | 阻塞不合理 / 任务设计错误 | `cancel_worker(dispatchId)` + 重新 `decompose` |

| 编号 | 需求 |
|------|------|
| FR-3.1 | Supervisor 必须在收到 block 后 N 轮内做出明确决策（防止无限重试） |
| FR-3.2 | 决策日志写入 `sessionDir/supervisor/memory/decisions.jsonl` |
| FR-3.3 | `escalate_to_human` 调用时**强制** Supervisor 提供 `mergedContext`，避免裸抛 Worker 原句 |
| FR-3.4 | 同一个 Worker 同一阻塞类型连续 ≥3 次升级用户 → Supervisor 必须切换策略（改派 / 取消），不允许无限询问 |

### FR-4：用户回复路由收敛

| 编号 | 需求 |
|------|------|
| FR-4.1 | 协作会话期间，前端发送用户消息的接口（`POST /api/collaboration/sessions/[id]/messages`）路由目标固定为 `supervisor` |
| FR-4.2 | 移除 Workflow 路径下 Worker 直接持有 HITL `resume` 回调的代码分支 |
| FR-4.3 | Supervisor 收到用户回复后，通过 `dispatch_worker` 或内部 follow-up prompt 自行决定如何把信息送回 Worker |
| FR-4.4 | 若 Supervisor 自身处于 `escalated` 状态等待用户，则用户消息进入 Supervisor 消息历史并 resume Supervisor 子进程 |

### FR-5：Workflow 模式兜底（策略 A）

| 编号 | 需求 |
|------|------|
| FR-5.1 | Workflow 模式（纯 trigger DAG）启动时**不** spawn Supervisor，保持轻量 |
| FR-5.2 | 当首个 Worker 抛出 `WORKER_BLOCK` 时，运行时**惰性挂载**一个 lightweight Supervisor 子进程 |
| FR-5.3 | Lightweight Supervisor 使用最小化 prompt（不含任务分解能力），只承担 HITL 中转 |
| FR-5.4 | 会话结束时 Lightweight Supervisor 子进程随会话一同销毁，不写入 `data/agents/supervisor/Memory.md` |

### FR-6：可观测性

| 编号 | 需求 |
|------|------|
| FR-6.1 | 事件流新增 `WORKER_BLOCK` / `SUPERVISOR_DECIDE` / `SUPERVISOR_ESCALATE` / `USER_REPLY_TO_SUPERVISOR` 类型 |
| FR-6.2 | UI 协作查看器分两层显示：前台对话（User ↔ Supervisor）+ 内部活动（Supervisor ↔ Worker，可折叠） |
| FR-6.3 | 每次 `escalate_to_human` 在前台对话窗口显式标注"代 {workerId} 询问"（用户感知整合来源） |

---

## 5. 非功能需求 / 约束

### 5.1 性能

- Supervisor 决策延迟 < 5s（从收到 `WORKER_BLOCK` 到产出决策事件）
- Lightweight Supervisor 冷启动 < 2s
- 同一会话内 Supervisor 子进程常驻，不在轮间重启

### 5.2 兼容性

- 现有 `HUMAN_REVIEW_REQUEST` 事件类型**保留**但标记为 deprecated；运行时收到该事件时自动包装为 `WORKER_BLOCK{type: 'need_input'}`
- 现有 Agent 工程目录（`data/agents/{id}/`）不需要迁移；Worker 工具白名单的收紧在运行时层完成
- Solution Manifest 不需要新增字段；前台模式默认即 supervisor

### 5.3 设计决策

| 决策 | 选择 | 备选 | 拒绝理由 |
|------|------|------|---------|
| Workflow HITL 策略 | **A：临时挂载轻量 Supervisor** | B: 阻塞=failed / C: Worker 直连用户 | B 回退现有能力；C 破坏单前台原则 |
| 专家直连模式 | **暂不实现** | 会话/项目/Manifest 三种触发口径 | 增加心智复杂度，无紧迫场景 |
| Worker `ask_user_question` 工具 | **从白名单移除** | 保留但运行时拦截 | 显式移除避免 Agent.md 误导生成 |

### 5.4 不在范围

- ❌ Worker 之间 P2P 直连协议（保持走 Blackboard / Supervisor 中转）
- ❌ 多 Supervisor 并存（Queen-Led / 共识投票交给 9.19 / 9.23）
- ❌ 专家直连模式（expert-direct）
- ❌ Supervisor 替换为其他实现（如 BabyAGI 风格自主循环）

---

## 6. 成功指标

| 指标 | 目标 | 验证 |
|------|------|------|
| 用户感知发言者唯一性 | 协作会话中用户视图收到的消息 100% 来自 Supervisor | 实证项目 events.jsonl 审计 |
| HITL 路由判定明确性 | 用户回复路由到非 Supervisor 的代码路径 = 0 | grep + 单测 |
| Worker 阻塞结构化率 | Worker 阻塞通过 `report_block` 上报 ≥ 95%；自然语言提问 fallback ≤ 5% | 抽样 |
| 重复提问消减 | 同一信息被 ≥2 个 Worker 各问一遍的场景 = 0（Supervisor 合并） | 实证 + 用例回归 |
| Workflow HITL 兜底成功率 | Workflow 模式 Worker 阻塞 → 用户回复 → 任务推进的成功率 ≥ 90% | 端到端测试 |

---

## 7. 实施路径（对应 Story 重分拆）

| Story | 范围 | 阻塞关系 |
|-------|------|---------|
| **9.30 PR-A**（保留） | Supervisor as Real Agent 子进程底座（已规划） | 必须先完成 |
| **9.31** | 单前台 Agent 契约（FR-1）+ Worker 工具白名单收紧 | 依赖 9.30 PR-A |
| **9.32** | Worker 结构化阻塞契约（FR-2）+ `report_block` 工具 + `WORKER_BLOCK` 事件 | 依赖 9.31 |
| **9.33** | Supervisor HITL 决策器（FR-3）+ 四种决策路径 + 升级整合上下文 | 依赖 9.32 |
| **9.34** | 用户回复路由收敛（FR-4）+ 移除 Worker 直连 resume 分支 | 依赖 9.33 |
| **9.35** | Workflow 模式 Lightweight Supervisor 兜底（FR-5） | 依赖 9.34 |
| **9.29 调整** | SUP-01 HITL 恢复改为"恢复后立刻收敛到 Supervisor 中转"，验收同步调整 | 与 9.31 协同 |
| **9.30 PR-B 调整** | 范围转移到 9.33，PR-B 可裁撤 | 见 9.30 README 调整 |

---

## 8. 风险与缓解

| 风险 | 影响 | 缓解 |
|------|------|------|
| Supervisor 成为单点 — 它崩溃则会话不可用 | 高 | Lightweight Supervisor 模板进系统内置；崩溃后自动重启并 replay events.jsonl 恢复上下文 |
| Supervisor 整合问题不当 — 比 Worker 单问更糟 | 中 | 在 `escalate_to_human` 模板中强制结构化（"代 X 询问 / 已知信息 / 待补字段"），Patterns.md 沉淀好模板 |
| 现存项目数据混入 `HUMAN_REVIEW_REQUEST` | 低 | 运行时收到时自动 wrap 为 `WORKER_BLOCK{need_input}`；UI 兼容渲染 |
| Workflow 临时挂载 Supervisor 成本 | 中 | 仅惰性挂载（Worker 阻塞才创建）；轻量 prompt 减少 LLM 成本 |

---

## 9. 开放问题

1. Supervisor 自身是否应该有 `BLOCKED` 状态？目前模型里 Supervisor 是协调者，但 Supervisor 在 `decomposing` 阶段也可能需要用户输入。当前方案是 Supervisor 直接 `escalate_to_human`，但这是否应该也走 `report_block` 自己抛给自己？
2. Lightweight Supervisor 在 Workflow 模式下是否应该有最小的状态机？还是纯 HITL 中转无状态？
3. 用户回复到 Supervisor 后，如果 Supervisor 误判（把信息送错 Worker），如何回滚？

> 这些问题不阻塞 9.31–9.35 实施，可在 Story 落地过程中迭代解答。

---

**最后更新：** 2026-05-22
**下次审查：** 9.31 启动前
