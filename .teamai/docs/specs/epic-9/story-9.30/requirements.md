# 需求规格 - Story 9.30

**Story:** Supervisor Agent 化（Supervisor as Real Agent）
**Epic:** 9 — Multi-Agent 协作运行时
**最后更新:** 2026-07-20

---

## 用户故事

> 作为多 Agent 协作运行时的设计者，我希望 Supervisor 像 Worker 一样是一个**真正的 Agent**——有 Agent.md/Memory.md/Tool.md，跑在独立子进程，通过 LLM 推理完成"目标分解 → 任务派发 → 状态监督 → 验收汇总"，而不是 Next.js 进程内的一段无状态函数。这样我们才有一个可演进的协调底座，让 9.19 Queen-Led / 9.23 共识投票真正落地。

---

## 功能需求

### A. M0 — 最小可用闭环（PR-A，必须）

#### A.1 SUPA-01：系统内置 Supervisor Agent 模板

- [ ] 在 `data/agents/supervisor/`（系统模板，首启动时拷贝）创建 7 个文件：
  - `Agent.md`（协调者身份与方法论）
  - `Role.md`（状态机：decomposing / dispatching / monitoring / verifying / aggregating / escalated / completed / failed）
  - `Tool.md`（工具白名单见 SUPA-03）
  - `Taste.md`、`Memory.md`、`Knowledge.md`、`Patterns.md`
- [ ] 模板可由项目级覆盖（`data/projects/{id}/agents/supervisor/`）
- [ ] 模板内容遵循 [Supervisor Agent 架构设计](../../../design/supervisor-agent.md) §3-§7

#### A.2 SUPA-02：Supervisor 子进程启动路径

- [ ] 在 `agent-worker.mts` 中新增 supervisor 模式：与 worker 同构（同样的 7 层 prompt，但内容来自 supervisor agent 目录）
- [ ] `executeSupervisorDag()` 改为胶水层：
  - 加载 Agents.json + 拓扑
  - spawn supervisor 子进程
  - Layer 6 末尾追加 `【协作上下文】`：globalGoal、topology、agentCards、sessionDir
  - `supervisor.prompt("开始协调")`
  - 监听 supervisor 工具调用并代为执行（dispatch_worker / wait_workers / run_verifier）
  - supervisor 自报 aggregating 完成后写 `finalReport.md`，关闭所有子进程
- [ ] 函数签名 `executeSupervisorDag(session, globalGoal)` 不变，仅内部实现重写
- [ ] 删除 `rewriteSubTaskGoal`（由 supervisor 在 decomposing 状态一次性输出全部 SubTask）
- [ ] `SupervisorMode.decompose()` 删除；`allocateAll` / `runVerifier` 保留作为 supervisor 工具的实现细节

#### A.3 SUPA-03：Supervisor 协调工具集（沙箱内注册）

新增 supervisor 专属工具，仅在 supervisor 模式启动时注入：

- [ ] `dispatch_worker(workerId, specificAction, acceptanceCriteria, dependsOn?)`
  - 内部 spawn / 复用 worker 子进程，通过 9.29 SUP-02/SUP-10 后的简洁任务 prompt 派发
  - 立即返回 `dispatchId`，异步执行
- [ ] `wait_workers(dispatchIds[], timeoutMs)`
  - 阻塞 supervisor.prompt 直到 dispatchIds 中任一/全部状态变化，返回 `{completed[], failed[], waiting[]}`
- [ ] `cancel_worker(dispatchId)` — 取消未完成派发
- [ ] `run_verifier(taskId, criteria)` — 复用 9.29 加固后的 verifier
- [ ] `read_file` / `list_files` — 只读访问 worker 工作目录（监督用，沙箱权限受限）
- [ ] 禁止注入：`write_file` / `edit_file` / 本体写工具 / `execute_command`

#### A.4 SUPA-04：实证验收

- [ ] 在 `proj-1778321075425-gmv0zt4h8` 上以 Supervisor Agent 模式跑通：
  - 事件流出现 `SUPERVISOR_AGENT_START` / `SUPERVISOR_DECOMPOSITION` / `SUPERVISOR_DISPATCH`
  - supervisor 在 `decomposing` 阶段一次性产出含 7 个 worker 的 SubTask 列表（写入 `sessionDir/supervisor/decomposition.md`）
  - 每个 worker 收到的任务 prompt 与全局目标显著不同（例如 naming-reviewer 收到的是"审查命名规范"，不是"创建项目"）
  - design-data-import 产出至少 1 个 artifact，被 reviewer 通过 `bb_get_artifact` 消费（依赖 9.29 SUP-03）
  - `finalReport.md` 在会话目录生成

### B. M1 — HITL & 记忆闭环（PR-B，**已转移**）

> **2026-05-22 更新**：本节范围已**整体转移**到新拆分的 Story 链：
> - SUPA-05 双向 HITL → [Story 9.33 Supervisor HITL 决策器](../story-9.33/README.md)（升级为四路径决策器 + 强制 mergedContext）
> - SUPA-06 Blackboard 工件工具 → 由 9.29 SUP-03 + 9.33 共同覆盖
> - SUPA-07 Supervisor 记忆持久化 → 由 9.33 决策日志 + Epic C Dream 机制覆盖
>
> 9.30 本身仅保留 PR-A（M0 Supervisor 子进程化底座）。下方 PR-B 内容保留作为历史背景，不再实施。

