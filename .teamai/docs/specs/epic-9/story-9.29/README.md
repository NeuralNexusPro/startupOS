# Story 9.29: Supervisor 模式协调能力修复

**Epic:** 9 — Multi-Agent 协作运行时
**状态:** 📋 Planning
**优先级:** Critical（阻塞 Story 9.19 Queen-Led 协调落地）
**估计工时:** 5–7 天
**依赖:** 9.13（Supervisor Mode 实现）、9.27（架构治理 / HITL）、9.28（Supervisor 接线）
**源依据:** [Supervisor 模式架构审查（2026-05-21）](../../../design/supervisor-mode-architecture-review-2026-05-21.md)

---

## 用户故事

> 作为多 Agent 协作运行时的使用者，当我以 Supervisor 模式运行一个含分解 / 审阅 / 汇总三段式的拓扑时（如 `proj-1778321075425-gmv0zt4h8` 数字化交付审查项目），我希望每个 Agent 能基于自己的职责完成具体动作并产出结构化工件，而不是停留在"请提供项目名称"的反复提问态。

---

## 问题

Story 9.28 完成后 `executeSupervisorDag()` 已接通，但实证项目 `proj-1778321075425-gmv0zt4h8`（7 Agent / 9 协作边）多次跑全过 Supervisor 模式后呈现：

| 指标 | 实际值 |
|------|-------|
| 总事件数 | 2,271 |
| AGENT_END / AGENT_COMPLETE_TASK | 21 / 21（名义"完成"）|
| 实际产出工件 | 0 |
| Agent 真实行为 | **全部停留在"请提供项目名称/主项号/项目编号"的提问态** |

**Verifier 判 passed，但 Agent 实际只是反复在问问题。**详见架构审查文档。

根因可归纳为 10 项缺陷（SUP-01 至 SUP-10），按优先级分 P0 / P1 / P2 三层；当前 Supervisor 路径**不能达成"多 Agent 协调"的目标**。

---

## 范围

### A. P0 — 阻塞协调目标（必须修，本 Story 最小可用闭环）

#### A.1 SUP-01：在 Supervisor 路径恢复 HITL 链路

> **2026-05-22 更新**：本节与 [Story 9.31 单前台契约](../story-9.31/README.md) / [Story 9.32 结构化阻塞](../story-9.32/README.md) 协同。HITL 恢复后**不允许** Worker → User 直连；Worker `HUMAN_REVIEW_REQUEST` 必须先包装为 `WORKER_BLOCK` 并路由到 Supervisor，由 Supervisor 决定是否 `escalate_to_human`。详见 [PRD-collaboration-product.md](../PRD-collaboration-product.md)。

- [ ] 在 `executeSupervisorDag()` 中复用 `executeMultiAgentDag()` 的 HITL 模式：
  - 检测 `HUMAN_REVIEW_REQUEST` 事件 → SubTask 置 `waiting`
  - 暂存进程引用到 `waitingProcs` map（不 destroy）
  - 注册 HITL `resume` 回调（与 DAG 路径共享 sessionId 注册表）
  - 等待人类回复后通过 `proc.resume()` 在原始消息历史里继续
- [ ] HITL 暂停**只暂停当前 SubTask**，同层其他并行 SubTask 不受影响（barrier 在层结束时等待 resumed task）
- [ ] 验证：project-config Agent 询问"项目名称"时进入 waiting，不被 verifier 直接判 failed

#### A.2 SUP-02：globalGoal 任务化转写 + buildSubTaskPrompt 清理

- [ ] 在 `buildSubTaskPrompt()` 中，进入 prompt 之前对 SubTask 做一次 LLM 任务化转写：
  - 输入：`globalGoal` + `agent.responsibility` + 上游产出摘要
  - 输出：`{ specificAction, acceptanceCriteria }`——"针对该 Agent 你需要做的具体动作 + 验收标准"
- [ ] 转写结果缓存到 SubTask（同一会话不重复调用 LLM）
- [ ] Prompt 注入 specificAction 替代 globalGoal，acceptanceCriteria 注入到"完成判定"段
- [ ] 验证：naming-reviewer 收到的不再是"创建数字化交付审查项目"，而是"对 design-data-import 产出的命名规范进行合规审查，输出审查报告 wiki"

**同步清理 buildSubTaskPrompt（与 SUP-10 合并实施）：**

- [ ] 移除 `【文件系统说明】` 段落：不再在任务 prompt 里注入 `agentDir` / `projectRootDir` 路径字符串
  - 根因：file tools 对相对路径做 `path.join(workingDirectory, filePath)`，注入的 `data/projects/{id}/...` 不是 OS 绝对路径，会被拼成嵌套路径导致 ENOENT
  - Agent.md 中已定义职责，`collaboration-prompt.ts` Layer 7 已注入 workingDirectory，无需在任务 prompt 重复
