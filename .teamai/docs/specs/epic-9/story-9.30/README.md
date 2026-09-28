# Story 9.30: Supervisor Agent 化（Supervisor as Real Agent）

**Epic:** 9 — Multi-Agent 协作运行时
**状态:** 📋 Planning
**优先级:** Critical（替代 9.29 SUP-04 的方案 (a)，承接 Story 9.19 Queen-Led 协调底座）
**估计工时:** 6–8 天
**依赖:** 9.27（HITL 链路）、9.28（Supervisor 接线）、9.29（Supervisor 模式协调能力修复）
**源依据:** [Supervisor Agent 架构设计](../../../design/supervisor-agent.md)

---

## 用户故事

> 作为多 Agent 协作运行时的设计者，我希望 Supervisor 像 Worker 一样是一个**真正的 Agent**——有 Agent.md/Memory.md/Tool.md，跑在独立子进程，通过 LLM 推理完成"目标分解 → 任务派发 → 状态监督 → 验收汇总"，而不是 Next.js 进程内的一段无状态函数。这样我们才有一个可演进的协调底座，让 9.19 Queen-Led / 9.23 共识投票真正落地。

---

## 目标

把 Supervisor 从函数式实现升级为独立 Agent 子进程，拥有 7 层 system prompt、协调工具集（dispatch_worker / wait_workers / run_verifier / bb_* / escalate_to_human），以及 Agent.md/Memory.md/Tool.md 等标准文件。PR-A（M0）完成 Supervisor 子进程化底座，PR-B（M1）已转移到 Story 9.33 等后续 Story。

---

## 文档导航

| 文档 | 内容 |
|------|------|
| [需求文档](./requirements.md) | 用户故事、功能需求、验收标准、依赖关系、边界条件 |
| [架构设计](./architecture.md) | 背景、模块设计、数据结构、代码变更、阶段化交付、相关文档 |
| [测试策略](./testing.md) | 测试用例、验收标准测试 |

---

## 阶段化交付

| PR | 范围 | 验收门槛 |
|----|------|---------|
| **PR-A**（M0，必须） | SUPA-01 / SUPA-02 / SUPA-03 / SUPA-04 | 实证 1-5 + 单元 7-12 |
| **PR-B**（M1，建议） | SUPA-05 / SUPA-06 / SUPA-07 | 实证 6（已转移到 9.33 等） |

PR-A 完成即解除 Story 9.19 / 9.23 的 Supervisor 形态前置依赖。
