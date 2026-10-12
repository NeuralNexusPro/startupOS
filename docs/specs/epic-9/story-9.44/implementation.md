# 开发文档 - Story 9.44

**Story:** 多Agent协作统一任务看板（Multica模式）
**版本:** 1.0
**最后更新:** 2026-10-12

---

## 🎯 开发目标

在多 Agent 协作窗口补齐 Multica 式统一任务看板：事件驱动实时更新 + 会话恢复快照对账 + Agent 详情联动，引擎与存储零改动，原项目工作区「任务」页签不受影响。

---

## 📋 实施步骤

### 步骤 1: store 任务派生逻辑（核心先行）

**任务：**
- [ ] 将 `store.ts` 既有 `tasks` 状态从 `{id,state,assignee}` 改形为 `TaskItem[]`（当前零消费，改形安全）
- [ ] 在 `addEvent` 事件入口新增 `TASK_*` 六类事件的增量 upsert（语义对齐引擎 `blackboard.ts` apply）
- [ ] 新增 `mergeSnapshotTasks(snapshot)` 与 `boardCollapsed` 状态
- [ ] 单测覆盖六类事件映射与快照合并

**位置:** `packages/core/src/modules/collaboration-runtime/ui/store.ts`

**命令：**
```bash
pnpm --filter @originos/core exec vitest run src/modules/collaboration-runtime/ui/__tests__/store-tasks.test.ts
```

### 步骤 2: TaskBoard 组件

**任务：**
- [ ] 新建 `TaskBoard.tsx`：汇总条（任务数/活跃/完成/失败 + 折叠按钮）+ 任务行列表（状态图标+描述+Agent名+状态标签+时间）
- [ ] 空态「暂无任务，等待 Supervisor 分派」；>50 条内部滚动
- [ ] 纯展示：数据来自 zustand selector，点击回调 `onTaskClick(agentId)`

**代码示例：**
```tsx
// packages/core/src/modules/collaboration-runtime/ui/TaskBoard.tsx
export function TaskBoard({ collapsed, onToggleCollapsed, onTaskClick, agentNames }: TaskBoardProps) {
  const tasks = useCollaborationUi((s) => s.tasks);
  const summary = useMemo(() => deriveSummary(tasks), [tasks]);
  if (tasks.length === 0 && collapsed) return null; // 或渲染空态占位
  // …渲染汇总条 + 折叠区任务列表
}
```

### 步骤 3: 挂载到 MultiAgentLauncher

**任务：**
- [ ] 在 Agent 状态条与主区之间渲染 `<TaskBoard />`
- [ ] `onTaskClick` → `setSelectedAgentId(agentId)`（复用既有抽屉联动）
- [ ] 仅在 `sessionId !== null` 后渲染（无会话不渲染，与 topology gating 同风格）

### 步骤 4: 快照恢复 + 双通道（非全量，按用户决策收窄）

**任务：**
- [ ] `ipc-protocol.ts`（core + desktop 两份）新增 `COLLAB_SNAPSHOT_GET: 'collaboration:snapshot:get'`
- [ ] `services/collaboration.ts` 新增 `getCollaborationTaskSnapshot(sessionId)`（IPC / fetch 双模式，套用 `readJsonResponse` 既有模式）
- [ ] desktop `collaboration-service.ts` 注册 handler，转发 core facade `getSessionTaskSnapshot`
- [ ] `MultiAgentLauncher` 会话恢复路径（`sessionId` 就绪后）调用一次快照 → `mergeSnapshotTasks`；失败 `console.error` 降级
- [ ] **恢复范围按既有 `WorkspaceTaskSnapshot` 形态**：活跃任务（`activeTasks`）+ 各 Agent 最近终端任务（`agents[].recentTerminalTask`）合成展示；不做全量历史恢复，不新增快照字段、不改用 blackboard GET（用户决策 2026-10-12）

**代码示例：**
```typescript
// packages/core/src/lib/integrations/electron/services/collaboration.ts
export async function getCollaborationTaskSnapshot(sessionId: string): Promise<IpcResponse<unknown>> {
  if (isElectron()) {
    return getIpcRenderer().invoke<IpcResponse<unknown>>(
      IPC_CHANNELS.COLLAB_SNAPSHOT_GET,
      { sessionId }
    );
  }
  const response = await fetch(`/api/collaboration/sessions/${encodeURIComponent(sessionId)}/snapshot`);
  return readJsonResponse<IpcResponse<unknown>>(response);
}
```

### 步骤 5: HITL → OriginOS 系统通知

**任务：**
- [ ] 新建 `packages/core/src/modules/collaboration-runtime/facade/hitl-notify.ts`：`registerHitlNotificationForwarder()`（见 architecture.md 模块 5 关键代码）
- [ ] `facade/dag-runner.ts` 组装点（`setStartDag` 注入处旁）调用一次注册
- [ ] 幂等：进程内 `Set<event.id>` 去重，防重复通知
- [ ] 防御：`createNotification` 包 try/catch + `.catch()`，失败仅 `console.error`
- [ ] 单测：HITL 事件 → createNotification 调用参数；非 HITL 事件零调用；同 id 幂等；manager 抛错不冒泡

