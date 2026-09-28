# 持久化 Agent 架构实现总结

## 已完成的实现

### 1. 核心类

#### PersistentAgent (`src/lib/integrations/pi-agent/persistent-agent.ts`)
- ✅ 启动时从项目目录读取 Agent.md, Tool.md, Skill.md
- ✅ 自主构建 system prompt（不依赖前端传入）
- ✅ 根据 Tool.md 过滤和注册工具
- ✅ 支持热重载配置
- ✅ 提供状态查询

**关键方法**:
- `initialize()` - 初始化 Agent
- `handleMessage()` - 处理消息
- `shutdown()` - 关闭 Agent
- `reload()` - 热重载配置
- `getStatus()` - 获取状态

#### PersistentAgentManager (`src/lib/integrations/pi-agent/persistent-agent-manager.ts`)
- ✅ 管理多个项目的 Agent 实例
- ✅ 单例模式，全局唯一
- ✅ 自动加载配置文件
- ✅ 提供默认配置 fallback

**关键方法**:
- `startAgent(projectId)` - 启动 Agent
- `stopAgent(projectId)` - 停止 Agent
- `getAgent(projectId)` - 获取运行中的 Agent
- `reloadAgent(projectId)` - 热重载
- `stopAllAgents()` - 停止所有 Agent

### 2. API 路由

#### 启动 Agent
```
POST /api/agent/projects/{projectId}/start
```
- ✅ 读取项目配置文件
- ✅ 创建并初始化 Agent
- ✅ 返回 Agent 状态

#### 停止 Agent
```
POST /api/agent/projects/{projectId}/stop
```
- ✅ 优雅关闭 Agent
- ✅ 清理资源

#### 发送消息
```
POST /api/agent/projects/{projectId}/messages
```
- ✅ 支持 SSE 流式响应
- ✅ 支持非流式响应
- ✅ 检查 Agent 运行状态

#### 初始化配置
```
POST /api/projects/{projectId}/agent/initialize
```
- ✅ 从模板创建 Agent.md 和 Tool.md
- ✅ 创建必要的目录结构

### 3. 配置模板

#### Agent.md (`templates/Agent.md`)
- ✅ 完整的项目访谈 Agent 定义
- ✅ 包含身份、职责、工作模式
- ✅ 详细的输出产物说明
- ✅ 文件操作规范

#### Tool.md (`templates/Tool.md`)
- ✅ 工具列表和使用说明
- ✅ 每个工具的参数和示例
- ✅ 工具使用原则

## 项目目录结构

```
data/projects/{projectId}/
├── Agent.md          # Agent 身份定义（启动时读取）
├── Tool.md           # 工具定义（启动时读取）
├── Skill.md          # 技能定义（可选）
├── skills/           # 多技能目录（可选）
│   └── project-initialization/
│       └── SKILL.md
├── output/           # Agent 输出目录
│   ├── interview-progress.md
│   └── business-model.json
└── sessions/         # 会话历史
    └── {sessionId}.json
```

## 使用流程

### 1. 创建项目并初始化配置

```typescript
// 前端调用
const response = await fetch(`/api/projects/${projectId}/agent/initialize`, {
  method: 'POST',
});

// 结果：创建 Agent.md, Tool.md, output/, sessions/ 目录
```

### 2. 启动 Agent

```typescript
const response = await fetch(`/api/agent/projects/${projectId}/start`, {
  method: 'POST',
});

const data = await response.json();
console.log('Agent started:', data.data.status);
```

**后台发生的事情**:
1. 读取 `data/projects/{projectId}/Agent.md`
2. 读取 `data/projects/{projectId}/Tool.md`
3. 读取 `data/projects/{projectId}/Skill.md` 或 `skills/` 目录
4. 构建 system prompt
5. 注册工具
6. Agent 开始运行

### 3. 发送消息（流式）

```typescript
const eventSource = new EventSource(
  `/api/agent/projects/${projectId}/messages`
);

eventSource.onmessage = (event) => {
  const data = JSON.parse(event.data);

  switch (data.type) {
    case 'user_message':
      // 用户消息确认
      break;
    case 'status':
      // 工具执行状态
      console.log('Tool:', data.data.toolName);
      break;
    case 'assistant_message':
      // 最终助手消息
      console.log('Assistant:', data.data.content);
      break;
    case 'done':
      eventSource.close();
      break;
  }
};

// 发送消息
await fetch(`/api/agent/projects/${projectId}/messages`, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Accept': 'text/event-stream',
  },
  body: JSON.stringify({
    content: '我想做一个电商平台',
    sessionId: 'session-123',
  }),
});
```

### 4. 停止 Agent

```typescript
await fetch(`/api/agent/projects/${projectId}/stop`, {
  method: 'POST',
});
```

## 与旧架构的对比

### 旧架构（基于 systemPrompt）

```typescript
// 前端每次都传入完整的 SKILL.md
const skillContent = await fetch('/api/skills/project-initialization/content');

await fetch('/api/agent/sessions', {
  method: 'POST',
  body: JSON.stringify({
    projectId,
    systemPrompt: skillContent, // ❌ 每次传输完整内容
  }),
});
```

