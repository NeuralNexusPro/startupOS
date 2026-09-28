# 需求定义 - Story 9.9

**Story:** ACL 消息协议
**Epic:** 9 — Multi-Agent 协作运行时
**最后更新:** 2026-07-17

---

## 用户故事

> 作为多 Agent 协作的通信基础，我需要标准化的消息协议让 Agent 之间可以请求、告知、委托和订阅，这样协作不依赖硬编码。

---

## 功能需求

1. **ACLMessage 数据结构** — performative, sender, receiver, content, conversationId, replyWith, inReplyTo
2. **请求-响应协议** — trigger 关系（request → inform）
3. **消息路由** — 定向消息仅目标可见，广播消息全部可见
4. **conversationId 管理** — 隔离不同对话流
5. **replyWith / inReplyTo 匹配** — 关联请求和响应

## 边界条件

- request → inform 消息匹配正确
- 广播消息（receiver: '*'）送达所有已注册 Agent
- conversationId 隔离不同对话流
- replyWith / inReplyTo 关联正确
- 消息格式验证（拒绝非法 performative）

## 验收标准

- [ ] request → inform 消息匹配正确
- [ ] 广播消息（receiver: '*'）送达所有已注册 Agent
- [ ] conversationId 隔离不同对话流
- [ ] replyWith / inReplyTo 关联正确
- [ ] 消息格式验证（拒绝非法 performative）

## 依赖关系

- [设计文档 §4.1 ACL](../../design/multi-agent-runtime.md#41-agent-通信语言acl)
- [设计文档 §4.2 协议 1：请求-响应](../../design/multi-agent-runtime.md#协议-1请求-responserequest-response)