- [ ] 移除 `【你的职责】` 段落：职责已在 system prompt Layer 1 Identity（Agent.md）中注入，任务 prompt 不应重复
- [ ] 保留：`【具体任务】`、`【完成判定】`、`【上游 Agent 产出】`（共三段，无额外说明）
- [ ] 移除 `buildSubTaskPrompt()` 的 `projectRootDir` 参数，同步清理调用点

#### A.3 SUP-03：上游产出结构化（Blackboard Artifact）

- [ ] 启用 `Blackboard.setArtifact(name, ref)` / `getArtifact(name)` 流转：
  - 上游 Agent 产出 → Agent 端 tool 调用 `blackboard.setArtifact(...)`（新增 sandbox tool）
  - 下游 prompt 注入 `artifactRef` 引用而非内联文本
- [ ] `upstreamOutputs` map 同时存储：
  - `text`：verifier 抽取的纯文本摘要（兼容现状）
  - `artifacts`：Blackboard ref 列表
- [ ] Provenance 记录：每条 artifact 写入时附带 `{ writer, timestamp, sourceTaskId }`
- [ ] 验证：design-data-import 产出 `ontology/data-import-spec.md` artifact，下游 reviewer prompt 看到 artifact 引用并可通过工具读取原文

#### A.4 SUP-10：Agent 初始化与任务指令分离

**问题**：`executeSupervisorDag` 当前在 `spawn()` 返回后立即调用 `proc.prompt(roundPrompt)`，
而 `roundPrompt` 里混合了 Agent 身份 + 文件路径 + 具体任务三种信息，与 `initializeProjectAgent`
从磁盘加载 Agent.md 构建的 system prompt 重叠。

> 注：`spawner.spawn()` → `start()` → `sendCommand({type:"initialize"})` 已经等到 worker ready 才返回，
> 顺序本身（先初始化后 prompt）没有问题。真正的问题是"任务 prompt 里混入了本该在 system prompt 的内容"。

**要求**：

- [ ] Agent 身份（职责、工作目录）完全由 `initializeProjectAgent` 在 system prompt 中注入，不在任务 prompt 中重复
- [ ] Supervisor 下发的任务 prompt 只包含：具体动作指令、完成判定标准、上游产出（三项）
- [ ] 如需在 spawn 时传递额外的协作上下文（如 `globalGoal`），通过 `AgentProcessConfig.systemPrompt` 字段追加到 system prompt 末尾，而不是混入 user prompt
- [ ] 验证：AGENT_START 事件的 system prompt 段包含 Agent.md 内容，user prompt 段只含具体任务指令

---

### B. P1 — 架构合理性（建议同 PR 一起修）

#### B.1 SUP-04：SupervisorMode 名实归位

> **决策（2026-05-21）**：本 Story 采用方案 **(b)** 改名 + 文档更新；治本方案"Supervisor as Agent"独立为 [Story 9.30](../story-9.30/README.md)，在本 Story 完成后实施。

- [ ] 当前 Story 范围内：
  - 把 `executeSupervisorDag` / `SupervisorMode` 在文档中明确标注为"DAG + Verifier"过渡形态
  - 同步更新 `docs/design/multi-agent-runtime.md` §5.3 措辞
- [ ] 治本方案在 Story 9.30：把 Supervisor 升级为真正的 Agent（独立子进程、Agent.md / Tool.md / Memory.md、LLM 分解 + 工具调度）

#### B.2 SUP-05：Revision Loop 复用进程

- [ ] `revision` 失败时**不 destroy 进程**，复用 `AgentProcess`：
  - 发送 follow-up prompt：`"Verifier 判定未完成，原因：{reasoning}，请继续完成任务"`
  - Agent 在原始消息历史里继续推理，看得到自己上一轮的工具调用
- [ ] `maxRevisions` 仍为 2，超过则正常 fail
- [ ] 验证：第二轮 revision 的 AGENT_START 事件 messages.length > 0（继承上一轮历史）

#### B.3 SUP-06：Barrier 后下游检查上游成功状态

- [ ] 进入下一 level 前对每个 task 检查"必需上游"是否 `completed`：
  - 必需上游 = topology trigger 入边（不含 notify 降级边）
  - 任一必需上游为 `failed` / `skipped` → 当前 task 置 `skipped` 并跳过 spawn
- [ ] `report-generator` 在所有 reviewer fail 时不应再启动产出空报告
- [ ] 验证：构造 reviewer 全失败的测试场景，report-generator 状态为 skipped，无 LLM 调用

---

### C. P2 — 鲁棒性（可分批修，不阻塞 P0）

#### C.1 SUP-07：computeTaskLevels 改 Kahn 拓扑排序

- [ ] 当前 `computeTaskLevels` 仅看入边深度，不算传递闭包，遇到菱形拓扑会错分层
- [ ] 改用 Kahn 算法：`level[v] = max(level[u] for u in upstream(v)) + 1`
- [ ] 单元测试覆盖：线性 / 并行 / 菱形 / 多入边汇总四种拓扑

#### C.2 SUP-08：Verifier 判定材料 + JSON 解析加固

