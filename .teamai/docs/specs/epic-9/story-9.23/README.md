# Story 9.23: 共识投票机制（BFT/Raft/Quorum）

**Epic:** 9 — Multi-Agent 协作运行时
**状态:** 📋 Planning
**优先级:** Low
**估计工时:** 2-3 天

---

## Story 概览

> 作为协作运行时，我需要在关键协作场景中引入多 Agent 投票共识机制，替代单点决策，这样对于本体结构变更、技能部署等关键操作可以有容错保障，防止单个 Agent 的错误决策影响全局。

---

## 快速导航

- [需求文档](./requirements.md) - 用户故事、功能需求、验收标准
- [架构设计](./architecture.md) - 技术栈、数据结构、模块设计
- [测试策略](./testing.md) - 测试用例、验收标准测试

---

## 相关文档

- Story 9.15: 冲突检测与消解
- Story 9.19: Queen-Led 层级协调
- [设计文档 §4.3 冲突消解](../../design/multi-agent-runtime.md#43-冲突检测与消解)
