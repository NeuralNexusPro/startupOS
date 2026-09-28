---
title: Supervisor Agent 架构设计
date: 2026-05-21（v1.1 修订 2026-05-22）
status: draft
related:
  - docs/design/multi-agent-runtime.md
  - docs/design/supervisor-mode-architecture-review-2026-05-21.md
  - docs/specs/epic-9/PRD-collaboration-product.md
  - docs/specs/epic-9/story-9.29/README.md
  - docs/specs/epic-9/story-9.30/README.md
  - docs/specs/epic-9/story-9.31/README.md
  - docs/specs/epic-9/story-9.32/README.md
  - docs/specs/epic-9/story-9.33/README.md
  - docs/specs/epic-9/story-9.34/README.md
  - docs/specs/epic-9/story-9.35/README.md
---

# Supervisor Agent 架构设计

## 0. 单前台 Agent 强约束（v1.1 新增）

**产品依据：** [PRD-collaboration-product.md](../specs/epic-9/PRD-collaboration-product.md)

本文档自 v1.1 起把 Supervisor 的角色从"协调器（建议）"升级为**协作会话期间唯一的前台 Agent（强约束）**。这是产品层的强制规约，不仅是工程优化：

| 维度 | v1.0（建议） | v1.1（强约束） |
|------|------------|--------------|
| 用户对话入口 | Supervisor 优先，Worker 可在特定路径直连 | **仅 Supervisor**；Worker 与用户之间无任何直连通路 |
| Worker 工具白名单 | 含 `ask_user_question` | **移除** `ask_user_question` 及所有面向用户的工具 |
| Worker 阻塞表达 | `HUMAN_REVIEW_REQUEST`（自由文本） | **结构化契约** `WorkerBlock`（need_input / decision_required / conflict_detected / capability_missing），由 `report_block` 工具触发 |
| 运行时事件路由 | Worker `HUMAN_REVIEW_REQUEST` 可直达用户 | 运行时**拒绝** Worker → User 直连；所有阻塞先到 Supervisor |
| 用户回复路由 | 通过 sessionId 找到原始 Worker resume | **永远** 路由到 Supervisor；由 Supervisor 决定如何回到 Worker |
| Workflow（纯 DAG）模式 | 无 Supervisor | **惰性挂载 Lightweight Supervisor** 作为 HITL 中转（见 §7.4） |

**Worker 心智模型简化为：**

> Worker 是纯执行单元。输入 = 明确任务 + 验收标准 + 上游产出；输出 = 业务工件 + 结构化阻塞。Worker 永远看不见用户，也不应该尝试与用户通信。

---

## 1. 设计动机

当前 `executeSupervisorDag()`（`src/lib/collaboration-runtime-bridge/multi-agent-executor.ts`）中的 Supervisor 是 Next.js 进程内的**无状态函数**：

- 没有自己的子进程，没有 system prompt，没有记忆，没有工具
- `SupervisorMode.decompose()` 是 stub，从未真正 LLM 分解
- 真正"动脑"的只有 `rewriteSubTaskGoal`（每个 SubTask 单独调用 LLM 改写），而它对全局目标、Agent 间协调关系、上游产出一无所知，且 fallback 模板硬编码在代码里
- 实证项目 `proj-1778321075425-gmv0zt4h8` 上跑 21 轮 LLM 调用 / 0 工件产出，根因之一即"无人在统筹"

**结论**：Supervisor 应该和 Worker 一样，是一个**真正的 Agent**——有身份、有目录、有 prompt、有工具、有记忆，跑在独立子进程里，通过 LLM 推理执行"接收用户目标 → 分解 → 分配 → 监督 → 验收 → 汇总"的完整闭环。

> 本文档描述把 Supervisor 升级为 Agent 后的目标架构。具体实施由 [Story 9.30](../specs/epic-9/story-9.30/README.md) 承担。

---

## 2. 角色定位

