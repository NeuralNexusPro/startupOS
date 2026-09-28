# 架构设计 - Story 9.38

**Story:** Service/Bridge 层合并 — 协作模块边界收敛
**Epic:** 9 — Multi-Agent 协作运行时
**最后更新:** 2026-05-22

---

## 背景

当前目录违反 CLAUDE.md 的**单向依赖原则**：
- `src/lib/collaboration-runtime-service/` — Layer 2（业务功能层），630 行，持有 session 状态机 + SSE 分发 + DAG 启动
- `src/lib/collaboration-runtime-bridge/` — 同 Layer 2，3100 行，持有 Supervisor DAG 编排 + Worker spawn + HITL 路由

两个目录都属于 `src/lib/`，但它们的职责比 lib 层更高——它们调用 sandbox（子进程）、依赖 modules，本质上是**协作模块内部**的实现，不应暴露在 lib 公共层。

### 目前调用关系

```
API Routes (app/)
  → collaboration-runtime-service  (lib/)
      → collaboration-runtime-bridge (lib/)
          → modules/collaboration-runtime/sandbox
          → modules/collaboration-runtime/session
```

### 目标结构

```
API Routes (app/)
  → modules/collaboration-runtime/facade  ← 新增（替代 service + bridge 入口）
      → modules/collaboration-runtime/engine/supervisor-dag  ← 迁入 multi-agent-executor
      → modules/collaboration-runtime/engine/agent-context-writer  ← 迁入 project-context-writer
      → modules/collaboration-runtime/sandbox
      → modules/collaboration-runtime/session
```

---

## 模块设计

### A. 新建 facade 层

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

### B. engine 层迁移

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

### C. 删除旧目录

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

### D. API Routes import 路径更新

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

## 迁移顺序（避免破坏中间状态）

```
步骤 1: 创建 facade/ 目录结构，逐文件拆分（session-store → event-bus → hitl-dispatcher → dag-runner → index）
步骤 2: 让 collaboration-runtime-service/index.ts 改为从 facade/ re-export（保持 API routes 不变，验证可用）
步骤 3: 用 git mv 迁移 multi-agent-executor.ts → engine/supervisor-dag.ts
步骤 4: engine/index.ts 追加导出，facade/dag-runner.ts 改 import 路径
步骤 5: API Routes 全部改为 import from facade/
步骤 6: 删除 collaboration-runtime-service/ 和已迁移的 bridge/ 文件
步骤 7: 运行完整 typecheck + lint + 测试
```

---

## 风险

1. **HMR 全局变量路径变化**：`globalThis.__collaborationSessions` 等在迁移后路径相同，影响不大
2. **循环依赖**：engine 层调用 sandbox/session，sandbox/session 不回调 engine — 单向依赖，安全
3. **agent-bridge.ts 暂留**：`src/lib/collaboration-runtime-bridge/` 不完全删除，留到 Story 9.39 一并清理
