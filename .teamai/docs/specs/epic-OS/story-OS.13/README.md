# Story OS.13: 统一 Agent 记忆使用路径并移除 Dream 主路径

**Epic:** OS — Phase 0 OS 交互基础
**状态:** ✅ Complete
**优先级:** High（直接影响 Agent loop 稳定性、长会话质量与多 Agent 协作行为）
**估计工时:** 4-6 天

---

## Story 概览

> 作为 OriginOS 用户，我希望单 Agent 与多 Agent 在长会话中都能稳定使用记忆，不因为上下文压缩、Recall 注入或 Dream 整理而丢失最近执行轨迹、陷入重复 tool loop，且长期记忆与运行时轨迹边界清晰、行为可预期。

---

## 快速导航

- [需求规格](./requirements.md) - 用户故事、功能需求、验收标准
- [架构设计](./architecture.md) - 技术栈、数据结构、模块设计
- [测试策略](./testing.md) - 测试用例、验收标准测试

---

## 核心问题

当前 Agent 记忆路径存在职责重叠和上下文污染问题：

1. **运行时短期轨迹与 Recall 检索混用** - Recall 条目无法完整表达最近 tool 调用、失败原因
2. **Dream 与 memory 机制重叠** - 两条路径都在把 history 变成长期记忆，但没有明确边界
3. **Memory.md、Recall、Recent Trace 职责不清** - 最近执行轨迹没有被视为独立的一等上下文层
4. **loop 风险被压缩放大** - 最近失败原因或禁止重复动作的约束可能在压缩时被裁掉

---

## 目标架构

Agent 记忆使用路径重构为三层：

1. **热记忆**（默认进上下文）- Agent 身份、工具规则、最近执行轨迹
2. **温记忆**（可自动补充，但不进 system prompt）- 当前任务摘要、高相关 Recall 结果
3. **冷记忆**（通过 memory 工具主动检索）- 更早轮次 history、长尾内容

---

## 关键变更

- ✅ 从 OS 运行时移除 Dream 主路径
- ✅ 定义默认上下文装载规则（Recall 不再写入 system prompt）
- ✅ 调整压缩策略，保护 Recent Trace
- ✅ 多 Agent 与单 Agent 记忆路径统一
- ✅ loop 稳定性治理

---

## 依赖关系

- **前置依赖：** OS.7（Agent 托管服务）已交付、Epic M / Story M.11 提供 memory-core 支撑能力

---

## 相关文档

- [需求规格](./requirements.md)
- [架构设计](./architecture.md)
- [测试策略](./testing.md)