| 维度 | Worker Agent（现状）| Supervisor Agent（目标） |
|------|--------------------|--------------------------|
| 工作对象 | 业务领域（命名审查、数据导入…）| 多 Agent 协作过程本身 |
| 输入 | 上游产出 + 任务指令 | 用户全局目标 + 拓扑 + Agent Card 列表 |
| 输出 | 业务工件（ontology、wiki、文件） | 任务分解、worker 指令、汇总报告 |
| 工具 | 文件 / 本体 / 命令 | Worker 调度 / Blackboard / HITL / Verifier |
| 记忆 | 自己领域内的会话 | 协作会话本身（哪些 worker 在做什么、阻塞在哪） |
| 子进程 | 1 个 sandbox 子进程 | 1 个 sandbox 子进程（与 worker 同构） |

Supervisor Agent 是**协调者**，不是任务执行者。它不写业务代码、不操作本体数据，只负责"派活、跟进、验收"。

---

## 3. 工程结构

Supervisor Agent 与 Worker Agent 共用 `data/agents/{agentId}/` 工程结构（与 `agent-creator` skill 产物一致）：

```
data/agents/supervisor/                # 系统内置 Supervisor 模板
  ├── Agent.md                         # 协调者身份与方法论
  ├── Role.md                          # 状态机：decomposing / dispatching / monitoring / verifying / aggregating
  ├── Tool.md                          # 工具白名单（见 §5）
  ├── Taste.md                         # 沟通风格（向上：简明；向下：明确）
  ├── Memory.md                        # 历史协调会话摘要
  ├── Knowledge.md                     # 任务分解模式 / 拓扑模式快照
  └── Patterns.md                      # 协调反模式（如"全员问问题"）

data/projects/{projectId}/collaboration-sessions/{sessionId}/supervisor/
  └── memory/                          # 当前会话的实践日志、分解记录
      ├── decomposition.md             # 本次分解结果
      ├── worker-status.md             # 每个 worker 的最新状态（dispatching/waiting/completed）
      └── history.jsonl
```

> 系统内置的 `data/agents/supervisor/` 由首次安装/启动时由 `skills/agent-creator` 派生模板生成，用户可在项目级覆盖。

---

## 4. System Prompt 七层结构（与 Worker 对齐）

Supervisor 复用 Worker 的 7 层 prompt 体系（`project-agent/collaboration-prompt.ts` 的扩展形式），只是各层内容有所不同：

| 层 | Worker 内容 | Supervisor 内容 |
|----|------------|----------------|
| 1. Identity | Agent.md 业务角色 | Agent.md 协调者角色（"你是 Supervisor，任务是让 N 个 Worker 协同完成 Goal"） |
| 2. State & Memory | 业务记忆 + Knowledge.md + Patterns.md | 协作会话快照 + 分解模式库 + 协调反模式库 |
| 3. Loop | 5 步业务思考 | 5 步协调思考：**理解 Goal → 解析拓扑 → 分解任务 → 派发监督 → 验收汇总** |
| 4. Toolbox | 文件/本体/命令工具 | Worker 调度 / Blackboard / HITL / Verifier 工具（见 §5） |
| 5. Style | Taste.md | Taste.md（协调者风格） |
| 6. Workspace | agentDir | agentDir + 协作会话目录 + 完整 Agent Card 列表 |
| 7. Safety | 标准安全约束 | 标准安全约束 + "不直接写业务工件"约束 |

**Layer 6 关键差异**：Supervisor 启动时在 system prompt 末尾追加：

```
【协作上下文】
- 全局目标: {globalGoal}
- 协作拓扑（含 entryPoints / exitPoints / edges）: {topologyJson}
- 可用 Worker 列表（Agent Card 摘要）: {agentCards}
- 当前协作会话目录: {sessionDir}
```

---

## 5. 工具集（Tool.md）

Supervisor Agent 拥有一组**新增的协调工具**，由 `agent-worker.mts` 在沙箱内注册（与 file-tools 同级）：

| 工具组 | 工具 | 用途 |
|--------|------|------|
| **Worker 调度** | `dispatch_worker(workerId, task, acceptanceCriteria)` | 向某个 Worker 派发具体任务（异步，立即返回 dispatchId） |
|  | `wait_workers(dispatchIds[], timeoutMs)` | 等待若干 dispatch 完成，返回 `{completed, failed, waiting}` |
|  | `cancel_worker(dispatchId)` | 取消未完成的派发 |
| **Blackboard** | `bb_get_artifact(name)` / `bb_list_artifacts(filter)` | 读黑板工件 |
|  | `bb_summarize_for_worker(workerId)` | 摘要某 Worker 应当看到的上游产出 |
| **HITL** | `escalate_to_human(question, mergedContext)` | 升级用户问题；`mergedContext` 强制包含"代哪个 Worker 询问 + 已知信息 + 待补字段" |
|  | `wait_for_human(promptId)` | 等待用户回复 |
| **Verifier** | `run_verifier(taskId, criteria)` | 调用 LLM verifier 判定某 Worker 产出是否达标（复用现有 verifyTaskCompletion） |
| **常用** | `read_file` / `list_files` | 只读访问 worker 工作目录（监督用） |

