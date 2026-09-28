# 持久化 Agent 架构设计

## 当前架构问题

### 现状
```
前端 → POST /api/agent/sessions (带 systemPrompt)
     → agentManager.getOrCreateAgent(sessionId, projectId, { systemPrompt })
     → 创建临时 Agent，systemPrompt 包含完整 SKILL.md 内容
```

**问题**：
1. SKILL.md 内容在每次请求时通过 systemPrompt 传输（浪费 token）
2. Agent 依赖前端传入配置，不是自主的
3. 无法支持 Agent 热重载（修改 SKILL.md 需要重启会话）
4. 不符合"Agent 读取 md 文件理解自己"的设计理念

## 新架构设计

### 核心理念

**Agent 是独立的后台进程**，拥有自己的工作目录和配置文件：

```
data/projects/{projectId}/
├── Agent.md          # Agent 身份定义
├── Tool.md           # Agent 可用工具
├── Skill.md          # Agent 技能定义（可选，或使用 skills/ 目录）
├── skills/           # 技能目录
│   ├── project-initialization/
│   │   └── SKILL.md
│   └── ontology-editor/
│       └── SKILL.md
├── output/           # Agent 输出目录
└── sessions/         # 会话历史
```

### 架构层次

```
┌─────────────────────────────────────────────────────────┐
│                    前端 (InterviewWindow)                │
│  - 启动/停止 Agent                                       │
│  - 发送消息                                              │
│  - 显示响应                                              │
└─────────────────────────────────────────────────────────┘
                            ↓ WebSocket/SSE
┌─────────────────────────────────────────────────────────┐
│              Agent Manager (后台服务)                    │
│  - 管理 Agent 生命周期                                   │
│  - 路由消息到对应 Agent                                  │
│  - 监控 Agent 状态                                       │
└─────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────┐
│         Project Agent (独立进程/线程)                    │
│  ┌───────────────────────────────────────────────────┐  │
│  │ 启动时读取：                                       │  │
│  │  - Agent.md  → 理解身份和职责                     │  │
│  │  - Tool.md   → 加载可用工具                       │  │
│  │  - Skill.md  → 加载技能定义                       │  │
│  └───────────────────────────────────────────────────┘  │
│  ┌───────────────────────────────────────────────────┐  │
│  │ 运行时：                                           │  │
│  │  - 接收消息                                        │  │
│  │  - 调用工具                                        │  │
│  │  - 输出到 output/ 目录                            │  │
│  │  - 保存会话到 sessions/ 目录                     │  │
│  └───────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────┘
```

## 实现方案

### 1. Agent 定义文件格式

#### Agent.md - Agent 身份定义

```markdown
---
agentId: project-initialization-agent
agentType: interview
version: 1.0.0
---

# 项目访谈 Agent

## 身份
我是 Oracle，OriginOS 的项目访谈助手。

## 职责
- 通过对话引导用户完成项目业务建模
- 识别行业领域和业务概念
- 生成结构化的业务模型

## 工作模式
- 采用两阶段模式：领域发现 → 业务精炼
- 主动提问，引导思考
- 实时记录和整理业务概念

## 输出产物
- output/interview-progress.md - 访谈进度记录
- output/business-model.json - 业务模型
- sessions/{sessionId}.json - 会话历史
```

#### Tool.md - 工具定义

```markdown
---
toolsVersion: 1.0.0
---

# 可用工具

## 文件工具
- write_file - 写入文件到项目目录
- read_file - 读取项目文件
- list_files - 列出目录文件

## 本体工具
- ontology_create - 创建本体实体
- ontology_update - 更新本体实体
- ontology_query - 查询本体实体

## 系统工具
- get_current_time - 获取当前时间
- log_message - 记录日志
```

#### Skill.md - 技能定义（可选）

如果 Agent 只有一个主要技能，可以直接在项目目录下放 Skill.md。
如果有多个技能，使用 skills/ 目录。

### 2. Agent 生命周期管理

#### 启动 Agent

