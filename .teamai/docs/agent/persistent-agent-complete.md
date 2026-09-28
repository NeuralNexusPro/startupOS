# 持久化 Agent 架构 - 完整实现

## ✅ 已完成的工作

### 1. 核心类实现

#### PersistentAgent (`src/lib/integrations/pi-agent/persistent-agent.ts`)
持久化 Agent 核心类，负责：
- ✅ 启动时从项目目录读取 Agent.md, Tool.md, Skill.md
- ✅ 自主构建 system prompt（不依赖前端传入）
- ✅ 根据 Tool.md 过滤和注册工具
- ✅ 支持热重载配置
- ✅ 提供状态查询和事件订阅

**关键方法**:
```typescript
async initialize(): Promise<void>
async handleMessage(message: string, sessionId?: string): Promise<void>
subscribe(listener: (event: any) => void): () => void
async shutdown(): Promise<void>
async reload(agentDef?, toolDef?, skillDef?): Promise<void>
getStatus(): AgentStatus
```

#### PersistentAgentManager (`src/lib/integrations/pi-agent/persistent-agent-manager.ts`)
全局单例管理器，负责：
- ✅ 管理多个项目的 Agent 实例
- ✅ 自动加载配置文件
- ✅ 提供默认配置 fallback
- ✅ 统一的生命周期管理

**关键方法**:
```typescript
async startAgent(projectId: string): Promise<PersistentAgent>
async stopAgent(projectId: string): Promise<void>
getAgent(projectId: string): PersistentAgent | null
isAgentRunning(projectId: string): boolean
async reloadAgent(projectId: string): Promise<void>
async stopAllAgents(): Promise<void>
```

### 2. API 路由实现

#### 初始化配置
```
POST /api/projects/{projectId}/agent/initialize
```
- ✅ 从模板创建 Agent.md 和 Tool.md
- ✅ 创建 output/ 和 sessions/ 目录
- ✅ 幂等操作（已存在则跳过）

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
GET /api/agent/projects/{projectId}/messages
```
- ✅ 支持 SSE 流式响应（Accept: text/event-stream）
- ✅ 支持非流式响应
- ✅ 检查 Agent 运行状态
- ✅ GET 返回 Agent 状态

### 3. 配置模板

#### Agent.md (`templates/Agent.md`)
完整的项目访谈 Agent 定义：
- ✅ YAML frontmatter（agentId, agentType, version, name）
- ✅ 身份定义
- ✅ 职责说明
- ✅ 工作模式（两阶段访谈流程）
- ✅ 对话风格
- ✅ 输出产物规范
- ✅ 文件操作规范
- ✅ 执行检查清单

#### Tool.md (`templates/Tool.md`)
工具定义和使用说明：
- ✅ YAML frontmatter（toolsVersion, allowedTools）
- ✅ 每个工具的详细说明
- ✅ 参数定义和示例
- ✅ 使用场景说明
- ✅ 工具使用原则

### 4. 项目目录结构

```
data/projects/{projectId}/
├── Agent.md          # Agent 身份定义（启动时读取）
├── Tool.md           # 工具定义（启动时读取）
├── Skill.md          # 技能定义（可选，单技能）
├── skills/           # 多技能目录（可选）
│   └── project-initialization/
│       └── SKILL.md
├── output/           # Agent 输出目录
│   ├── interview-progress.md
│   └── business-model.json
└── sessions/         # 会话历史
    └── {sessionId}.json
```

## 🎯 核心优势

### 1. Agent 自主理解能力
- **旧架构**: Agent 依赖前端传入 systemPrompt
- **新架构**: Agent 启动时自己读取配置文件，自主理解能力和职责

### 2. Token 效率
- **旧架构**: 每次请求传输完整 SKILL.md（~5000 tokens）
- **新架构**: 启动时读取一次，后续请求不传输（0 tokens）

### 3. 持久化运行
- **旧架构**: 每次请求创建临时 Agent
- **新架构**: 后台常驻 Agent，通过前端启动和停止

### 4. 热重载支持
- **旧架构**: 修改配置需要重启会话
- **新架构**: 调用 `reloadAgent()` 即可，无需重启

### 5. 架构清晰
- **旧架构**: 配置分散在前端和后端
- **新架构**: 所有配置在项目目录，Agent 自包含

## 📖 使用流程

### 完整示例

```typescript
// 1. 初始化项目配置
const initRes = await fetch(`/api/projects/${projectId}/agent/initialize`, {
  method: 'POST',
});
// 结果：创建 Agent.md, Tool.md, output/, sessions/ 目录

