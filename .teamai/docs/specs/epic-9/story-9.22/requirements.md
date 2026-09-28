# 需求文档 - Story 9.22

**Story:** 三层模型路由
**Epic:** 9 — Multi-Agent 协作运行时
**最后更新:** 2026-07-20

---

## 用户故事

> 作为协作运行时，我需要根据任务复杂度自动选择 LLM 模型（Haiku/Sonnet/Opus），这样可以在保证质量的同时控制多 Agent 协作产生的大量 LLM 调用成本。

---

## 功能需求

1. **复杂度评估** — 基于 token 量、操作类型、依赖深度评估任务复杂度百分比
2. **动态路由** — 根据复杂度 + Agent 类型选择最优模型
3. **回退机制** — 模型过载/不可用时自动降级到下一 Tier
4. **Agent Booster**（Tier 1）— WASM 沙箱处理简单转换（var→const、加类型、去 console），零 LLM 成本
5. **Agent 类型默认映射** — architect→opus、coder→sonnet、formatter→haiku、verifier→haiku、queen→sonnet

---

## 验收标准

- [ ] 低复杂度任务（<30%）路由到 Haiku，单次成本 < $0.001
- [ ] 高复杂度任务（>30%）路由到 Sonnet/Opus
- [ ] Agent Booster 处理简单转换（成本 $0，延迟 <1ms）
- [ ] 模型过载时自动降级到下一 Tier
- [ ] Agent 类型默认映射生效
- [ ] 安全敏感度因子使安全相关任务至少使用 Sonnet

---

## 依赖关系

- Story 9.6: PI Agent 桥接与子进程入口
- [Ruflo ADR-026 三层模型路由](../../../../learn/ruflo/v3/@claude-flow/cli/CLAUDE.md)