**验证点：**
- 通知中心 UI 零改动——`NotificationBell` 30s 轮询自动拉到新通知，未读计数 +1
- 三条 HITL 路径（supervisor tools 直发 / dispatch 直连转换 / 旧路径兜底）都经 `eventEmitter` 广播，挂点统一覆盖

### 步骤 6: 验证与回归

**任务：**
- [ ] core 单测（store 派生 + TaskBoard 渲染）全绿
- [ ] `pnpm lint`、`pnpm lint:boundaries` 通过
- [ ] core tsc 无新增错误
- [ ] 手动验证：真实项目发起协作 → 看板出现任务；重开窗口 → 快照恢复
- [ ] 确认项目工作区「任务」页签零改动（AC5 回归）

### 步骤 7: 文档与变更记录

**任务：**
- [ ] 本文件补实施日志与验证结果
- [ ] `testing.md` 记录测试矩阵与结果
- [ ] `docs/changes/changelog.md` + 当前版本目录追加变更摘要
- [ ] Epic README Story 表更新 9.44 状态

---

## 💻 关键代码片段

### 代码片段 1: 事件 → 任务增量映射（store 内纯函数）

```typescript
// packages/core/src/modules/collaboration-runtime/ui/store.ts
// 与引擎 blackboard.ts 的 TASK_* apply 语义逐条对齐
export function applyTaskEventToTasks(
  tasks: TaskItem[],
  event: RuntimeEvent,
): TaskItem[] {
  const payload = (event.payload ?? {}) as Record<string, unknown>;
  switch (event.type) {
    case "TASK_CREATED": {
      const task = payload["task"] as TaskItem | undefined;
      if (!task || tasks.some((t) => t.id === task.id)) return tasks;
      return [...tasks, task];
    }
    case "TASK_ASSIGNED": {
      const taskId = payload["taskId"] as string | undefined;
      const agentId = payload["agentId"] as string | undefined;
      if (!taskId) return tasks;
      return tasks.map((t) => t.id === taskId
        ? { ...t, assignedTo: agentId, status: "assigned" as const }
        : t);
    }
    case "TASK_STARTED": {
      const taskId = payload["taskId"] as string | undefined;
      if (!taskId) return tasks;
      return tasks.map((t) => t.id === taskId ? { ...t, status: "running" as const } : t);
    }
    case "TASK_REPORTED": {
      const taskId = payload["taskId"] as string | undefined;
      if (!taskId) return tasks;
      return tasks.map((t) => t.id === taskId
        ? { ...t, status: "reported" as const, output: payload["output"] }
        : t);
    }
    case "TASK_COMPLETED": {
      const taskId = payload["taskId"] as string | undefined;
      if (!taskId) return tasks;
      return tasks.map((t) => t.id === taskId
        ? { ...t, status: "completed" as const, output: payload["output"], completedAt: event.timestamp }
        : t);
    }
    case "TASK_FAILED": {
      const taskId = payload["taskId"] as string | undefined;
      if (!taskId) return tasks;
      return tasks.map((t) => t.id === taskId
        ? { ...t, status: "failed" as const, completedAt: event.timestamp }
        : t);
    }
    default:
      return tasks;
  }
}
```

**说明：**
- 纯函数，便于单测；`addEvent` 内对新事件调用并写入 store
- 引擎 `dispatch` 链路会连续发 CREATED→ASSIGNED→STARTED，本映射保持幂等（同 id 不重复 push）

### 代码片段 2: 会话恢复时序（MultiAgentLauncher）

```tsx
// sessionId 就绪后拉取一次快照（恢复场景）；运行中靠事件流，不轮询
useEffect(() => {
  if (sessionId === null) return;
  void getCollaborationTaskSnapshot(sessionId)
    .then((result) => {
      if (!result.success) {
        console.error("[MultiAgentLauncher] Get task snapshot failed:", result.error);
        return; // 降级：仅事件驱动
      }
      useCollaborationUi.getState().mergeSnapshotTasks(result.data as WorkspaceTaskSnapshot);
    })
    .catch((error) => {
      console.error("[MultiAgentLauncher] Get task snapshot request failed:", error);
    });
}, [sessionId]);
```
**说明：**
- **按用户决策（2026-10-12）不做全量恢复**：恢复范围 = `activeTasks` + 各 Agent `recentTerminalTask`，与快照既有形态一致，不新增字段、不改恢复源
- 快照 data 按 unknown 接收后收窄（`asTaskItem` 防御式校验），禁止 any

### 代码片段 3: HITL 通知挂点（facade/hitl-notify.ts）

见 `architecture.md` 模块 5 关键代码。实施要点：
- `registerHitlNotificationForwarder()` 在 `facade/dag-runner.ts` 模块组装点调用一次（返回的取消注册函数暂不使用，进程生命周期同应用）
- `NotificationManager` 从 `@originos/core` 内部路径 `../../../lib/integrations/pi-agent/notification-system` 引用（facade 组装边界允许，与 `hitl-dispatcher.ts` 引 `lib/features/user-config` 同模式）
- 幂等 Set 需容忍 HMR：挂到 `globalThis`（参照 `hitlResumerRegistry` 的 HMR 安全模式）

