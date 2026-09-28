# 架构设计 - Story 10.9

**Story:** Next.js HTTP API → Electron IPC 服务化迁移
**Epic:** 10 - OriginOS CE 客户端
**最后更新:** 2026-06-12

---

## 与现有架构的关系

### Service Layer 模式

```
┌───────────────────────────────────────────────────────────────┐
│                  调用点（page.tsx / hook / component）          │
│                              ↓                                  │
│         packages/core/.../electron/services/<domain>.ts        │
│         （客户端适配器：isElectron() 分支）                      │
│                              ↓                                  │
│        ┌─────────────────────┴─────────────────────┐          │
│        ↓                                            ↓          │
│  IPC（CE 版本）                              HTTP（Web 版本）    │
│        ↓                                            ↓          │
│  packages/desktop/src/main/services/        packages/web/      │
│  <domain>-service.ts                        src/app/api/.../   │
│                              ↓                                  │
│         packages/core/lib/features/<domain>/...                │
│         （业务核心，单一来源—Single Source of Truth）         │
└───────────────────────────────────────────────────────────────┘
```

**约束（强制，遵循 AGENTS.md §模块依赖规约）：**
- ✅ `packages/desktop/src/main/services/*` 只能依赖 `@originos/core/lib/features/*`
- ✅ `packages/web/src/app/api/**/route.ts` 只能依赖 `@originos/core/lib/features/*`
- ✅ `packages/core/src/lib/integrations/electron/services/*` 是客户端适配器，不含业务逻辑
- ❌ 禁止 IPC handler 与 route handler 重复实现业务逻辑
- ❌ 禁止 `route.ts` 直接 import `packages/desktop` 内容
- ❌ 禁止业务核心（`features/*`）感知传输层（HTTP / IPC）

### 与已有 Story 的关系

| Story | 关系 | 说明 |
|-------|------|------|
| 10.3 | **扩展** | `LocalFileSystem` 已是该模式的雏形，本 Story 将其纳入统一 `services/` 命名空间 |
| 10.4 | **扩展** | `LocalAgentBridge` 同上，扩展覆盖 `agent/sessions/*`、`agent/projects/*` 等剩余路由 |
| 10.8 | **依赖** | 本 Story 在客户端适配器中调用平台分支，必须遵循 10.8 的容器/Provider 模式 |

---

## 子任务分解

> 全部子 Story 共享统一交付物模板：
> 1. 在 `packages/core/.../electron/ipc-protocol.ts` 增加领域 IPC 通道常量
> 2. 在 `packages/desktop/src/main/services/<domain>-service.ts` 实现 `ipcMain.handle`
> 3. 在 `packages/core/.../electron/services/<domain>.ts` 提供客户端适配器（`isElectron()` 分支）
> 4. 调用点迁移：替换 `fetch('/api/...')` 为适配器调用
> 5. `route.ts` 保留，转为薄壳代理（仅服务 Web 模式）
> 6. 流式接口（如有）通过 `webContents.send` + `ipcRenderer.on` 桥接

### 10.9.1 ｜ FS 服务补完（扩展 Story 10.3）

- 范围：`/api/files/[...path]`、`/api/workspace/{resolve,files,upload,files/[...filePath]}`
- IPC 通道：`FS_RESOLVE`、`FS_UPLOAD`、`WORKSPACE_LIST`、`WORKSPACE_RESOLVE`
- 主进程：`packages/desktop/src/main/services/fs-service.ts`（合并/扩展 `local-fs.ts`）
- 客户端：`packages/core/.../electron/services/fs.ts`、`workspace.ts`
- 复用：`@originos/core/lib/storage/json-store`、`features/workspace`

### 10.9.2 ｜ Agent 服务补完（扩展 Story 10.4）

- 范围：`/api/agent/{abort,memory/consolidate,test-llm,sessions/**,projects/[projectId]/**}`、`/api/agents/[id]`
- IPC 通道：`AGENT_SESSION_CREATE/DESTROY/MESSAGE/STATS/SUMMARY`、`AGENT_PROJECT_START/STOP/MESSAGE/ABORT`、`AGENT_MEMORY_CONSOLIDATE`、`AGENT_TEST_LLM`
- 主进程：`packages/desktop/src/main/services/agent-service.ts`（扩展 `local-agent-bridge.ts`）
- 客户端：`packages/core/.../electron/services/agent.ts`
- 流式：`AGENT_EVENT` 现有通道扩展支持 sessions / projects 子频道
- 复用：`@originos/core/lib/integrations/pi-agent/{agent-manager,session-store,persistent-agent-manager}`

