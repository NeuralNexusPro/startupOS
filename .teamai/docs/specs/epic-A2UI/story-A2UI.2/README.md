# Story A2UI.2: 聊天消息渲染接入与 Markdown 降级

**Story 编号:** A2UI.2  
**所属 Epic:** [Epic A2UI](../README.md)  
**优先级:** 🔴 Critical  
**状态:** 📋 Planning  
**范围说明:** 本 Story 仅做规划，不包含实现。

---

## 📋 用户故事

作为用户，我希望 Agent 在聊天中生成的图表、表格和操作卡片能直接以内嵌卡片呈现；当当前客户端不支持该卡片时，我仍能看到可读的 Markdown 降级内容。

---

## 🎯 目标

规划 A2UI 卡片在聊天消息中的渲染接入方式，确保与现有 Markdown 渲染兼容并提供可靠的降级策略。

---

## 📚 文档导航

- **[需求文档](./requirements.md)** — 用户故事、功能需求、验收标准、规划产物

---

## 🔗 相关文档

- [Epic A2UI README](../README.md)

---

**后续实现建议：** A2UI 渲染入口可通过聊天消息组件注入，避免让 Markdown 渲染器承担业务协议职责。`packages/core/src/modules/collaboration-runtime/ui/` 只应通过 UI 依赖注入消费 A2UI 渲染器。
