# Story: 工具帧展示 + 文件上传功能

## 概述

为 RoleAgent/Agent/SkillDialog 三类对话界面添加工具执行帧展示和文件上传功能。

---

## Part 1: 工具执行帧展示

### 背景

当前只有 `InterviewWindow` 通过 `usePersistentAgent` 获得 `toolExecutions` 并在 `CUIDialogPanel` 中展示。`AgentDialog`（RoleAgent/Agent）和 `SkillDialog` 没有工具执行帧展示，用户不知道 Agent 在后台做了什么。

### 可复用组件

- **`CUIDialogPanel` 中的 `ToolExecutionFrame`** — `src/components/interview/CUIDialogPanel.tsx:79-121`
  - 已有完整的工具执行帧 UI：状态图标（running/completed/error）、中文名称映射
  - 已有可见性管理逻辑（新增时展示，完成后 1.5s 自动消失）
- **`TOOL_NAME_CN` 映射表** — `src/components/interview/CUIDialogPanel.tsx:59-73`
  - 已有工具名称中文映射

### 需要做的改动

#### Story 1.1: 提取共享工具帧组件

- 将 `ToolExecutionFrame` + `TOOL_NAME_CN` 提取为 `src/components/os/agent-dialog/ToolExecutionFrame.tsx`
- 将 `ToolExecution` 类型导出为共享类型
- 从 `CUIDialogPanel` 改为引用共享组件

#### Story 1.2: AgentDialog 工具帧支持

- 当前 `AgentDialog`（`src/components/os/agent-host/AgentDialog.tsx`）通过 `/api/agent/sessions/[sessionId]/messages` 的非 SSE 方式调用
- SSE 流已发送 `tool_call` 事件（`data: { type: 'start'|'end', toolName, callId, ... }`）
- 需要改为使用 SSE 连接，收集 tool_call 事件，传给 `ToolExecutionFrame`

#### Story 1.3: SkillDialog 工具帧支持

- `SkillDialog`（`src/components/skills/SkillDialog.tsx`）同样使用非 SSE 消息接口
- 同样需要改为 SSE 连接，支持工具帧展示

### 技术要点

- SSE `tool_call` 事件格式已存在于 `/api/agent/sessions/[sessionId]/messages/route.ts:389-405`
- `type: 'start'` → `ToolExecution { status: 'running' }`
- `type: 'end'` → `ToolExecution { status: isError ? 'error' : 'completed' }`

---

## Part 2: 文件上传功能

### 背景

项目/Agent/RoleAgent/SkillDialog 都需要支持文件上传到对应的工作目录。

### 需求分析

| 入口 | 文件存放位置 | 说明 |
|------|------------|------|
| Project | `data/projects/{id}/` 下 | 通过 workspace 接口上传 |
| Agent | `data/agents/{id}/` 下 | 同 workspace 接口 |
| RoleAgent | `data/agents/{id}/` 下 | 同 workspace 接口 |
| Skill | `tmp/skills-upload/` 下 | 临时目录，不污染 skill 本身 |

### Story 2.1: 创建文件上传 API

- **新路由**: `POST /api/workspace/upload?basePath=...`
- 使用 `FormData` 接收文件
- 写入到 `basePath` 指定目录
- 返回上传后的文件信息（path, name, size）
- 安全校验：复用 `resolveAndCheck` 函数确保 basePath 在 ALLOWED_BASES 内

### Story 2.2: WorkspaceWindow 添加上传按钮

- 在 WorkspaceWindow toolbar 添加"上传文件"按钮
- 点击触发文件选择器
- 选择文件后调用上传 API
- 上传成功后刷新文件列表
- 支持多文件上传

### Story 2.3: AgentDialog 添加上传按钮

- 在 AgentDialog 底部状态栏已有一个"打开工作区"按钮
- 在其旁添加"上传文件"按钮（或使用图标）
- 上传到 agent 的 baseDir（`data/agents/{id}/`）
- 上传后显示通知

### Story 2.4: SkillDialog 添加上传按钮

- 在 SkillDialog 添加上传按钮
- 上传到临时目录（`tmp/skills-upload/`）
- 上传后可通过 workspace 窗口查看

### Story 2.5: Skill 文件查看

- Skill 上传的文件需要能通过某种方式查看
- 在 SkillDialog 中添加"查看上传文件"按钮，打开对应的 workspace 窗口
- 或直接提供简单的文件列表展示

---

## 实现顺序

1. **Story 1.1**: 提取共享 ToolExecutionFrame 组件（基础依赖）
2. **Story 1.2**: AgentDialog 工具帧支持
3. **Story 1.3**: SkillDialog 工具帧支持
4. **Story 2.1**: 创建文件上传 API
5. **Story 2.2**: WorkspaceWindow 上传支持
6. **Story 2.3**: AgentDialog 上传支持
7. **Story 2.4**: SkillDialog 上传支持
8. **Story 2.5**: Skill 文件查看

---

## 文件变更清单

| 文件 | 操作 | Story |
|------|------|-------|
| `src/components/os/agent-dialog/ToolExecutionFrame.tsx` | **新建** | 1.1 |
| `src/components/interview/CUIDialogPanel.tsx` | 编辑（改用共享组件） | 1.1 |
| `src/components/os/agent-host/AgentDialog.tsx` | 编辑（添加 SSE + 工具帧） | 1.2 |
| `src/components/skills/SkillDialog.tsx` | 编辑（添加 SSE + 工具帧） | 1.3 |
| `src/app/api/workspace/upload/route.ts` | **新建** | 2.1 |
| `src/components/os/workspace/WorkspaceWindow.tsx` | 编辑（添加上传） | 2.2 |
| `src/components/os/agent-host/AgentDialog.tsx` | 编辑（添加上传） | 2.3 |
| `src/components/skills/SkillDialog.tsx` | 编辑（添加上传） | 2.4 |