**禁止的工具**：`write_file` / `edit_file` / 本体写工具 / `execute_command` / `ask_user_question`（用户提问必须经过 `escalate_to_human` 的 mergedContext 整合）。Supervisor 不写业务工件，也不跑 shell，也不直接裸抛用户问题。

---

## 6. 状态机（Role.md）

```
[*] → idle
idle → decomposing      : receive(globalGoal)
decomposing → dispatching : decomposition.json 写入 sessionDir
dispatching → monitoring : 所有 worker 已 dispatch
monitoring → verifying  : 某 worker 报告完成
verifying → dispatching : verifier 判 failed → revision（≤2 轮）
verifying → aggregating : 所有必需 worker completed
monitoring → escalated  : worker HITL 上抛 / Supervisor 决定问用户
escalated → monitoring  : 用户回复
aggregating → completed
任意状态 → failed       : 不可恢复错误
```

每个状态对应 Layer 3 思考 prompt 的一种引导，例如：

- `decomposing`: "请基于 globalGoal 和 Worker Card 列表，输出 JSON 结构 `[{workerId, specificAction, acceptanceCriteria, dependsOn}]`"
- `monitoring`: "请检查 worker_status.md，决定是否需要 wait_workers / escalate_to_human / 进入 verifying"
- `verifying`: "请调用 run_verifier 并根据结果决定 revision / aggregate"

---

## 7. 与 Worker 的协作协议

### 7.1 任务派发

Supervisor → Worker：通过 `dispatch_worker` 工具，运行时层将其翻译为：

1. spawn Worker 子进程（如未在线）
2. 写入 `agent-worker.mts` 的 `prompt(taskInstruction)`，taskInstruction 仅含 `【具体任务】/【完成判定】/【上游产出】` 三段（与 Story 9.29 SUP-02/SUP-10 对齐）
3. 返回 `dispatchId`，Supervisor 后续通过 `wait_workers` 关注其状态

### 7.2 产出汇集

Worker → Supervisor：Worker 产出工件时调用 `blackboard.setArtifact(name, ref)`（Story 9.29 SUP-03 引入）。Supervisor 通过 `bb_list_artifacts` / `bb_get_artifact` 观测，无需直接读 Worker 文件目录。

### 7.3 HITL 双向（v1.1 强约束）

**核心原则：用户与 Worker 之间不存在任何直连通路。**

- **Worker 端阻塞**：Worker 调用 `report_block(WorkerBlock)` → 运行时发出 `WORKER_BLOCK` 事件 → **强制**路由到当前会话的 Supervisor（绝不冒泡到用户）→ Supervisor 在四种决策中选一：
  1. **自助补参**：通过 `bb_get_artifact` 拿到信息后 `dispatch_worker(workerId, ..., 补充参数)` 重派
  2. **改派**：信息属于另一个 Worker 的职责 → `dispatch_worker(otherWorkerId, ...)`
  3. **升级用户**：`escalate_to_human(question, mergedContext)`，必须附带整合上下文
  4. **拒绝**：`cancel_worker(dispatchId)` + 重新分解
- **Supervisor 端阻塞**：Supervisor 自身在 `decomposing` 阶段需要用户澄清时直接 `escalate_to_human`，且必须合并所有 Worker 的潜在信息需求一次性提问
- **用户回复**：永远注入 Supervisor 消息历史，由 Supervisor 决定如何分发到 Worker

**反模式（必须拒绝）：**

