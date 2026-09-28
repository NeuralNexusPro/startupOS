# 需求定义 - Story 9.1

**Story:** 类型定义与事件模型
**Epic:** 9 — Multi-Agent 协作运行时
**最后更新:** 2026-07-17

---

## 用户故事

> 作为协作运行时的开发者，我需要一套完整的类型系统来定义事件、黑板、ACL 消息和协作拓扑，这样所有模块都能基于统一的类型安全地交互。

---

## 功能需求

1. **RuntimeEvent** — 完整的事件模型，覆盖 16+ EventType
2. **Blackboard** — 黑板数据结构（sharedData, messages, tasks, artifacts, locks）
3. **ACLMessage** — Agent 通信语言（performative: inform/request/notify/delegate 等）
4. **CollaborationTopology** — 拓扑结构（agents map, edges, entryPoints, exitPoints）
5. **CollaborationSession** — 会话模型

## 边界条件

- 无 `any` 类型，全部具体类型定义
- 类型导出公共 API（`index.ts` 导出）

## 验收标准

- [ ] 覆盖设计文档 §3.2 全部 EventType
- [ ] Blackboard 数据结构覆盖 §3.3 全部字段
- [ ] ACLMessage 覆盖 §4.1 全部 performative
- [ ] 无 `any` 类型，全部具体类型定义
- [ ] 类型导出公共 API（`index.ts` 导出）

## 依赖关系

- [设计文档 §3.2 事件模型](../../design/multi-agent-runtime.md#32-事件模型)
- [设计文档 §3.3 黑板数据结构](../../design/multi-agent-runtime.md#33-黑板数据结构)
- [设计文档 §4.1 ACL](../../design/multi-agent-runtime.md#41-agent-通信语言acl)
