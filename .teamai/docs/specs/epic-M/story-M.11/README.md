# Story M.11: 用 Memory Core 统一 history-to-cognition 管线并替代 Dream

**Epic:** M — Memory Core 记忆核心
**状态:** ✅ Complete
**优先级:** Critical（Dream 退出主路径后的替代能力）
**估计工时:** 4-6 天
**依赖:** M.8、M.9、M.10

---

## 概述

让 `memory-core` 成为唯一的 history-to-cognition 中枢，将对话历史统一分类沉淀为 Recall History、Long-term Stable Memory、Pattern/Reflection、Knowledge Candidates 四类认知产物，替代 Dream 机制，消除 `Memory.md` 多方改写和职责混乱问题。

---

## 📂 文档导航

| 文档 | 内容 |
|------|------|
| [需求文档](./requirements.md) | 用户故事、背景与问题、目标模型（四类产物）、设计原则、与其他 Story 的关系 |
| [架构文档](./architecture.md) | 范围 A-E（consolidation 接管、停止 turn 摘要直写、分类规则、统一检索接口、OS 层消费约定）、关键文件、实施清单（Phase 1-5） |
| [测试文档](./testing.md) | 6 项验收标准、测试场景（consolidation 分类、旧路径停用、统一消费接口、多启动方式、迁移回归） |