```typescript
// src/lib/integrations/pi-agent/persistent-agent-manager.ts

export class PersistentAgentManager {
  private agents = new Map<string, PersistentAgent>();

  /**
   * 启动项目 Agent
   */
  async startAgent(projectId: string): Promise<PersistentAgent> {
    // 1. 检查是否已启动
    if (this.agents.has(projectId)) {
      return this.agents.get(projectId)!;
    }

    // 2. 读取 Agent 定义文件
    const agentDef = await this.loadAgentDefinition(projectId);
    const toolDef = await this.loadToolDefinition(projectId);
    const skillDef = await this.loadSkillDefinition(projectId);

    // 3. 创建 Agent 实例
    const agent = new PersistentAgent({
      projectId,
      agentDefinition: agentDef,
      toolDefinition: toolDef,
      skillDefinition: skillDef,
      workingDirectory: `data/projects/${projectId}`,
    });

    // 4. 初始化 Agent
    await agent.initialize();

    // 5. 缓存 Agent
    this.agents.set(projectId, agent);

    console.log(`[PersistentAgentManager] Agent started for project: ${projectId}`);
    return agent;
  }

  /**
   * 停止 Agent
   */
  async stopAgent(projectId: string): Promise<void> {
    const agent = this.agents.get(projectId);
    if (!agent) return;

    await agent.shutdown();
    this.agents.delete(projectId);

    console.log(`[PersistentAgentManager] Agent stopped for project: ${projectId}`);
  }

  /**
   * 获取运行中的 Agent
   */
  getAgent(projectId: string): PersistentAgent | null {
    return this.agents.get(projectId) || null;
  }

  /**
   * 从项目目录读取 Agent.md
   */
  private async loadAgentDefinition(projectId: string): Promise<AgentDefinition> {
    const filePath = `data/projects/${projectId}/Agent.md`;
    const content = await fs.readFile(filePath, 'utf-8');
    return parseAgentDefinition(content);
  }

  /**
   * 从项目目录读取 Tool.md
   */
  private async loadToolDefinition(projectId: string): Promise<ToolDefinition> {
    const filePath = `data/projects/${projectId}/Tool.md`;
    const content = await fs.readFile(filePath, 'utf-8');
    return parseToolDefinition(content);
  }

  /**
   * 从项目目录读取 Skill.md 或 skills/ 目录
   */
  private async loadSkillDefinition(projectId: string): Promise<SkillDefinition> {
    // 优先读取 Skill.md
    const skillFilePath = `data/projects/${projectId}/Skill.md`;
    if (await fs.pathExists(skillFilePath)) {
      const content = await fs.readFile(skillFilePath, 'utf-8');
      return parseSkillDefinition(content);
    }

    // 否则读取 skills/ 目录
    const skillsDir = `data/projects/${projectId}/skills`;
    if (await fs.pathExists(skillsDir)) {
      return await this.loadSkillsDirectory(skillsDir);
    }

    return { skills: [] };
  }
}
```

#### PersistentAgent 类

