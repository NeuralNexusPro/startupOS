# Pi Agent 工具注册修复文档

## 问题描述

业务访谈（`project-initialization` skill）执行时，SKILL.md 中指示 Agent 调用 `write_file` 工具生成访谈进度 Markdown 文档，但文档没有生成。

## 根本原因

`agentManager.getOrCreateAgent()` 创建 Agent 时没有注册内置工具（file tools, ontology tools, system tools, bash tools），导致 Agent 无法调用 `write_file` 等工具。

对比：
- ✅ `store.ts` 中的 `initialize()` 正确调用了 `initializeBuiltInTools()` 和 `agent.setTools(getAgentTools())`
- ❌ `agent-manager.ts` 中的 `getOrCreateAgent()` 缺少工具注册逻辑

## 修复方案

### 1. 导入工具注册函数

```typescript
// src/lib/integrations/pi-agent/agent-manager.ts
import { initializeBuiltInTools, getAgentTools } from './tools/index';
import { setToolContext, removeToolContext } from './tools/context';
```

### 2. 在创建 Agent 时注册工具

```typescript
async getOrCreateAgent(
  sessionId: string,
  projectId: string,
  options?: {
    systemPrompt?: string;
    agentType?: string;
  }
): Promise<OriginOSAgent> {
  // ... 缓存检查逻辑 ...

  // 创建新 Agent 时：

  // 1. 初始化内置工具（全局注册）
  initializeBuiltInTools();

  // 2. 设置工具执行上下文（会话级别）
  setToolContext(sessionId, {
    projectContext: { projectId, projectName: options?.agentType || 'Agent Session' },
    sessionId,
  });

  // 3. 创建 Agent
  const agent = createOriginOSAgent({
    sessionId,
    systemPrompt: options?.systemPrompt,
    variables: {
      projectId,
      projectName: options?.agentType || 'Agent Session',
    },
  });

  // 4. 注册工具到 Agent 实例
  agent.setTools(getAgentTools());

  return agent;
}
```

### 3. 清理时移除工具上下文

```typescript
removeAgent(sessionId: string): boolean {
  const entry = this.agents.get(sessionId);
  if (!entry) {
    return false;
  }

  entry.agent.destroy();
  removeToolContext(sessionId);  // 清理工具上下文
  this.agents.delete(sessionId);
  return true;
}
```

## 工具上下文机制

### 为什么需要工具上下文？

文件工具（`write_file`, `read_file` 等）需要知道当前项目的 `projectId`，以便将文件路径解析到正确的项目目录：

```
相对路径: output/interview-progress.md
↓ 解析为
绝对路径: data/projects/{projectId}/output/interview-progress.md
```

### 工具上下文流程

1. **设置上下文**：`setToolContext(sessionId, { projectContext, sessionId })`
   - 在创建 Agent 时调用
   - 将 `projectId` 与 `sessionId` 关联

2. **获取上下文**：`getToolContext(sessionId)`
   - 在工具执行时调用
   - 返回该会话的 `projectContext`

3. **清理上下文**：`removeToolContext(sessionId)`
   - 在销毁 Agent 时调用
   - 防止内存泄漏

## 完整执行流程

### 业务访谈场景

```
1. InterviewWindow.tsx
   ↓ 加载 SKILL.md 和 Agent.md
   ↓ 调用 initialize(sessionId, projectContext, { systemPrompt })

2. use-pi-agent-session.ts
   ↓ POST /api/agent/sessions
   ↓ 创建会话，存储 systemPrompt

3. 用户发送消息
   ↓ POST /api/agent/sessions/{sessionId}/messages

4. messages/route.ts
   ↓ agentSessionService.getSession(sessionId)
   ↓ agentManager.getOrCreateAgent(sessionId, projectId, { systemPrompt, agentType })

5. agent-manager.ts (修复后)
   ↓ initializeBuiltInTools()           // 注册所有内置工具
   ↓ setToolContext(sessionId, context) // 设置项目上下文
   ↓ createOriginOSAgent(...)           // 创建 Agent
   ↓ agent.setTools(getAgentTools())    // 注册工具到 Agent

6. Agent 执行
   ↓ 读取 systemPrompt (包含 SKILL.md)
   ↓ 理解指令："每次回复后调用 write_file 保存进度"
   ↓ 调用 write_file('output/interview-progress.md', content)

7. file-tools.ts
   ↓ getToolContext(sessionId)          // 获取 projectContext
   ↓ 解析路径: data/projects/{projectId}/output/interview-progress.md
   ↓ 写入文件
```

