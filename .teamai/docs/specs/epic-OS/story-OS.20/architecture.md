# 架构设计文档 - Story OS.20

**Story：** 窗体会话历史切换与上下文恢复  
**版本：** 1.0  
**最后更新：** 2026-07-29

## 当前问题

`SkillDialog.selectSession()` 和 `AgentDialogContent.selectSession()` 只修改本地
`activeSessionId`。`AgentDialogContent` 的初始化 effect 在 `isInitialized=true`
后直接退出；`usePiAgent.initialize()` 即使命中已存在 Session 也执行
`setMessages([])`。因此历史选择既没有可靠地重绑 runtime，也没有恢复消息。

## 目标边界

引入统一的公共 Session restore contract，返回一个可原子应用的快照：

```typescript
export interface RestoredAgentSession {
  sessionId: string;
  projectId: string;
  messages: DisplayMessage[];
  projectContext: ProjectContext;
  agentType?: string;
  llmConfig?: RuntimeLLMConfig;
  runtime: {
    restored: boolean;
    branchId?: string;
    resumable: boolean;
    warning?: string;
  };
}
```

具体字段以现有公共 Pi API 为准，不复制或解析上游私有 Session state。

## 模块职责

### Core integration

路径：`packages/core/src/lib/integrations/pi-agent/`

- 定义 restore request/result/error 类型和公共导出。
- 通过现有 SessionStore/AgentManager 公开边界恢复目标 Session。
- 过滤内部消息，生成稳定的 display messages。
- 校验 Session 与 project/entry ownership。
- 使用 request epoch 或 AbortSignal 防止迟到结果提交。

### Desktop service

路径：`packages/desktop/src/main/services/agent-session-service.ts`

- 在 IPC 边界解析参数并调用 Core restore API。
- 返回结构化 `NOT_FOUND`、`OWNERSHIP_MISMATCH`、`CORRUPT_SESSION`、
  `RESTORE_FAILED`。
- 不复制 Core 的 restore 业务逻辑。

### Web service/hook

路径：

- `packages/core/src/lib/integrations/pi-agent/client-hooks.ts`
- `packages/web/src/components/skills/SkillDialog.tsx`
- `packages/web/src/components/os/agent-dialog/AgentDialogContent.tsx`

职责：

- `usePiAgent` 暴露 `restoreSession()`，原子更新 sessionId、messages、
  projectContext 和初始化状态。
- Skill/Agent/RoleAgent 窗体只调用统一 action，不自行拼装历史状态。
- 流事件必须携带或校验 Session ID，旧 Session 迟到事件不得进入新消息列表。

## 依赖方向

```text
Web components
  -> client service / hook
  -> Electron IPC adapter
  -> Core pi-agent public restore API
  -> SessionStore / AgentManager / public Pi Runtime
```

- Core 不依赖 Web 或 Desktop。
- Desktop 不依赖 Web UI。
- Web 组件不直接读取本地 Session 文件。
- Feature 间调用通过公共 `index.ts` 导出。

## 状态与并发

Renderer 至少维护：

```typescript
type SessionSwitchState =
  | { status: 'idle'; activeSessionId: string }
  | { status: 'switching'; activeSessionId: string; targetSessionId: string; epoch: number }
  | { status: 'failed'; activeSessionId: string; targetSessionId: string; error: string };
```

每次选择递增 epoch。restore 完成时必须同时匹配最新 epoch、target Session 和
当前 entry ownership 才能提交。切换前 abort 当前 stream，并取消旧订阅；新
runtime binding 建立后再接受事件和开放输入。

## 持久化与兼容

- 不创建第二份历史记录；canonical 数据仍由现有 Agent Session persistence
  持有。
- 旧 Session 缺少新字段时使用现有 project context 默认值并返回 warning；
  不静默改写历史文件。
- 不自动恢复进程内未结束的 tool promise。可恢复状态必须来自公开持久化数据。
- 删除和新建 Session 的现有数据格式保持兼容。

## 性能与安全

- Session get/restore 不在 Electron 主线程执行同步大文件读取。
- 大历史先构造有界 DTO，再一次性提交 React state；列表与消息渲染避免
  O(n²) 合并。
- 日志只记录 sessionId hash、entry type、message count、阶段、耗时和错误码。
- ownership 校验必须在读取消息正文前完成，防止跨 Agent/Skill 数据泄漏。

## AGENTS.md 符合性

- 业务恢复逻辑下沉到 Core integration，`app/` 和 Desktop 不承载业务实现。
- 依赖保持单向，无 Web/Desktop 反向依赖。
- 使用 TypeScript、React Hooks、现有状态方案和本地文件 persistence。
- 不修改 `.next`、`dist-electron`、`node_modules` 或私有 Pi Runtime 文件。
- 实施前必须创建独立 OpenSpec Proposal，并在对应 Git worktree 中执行。

