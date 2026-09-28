---
title: Supervisor 模式架构审查（2026-05-21）
date: 2026-05-21
status: draft
related:
  - docs/specs/epic-9/story-9.28/README.md
  - docs/specs/epic-9/story-9.29/README.md
  - src/lib/collaboration-runtime-bridge/multi-agent-executor.ts
---

# Supervisor 模式架构审查（2026-05-21）

## 1. 审查范围

本次审查针对 `executeSupervisorDag` 的端到端链路，回答一个核心问题：

> **当前的 SupervisorDag 实现，能否达成"多 Agent 协调"的目标？**

实证素材：项目 `data/projects/proj-1778321075425-gmv0zt4h8`（数字化交付审查），7 个 Agent，9 条协作边（含 1 条 trigger 回边降级为 notify），多次跑全过 supervisor 模式。

## 2. 实证：拓扑与会话日志

### 2.1 项目拓扑

```
project-config
  → design-data-import
      → review-task-manager
          ├→ naming-reviewer ─────┐
          ├→ property-fill-reviewer ─┤  (回边：reviewer→manager 被 extractEdges 降级为 notify)
          ├→ three-d-consistency-reviewer ┘
          └→ report-generator
```

### 2.2 真实运行（cs-1779333343912-bym68y）

| 指标 | 实际值 |
|------|-------|
| 总事件数 | 2,271 |
| AGENT_END 数量 | 21（每个 agent 平均 3 次）|
| AGENT_COMPLETE_TASK | 21（与 AGENT_END 1:1，名义"完成"）|
| 实际产出工件 | 0（无 ontology/wiki/output 写入）|
| Agent 行为 | **全部停留在"请提供项目名称/主项号/项目编号"的提问态** |

**项目状态**：跑了 21 轮 LLM 调用、若干分钟、无任何业务产出。Verifier 判 passed，但 agent 实际只是反复在问问题。

## 3. 链路解剖

```
loadAgentsJson → extractEdges → buildTopology
  → buildStaticPlan          ← agent ↔ SubTask 1:1 静态绑定
  → SupervisorMode.allocateAll ← ContractNet 形式，但 worker 已被绑死
  → computeTaskLevels         ← 按 trigger 入边分层，不算传递闭包
  → for each level:
       Promise.allSettled(tasks.map(execute))
         └ spawn → prompt(globalGoal + 上游产出文本 + 双目录指令)
           └ verifyTaskCompletion (LLM 判定)
           └ failed → revision (复用 prompt + lastSummary，但**新 spawn 进程**)
  → supervisor.aggregate
```

## 4. 与多 Agent 协调目标的差距

### 4.1 名义 vs 实质

| 名义（代码命名） | 实质（运行行为） |
|------------------|------------------|
| `SupervisorMode` | 实际是带 verifier 的静态 DAG |
| `decompose()` | stub，从未被调用 |
| `ContractNetProtocol.allocateAll` | worker 已被 `buildStaticPlan` 锁死，投标无意义 |
| `Blackboard` | 仅用于 setData("plan"/"finalResult") 这两个键，setArtifact / sharedData 流转未启用 |
| `revision loop` | 复用 prompt 字符串但重启进程，agent 看不到自己上一轮的工具调用 |

### 4.2 协调失败的物理原因（由实证日志归纳）

1. **prompt 同源**：所有 agent 收到同一份 globalGoal，命名审查 agent 在拿到"创建数字化交付审查项目"的 goal 后，无法推导出自己应该做什么。
2. **上游产出无结构**：`upstreamOutputs.set(agentId, output)` 储存的是 verifier 抽取的纯文本（往往是上游的提问句），下游 agent 看到一段问句，自然继续问。
3. **HITL 缺失**：`project-config` 创建项目本身需要用户输入项目名/主项号；但 9.27 之后 multi-agent-executor 把 HITL 链路全部移除了，agent 一问即被 verifier 判 failed，2 轮 revision 用尽 → 整条链路从源头断掉。
4. **下游不依赖上游成功**：barrier 只等待"层完成"，不检查"必需上游是否成功"。reviewer 全失败时 `report-generator` 仍然启动并产出空报告。

