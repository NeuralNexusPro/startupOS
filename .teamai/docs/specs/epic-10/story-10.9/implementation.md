# 实施文档 - Story 10.9

**Story:** Next.js HTTP API → Electron IPC 服务化迁移
**Epic:** 10 - OriginOS CE 客户端
**最后更新:** 2026-06-12

---

## 实施方案（分 Phase）

### Phase 1：基础设施铺底（1-2 周）

1. 建立 `packages/core/.../electron/services/` 与 `packages/desktop/src/main/services/` 目录约定
2. 编写 IPC 类型生成脚手架（共享 request/response schema）
3. 流式事件桥接基础组件：`createIpcEventStream`（main side）+ `subscribeIpcEvents`（renderer side），API 与 EventSource 对齐
4. 编写迁移模板：以 Story 10.9.3 中的 `skill-evolution` 为最小样板（业务逻辑已在 core，迁移代价最低）

### Phase 2：分领域迁移（按子 Story 顺序，4-6 周）

5. 按 10.9.1 → 10.9.9 顺序推进，每个领域内部步骤：
   - a. 抽取/确认业务函数已完整归属 `@originos/core/lib/features/<domain>`
   - b. 新增 IPC 通道常量 + 类型契约
   - c. 实现主进程 service handler
   - d. 实现客户端适配器（含 `isElectron()` 分支）
   - e. 迁移调用点（component/hook/page）
   - f. 保留 route.ts 为 Web 模式服务，去除 CE 分支冗余代码

### Phase 3：CE 离线化（1 周）

6. CE 启动流程剥离 `next dev` 依赖：Electron 直接加载本地静态打包产物
7. 验证：关闭 HTTP server 后 CE 全部领域功能正常
8. 灰度回归：双版本 E2E 自动化覆盖关键路径

---

## 验证方式

1. **Web 模式回归**
   ```bash
   pnpm --filter @originos/web dev
   ```
   - 所有 route.ts 行为不变，Web fallback 调用点继续工作

2. **CE 模式 IPC 走通**
   ```bash
   pnpm --filter @originos/desktop dev
   ```
   - 在 DevTools Network 面板观察 `/api/*` 请求消失（CE 模式不再发起 HTTP）
   - 在主进程日志观察 `ipcMain.handle` 被命中

3. **CE 离线验证（Phase 3）**
   - 显式关闭 next dev 进程
   - 启动 Electron，测试：技能调用、项目创建、Agent 会话、Ontology 编辑、协作运行时全部可用

4. **流式事件端到端延迟**
   - Collaboration 事件、Agent 流式 message 的 P95 延迟 < 50ms

5. **架构合规性 lint**
   ```bash
   pnpm lint
   ```
   - 检查依赖方向：`packages/desktop/src/main/services/*` 不依赖 `packages/web/*`
   - 检查 `packages/core/.../electron/services/*` 中无业务逻辑（仅适配器）

---

## 实施进展

### 2026-06-12 — Phase 1 启动：Skill Evolution IPC 样板

**范围**：Story 10.9.3 的 Skill 服务最小端到端样板。

**已完成**：
- `@originos/core/lib/integrations/pi-agent/skill-evolution` 新增 transport-agnostic `handleSkillEvolution()`，HTTP route 与 IPC handler 共享同一业务入口。
- `@originos/core/lib/features/skills/service.ts` 新增 Skill list / refresh / content / sessions 共享服务函数，HTTP route 与 IPC handler 共用。
- `packages/core/src/lib/integrations/electron/ipc-protocol.ts` 新增 `SKILL_LIST`、`SKILL_CONTENT`、`SKILL_REFRESH`、`SKILL_SESSION_LIST`、`SKILL_EVOLUTION_RUN` 通道和请求/响应类型契约。
- `packages/core/src/lib/integrations/electron/services/skill.ts` 新增 renderer 侧统一适配器，Electron 走 IPC，Web fallback 走 HTTP。
- `packages/desktop/src/main/services/skill-service.ts` 新增 main process IPC handler，并在 desktop main 启动时注册。
- `packages/web/src/components/skills/SkillDialog.tsx`、`SkillBrowser.tsx` 的 skill list/content/session history/evolution 调用点已迁移到统一适配器。
- `skills/executions` 的 start / complete / timeline / non-streaming message 已抽到 core service，并提供 Electron IPC adapter。
- `skills/executions/[executionId]/message` 的流式业务已抽到 `streamSkillExecutionMessage()`：Web 端保留 HTTP SSE，CE/Electron 桌面端通过 `SKILL_EXECUTION_MESSAGE_STREAM` + `SKILL_EXECUTION_EVENT` IPC event stream 推送。

**后续**：该阶段只覆盖 Skill 样板；剩余领域已在 10.9.4-10.9.9 中继续迁移。

### 2026-06-13 — Story 10.9.2：Agent Project IPC 迁移

**范围**：`usePersistentAgent` hook 从 `fetch('/api/agent/projects/...')` 迁移到 IPC 适配器。

