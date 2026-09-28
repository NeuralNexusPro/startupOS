# 需求文档 - Story 9.19

**Story:** Queen-Led 层级协调（动态治理模式）
**Epic:** 9 — Multi-Agent 协作运行时
**最后更新:** 2026-07-20

---

## 用户故事

> 作为协作运行时的治理引擎，我需要根据 Agent 数量、故障率和协作复杂度动态切换治理模式（hierarchical → democratic → emergency），Queen 作为权威状态维护者防止 Agent 漂移，在 Worker 崩溃时紧急接管任务。

---

## 功能需求

### 动态治理模式

根据协作场景动态切换治理模式：
- **Hierarchical 模式**：Queen 主导决策，Worker 执行
- **Democratic 模式**：Worker 参与决策，投票表决
- **Emergency 模式**：Queen 紧急接管，快速恢复

### 切换条件

根据以下指标动态切换：
- Agent 数量变化
- 故障率阈值
- 协作复杂度评估
- 系统负载情况

### Queen 职责

Queen 作为权威状态维护者：
- 维护全局状态一致性
- 防止 Agent 行为漂移
- 协调 Worker 间的冲突
- 在 Worker 崩溃时紧急接管任务

---

## 验收标准

1. 系统能够根据 Agent 数量、故障率、复杂度动态切换治理模式
2. Queen 能够维护全局状态一致性
3. Queen 能够防止 Agent 行为漂移
4. Worker 崩溃时 Queen 能够紧急接管任务
5. 治理模式切换过程平滑，不影响正在执行的任务

---

## 边界条件

- 治理模式切换的时机和策略
- Queen 自身故障的容错机制
- 多个 Worker 同时崩溃的处理
- 治理模式切换的性能开销
- 状态一致性的保证机制

---

## 依赖关系

### 相关 Story
- Story 9.8: DAG 执行器
- Story 9.13: Supervisor 模式

### 设计文档
- [设计文档 §5.3 Supervisor-Worker 模式](../../design/multi-agent-runtime.md#模式-bsupervisor-worker动态分解)

---

## 元数据

**状态:** 📋 Planning
**优先级:** High
**估计工时:** 3-4 天
