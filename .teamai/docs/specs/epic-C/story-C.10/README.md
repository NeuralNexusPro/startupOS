# Story C.10: Pattern 机制重构

**状态:** 📋 Planning
**优先级:** High
**Epic:** C（认知系统）
**设计文档:** [pattern-on-memory-core.md](../../../design/pattern-on-memory-core.md)

## 概述

将 Pattern 重构为 Memory Core 的上层应用，实现 Positive/Negative 经验二分，补注册 PracticeLogger，引入用户纠正信号识别，统一 archival 存储，使 Agent 能够区分"用户认可的最佳实践"和"用户指出问题的反例"并准确召回。

## 文档导航

| 文档 | 内容 |
|------|------|
| [requirements.md](./requirements.md) | 用户故事、背景、范围（In/Out of scope）、依赖关系、风险、关联文档 |
| [architecture.md](./architecture.md) | 核心改动点、关键数据契约、落地切片 |
| [testing.md](./testing.md) | 功能验收标准、兼容性验收标准、测试用例规划 |

## 状态

- [ ] 需求确认
- [ ] 架构设计
- [ ] 开发实施
- [ ] 测试验证