- ❌ Worker 子进程直接调用 `ask_user_question` —— 工具白名单已移除
- ❌ 多个 Worker 同时 `report_block(need_input)` 后由运行时聚合提问 —— 必须由 Supervisor 仲裁后整合
- ❌ Supervisor 收到 Worker 阻塞后裸抛 Worker 原句给用户 —— `escalate_to_human` 强制 `mergedContext`
- ❌ 同一 Worker 同一阻塞类型连续 ≥3 次升级用户 —— 必须切换决策（改派 / 取消）

### 7.4 Workflow 模式 Lightweight Supervisor 兜底（v1.1 新增）

Workflow（纯 trigger DAG）模式默认不 spawn Supervisor 以保持轻量。但单前台原则要求 Worker 在该模式下也不能直连用户。解决方案：**惰性挂载 Lightweight Supervisor**。

```
Workflow 模式启动 → 不 spawn Supervisor
  ↓
Worker A 执行
  ↓
Worker A 调用 report_block(WorkerBlock)
  ↓
运行时检测到首次 Worker 阻塞
  → spawn Lightweight Supervisor 子进程（最小化 prompt）
  → 路由 WORKER_BLOCK → Lightweight Supervisor
  ↓
Lightweight Supervisor 仅做 HITL 中转：
  - 不做任务分解
  - 不做 verifier 决策
  - 不写 Memory.md / Patterns.md
  - 仅 escalate_to_human 或 dispatch_worker(同一 worker, 补充参数)
  ↓
会话结束 → Lightweight Supervisor 子进程销毁，状态不持久化
```

实现要点：

- Lightweight Supervisor 的 system prompt 只含 Layer 1（轻量身份）+ Layer 4（HITL 工具子集）+ Layer 6（协作上下文摘要），跳过 Memory / Knowledge / Patterns
- 工具白名单只含 `escalate_to_human` / `wait_for_human` / `dispatch_worker`（限制为 resume 同一 worker） / `bb_get_artifact`
- 会话级唯一，不写入 `data/agents/supervisor/` 系统模板

---



---

## 8. 运行时改造（Bridge 层）

`src/lib/collaboration-runtime-bridge/multi-agent-executor.ts` 不再承载 supervisor 业务逻辑，而是退化为**胶水层**：

```
executeSupervisorDag(session, globalGoal)
  ├── 加载 Agents.json + 拓扑
  ├── spawn supervisor 子进程（与 worker 同构）
  ├── 把 globalGoal/topology/agentCards 注入 supervisor system prompt（Layer 6）
  ├── supervisor.prompt("开始协调")
  ├── 监听 supervisor 工具调用：
  │     - dispatch_worker → spawn/复用 worker 子进程并 prompt
  │     - wait_workers   → block supervisor.prompt，直到 worker 事件返回
  │     - escalate_to_human → 升级 HITL
  │     - run_verifier  → 调用现有 verifier
  ├── supervisor 进入 aggregating → 写 finalReport.md 到 sessionDir
  └── 返回结果，关闭所有子进程
```

> 现有 `SupervisorMode` / `CapabilityMatcher` / `ContractNetProtocol` 类被 supervisor agent 通过工具间接调用（封装为 `dispatch_worker` 内部实现），不再直接由 bridge 层硬编码调用。

### 8.1 新增运行时事件

| Event | payload |
|-------|---------|
| `SUPERVISOR_AGENT_START` | `{ agentId: 'supervisor', sessionId, globalGoal }` |
| `SUPERVISOR_DECOMPOSITION` | `{ subtasks: [{workerId, specificAction, acceptanceCriteria}] }` |
| `SUPERVISOR_DISPATCH` | `{ dispatchId, workerId, task }` |
| `SUPERVISOR_AGGREGATE` | `{ reportRef, completedCount, failedCount }` |
| `SUPERVISOR_ESCALATE` | `{ to: 'human', question }` |

事件统一通过现有 `eventStore.append()` 持久化，UI 协作查看器无需特殊处理（自然显示在时间线中）。

---

## 9. 与既有架构的关系