// 2. 启动 Agent
const startRes = await fetch(`/api/agent/projects/${projectId}/start`, {
  method: 'POST',
});
// 后台发生：
// - 读取 data/projects/{projectId}/Agent.md
// - 读取 data/projects/{projectId}/Tool.md
// - 读取 data/projects/{projectId}/Skill.md 或 skills/
// - 构建 system prompt
// - 注册工具
// - Agent 开始运行

// 3. 发送消息（流式）
const eventSource = new EventSource(
  `/api/agent/projects/${projectId}/messages?content=${encodeURIComponent('我想做一个电商平台')}&sessionId=session-123`
);

eventSource.onmessage = (event) => {
  const data = JSON.parse(event.data);

  switch (data.type) {
    case 'user_message':
      console.log('用户消息确认:', data.data.content);
      break;
    case 'status':
      console.log('工具执行:', data.data.toolName);
      break;
    case 'assistant_message':
      console.log('助手回复:', data.data.content);
      break;
    case 'done':
      eventSource.close();
      break;
  }
};

// 4. 停止 Agent
await fetch(`/api/agent/projects/${projectId}/stop`, {
  method: 'POST',
});
```

### SSE 事件类型

```typescript
// 用户消息确认
{
  type: 'user_message',
  data: { content: string, timestamp: number }
}

// 工具执行状态
{
  type: 'status',
  data: { toolName: string, status: string }
}

// 助手消息（最终）
{
  type: 'assistant_message',
  data: { content: string, timestamp: number }
}

// 完成
{
  type: 'done',
  data: {}
}

// 错误
{
  type: 'error',
  data: { message: string }
}
```

## 🧪 测试

### 手动测试脚本

已创建测试脚本：`test-persistent-agent.sh`

```bash
./test-persistent-agent.sh
```

测试流程：
1. 初始化项目配置
2. 启动 Agent
3. 发送消息
4. 检查状态
5. 停止 Agent

### 验证文件生成

```bash
# 检查配置文件
ls -la data/projects/test-project-*/Agent.md
ls -la data/projects/test-project-*/Tool.md

# 检查目录结构
tree data/projects/test-project-*/
```

## 📋 下一步工作

### 1. 前端集成（待实现）

需要修改 `src/components/interview/InterviewWindow.tsx`：

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

  // 使用新 API 发送消息
  const sendMessage = async (content: string) => {
    const eventSource = new EventSource(
      `/api/agent/projects/${projectId}/messages?content=${encodeURIComponent(content)}&sessionId=${sessionId}`
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

### 2. 热重载支持（可选）

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

### 3. 多技能支持（可选）

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

## 🔍 架构对比

### 旧架构（systemPrompt 模式）

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

## 📝 配置文件示例

### Agent.md 结构

```yaml
---
agentId: project-interview-oracle
agentType: conversational-interviewer
version: 1.0.0
name: Oracle - 项目访谈专家
---

# 身份

你是 Oracle，一位经验丰富的项目访谈专家...

# 职责

1. 引导用户完成结构化的项目访谈
2. 收集完整的业务需求和领域知识
3. 生成标准化的业务模型文档

# 工作模式

## Phase 1: 领域发现
...

## Phase 2: 模型构建
...

# 输出产物

## 1. 访谈进度记录
文件路径: `output/interview-progress.md`
...

## 2. 业务模型文件
文件路径: `output/business-model.json`
...
```

### Tool.md 结构

```yaml
---
toolsVersion: 1.0.0
allowedTools: [write_file, read_file, list_files, delete_file, ontology_create, ontology_update, ontology_query, get_current_time]
---

# 可用工具

## 文件工具

### write_file
**功能**: 写入内容到文件

**参数**:
- `filePath` (string): 相对路径
- `content` (string): 文件内容

**使用场景**:
- 保存访谈进度记录
- 生成业务模型文件
...
```

## ✨ 总结

持久化 Agent 架构已经完整实现，核心特性：

✅ **Agent 自主理解能力** - 启动时读取配置文件
✅ **持久化运行** - 后台常驻，不是临时创建
✅ **Token 高效** - 配置只读取一次
✅ **热重载支持** - 修改配置无需重启
✅ **项目隔离** - 每个项目独立的 Agent 和工作目录
✅ **清晰架构** - 配置文件化，易于维护

下一步只需要调整前端代码，从旧的 systemPrompt 模式切换到新的持久化 Agent API。