#### B.1 SUPA-05：双向 HITL（→ 9.33）

- [ ] 新增工具：
  - `escalate_to_human(question, context)`
  - `wait_for_human(promptId)`
- [ ] Worker HITL 路由变更：Worker `HUMAN_REVIEW_REQUEST` → 由运行时路由给 supervisor（不再直接到用户）
- [ ] supervisor 决定 `escalate_to_human` 转发，或 `dispatch_worker(...,补充信息)` 短路继续
- [ ] supervisor 自身 `decomposing` 阶段缺信息时直接 `escalate_to_human`

#### B.2 SUPA-06：Blackboard 工件工具

- [ ] 新增工具 `bb_get_artifact(name)` / `bb_list_artifacts(filter)` / `bb_summarize_for_worker(workerId)`
- [ ] supervisor 在 `dispatching` / `monitoring` 状态使用这些工具准备下游 worker 输入
- [ ] 与 9.29 SUP-03 的 `blackboard.setArtifact` API 对接

#### B.3 SUPA-07：Supervisor 记忆持久化

- [ ] `sessionDir/supervisor/memory/` 写入：
  - `decomposition.md`（本次分解快照）
  - `worker-status.md`（每个 worker 的最新状态，每次状态变化追加）
  - `history.jsonl`（与 worker Memory tracker 同构）
- [ ] Session 结束时通过 Dream（Epic C）滚入 `data/agents/supervisor/Memory.md` / `Patterns.md`

---

## 验收标准

### 实证级（端到端，必须）

1. - [ ] supervisor agent 子进程在协作会话启动后出现在 `ps` 中
2. - [ ] `events.jsonl` 中可观测 `SUPERVISOR_AGENT_START` / `SUPERVISOR_DECOMPOSITION` / `SUPERVISOR_DISPATCH` / `SUPERVISOR_AGGREGATE`
3. - [ ] `proj-1778321075425-gmv0zt4h8` 的 7 个 worker 各自收到差异化任务 prompt（不再是同源 globalGoal）
4. - [ ] 全过程不再调用已删除的 `rewriteSubTaskGoal`
5. - [ ] `finalReport.md` 在会话目录产出
6. - [ ] M1 范围下：worker HITL 抛出后 supervisor 能选择短路或升级用户

### 单元/集成级

7. - [ ] supervisor system prompt 7 层结构完整（Identity 来自 Agent.md，Layer 6 含协作上下文）
8. - [ ] `dispatch_worker` 调用 → spawn worker → worker 任务 prompt 仅含三段（与 9.29 SUP-10 验证一致）
9. - [ ] `wait_workers` 在所有 dispatch 完成前正确阻塞 supervisor.prompt
10. - [ ] supervisor 工具白名单生效：尝试调用 `write_file` 被沙箱拒绝
11. - [ ] `npx tsc --noEmit --skipLibCheck` 0 error
12. - [ ] `npm run lint` 0 Error（针对本 Story 改动文件）

---

## 边界条件

### 非目标

- ❌ Multi-Supervisor / Queen-Led 三态切换（保留给 9.19）
- ❌ Worker 之间 P2P（仍走 Supervisor / Blackboard）
- ❌ Supervisor 自动技能学习（沿用 Worker 的 Dream / Epic C）
- ❌ 共识投票（保留给 9.23）

---

## 依赖关系

- **依赖**: 9.27（HITL 链路）、9.28（Supervisor 接线）、9.29（Supervisor 模式协调能力修复）
- **被依赖**: 9.31（单前台 Agent 契约）依赖本 Story PR-A
- **后续拆分**: PR-B 范围已转移至 9.33（Supervisor HITL 决策器）

---

## 范围

### 阶段化交付

| PR | 范围 | 验收门槛 |
|----|------|---------|
| **PR-A**（M0，必须） | SUPA-01 / SUPA-02 / SUPA-03 / SUPA-04 | 实证 1-5 + 单元 7-12 |
| **PR-B**（M1，建议） | SUPA-05 / SUPA-06 / SUPA-07 | 实证 6 |

PR-A 完成即解除 Story 9.19 / 9.23 的 Supervisor 形态前置依赖。

### 与 Story 9.29 的关系

- 9.29 修的是"当前函数式 Supervisor 在 P0 路径上的硬伤"（HITL / 任务化转写 / Artifact）——治标
- 9.30 修的是"Supervisor 不应该是函数"（应该是 Agent）——治本
- **执行顺序**：先 9.29 PR-A（建立可比基线 + 引入 Blackboard Artifact API），再 9.30 PR-A（在基线上重写为 Agent）。9.29 SUP-04 (b) 改名方案在本 Story 中被 (a) 方案"恢复 LLM 动态分解"取代，但分解者是 Supervisor Agent 本身，而不是 `SupervisorMode.decompose()`。
