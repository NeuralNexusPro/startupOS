# 架构设计 - Story 9.1

**Story:** 类型定义与事件模型
**Epic:** 9 — Multi-Agent 协作运行时
**最后更新:** 2026-07-17

---

## 技术栈

- TypeScript 严格模式（禁止 `any` 类型）
- 类型定义位于 `src/modules/collaboration-runtime/` 模块内

## 数据结构

### EventType 清单

| 分类 | 事件类型 |
|------|---------|
| 生命周期 | SESSION_CREATED, SESSION_COMPLETE, SESSION_ABORTED, CHECKPOINT |
| 用户交互 | USER_INPUT, USER_RESPONSE |
| Agent 活动 | AGENT_REGISTERED, AGENT_UNREGISTERED, AGENT_THINKING, AGENT_ACT, AGENT_COMPLETE_TASK, AGENT_FAIL_TASK |
| Agent 通信 | AGENT_MESSAGE, AGENT_BROADCAST, AGENT_REQUEST, AGENT_RESPONSE, AGENT_DELEGATE |
| 协作协调 | TASK_CREATED, TASK_ASSIGNED, TASK_STARTED, TASK_COMPLETED, TASK_FAILED, TASK_REASSIGNED |
| 黑板操作 | BLACKBOARD_WRITE, BLACKBOARD_UPDATE, BLACKBOARD_LOCK, BLACKBOARD_RELEASE |
| 冲突 | CONFLICT_DETECTED, CONFLICT_RESOLVED |
| 沙箱执行 | TOOL_CALL, TOOL_RESULT, TOOL_FAILURE |

### ACLMessage performative

inform, request, query, propose, accept, reject, cfp, subscribe, notify, failure, refuse, agree, delegate

## 模块设计

**文件：** `src/modules/collaboration-runtime/session/types.ts`

## 代码变更

- 新增 `session/types.ts`：定义 RuntimeEvent、Blackboard、ACLMessage、CollaborationTopology、CollaborationSession
- 通过 `index.ts` 导出公共 API
