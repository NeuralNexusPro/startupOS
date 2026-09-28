# 需求文档 - Story 9.13

**Story:** Supervisor 模式（Supervisor-Worker）
**Epic:** 9 — Multi-Agent 协作运行时
**最后更新:** 2026-07-18

---

## 用户故事

> 作为协作引擎，我需要支持 Supervisor-Worker 动态任务分解模式，让复杂的非结构化任务可以被 Supervisor 自动拆解、分配、监控和汇总，而不依赖预定义的 DAG 拓扑。

---

## 功能需求

1. **Supervisor 模式执行器** — Supervisor 接收全局目标 → 分解为子任务 → 分配给 Worker → 监控 → 汇总
2. **任务分解** — Supervisor Agent 将全局目标拆分为结构化子任务列表
3. **Worker 选择** — 通过 CapabilityMatcher 为每个子任务匹配合适的 Worker
4. **Contract Net 协议分配** — 通过 cfp → propose → accept/reject → inform 协议分配任务
5. **进度监控** — 实时监控 Worker 状态，检测失败
6. **失败重分配** — Worker 失败时重新选择 Worker 并重分配
7. **结果汇总** — 收集所有 Worker 输出，判定全局目标是否达成

---

## 验收标准

- [ ] Supervisor 能正确分解全局目标
- [ ] Contract Net 协议 cfp → propose → accept → inform 完整执行
- [ ] Worker 失败时自动重分配（不超过 retryCount）
- [ ] 多轮迭代支持（maxIterations 限制）
- [ ] 全局超时后终止执行
- [ ] 所有事件写入 EventStore
- [ ] 结果包含每个 Worker 的输出和总 Token 消耗

---

## 边界条件

- 子任务分解失败时的回退策略
- Worker 全部失败时的终止条件
- 超时与重试的平衡
- 多轮迭代的上限控制

---

## 依赖关系

- Story 9.14: 招标-投标协议（Contract Net）
- Story 9.16: 能力匹配（CapabilityMatcher）
- Story 9.8: DAG 执行器（基础执行框架）