```typescript
// src/lib/integrations/pi-agent/persistent-agent.ts

export class PersistentAgent {
  private agent: OriginOSAgent;
  private projectId: string;
  private workingDirectory: string;
  private agentDefinition: AgentDefinition;
  private toolDefinition: ToolDefinition;
  private skillDefinition: SkillDefinition;
  private isRunning = false;

  constructor(config: PersistentAgentConfig) {
    this.projectId = config.projectId;
    this.workingDirectory = config.workingDirectory;
    this.agentDefinition = config.agentDefinition;
    this.toolDefinition = config.toolDefinition;
    this.skillDefinition = config.skillDefinition;
  }

  /**
   * 初始化 Agent
   */
  async initialize(): Promise<void> {
    // 1. 构建 system prompt（从 Agent.md + Skill.md）
    const systemPrompt = this.buildSystemPrompt();

    // 2. 创建 Agent 实例
    this.agent = await createOriginOSAgent({
      sessionId: `persistent-${this.projectId}`,
      systemPrompt,
      variables: {
        projectId: this.projectId,
        workingDirectory: this.workingDirectory,
      },
    });

    // 3. 注册工具（从 Tool.md）
    const tools = this.buildTools();
    this.agent.setTools(tools);

    // 4. 设置工具上下文
    setToolContext(`persistent-${this.projectId}`, {
      projectContext: {
        projectId: this.projectId,
        projectName: this.agentDefinition.name,
        currentPath: this.workingDirectory,
      },
      sessionId: `persistent-${this.projectId}`,
    });

    this.isRunning = true;
    console.log(`[PersistentAgent] Initialized for project: ${this.projectId}`);
  }

  /**
   * 处理消息
   */
  async handleMessage(message: string, sessionId: string): Promise<void> {
    if (!this.isRunning) {
      throw new Error('Agent is not running');
    }

    // 使用项目级别的 Agent，但保持会话隔离
    await this.agent.prompt(message);
  }

  /**
   * 关闭 Agent
   */
  async shutdown(): Promise<void> {
    if (this.agent) {
      this.agent.destroy();
    }
    removeToolContext(`persistent-${this.projectId}`);
    this.isRunning = false;
    console.log(`[PersistentAgent] Shutdown for project: ${this.projectId}`);
  }

  /**
   * 热重载配置（当 Agent.md/Tool.md/Skill.md 修改时）
   */
  async reload(): Promise<void> {
    console.log(`[PersistentAgent] Reloading configuration for project: ${this.projectId}`);

    // 重新读取定义文件
    const agentDef = await loadAgentDefinition(this.projectId);
    const toolDef = await loadToolDefinition(this.projectId);
    const skillDef = await loadSkillDefinition(this.projectId);

    // 更新配置
    this.agentDefinition = agentDef;
    this.toolDefinition = toolDef;
    this.skillDefinition = skillDef;

    // 重新构建 system prompt 和工具
    const systemPrompt = this.buildSystemPrompt();
    this.agent.setSystemPrompt(systemPrompt);

    const tools = this.buildTools();
    this.agent.setTools(tools);

    console.log(`[PersistentAgent] Reloaded for project: ${this.projectId}`);
  }

  /**
   * 从 Agent.md + Skill.md 构建 system prompt
   */
  private buildSystemPrompt(): string {
    let prompt = '';

    // Agent 身份定义
    if (this.agentDefinition.content) {
      prompt += `# AGENT DEFINITION\n\n${this.agentDefinition.content}\n\n`;
    }

    // 技能定义
    if (this.skillDefinition.content) {
      prompt += `# SKILLS\n\n${this.skillDefinition.content}\n\n`;
    }

    return prompt;
  }

  /**
   * 从 Tool.md 构建工具列表
   */
  private buildTools(): AgentTool[] {
    // 1. 获取内置工具
    const builtInTools = getAgentTools();

    // 2. 根据 Tool.md 过滤允许的工具
    const allowedToolNames = this.toolDefinition.allowedTools || [];

    if (allowedToolNames.length === 0) {
      // 如果没有指定，允许所有工具
      return builtInTools;
    }

    // 只返回允许的工具
    return builtInTools.filter(tool =>
      allowedToolNames.includes(tool.name)
    );
  }

  /**
   * 获取 Agent 状态
   */
  getStatus(): AgentStatus {
    return {
      projectId: this.projectId,
      isRunning: this.isRunning,
      agentType: this.agentDefinition.agentType,
      version: this.agentDefinition.version,
    };
  }
}
```

### 3. API 路由调整

#### 启动 Agent

```typescript
// src/app/api/agent/projects/[projectId]/start/route.ts

import { persistentAgentManager } from '@/lib/integrations/pi-agent/persistent-agent-manager';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const { projectId } = await params;

  try {
    const agent = await persistentAgentManager.startAgent(projectId);

    return NextResponse.json({
      success: true,
      data: {
        projectId,
        status: agent.getStatus(),
      },
    });
  } catch (error) {
    return NextResponse.json({
      success: false,
      error: {
        code: 'AGENT_START_FAILED',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
    }, { status: 500 });
  }
}
```

#### 停止 Agent

```typescript
// src/app/api/agent/projects/[projectId]/stop/route.ts

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const { projectId } = await params;

  try {
    await persistentAgentManager.stopAgent(projectId);

    return NextResponse.json({
      success: true,
      data: { projectId },
    });
  } catch (error) {
    return NextResponse.json({
      success: false,
      error: {
        code: 'AGENT_STOP_FAILED',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
    }, { status: 500 });
  }
}
```

#### 发送消息（使用持久化 Agent）

```typescript
// src/app/api/agent/projects/[projectId]/messages/route.ts

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const { projectId } = await params;
  const body = await request.json();

  // 获取运行中的 Agent
  const agent = persistentAgentManager.getAgent(projectId);
  if (!agent) {
    return NextResponse.json({
      success: false,
      error: {
        code: 'AGENT_NOT_RUNNING',
        message: 'Agent is not running. Please start the agent first.',
      },
    }, { status: 400 });
  }

  // 检查是否请求流式响应
  const acceptHeader = request.headers.get('accept') || '';
  const wantsStreaming = acceptHeader.includes('text/event-stream');

  if (wantsStreaming) {
    // 返回 SSE 流
    const stream = createEventStream(agent, body.content, body.sessionId);
    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      },
    });
  }

  // 非流式响应
  await agent.handleMessage(body.content, body.sessionId);

  return NextResponse.json({
    success: true,
    data: { message: 'Message sent' },
  });
}
```

### 4. 前端调整

#### InterviewWindow 使用持久化 Agent

```typescript
// src/components/interview/InterviewWindow.tsx

