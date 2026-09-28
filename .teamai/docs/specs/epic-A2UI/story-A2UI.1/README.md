# Story A2UI.1: A2UI v1 协议与组件注册表

**Story 编号:** A2UI.1  
**所属 Epic:** [Epic A2UI](../README.md)  
**优先级:** 🔴 Critical  
**状态:** 📋 Planning  
**范围说明:** 本 Story 仅做规划，不包含实现。

---

## 📋 用户故事

作为 Agent Runtime，我希望用稳定、可校验、可版本化的 A2UI payload 描述交互卡片，以便前端可以安全渲染结构化 UI，而不是解析不稳定的自然语言或任意 HTML。

---

## 🎯 目标

定义 A2UI v1 协议规范和组件注册表，为后续实现提供清晰的技术基线。

---

## 📚 文档导航

- **[需求文档](./requirements.md)** — 用户故事、功能需求、验收标准、规划产物

---

## 🔗 相关文档

- [Epic A2UI README](../README.md)

---

**后续实现建议：** 协议类型建议放在 `packages/core/src/modules/a2ui/`，保持纯数据和纯函数边界；Web 渲染器只消费协议，不反向依赖 Agent 内部实现。