**问题**:
- ❌ 每次请求传输完整 SKILL.md（浪费 token）
- ❌ Agent 依赖前端配置
- ❌ 无法热重载
- ❌ 不符合"Agent 自主理解"理念

### 新架构（持久化 Agent）

```typescript
// 前端只需启动 Agent
await fetch(`/api/agent/projects/${projectId}/start`, {
  method: 'POST',
});

// Agent 自己读取配置文件
// ✅ 一次性读取，不重复传输
// ✅ Agent 自主理解能力
// ✅ 支持热重载
// ✅ 符合 Agent OS 理念
```

## 核心优势

### 1. Token 效率
- **旧**: 每次请求传输完整 SKILL.md（~5000 tokens）
- **新**: 启动时读取一次，后续请求不传输（0 tokens）

### 2. Agent 自主性
- **旧**: Agent 依赖前端传入配置
- **新**: Agent 启动时自己读取配置，自主理解能力

### 3. 热重载
- **旧**: 修改 SKILL.md 需要重启会话
- **新**: 调用 `reloadAgent()` 即可，无需重启

### 4. 架构清晰
- **旧**: 配置分散在前端和后端
- **新**: 所有配置在项目目录，Agent 自包含

## 下一步工作

### 1. 前端集成

需要修改 `InterviewWindow.tsx`:

```typescript
// 移除旧的 systemPrompt 加载逻辑
// 改为使用持久化 Agent API

export function InterviewWindow({ projectId }: Props) {
  const [agentStatus, setAgentStatus] = useState<'stopped' | 'running'>('stopped');

  // 启动 Agent
  useEffect(() => {
    const startAgent = async () => {
      // 1. 初始化配置文件
      await fetch(`/api/projects/${projectId}/agent/initialize`, {
        method: 'POST',
      });

      // 2. 启动 Agent
      const res = await fetch(`/api/agent/projects/${projectId}/start`, {
        method: 'POST',
      });

      if (res.ok) {
        setAgentStatus('running');
      }
    };

    startAgent();

    return () => {
      // 组件卸载时停止 Agent
      fetch(`/api/agent/projects/${projectId}/stop`, {
        method: 'POST',
      });
    };
  }, [projectId]);

  // 发送消息使用新 API
  const sendMessage = async (content: string) => {
    const eventSource = new EventSource(
      `/api/agent/projects/${projectId}/messages?content=${encodeURIComponent(content)}`
    );

    eventSource.onmessage = (event) => {
      // 处理 SSE 事件
    };
  };

  return (
    <div>
      {agentStatus === 'running' ? (
        <div>🟢 Agent 运行中</div>
      ) : (
        <div>⚪ Agent 已停止</div>
      )}
      {/* 对话界面 */}
    </div>
  );
}
```

### 2. 热重载支持

添加文件监听，自动重载：

```typescript
// src/lib/integrations/pi-agent/file-watcher.ts

import chokidar from 'chokidar';
import { persistentAgentManager } from './persistent-agent-manager';

export function watchProjectConfigs(projectId: string) {
  const projectDir = `data/projects/${projectId}`;

  const watcher = chokidar.watch(
    [
      `${projectDir}/Agent.md`,
      `${projectDir}/Tool.md`,
      `${projectDir}/Skill.md`,
    ],
    { ignoreInitial: true }
  );

  watcher.on('change', async (path) => {
    console.log(`[FileWatcher] Config changed: ${path}`);
    await persistentAgentManager.reloadAgent(projectId);
    console.log(`[FileWatcher] Agent reloaded for project: ${projectId}`);
  });

  return watcher;
}
```

### 3. 多技能支持

如果项目需要多个技能，使用 `skills/` 目录：

```
data/projects/{projectId}/
├── Agent.md
├── Tool.md
└── skills/
    ├── project-initialization/
    │   └── SKILL.md
    ├── ontology-editor/
    │   └── SKILL.md
    └── task-manager/
        └── SKILL.md
```

Agent 启动时会加载所有技能。

### 4. 测试

创建测试用例验证：

```typescript
// tests/persistent-agent.test.ts

describe('PersistentAgent', () => {
  it('should start agent and read config files', async () => {
    const agent = await persistentAgentManager.startAgent('test-project');
    expect(agent.getStatus().isRunning).toBe(true);
  });

  it('should handle messages', async () => {
    const agent = await persistentAgentManager.startAgent('test-project');
    await agent.handleMessage('Hello');
    // 验证响应
  });

  it('should reload config', async () => {
    const agent = await persistentAgentManager.startAgent('test-project');
    await persistentAgentManager.reloadAgent('test-project');
    // 验证配置已更新
  });
});
```

## 总结

持久化 Agent 架构已经完整实现，核心特性：

✅ **Agent 自主理解能力** - 启动时读取配置文件
✅ **持久化运行** - 后台常驻，不是临时创建
✅ **Token 高效** - 配置只读取一次
✅ **热重载支持** - 修改配置无需重启
✅ **项目隔离** - 每个项目独立的 Agent 和工作目录
✅ **清晰架构** - 配置文件化，易于维护

下一步只需要调整前端代码，从旧的 systemPrompt 模式切换到新的持久化 Agent API。