---

## ⚙️ 环境配置

### 开发环境

**Node.js:** >= 18.x
**包管理:** pnpm workspace（monorepo 根目录执行）

### 验证命令

```bash
# core 单测
pnpm --filter @originos/core exec vitest run src/modules/collaboration-runtime/ui/__tests__/
# lint
pnpm lint && pnpm lint:boundaries
# exports 门禁（若动 core exports）
node scripts/expand-core-exports.cjs --verify
```

---

## ⚠️ 开发注意事项

### 必须遵守的规约

1. **AGENTS.md 规约**
   - ✅ 不改 engine/session/protocol 核心子层
   - ✅ ui/ 不 import web/desktop
   - ✅ 不向 `.claude/skills/` 写入
   - ✅ 产物不写入技能源目录（本 Story 无技能产物）

2. **代码规范**
   - ✅ TypeScript 严格模式、禁止 any（快照响应按 unknown 收窄）
   - ✅ Tailwind class，无内联样式（现有文件个别 style 宽度过渡属既有模式，不扩散）

3. **性能要求**
   - ✅ 事件→看板 < 500ms；快照仅恢复时拉取一次

### 常见陷阱

#### 陷阱 1: 快照 activeTasks 不是全量任务

**问题：**
```typescript
// ❌ 误以为 snapshot.activeTasks 包含已完成任务 → 恢复后历史任务消失
mergeSnapshotTasks({ activeTasks: snapshot.activeTasks });
```

**解决：**
```typescript
// ✅ 活跃任务 + 各 Agent recentTerminalTask 合成；或改用 blackboard GET 拿全量
const restored = [
  ...snapshot.activeTasks,
  ...snapshot.agents.map((a) => a.recentTerminalTask).filter(Boolean),
];
```
（更稳妥方案：恢复源改用 `GET .../blackboard` 或在快照 API 补 `tasks` 全量字段，实施时定案并回写架构文档。）

#### 陷阱 2: TASK_CREATED 与 ASSIGNED 连发导致闪烁

**问题：** 引擎在 dispatch 中连续发三类事件，逐帧 setState 出现「未分配 → 已分配 → 运行中」跳动。

**解决：** zustand 更新天然批处理（React 18 自动批）；TaskBoard 行渲染对 status 直接取最新值，不做逐事件过渡动画。

---

## 🐛 已知问题

### 问题 1: 真实会话尚无 TASK_* 事件样本

**描述:** 现存历史协作会话均在 HITL 阶段中断，黑板任务数为 0，事件驱动路径缺真实数据回归样本。
**影响范围:** 验收依赖新发起一次完整协作会话。
**临时解决方案:** 单测用构造事件序列覆盖；手动验收时新起会话验证。
**计划修复:** 无需修复（属测试数据问题）。

### 问题 2: 会话恢复不含全量历史任务（用户决策，非缺陷）

**描述:** 快照恢复仅展示活跃任务 + 各 Agent 最近终端任务，更早的终端任务不在恢复范围内（每个 Agent 只保留最近一条终端任务）。
**影响范围:** AC6 明确收窄后的预期行为。
**临时解决方案:** 无需处理；如未来需要，另立 Story 扩展快照形态或改用 blackboard 全量读取。
**计划修复:** 暂不处理。

---

## 🔍 代码审查要点

### 审查清单

#### 架构和设计
- [ ] engine/session/protocol 零改动
- [ ] ui/ → integrations 单向依赖
- [ ] 无跨包相对路径穿透；exports 白名单未被绕过

#### 代码质量
- [ ] 无 any；快照 unknown 收窄
- [ ] 事件映射缺字段防御
- [ ] 无内存泄漏（无新增定时器/订阅；折叠状态随组件生命周期）

#### 测试
- [ ] store 派生单测覆盖 6 类事件 + 快照合并
- [ ] TaskBoard 渲染/空态/联动测试
- [ ] 手动：真实会话端到端验证

#### 文档
- [ ] 实施日志、测试结果回写
- [ ] Epic README 状态同步

---

## 📝 开发日志

### 2026-10-12

**完成：**
- 完成 6 份 Story 文档初稿（README/requirements/interaction/architecture/implementation/testing）
- 范围确认：看板仅在多 Agent 协作窗口；项目工作区「任务」页签不呈现协作任务（两套体系不打通）
- 用户决策落地：①快照恢复收窄为非全量（活跃 + 最近终端任务）；②新增 HITL → OriginOS 通知中心转发（FR6/AC7，复用 NotificationManager 零新增基建）

---

## 🚀 部署说明

### 本地开发

```bash
pnpm dev   # Web 模式验证 HTTP 快照路径
```

### 桌面验证

```bash
# Electron 模式验证 IPC 快照路径
pnpm --filter @originos/desktop dev
```

---

## 📌 相关文档

- [Story README](./README.md)
- [需求文档](./requirements.md)
- [交互设计](./interaction.md)
- [架构设计](./architecture.md)
- [测试文档](./testing.md)
- [AGENTS.md](../../../AGENTS.md)