**已完成**：
- `packages/core/src/lib/integrations/electron/ipc-protocol.ts` 新增 `AGENT_PROJECT_START`、`AGENT_PROJECT_STOP`、`AGENT_PROJECT_MESSAGE`、`AGENT_PROJECT_ABORT` 通道和请求/响应类型契约（含 `AgentProjectStreamEvent`）。
- `packages/core/src/lib/integrations/electron/services/agent-project.ts` 新增 renderer 侧统一适配器：`startProjectAgent()`、`stopProjectAgent()`、`sendProjectAgentMessage()`、`abortProjectAgent()`、`initializeProjectAgent()`，Electron 走 IPC，Web fallback 走 HTTP SSE。
- `packages/desktop/src/main/services/agent-project-service.ts` 新增 main process IPC handler，调用 `persistentAgentManager` 管理 Agent 生命周期，流式事件通过 `AGENT_EVENT` 通道广播（含 `projectId` 过滤）。
- `packages/core/src/lib/integrations/pi-agent/use-persistent-agent.ts` 重构为使用统一适配器，移除直接 `fetch()` 调用和 `parseSSEChunk` SSE 解析逻辑。
- `packages/desktop/src/main/main.ts` 注册 `AgentProjectService`。
- 流式桥接模式：IPC handler 订阅 `PersistentAgent.subscribe()` 事件 → `BrowserWindow.webContents.send(AGENT_EVENT, { projectId, type, data })` → renderer `ipcRenderer.on(AGENT_EVENT)` 按 `projectId` 过滤。

**后续**：该阶段只覆盖 Agent Project 流式 IPC；Project、Ontology、Collaboration 等基础服务已在后续子任务中迁移。

### 2026-06-13 — Story 10.9.4：Project 服务迁移

**范围**：Project CRUD、import/export、initialize、solutions、artifacts、sync-ontology、agent operations。

**已完成**：
- `packages/core/src/lib/integrations/electron/ipc-protocol.ts` 新增 `PROJECT_IMPORT` 通道（补充已有 `PROJECT_LIST/GET/CREATE/UPDATE/DELETE/EXPORT/ARTIFACT_GET/INITIALIZE/SYNC_ONTOLOGY/SOLUTION_*` 通道）。
- `packages/core/src/lib/integrations/electron/services/project.ts` 新增 `importProject()` 适配器函数（Electron IPC + Web HTTP fallback）。
- `packages/desktop/src/main/services/project-service.ts` 新增 `PROJECT_IMPORT` IPC handler。
- `packages/web/src/lib/hooks/use-projects.ts` 重构为使用 project adapter 函数，移除直接 `fetchApi` 调用。
- Agent project 操作（start/stop/message/abort）已在 10.9.2 中通过 `agent-project-service.ts` 迁移。

**保留 / 非阻塞项**：
- `/api/projects/[id]/files` 路由 — 前端未使用（`useWorkspace` hook 通过 workspace adapter / `local-fs` 处理文件操作）。
- `/api/projects/init/*` 路由 — `useProjectInitialization` hook 直接调用 core 函数，不经过 API。
- `/api/project/create/*` 路由 — 已通过 `PROJECT_CREATION_START/ANSWER/COMPLETE` IPC 通道接入，`ProjectCreationWizard.tsx` 使用 project adapter。

### 2026-06-13 — Story 10.9.5/10.9.6/10.9.8/10.9.9：剩余基础服务 IPC 迁移

**范围**：Ontology / Ontology Data、Collaboration SSE、User Registry、Interview / Notification / Taste / Debug / Launch / Sandbox。

**已完成**：
- `packages/core/src/lib/integrations/electron/ipc-protocol.ts` 已覆盖 ontology-data、collaboration、user-registry、misc 基础通道。
- `packages/core/src/lib/integrations/electron/services/{ontology,ontology-data,collaboration,user-registry,misc}.ts` 提供 renderer 侧 Electron IPC + Web HTTP fallback adapter。
- `packages/desktop/src/main/services/{ontology,ontology-data,collaboration,user-registry,misc}-service.ts` 注册 main process IPC handler。
- Collaboration SSE 在 Electron 下通过 `COLLAB_EVENT` IPC 广播替代 EventSource；Web 模式继续使用 `/api/collaboration/sessions/[id]/events`。
- Project Creation Wizard 迁移到 `PROJECT_CREATION_START/ANSWER/COMPLETE` IPC 通道，复用 `projectCreationService`。
- legacy `use-projects`、`use-workspace`、`ontology/client`、`interviewApi` 已改为调用统一 Electron adapter，避免业务侧继续直接依赖 Next API。
- Ontology Data instance relation 的存储操作下沉到 `@originos/core/lib/features/ontology-data-store/instance-relations.ts`，desktop handler 不再直接读写 `instance-relations.json`。
- `packages/core/src/lib/integrations/pi-agent/store.ts` 修复 10.9.2 迁移遗留的 `sessionStore` 局部变量缺失，恢复 web type-check 在该模块的可编译性。
- Workspace upload 已新增 `WORKSPACE_FILE_UPLOAD` IPC 通道，`use-file-upload` 在 Electron 下通过 workspace adapter 上传 `ArrayBuffer`，不再依赖 `/api/workspace/upload`。

**例外 / 后续增强**：
- User Registry create/update 当前 core 未提供业务函数，IPC 只迁移现有 list/get/delete 能力。
- Multipart upload 的 Web fallback 继续保留；Electron 运行时已走 IPC，后续可增强为大文件本地路径 copy，避免大文件穿过 IPC。
- `/api/agent/test-llm` 是服务端外部 LLM 连通性代理，不属于 renderer → local service 迁移面。
- `pnpm --filter @originos/web type-check`、`pnpm --filter @originos/desktop build` 已通过。
