# Story C.8: Reflexion 失败反思

**状态:** 📋 Planning
**优先级:** High
**Epic:** C（认知系统）

## 概述

将 Reflexion 模式（Shinn et al. 2023）集成到 PatternProvider 中，使 Agent 在工具链失败或任务未解决时，自动生成叙事性反思（"哪里出错了，下次应该怎么做"），并存入情景记忆（Episodic Memory）。这些反思与现有的统计型模式不同——它们是 Agent 对自身失败的自我分析，用于指导下一次尝试。

## 文档导航

| 文档 | 内容 |
|------|------|
| [requirements.md](./requirements.md) | 用户故事、动机、验收标准、依赖关系、备注 |
| [architecture.md](./architecture.md) | 核心设计（失败触发、反思生成、情景记忆存储、检索注入、记忆衰退、去重）、代码变更 |
| [testing.md](./testing.md) | 测试策略、功能测试用例、兼容性测试用例 |

## 状态

- [ ] 需求确认
- [ ] 架构设计
- [ ] 开发实施
- [ ] 测试验证
