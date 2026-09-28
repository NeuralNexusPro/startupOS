# 需求定义 - Story 9.8

**Story:** DAG 执行器（Workflow 模式）
**Epic:** 9 — Multi-Agent 协作运行时
**最后更新:** 2026-07-17

---

## 用户故事

> 作为协作引擎的核心，我需要按拓扑排序执行 Agent 并支持并行和无依赖等待，这样多 Agent 可以按 Solution Manifest 定义的顺序正确协作。

---

## 功能需求

1. **拓扑排序** — Kahn 算法或 DFS，确定 Agent 执行顺序
2. **并行执行** — 无依赖的 Agent 并行执行（Promise.all）
3. **依赖等待** — 有依赖的 Agent 等待上游完成后触发
4. **trigger 自动触发** — 上游 Agent 完成后自动触发下游
5. **全局目标判定** — 所有出口 Agent 完成后判定任务完成
6. **超时限制** — 全局超时后终止执行
7. **最大迭代次数** — 防止无限循环

## 边界条件

- 上游 Agent 失败时下游不触发
- 全局超时后终止执行
- 所有事件写入 EventStore

## 验收标准

- [ ] A→B→C 线性拓扑正确顺序执行
- [ ] B/C 并行 + D 汇总拓扑正确并行后汇总
- [ ] 上游 Agent 失败时下游不触发
- [ ] 全局超时后终止执行
- [ ] 所有事件写入 EventStore
- [ ] 执行结果包含每个 Agent 的输出和耗时

## 依赖关系

- [设计文档 §5.3 模式 A：DAG 执行](../../design/multi-agent-runtime.md#模式-adag执行静态拓扑)
- [设计文档 §7.1 Workflow 模式示例](../../design/multi-agent-runtime.md#71-workflow-模式示例固定-dag)