## 5. 架构债务清单（按严重度排序）

### P0（阻塞协调目标，必须修）

| ID | 问题 | 修复方向 |
|----|------|---------|
| **SUP-01** | HITL 链路已被移除 | 在 `executeSupervisorDag` 重新引入 waiting 状态 + resume 回调 + sessionId 注册（参照 `executeMultiAgentDag` 的实现，再做收敛）|
| **SUP-02** | globalGoal 同源喂给所有 agent | 在 SubTask 进入 prompt 之前，按 agent.responsibility 做一次 LLM 任务化转写（"针对该 agent 你需要做的具体动作 + 验收标准"）|
| **SUP-03** | 上游产出仅文本传递，下游无法消费 | 启用 Blackboard：上游 agent 产出 → tool 写 `blackboard.setArtifact(name, ref)`；下游 prompt 注入引用而非内联文本 |

### P1（架构合理性，建议同 PR 一起修）

| ID | 问题 | 修复方向 |
|----|------|---------|
| **SUP-04** | SupervisorMode 名实不符（其实是 DAG+Verifier） | 二选一：(a) 恢复 `decompose()` 的 LLM 动态分解 + 真投标；(b) 改名 `executeDagWithVerifier`，下游 9.19+ Queen-Led 再做真 Supervisor |
| **SUP-05** | revision 复用 prompt 但重启进程，agent 失去上下文 | 复用 AgentProcess（不 destroy），发送 follow-up prompt（"Verifier 判定未完成，原因 X，请继续"），让 agent 在原始消息历史里继续 |
| **SUP-06** | barrier 后下游不检查上游是否成功 | 进入下一 level 前对每个 task 检查"必需上游"是否 completed，否则置 `skipped` 并跳过 spawn |

### P2（鲁棒性，可分批修）

| ID | 问题 | 修复方向 |
|----|------|---------|
| **SUP-07** | `computeTaskLevels` 仅看入边，不算传递闭包 | 改成 Kahn 拓扑排序，level = max(上游 level) + 1 |
| **SUP-08** | Verifier 判定材料不全 + JSON 解析脆弱 | 注入 toolResult 内容（截断到合理长度），输出 JSON 用 strict schema / structured output |
| **SUP-09** | Verifier 回退规则会误判 read-only agent | 回退路径：综合 (有工具调用 ∧ 非纯提问) 而非仅"是否写文件" |

## 6. 与既有 Story 的关系

- **Story 9.27**（架构治理）已修复 HITL 在 Workflow 路径的三个 bug，但这些修复**没有同步到 Supervisor 路径**。本审查识别的 SUP-01 即此遗漏。
- **Story 9.28**（Supervisor 接线）只接通了"SupervisorMode 被调用"，未对其内部协调能力的真实性做端到端验证。本审查正是 9.28 完成后的"实战回头看"。
- **Story 9.19**（Queen-Led 层级协调）依赖 Supervisor 模式产出可用的协调底座；P0/P1 必须先于 9.19 完成。

## 7. 结论

> **当前 `executeSupervisorDag` 不能达成多 Agent 协调目标。**

它只是给 DAG 加了个 LLM verifier，缺少真正协调器应有的三件套：
1. **目标分解**（每个 agent 知道自己要干什么，不是看总目标）
2. **结构化共享状态**（产出物通过 Blackboard 流转，不是文本拼接）
3. **人机互锁**（agent 提问 → 等用户 → 继续，而不是被 verifier 判失败）

修复路径已收敛为 9 个 SUP-XX 项，按 P0/P1/P2 分层。建议按 P0 三项作为下一个 Story 的最小可用闭环（"跑通 project-config → design-data-import → review-task-manager 三棒"），P1/P2 在闭环可用之后再迭代。
