# 需求定义 - Story 9.11

**Story:** Collaboration API Routes
**Epic:** 9 — Multi-Agent 协作运行时
**最后更新:** 2026-07-17

---

## 用户故事

> 作为 API 层，我需要提供 RESTful 接口和 SSE 事件流，让前端和外部系统可以与协作运行时交互，同时所有业务逻辑委托给 collaboration-runtime 模块。

---

## 功能需求

| 路由 | 方法 | 功能 |
|------|------|------|
| `/api/collaboration/sessions` | POST | 创建协作会话 |
| `/api/collaboration/sessions` | GET | 列出会话 |
| `/api/collaboration/sessions/[id]` | GET | 会话详情 + 黑板快照 |
| `/api/collaboration/sessions/[id]/events` | GET | 事件流（SSE） |
| `/api/collaboration/sessions/[id]/blackboard` | GET | 黑板状态 |
| `/api/collaboration/sessions/[id]/execute` | POST | 启动执行 |
| `/api/collaboration/sessions/[id]/abort` | POST | 终止 |

**架构约束：**
- API routes 仅做 HTTP 请求/响应处理
- 所有业务逻辑委托给 `src/modules/collaboration-runtime/`
- 负责组装 `CollaborationRuntimeDeps` 并注入模块
- 禁止在 route 中定义业务逻辑

## 边界条件

- POST 创建 session 返回正确 ID 和状态
- GET events 返回 SSE 流，Content-Type: text/event-stream
- SSE 事件格式符合 RuntimeEvent JSON
- route 中无业务逻辑，全部委托模块
- deps 组装正确注入（agentEngine, toolExecutor, ontologyStore, fileOps, eventEmitter）
- 错误返回统一格式 `{ success: false, error: string }`

## 验收标准

- [ ] POST 创建 session 返回正确 ID 和状态
- [ ] GET events 返回 SSE 流，Content-Type: text/event-stream
- [ ] SSE 事件格式符合 RuntimeEvent JSON
- [ ] route 中无业务逻辑，全部委托模块
- [ ] deps 组装正确注入（agentEngine, toolExecutor, ontologyStore, fileOps, eventEmitter）
- [ ] 错误返回统一格式 `{ success: false, error: string }`

## 依赖关系

- [设计文档 §9 API Routes](../../design/multi-agent-runtime.md#9-api-routes)
- [设计文档 §5.6 协作引擎 API](../../design/multi-agent-runtime.md#56-协作引擎-api)
