# 架构设计 - Story 9.9

**Story:** ACL 消息协议
**Epic:** 9 — Multi-Agent 协作运行时
**最后更新:** 2026-07-17

---

## 技术栈

- TypeScript 严格模式
- ACL（Agent Communication Language）协议
- 黑板消息路由

## 数据结构

### ACLMessage

```typescript
interface ACLMessage {
  performative: Performative;
  sender: string;
  receiver: string;  // '*' 表示广播
  content: unknown;
  conversationId?: string;
  replyWith?: string;
  inReplyTo?: string;
}
```

### Performative

inform, request, query, propose, accept, reject, cfp, subscribe, notify, failure, refuse, agree, delegate

## 模块设计

**文件：** `src/modules/collaboration-runtime/protocol/acl.ts`

## 代码变更

### AclProtocol 接口

```typescript
interface AclProtocol {
  // 创建消息
  createMessage(params: {
    performative: Performative;
    sender: string;
    receiver: string;
    content: unknown;
    conversationId?: string;
    replyWith?: string;
    inReplyTo?: string;
  }): ACLMessage;

  // 发送消息（写入黑板）
  send(msg: ACLMessage, blackboard: Blackboard): void;

  // 获取目标 Agent 的未读消息
  getUnread(agentId: string, blackboard: Blackboard): ACLMessage[];

  // 匹配 request-response
  matchResponse(requestMsg: ACLMessage, blackboard: Blackboard): ACLMessage | null;
}
```

- 新增 `protocol/acl.ts`：实现 ACL 消息协议
- 消息路由到黑板
- 支持 request-response 匹配