## 验证方法

### 1. 启动开发服务器

```bash
npm run dev
```

### 2. 测试业务访谈

1. 打开 http://localhost:3000
2. 创建新项目或打开现有项目
3. 启动项目访谈
4. 与 Agent 对话（例如："我想做一个电商平台"）
5. 检查文件是否生成：

```bash
ls data/projects/{projectId}/output/interview-progress.md
```

### 3. 查看日志

开发模式下，`agent-manager.ts` 会输出调试日志：

```
[AgentManager] Creating new agent for session: project-initialization-xxx
[AgentManager] Agent created, isInitialized: true
[ToolRegistry] 已注册 N 个工具
```

## 相关文件

- `src/lib/integrations/pi-agent/agent-manager.ts` - Agent 管理器（已修复）
- `src/lib/integrations/pi-agent/store.ts` - Zustand store（参考实现）
- `src/lib/integrations/pi-agent/tools/index.ts` - 工具注册入口
- `src/lib/integrations/pi-agent/tools/context.ts` - 工具上下文管理
- `src/lib/integrations/pi-agent/tools/file-tools.ts` - 文件工具实现
- `src/app/api/agent/sessions/[sessionId]/messages/route.ts` - 消息 API
- `src/components/interview/InterviewWindow.tsx` - 访谈窗口组件
- `skills/project-initialization/SKILL.md` - 访谈技能定义

## 后续优化建议

### 1. Agent.md 和 Tool.md 支持

用户提到希望支持项目特定的 Agent.md 和 Tool.md 定义。当前实现：

- ✅ Agent.md：已支持，通过 `loadAgentDefinition(projectId)` 加载
- ❌ Tool.md：未实现，需要扩展工具注册机制

建议实现：

```typescript
// 1. 在项目目录下创建 Tool.md
data/projects/{projectId}/Tool.md

// 2. 在 agent-manager.ts 中加载项目特定工具
async function loadProjectTools(projectId: string): Promise<AgentTool[]> {
  const res = await fetch(`/api/projects/${projectId}/tools`);
  const data = await res.json();
  return data.success ? data.data.tools : [];
}

// 3. 注册项目工具
const projectTools = await loadProjectTools(projectId);
agent.setTools([...getAgentTools(), ...projectTools]);
```

### 2. 工具执行日志

添加工具执行日志，便于调试：

```typescript
// file-tools.ts
export const fileTools = [
  {
    name: 'write_file',
    execute: async (params) => {
      console.log('[write_file] Writing to:', params.filePath);
      console.log('[write_file] Project context:', getToolContext(sessionId));
      // ... 执行逻辑
      console.log('[write_file] Success');
    }
  }
];
```

### 3. 工具权限控制

不同 Agent 类型可能需要不同的工具权限：

```typescript
const toolPermissions = {
  'project-initialization': ['write_file', 'read_file', 'list_files'],
  'ontology-editor': ['ontology_create', 'ontology_update', 'ontology_query'],
  'task-manager': ['task_create', 'task_update', 'task_query'],
};

const allowedTools = getAgentTools().filter(tool =>
  toolPermissions[agentType]?.includes(tool.name)
);
agent.setTools(allowedTools);
```

## 总结

修复完成后，Pi Agent 在通过 API 路由创建时会正确注册内置工具，使得 SKILL.md 中的工具调用指令能够正常执行。业务访谈过程中，Agent 会按照 SKILL.md 的指示调用 `write_file` 生成访谈进度 Markdown 文档。

---

**修复日期**: 2026-04-09
**修复人**: Claude (Sonnet 4.6)
**相关 Issue**: 业务访谈进度文档未生成
