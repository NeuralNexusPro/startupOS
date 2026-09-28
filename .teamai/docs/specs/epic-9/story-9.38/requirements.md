# 需求文档 - Story 9.38

**Story:** Service/Bridge 层合并 — 协作模块边界收敛
**Epic:** 9 — Multi-Agent 协作运行时
**最后更新:** 2026-05-22

---

## 用户故事

> 作为开发者，我希望协作运行时的所有核心逻辑都统一在 `src/modules/collaboration-runtime/` 下，而不是分散在 `src/lib/collaboration-runtime-bridge/` 和 `src/lib/collaboration-runtime-service/` 两个孤立目录，这样排障和扩展都更清晰。

---

## 功能需求

### A. 新建 facade 层（必须）

**目标目录：** `src/modules/collaboration-runtime/facade/`

#### A.1 `session-store.ts`
从 `collaboration-runtime-service/index.ts` 中拆出 session 管理：
- `sessions` Map（globalThis HMR 安全）
- `eventStores` Map
- `blackboards` Map
- `saveProjectSessions()`、`loadPersistedSessions()`、`generateId()`
- `createSession()`、`listSessions()`、`getSession()`

#### A.2 `event-bus.ts`
从 `collaboration-runtime-service/index.ts` 中拆出 SSE 分发：
- `SseClient` interface
- `registerClient()`、`unregisterClient()`、`getClientCount()`
- `subscribeToEvents()`、`unsubscribeFromEvents()`、`clientDisconnected()`
- `getEvents()`（含 eventStore 委托）
- `startGraceTimer()`
- 全局 `eventEmitter`（`emit` → 广播到所有 SSE 客户端）

#### A.3 `index.ts`（公共 API）
重新导出以下函数（保持调用签名完全不变，API Routes 零改动）：
```typescript
export { createSession, listSessions, getSession } from './session-store';
export { subscribeToEvents, unsubscribeFromEvents, clientDisconnected, getEvents } from './event-bus';
export { executeSession, abortSession } from './dag-runner';
export { sendMessageToSupervisor, respondToHumanReview } from './hitl-dispatcher';
export { getBlackboardState } from './session-store';
```

#### A.4 `dag-runner.ts`
从 `collaboration-runtime-service/index.ts` 中拆出 DAG 启动逻辑：
- `executeSession()`（含 greeting 模式 + startDag）
- `startDag()`（调 `executeSupervisorDag`，非阻塞）
- `abortSession()`

#### A.5 `hitl-dispatcher.ts`
从 `collaboration-runtime-service/index.ts` 中拆出 HITL 路由：
- `sendMessageToSupervisor()`
- `respondToHumanReview()`（已是 `sendMessageToSupervisor` 的别名）

---

### B. engine 层迁移（必须）

**目标目录：** `src/modules/collaboration-runtime/engine/`（已存在，追加文件）

#### B.1 `supervisor-dag.ts`
从 `src/lib/collaboration-runtime-bridge/multi-agent-executor.ts` 迁移（git mv，保留历史）：
- `executeSupervisorDag()`
- `resumeSupervisorHitl()`
- `loadProjectTopology()`
- `executeCollaborationRuntime()`（兜底入口）
- 所有辅助函数和类型

#### B.2 `agent-context-writer.ts`
从 `src/lib/collaboration-runtime-bridge/project-context-writer.ts` 迁移：
- `writeProjectContextForAgent()`
- `writeAgentMd()` 等

#### B.3 `engine/index.ts`
追加导出：
```typescript
export { executeSupervisorDag, resumeSupervisorHitl, loadProjectTopology } from './supervisor-dag';
export { writeProjectContextForAgent } from './agent-context-writer';
```

---

### C. 删除旧目录（必须）

迁移完成并验证后删除：
- `src/lib/collaboration-runtime-service/` （全部文件）
- `src/lib/collaboration-runtime-bridge/multi-agent-executor.ts`
- `src/lib/collaboration-runtime-bridge/project-context-writer.ts`
- `src/lib/collaboration-runtime-bridge/multi-agent-dag-executor.ts`（re-export 中间层，一并删）

保留（暂不迁移，因有独立使用方）：
- `src/lib/collaboration-runtime-bridge/agent-bridge.ts` — 被 `pi-agent/agent-manager.ts` 使用，待 Story 9.39 处理
- `src/lib/collaboration-runtime-bridge/event-mapper.ts` — 内部工具，随 agent-bridge 一起处理
- `src/lib/collaboration-runtime-bridge/__tests__/` — 随文件一起迁移

---

### D. API Routes import 路径更新（必须）

所有 API Route 只改 import 路径，函数签名不变：

| 文件 | 旧 import | 新 import |
|---|---|---|
| `sessions/route.ts` | `@/lib/collaboration-runtime-service` | `@/modules/collaboration-runtime/facade` |
| `sessions/[id]/execute/route.ts` | 同上 | 同上 |
| `sessions/[id]/messages/route.ts` | 同上 | 同上 |
| `sessions/[id]/events/route.ts` | 同上 | 同上 |
| `sessions/[id]/abort/route.ts` | 同上 | 同上 |
| `sessions/[id]/blackboard/route.ts` | 同上 | 同上 |
| `sessions/[id]/human-review/route.ts` | 同上 | 同上 |
| `sessions/[id]/route.ts` | 同上 | 同上 |
| `topology/route.ts` | `@/lib/collaboration-runtime-bridge/multi-agent-executor` | `@/modules/collaboration-runtime/facade` |

---

### E. 测试（必须）

- [ ] 迁移现有 `collaboration-runtime-bridge/__tests__/` 到 `modules/collaboration-runtime/engine/__tests__/`
- [ ] 迁移现有 service 层逻辑测试（如有）
- [ ] `npm run lint` 0 error
- [ ] `npm run typecheck` 0 error
- [ ] 现有 API route 测试通过（`sessions/[id]/messages/__tests__/`、`human-review/__tests__/`）

---

## 验收标准

- [ ] `src/lib/collaboration-runtime-service/` 目录不存在
- [ ] `src/lib/collaboration-runtime-bridge/multi-agent-executor.ts` 不存在
- [ ] `src/lib/collaboration-runtime-bridge/project-context-writer.ts` 不存在
- [ ] 所有 API Routes import 路径指向 `@/modules/collaboration-runtime/facade`
- [ ] `npm run typecheck` 0 error（排除预存错误）
- [ ] `npm run lint` 0 error
- [ ] 现有测试全部通过

---

## 依赖关系

- **前置依赖：** Story 9.37（HITL 直连，Day 1 完成后再做目录迁移）
- **源依据：** CLAUDE.md §模块依赖规约 · Story 9.37 Section B