| 模块 | 改动 |
|------|------|
| `SupervisorMode`（`engine/supervisor.ts`）| 降级为内部库：`decompose` 完全删除（由 Supervisor Agent LLM 完成），`allocateAll` / `runVerifier` 保留作为 supervisor 工具的实现细节 |
| `executeSupervisorDag` | 重写为胶水层（§8） |
| `rewriteSubTaskGoal` | 删除（由 Supervisor Agent 在 `decomposing` 状态下直接产出，不再每 SubTask 单独调一次 LLM）|
| `agent-worker.mts` | 新增 supervisor 模式：注册 `dispatch_worker` / `wait_workers` / `bb_*` / `escalate_to_human` / `run_verifier` 工具 |
| `Blackboard` | 受 Story 9.29 SUP-03 改动后即可被 supervisor 工具消费 |
| `Story 9.19` (Queen-Led) | Supervisor Agent 是 Queen-Led 的具体落地形态：hierarchical 模式 = 1 个 Supervisor + N Worker；democratic / emergency 在此基础上增加投票 / 接管逻辑 |

---

## 10. 演进路线

| 阶段 | 范围 |
|------|------|
| **M0（Story 9.30 PR-A）** | 系统内置 supervisor 模板 + spawn 路径 + dispatch_worker / wait_workers / run_verifier 三个工具 + 静态拓扑下端到端跑通 `proj-1778321075425-gmv0zt4h8` |
| **M1（Story 9.31）** | 单前台 Agent 强约束：Worker 工具白名单收紧（移除 `ask_user_question`），运行时拒绝 Worker→User 直连 |
| **M2（Story 9.32）** | Worker 结构化阻塞契约 `WorkerBlock` + `report_block` 工具 + `WORKER_BLOCK` 事件 |
| **M3（Story 9.33）** | Supervisor HITL 决策器（自助/改派/升级/拒绝四路径） + `escalate_to_human` 强制 mergedContext |
| **M4（Story 9.34）** | 用户回复路由收敛到 Supervisor，移除 Worker 直接 resume 分支 |
| **M5（Story 9.35）** | Workflow 模式 Lightweight Supervisor 惰性挂载兜底 |
| **M6（Story 9.19）** | Queen-Led 三态切换（hierarchical / democratic / emergency），Supervisor Agent 作为 hierarchical 实现 |
| **M7（Story 9.23）** | democratic 模式下多 Supervisor 投票 / 共识 |

---

## 11. 风险与权衡

| 风险 | 缓解 |
|------|------|
| **多花一次 LLM 调用** — Supervisor Agent 自己也是 LLM 实例 | Supervisor 用便宜模型（Haiku）即可，分解一次性，监督期间多为工具调用而非纯推理 |
| **Supervisor 误派发循环** — LLM 反复 dispatch 同一 worker | `dispatch_worker` 加防抖 + 同 workerId 同 task hash 去重；Patterns.md 沉淀循环模式作为反例 |
| **任务分解质量** — 弱模型分解不准 | 在 Knowledge.md 注入"分解模式库"（按拓扑形态预置示例）；首版可在 system prompt Layer 4 提供 few-shot |
| **HITL 路由变长** — Worker → Supervisor → Human 三跳 | 短路：Supervisor 检测到 Worker 问题确实需要用户回答时，直接转发，不二次推理 |
| **现有调用方迁移** — `executeSupervisorDag` 签名变化 | 保持函数签名不变（输入 session+goal，输出结果），内部实现改为胶水层 |

---

## 12. 不在范围

- ❌ Worker Agent 之间的 P2P 协议（仍走 Blackboard / Supervisor 中转）
- ❌ Multi-Supervisor（一个会话多个 Supervisor），留给 Queen-Led / 共识投票
- ❌ Supervisor 自学习：Patterns.md / Knowledge.md 的自动维护沿用 Worker 的 memory-core consolidation / Epic C 认知管线，无需在本设计中重做
- ❌ 专家直连模式（expert-direct）：暂不实现，未来若有调试需求再讨论触发口径
- ❌ Worker → User 直连通路：v1.1 强约束已禁止

---

**最后更新：** 2026-05-22（v1.1 — 单前台 Agent 强约束 + Workflow Lightweight 兜底）
**关联 Story：** [Story 9.30](../specs/epic-9/story-9.30/README.md) · [Story 9.31](../specs/epic-9/story-9.31/README.md) · [Story 9.32](../specs/epic-9/story-9.32/README.md) · [Story 9.33](../specs/epic-9/story-9.33/README.md) · [Story 9.34](../specs/epic-9/story-9.34/README.md) · [Story 9.35](../specs/epic-9/story-9.35/README.md)