### 10.9.3 ｜ Skill 服务

- 范围：`/api/skill-sessions`、`/api/skills/{_test,refresh,[name],[name]/content,executions/**}`、`/api/agent/skill-evolution`
- IPC 通道：`SKILL_LIST/REFRESH/CONTENT/TEST`、`SKILL_SESSION_CREATE/DESTROY`、`SKILL_EXEC_START/MESSAGE/COMPLETE/TIMELINE`、`SKILL_EVOLUTION_RUN`
- 主进程：`packages/desktop/src/main/services/skill-service.ts`
- 客户端：`packages/core/.../electron/services/skill.ts`
- 复用：`@originos/core/lib/integrations/pi-agent/{skills,skill-evolution}`、`features/skills`

### 10.9.4 ｜ Project 服务

- 范围：`/api/projects/**`（init / initialize / [id]/**：artifacts、solutions、files、export、import、sync-ontology、agent、route）、`/api/project/create/**`
- IPC 通道：`PROJECT_LIST/CREATE/IMPORT/EXPORT`、`PROJECT_INIT_START/MESSAGE/COMPLETE/CANCEL/CONTEXT`、`PROJECT_SOLUTION_GET/UPSERT/INIT`、`PROJECT_ARTIFACT_GET/SET`、`PROJECT_FILE_LIST/READ/WRITE`、`PROJECT_AGENT_INIT`、`PROJECT_ROUTE`
- 主进程：`packages/desktop/src/main/services/project-service.ts`
- 客户端：`packages/core/.../electron/services/project.ts`
- 流式：项目初始化（`init/[sessionId]/message`）→ IPC 流
- 复用：`@originos/core/lib/features/projects/**`

### 10.9.5 ｜ Ontology 服务

- 范围：`/api/ontology/**`（validate / generate / [id] / [id]/chat / [id]/confirm / entities / entities/[id] / entities/[id]/related）、`/api/ontology-data/**`（domains、concepts、instances、relations、sync）
- IPC 通道：`ONTOLOGY_VALIDATE/GENERATE/GET/CHAT/CONFIRM`、`ONTOLOGY_ENTITY_LIST/GET/RELATED`、`ONTOLOGY_DATA_DOMAIN_*`、`ONTOLOGY_DATA_CONCEPT_*`、`ONTOLOGY_DATA_INSTANCE_*`、`ONTOLOGY_DATA_RELATION_*`、`ONTOLOGY_DATA_SYNC`
- 主进程：`packages/desktop/src/main/services/ontology-service.ts`
- 客户端：`packages/core/.../electron/services/ontology.ts`
- 流式：`/api/ontology/[id]/chat`（如为 SSE）→ IPC 流
- 复用：`@originos/core/lib/features/ontology/**`
- 当前状态：validate / get / update / chat / confirm / generate、entity CRUD / related、ontology-data domains/concepts/instances/relations/sync 均已接入 Electron IPC adapter；instance relation 文件读写已下沉到 `@originos/core/lib/features/ontology-data-store/instance-relations.ts`，避免 desktop handler 内联业务存储逻辑。
- 说明：`/api/ontology/[id]/chat` 当前是非 SSE 的占位聊天接口，Electron 侧使用等价 IPC request/response；若后续升级为流式 AI 编辑，再接 IPC stream。

### 10.9.6 ｜ Collaboration / SSE 服务

- 范围：`/api/collaboration/{topology,sessions,sessions/[id]/{abort,messages,execute,events,blackboard,human-review}}`
- IPC 通道：`COLLAB_TOPOLOGY_GET`、`COLLAB_SESSION_CREATE/GET/ABORT/EXECUTE`、`COLLAB_SESSION_MESSAGE_LIST/POST`、`COLLAB_BLACKBOARD_GET/SET`、`COLLAB_HUMAN_REVIEW_*`、`COLLAB_EVENT`（流式广播）
- 主进程：`packages/desktop/src/main/services/collaboration-service.ts`
- 客户端：`packages/core/.../electron/services/collaboration.ts`
- 流式：`/api/collaboration/sessions/[id]/events`（SSE）→ `COLLAB_EVENT` IPC 推送，`webContents.send` 广播
- 复用：`@originos/core/modules/collaboration-runtime/**`
- 当前状态：topology、session list/create/get/abort/execute、supervisor message、blackboard、human-review 已接入 IPC；renderer 侧 `subscribeCollaborationEvents()` 在 Electron 下通过 `COLLAB_EVENT` 接收主进程广播，Web 下保留 EventSource。
- 说明：`COLLAB_SESSION_MESSAGE_LIST`、`COLLAB_BLACKBOARD_SET` 当前无运行时调用点；事件续传/ack 是后续增强项，不阻塞本轮 IPC 收口。

### 10.9.7 ｜ Workspace / Files 服务

- 与 10.9.1 合并实施（同一 IPC handler 模块），独立列出便于排期
- 关注点：`/api/workspace/upload`（multipart）→ Electron 下通过 `WORKSPACE_FILE_UPLOAD` 传输 `ArrayBuffer`，Web 下保留 HTTP multipart fallback。

### 10.9.8 ｜ User-agents / User-skills 服务

- 范围：`/api/user-agents`、`/api/user-agents/[id]`、`/api/user-skills`、`/api/user-skills/[id]`
- IPC 通道：`USER_AGENT_LIST/GET/DELETE`、`USER_SKILL_LIST/GET/DELETE`
- 主进程：`packages/desktop/src/main/services/user-registry-service.ts`
- 客户端：`packages/core/.../electron/services/user-registry.ts`
- 复用：`@originos/core/lib/features/user-registry`
- 当前状态：与现有 HTTP route 能力对齐，已迁移 list/get/delete；create/update 需要先在 core registry 定义业务函数后再补 IPC 通道。

### 10.9.9 ｜ Interview / Notification / Taste / Debug / Misc 服务

- 范围：
  - Interview：`/api/interviews/**`
  - Notification：`/api/notifications/**`
  - Taste：`/api/taste/user/detection/**`
  - Launch：`/api/launch`
  - Sandbox：`/api/sandbox/apps/**`
  - Debug：`/api/debug/env`
- IPC 通道：`INTERVIEW_*`、`NOTIFICATION_*`、`TASTE_*`、`LAUNCH`、`SANDBOX_APP_*`、`DEBUG_ENV`
- 主进程：`packages/desktop/src/main/services/misc-service.ts`（按领域拆分文件，统一注册入口）
- 客户端：`packages/core/.../electron/services/misc.ts`
- 当前状态：Interview list/create/get/complete/answer、Notification list/update、Taste detection start/message/analyze/draft、Launch、Sandbox app list、Debug env 已接入 IPC adapter；Web fallback 继续走 HTTP API。
- 复用：`@originos/core/lib/features/{interview,notification,taste}`

---

## 关键文件

| 文件 / 目录 | 操作 | 说明 |
|------------|------|------|
| `packages/core/src/lib/integrations/electron/ipc-protocol.ts` | **扩展** | 按领域分组追加新通道（每个子 Story 一段） |
| `packages/core/src/lib/integrations/electron/services/` | **新建目录** | 客户端适配器集合（每个领域一个文件） |
| `packages/core/src/lib/integrations/electron/streams/` | **新建目录** | 流式订阅适配器（collaboration-events、agent-events） |
| `packages/desktop/src/main/services/` | **新建目录** | IPC handler 实现（每个领域一个 service 类） |
| `packages/desktop/src/main/main.ts` | **修改** | 注册新增 service（`new XxxService()` 触发 `ipcMain.handle`） |
| `packages/desktop/src/main/local-fs.ts` | **重构** | 移入 `services/fs-service.ts`，保留兼容导出 |
| `packages/desktop/src/main/local-agent-bridge.ts` | **重构** | 移入 `services/agent-service.ts`，保留兼容导出 |
| `packages/web/src/app/api/**/route.ts` | **保留** | 继续服务 Web 模式，业务逻辑不变（已经是薄壳） |
| `packages/web/src/components/**`、`packages/web/src/hooks/**` | **修改** | 调用点替换 `fetch('/api/...')` 为 `services/<domain>` |