export function InterviewWindow({ projectId, onClose }: InterviewWindowProps) {
  const [agentStatus, setAgentStatus] = useState<'stopped' | 'starting' | 'running' | 'error'>('stopped');

  // 启动 Agent
  const startAgent = useCallback(async () => {
    setAgentStatus('starting');
    try {
      const res = await fetch(`/api/agent/projects/${projectId}/start`, {
        method: 'POST',
      });
      const data = await res.json();

      if (data.success) {
        setAgentStatus('running');
        console.log('[InterviewWindow] Agent started:', data.data.status);
      } else {
        setAgentStatus('error');
        console.error('[InterviewWindow] Failed to start agent:', data.error);
      }
    } catch (error) {
      setAgentStatus('error');
      console.error('[InterviewWindow] Error starting agent:', error);
    }
  }, [projectId]);

  // 停止 Agent
  const stopAgent = useCallback(async () => {
    try {
      await fetch(`/api/agent/projects/${projectId}/stop`, {
        method: 'POST',
      });
      setAgentStatus('stopped');
      console.log('[InterviewWindow] Agent stopped');
    } catch (error) {
      console.error('[InterviewWindow] Error stopping agent:', error);
    }
  }, [projectId]);

  // 发送消息（使用持久化 Agent）
  const sendMessage = useCallback(async (content: string) => {
    if (agentStatus !== 'running') {
      console.warn('[InterviewWindow] Agent is not running');
      return;
    }

    const eventSource = new EventSource(
      `/api/agent/projects/${projectId}/messages?content=${encodeURIComponent(content)}`
    );

    eventSource.onmessage = (event) => {
      const data = JSON.parse(event.data);
      // 处理消息...
    };

    eventSource.onerror = () => {
      eventSource.close();
    };
  }, [projectId, agentStatus]);

  // 组件挂载时启动 Agent
  useEffect(() => {
    startAgent();
    return () => {
      stopAgent();
    };
  }, [startAgent, stopAgent]);

  return (
    <div>
      {/* Agent 状态指示器 */}
      <div className="agent-status">
        {agentStatus === 'running' && <span>🟢 Agent 运行中</span>}
        {agentStatus === 'starting' && <span>🟡 Agent 启动中...</span>}
        {agentStatus === 'stopped' && <span>⚪ Agent 已停止</span>}
        {agentStatus === 'error' && <span>🔴 Agent 错误</span>}
      </div>

      {/* 对话界面 */}
      {/* ... */}
    </div>
  );
}
```

## 优势对比

### 当前架构
```
❌ 每次请求传输完整 SKILL.md（浪费 token）
❌ Agent 依赖前端配置
❌ 无法热重载
❌ 不符合"Agent 自主理解"的理念
```

### 新架构
```
✅ Agent 启动时读取配置文件（一次性）
✅ Agent 独立运行，自主理解能力
✅ 支持热重载（修改 md 文件后调用 reload）
✅ 前端只负责启动/停止/发送消息
✅ 符合 openclaw 模式
```

## 迁移路径

### Phase 1: 创建持久化 Agent 基础设施
1. 实现 `PersistentAgent` 类
2. 实现 `PersistentAgentManager`
3. 添加 Agent 启动/停止 API

### Phase 2: 调整前端
1. 修改 `InterviewWindow` 使用新 API
2. 添加 Agent 状态显示
3. 移除 systemPrompt 传输逻辑

### Phase 3: 项目模板
1. 创建默认的 Agent.md 模板
2. 创建默认的 Tool.md 模板
3. 项目初始化时自动生成这些文件

### Phase 4: 热重载支持
1. 监听 md 文件变化
2. 自动调用 `agent.reload()`
3. 通知前端 Agent 已重载

## 总结

新架构将 Agent 从"临时的、依赖前端配置的"转变为"持久化的、自主理解能力的"后台进程，更符合 Agent OS 的设计理念。