- [ ] 注入 `toolResult` 内容到 verifier prompt（截断到合理长度，如 4KB / call）
- [ ] LLM 输出改用 strict JSON schema / structured output（如 pi-ai 支持），fallback 才用 regex 抽取
- [ ] Verifier 错误率 metric 暴露到 `metrics.ts`

#### C.3 SUP-09：Verifier 回退规则避免误判 read-only Agent

- [ ] 当前回退路径仅看"是否写文件"判 passed，read-only reviewer 永远 failed
- [ ] 改为综合判定：`(有工具调用 ∧ 非纯提问) ∨ 写文件`
- [ ] 提问态识别：最后一条 assistant message 以"？"或"请提供"结尾且无 tool_use → 判为 question

---

## 验收标准

### 实证级（端到端，必须通过）

1. - [ ] 在 `proj-1778321075425-gmv0zt4h8` 上以 Supervisor 模式跑通"project-config → design-data-import → review-task-manager"三棒
2. - [ ] project-config 触发 HITL → 用户回复项目信息后继续，不再被 verifier 误判 failed
3. - [ ] design-data-import 产出至少一个 ontology / wiki artifact 写入 Blackboard
4. - [ ] reviewer Agent prompt 中能看到 design-data-import 的 artifact 引用，并执行真实审查动作（非反问）
5. - [ ] 全 reviewer 失败时 report-generator 不启动

### 单元/集成级

6. - [ ] HITL waiting 状态不阻塞同层其他并行 SubTask（≥1 测试用例）
7. - [ ] 任务化转写产出符合 schema（`{ specificAction, acceptanceCriteria }`）
8. - [ ] Blackboard artifact 读写 + Provenance 元数据正确（≥1 测试用例）
9. - [ ] Revision loop 第二轮继承上轮消息历史（≥1 测试用例）
10. - [ ] computeTaskLevels 在菱形拓扑下分层正确（Kahn 测试）
11. - [ ] `buildSubTaskPrompt()` 输出不含路径字符串（无 `data/projects/`、无 `agentDir`）
12. - [ ] AGENT_START system prompt 包含 Agent.md，user prompt 段只含具体任务指令（SUP-10 验证）
13. - [ ] `npx tsc --noEmit --skipLibCheck` 0 error
14. - [ ] `npm run lint` 0 Error（针对本 Story 改动文件）

---

## 关键文件

| 操作 | 文件路径 | 说明 |
|------|---------|------|
| MODIFY | `src/lib/collaboration-runtime-bridge/multi-agent-executor.ts` | HITL 接入、任务化转写、Revision 复用进程、Barrier 检查上游 |
| MODIFY | `src/modules/collaboration-runtime/session/blackboard.ts` | Artifact API + Provenance |
| MODIFY | `src/modules/collaboration-runtime/sandbox/agent-worker.mts` | 新增 `blackboard_set_artifact` / `blackboard_get_artifact` 工具 |
| MODIFY | `src/modules/collaboration-runtime/engine/supervisor.ts` | 改名（如选 SUP-04 (b)）+ Verifier 加固 |
| MODIFY | `src/modules/collaboration-runtime/engine/dag-executor.ts` | computeTaskLevels 改 Kahn |
| MODIFY | `docs/design/multi-agent-runtime.md` | §5.3 措辞同步 |
| NEW | `docs/design/supervisor-mode-architecture-review-2026-05-21.md` | （已创建）本 Story 的源依据 |

---

## 阶段化交付

为降低风险并尽早形成可验证闭环，建议分两个 PR：

| PR | 范围 | 验收门槛 |
|----|------|---------|
| **PR-A**（必须）| SUP-01 / SUP-02（含 buildSubTaskPrompt 清理）/ SUP-03 / SUP-10 | 实证项目三棒跑通 + 端到端验收 1-5，单元验收 11-12 |
| **PR-B**（建议）| SUP-04 / SUP-05 / SUP-06 + P2 任意 | 单元/集成验收 6-14 |

P0 完成即可解除 Story 9.19（Queen-Led 协调）的前置依赖；P1 / P2 可与 9.19 并行。

---

## 非目标

- ❌ LLM 驱动的动态任务分解（保留给 Story 9.19 Queen-Led）
- ❌ 真正的多 Agent 竞标 / 拜占庭共识（保留给 9.23）
- ❌ HNSW 语义索引（保留给 9.20）
- ❌ Supervisor 路径独立 UI（复用现有协作查看器）

---

## 相关文档

- [Supervisor 模式架构审查（2026-05-21）](../../../design/supervisor-mode-architecture-review-2026-05-21.md) — 9 项 SUP-XX 缺陷的实证依据
- [多 Agent 协作运行时设计文档](../../../design/multi-agent-runtime.md) §5.1-5.3
- [DAG HITL 输入判定标准](../../../design/dag-hitl-decision-standard.md)
- Story 9.13（Supervisor Mode 实现）
- Story 9.27（架构治理与 HITL 链路修复）
- Story 9.28（Swarm/Supervisor 模式生产接线）
