# OriginOS Agent 生命周期架构设计

**版本：** 1.0.0
**日期：** 2026-03-19
**参考：** OpenClaw Agent Lifecycle

---

## 1. 设计目标

参考 OpenClaw 的生命周期设计，为 OriginOS 建立独立、可扩展的 Agent 系统：

- **项目级别 Agent**：每个项目一个独立的 Agent，携带项目上下文
- **全局级别 Agent**：全局助手，跨项目提供通用服务
- **生命周期管理**：session 创建 → 配置加载 → 运行 → 清理
- **配置分离**：通过 workspace 文件（类似 AGENTS.md）管理 Agent 行为

---

## 2. OpenClaw 设计参考

### 2.1 核心机制

```
Session 启动
  ↓
加载 Workspace Bootstrap 文件
  ├─ AGENTS.md     (Agent 行为约束)
  ├─ SOUL.md       (Agent 人设/风格)
  ├─ TOOLS.md      (工具使用指导)
  └─ USER.md       (用户偏好)
  ↓
注入到 System Prompt
  ↓
PiAgent 运行
  ↓
Session 结束
```

### 2.2 关键特性

| 特性 | OpenClaw 实现 | OriginOS 借鉴价值 |
|------|---------------|-----------------|
| Bootstrap 文件 | workspace/*.md | ✓ 项目 Agent 配置文件 |
| 缓存机制 | inode/dev/size/mtime 身份缓存 | ✓ 避免 I/O 开销 |
| Hook 覆盖 | AgentBootstrapHook | ✓ 动态配置调整 |
| Token 限制 | maxChars 分配 | ✓ 控制 Prompt 大小 |
| Session 过滤 | subagent/cron 过滤 | ✓ 不同 Agent 类型差异化 |

---

## 3. OriginOS 架构设计

### 3.1 目录结构

```
originos/
├── data/
│   ├── agents/                      # Agent 数据目录
│   │   ├── global/                  # 全局 Agent
│   │   │   ├── GLOBAL.md            # 全局配置
│   │   │   ├── AGENTS.md            # 行为约束
│   │   │   └── MEMORY.md            # 长期记忆
│   │   │
│   │   └── projects/                # 项目 Agent
│   │       └── {project-id}/        # 每个项目独立
│   │           ├── PROJECT.md       # 项目上下文
│   │           ├── AGENTS.md        # 项目 Agent 约束
│   │           ├── SOUL.md          # Agent 人设
│   │           └── MEMORY.md        # 项目记忆
│   │
├── src/lib/
│   └── integrations/
│       └── pi-agent/
│           ├── agent/
│           │   ├── workspace.ts         # Workspace 管理
│           │   ├── bootstrap.ts         # Bootstrap 文件加载
│           │   ├── system-prompt.ts     # System Prompt 构建
│           │   └── lifecycle.ts         # 生命周期管理
│           │
│           ├── sessions/
│           │   ├── session-manager.ts   # Session 管理器
│           │   ├── session-store.ts     # Session 状态存储
│           │   └── session-context.ts   # Session 上下文
│           │
│           └── types.ts                  # 类型定义
```

### 3.2 Agent 类型定义

```typescript
// Agent 作用域
export enum AgentScope {
  GLOBAL = 'global',
  PROJECT = 'project',
}

// Agent 配置文件
export interface AgentWorkspaceConfig {
  scope: AgentScope;
  projectId?: string;
  files: {
    agents?: string;      // AGENTS.md
    soul?: string;        // SOUL.md
    project?: string;     // PROJECT.md (项目级)
    memory?: string;      // MEMORY.md
  };
}

// Session 上下文
export interface AgentSessionContext {
  sessionId: string;
  scope: AgentScope;
  projectId?: string;
  workspaceConfig: AgentWorkspaceConfig;
  systemPrompt: string;
  contextFiles: ContextFile[];
  initializedAt: number;
}
```

### 3.3 Workspace 文件系统

#### 3.3.1 全局 Agent 配置文件

**`data/agents/global/AGENTS.md`**
```markdown
# OriginOS Global Agent Configuration

## Agent Identity
You are OriginOS Global Assistant, a knowledgeable AI assistant
specialized in helping users navigate, organize, and manage
their personal knowledge ecosystem.

## Core Capabilities
- Project management and organization
- Knowledge graph queries
- File system navigation
- Task tracking and reminders
- Quick research and information retrieval

## Constraints
- Never access project-specific data unless explicitly requested
- Maintain separation between projects
- Respect user privacy settings
- Ask before making irreversible changes

## Interaction Style
- Concise and helpful
- Proactive suggestions for organization
- Context-aware responses across projects
```

#### 3.3.2 项目 Agent 配置文件

**`data/agents/projects/{project-id}/PROJECT.md`**
```markdown
# Project Context

## Project Metadata
- ID: {project-id}
- Name: {project-name}
- Type: {project-type}
- Created: {creation-date}

## Project Domain
- Primary Domain: {domain}
- Related Domains: {domains}
- Key Concepts: {concepts}

## Project Ontology
- Domains: {domain-count}
- Concepts: {concept-count}
- Relations: {relation-count}

## Workflow Notes
- Preferred Tools: {tools}
- Typical Tasks: {tasks}
```

**`data/agents/projects/{project-id}/AGENTS.md`**
```markdown
# {Project Name} Project Agent

## Agent Identity
You are a specialized agent for the {project-name} project.
You have deep knowledge of this project's ontology, structure,
and domain-specific workflows.

## Project-Specific Knowledge
- Domain Expertise: {expertise}
- Typical Interactions: {interactions}
- Project Conventions: {conventions}

## Tasks
- Ontology management and refinement
- Concept relationship analysis
- Project metadata updates
- Domain-specific research

## Constraints
- Stay within project scope
- Use established terminology
- Follow project-specific workflows
```

**`data/agents/projects/{project-id}/SOUL.md`**
```markdown
# Agent Persona

## Tone
Professional yet approachable, like a knowledgeable colleague
who understands both the big picture and implementation details.

## Personality
- Enthusiastic about the domain
- Methodical in analysis
- Patient with iterative refinement
- Proactive in suggesting improvements

## Communication Style
- Use domain terminology naturally
- Explain complex concepts simply
- Suggest, don't command
- Offer alternatives

## Response Patterns
- Start with key insight
- Provide context when relevant
- Suggest next steps
- Ask clarifying questions when needed
```

---

## 4. 生命周期实现

### 4.1 Workspace Bootstrap 加载

```typescript
// src/lib/integrations/pi-agent/agent/workspace.ts

export class AgentWorkspace {
  private cache = new Map<string, WorkspaceCacheEntry>();

  async loadBootstrapFiles(
    scope: AgentScope,
    projectId?: string
  ): Promise<WorkspaceBootstrapFile[]> {
    const workspaceDir = this.resolveWorkspaceDir(scope, projectId);

    const files: WorkspaceBootstrapFile[] = [
      {
        name: 'AGENTS.md',
        path: path.join(workspaceDir, 'AGENTS.md'),
      },
      {
        name: 'SOUL.md',
        path: path.join(workspaceDir, 'SOUL.md'),
      },
    ];

    if (scope === AgentScope.PROJECT && projectId) {
      files.unshift({
        name: 'PROJECT.md',
        path: path.join(workspaceDir, 'PROJECT.md'),
      });
    }

    return Promise.all(
      files.map(async (file) => ({
        ...file,
        content: await this.readFileWithCache(file.path),
        missing: !await this.fileExists(file.path),
      }))
    );
  }

  private async readFileWithCache(
    filePath: string
  ): Promise<string | undefined> {
    const stat = await fs.stat(filePath);
    const identity = `${stat.ino}:${stat.mtimeMs}`;

    const cached = this.cache.get(filePath);
    if (cached?.identity === identity) {
      return cached.content;
    }

    const content = await fs.readFile(filePath, 'utf-8');
    this.cache.set(filePath, { identity, content });
    return content;
  }
}
```

### 4.2 System Prompt 构建

```typescript
// src/lib/integrations/pi-agent/agent/system-prompt.ts

export async function buildAgentSystemPrompt(
  context: AgentSessionContext
): Promise<string> {
  const { scope, projectId, workspaceConfig, contextFiles } = context;

  const sections: string[] = [];

  // 1. Base Identity
  sections.push(`You are an OriginOS ${scope === AgentScope.GLOBAL ? 'Global' : 'Project'} Assistant.\n`);

  // 2. Project Context (for project agents)
  if (scope === AgentScope.PROJECT && projectId) {
    const projectFile = contextFiles.find(f => f.name === 'PROJECT.md');
    if (projectFile?.content) {
      sections.push(`\n## Project Context\n${projectFile.content}\n`);
    }
  }

  // 3. Agent Behavior
  const agentsFile = contextFiles.find(f => f.name === 'AGENTS.md');
  if (agentsFile?.content) {
    sections.push(`\n## Agent Guidelines\n${agentsFile.content}\n`);
  }

  // 4. Persona (SOUL.md)
  const soulFile = contextFiles.find(f => f.name === 'SOUL.md');
  if (soulFile?.content) {
    sections.push(`\n## Persona\n${soulFile.content}\n`);
  }

  return sections.join('');
}
```

### 4.3 生命周期管理

```typescript
// src/lib/integrations/pi-agent/agent/lifecycle.ts

export class AgentLifecycle {
  private workspace: AgentWorkspace;
  private sessionStore: SessionStore;

  async createSession(
    scope: AgentScope,
    projectId?: string
  ): Promise<AgentSessionContext> {
    const sessionId = `session-${scope}-${projectId || 'global'}-${Date.now()}`;

    // 1. 加载 workspace 配置
    const bootstrapFiles = await this.workspace.loadBootstrapFiles(
      scope,
      projectId
    );

    // 2. 过滤有效的 context files
    const contextFiles = bootstrapFiles.filter(f => !f.missing);

    // 3. 构建 system prompt
    const systemPrompt = await buildAgentSystemPrompt({
      sessionId,
      scope,
      projectId,
      workspaceConfig: {
        scope,
        projectId,
        files: {},
      },
      contextFiles,
      initializedAt: Date.now(),
    });

    // 4. 存储 session
    await this.sessionStore.save(sessionId, {
      sessionId,
      scope,
      projectId,
      systemPrompt,
      contextFiles,
      createdAt: Date.now(),
    });

    return {
      sessionId,
      scope,
      projectId,
      workspaceConfig: { scope, projectId },
      systemPrompt,
      contextFiles,
      initializedAt: Date.now(),
    };
  }

  async terminateSession(sessionId: string): Promise<void> {
    await this.sessionStore.delete(sessionId);
  }

  async getSession(sessionId: string): Promise<AgentSessionContext | null> {
    return this.sessionStore.get(sessionId);
  }
}
```

---

## 5. 与现有 CUI 实现的集成

### 5.1 修改 AgentDialogContent

在用户选择 Agent 时，根据 scope 和 projectId 创建对应的 session：

```typescript
// src/components/os/agent-dialog/AgentDialogContent.tsx

const initAgent = async () => {
  try {
    setAgentStatus(agentId, AgentStatus.RUNNING);

    const agentConfig = getAgentConfiguration(agentId);

    // 使用新的生命周期管理
    const lifecycle = new AgentLifecycle();
    const sessionContext = await lifecycle.createSession(
      agentConfig.scope,
      agentConfig.projectId
    );

    // 初始化 Pi Agent
    await initialize(
      sessionContext.sessionId,
      {
        projectId: agentConfig.projectId,
        projectName: agent.displayName,
      },
      {
        agentType: agentConfig.type,
        systemPrompt: sessionContext.systemPrompt,
      }
    );

  } catch (error) {
    console.error('[AgentDialogContent] Failed to initialize agent:', error);
    setAgentStatus(agentId, AgentStatus.ERROR);
  }
};
```

### 5.2 Agent 配置管理

```typescript
// src/lib/integrations/pi-agent/agent-config.ts

export interface AgentConfig {
  id: string;
  name: string;
  displayName: string;
  scope: AgentScope;
  projectId?: string;
  type: string;
  description?: string;
}

export const AGENT_CONFIGS: AgentConfig[] = [
  {
    id: 'global-assistant',
    name: 'global',
    displayName: '全局助手',
    scope: AgentScope.GLOBAL,
    type: 'global-assistant',
    description: '跨项目提供通用服务',
  },
  // 项目级 Agent，动态从项目中读取
];

export function getAgentConfigurations(): AgentConfig[] {
  // 从项目数据中动态添加项目级 Agent
  const projects = getActiveProjects();

  const projectAgents = projects.map(project => ({
    id: `project-${project.id}`,
    name: `project-${project.id}`,
    displayName: `${project.name} 助手`,
    scope: AgentScope.PROJECT as AgentScope,
    projectId: project.id,
    type: 'project-assistant',
    description: `针对 ${project.name} 项目的专用助手`,
  }));

  return [...AGENT_CONFIGS, ...projectAgents];
}
```

---

## 6. 实施路线图

### Phase 1: 基础架构（1-2天）
- [ ] 创建 workspace 目录结构
- [ ] 实现 AgentWorkspace 类
- [ ] 实现 bootstrap 文件加载
- [ ] 实现缓存机制

### Phase 2: 生命周期管理（1天）
- [ ] 实现 AgentLifecycle 类
- [ ] 实现 Session 存储
- [ ] 实现 system prompt 构建
- [ ] 添加单元测试

### Phase 3: UI 集成（1天）
- [ ] 修改 AgentDialogContent 使用新系统
- [ ] 添加 Agent 配置界面
- [ ] 实现 Agent 创建/删除功能

### Phase 4: 用户体验优化（1天）
- [ ] 添加 Agent 人设配置 UI
- [ ] 实现记忆持久化
- [ ] 性能优化（lazy loading, caching）

---

## 7. 验收标准

### 功能验收
- [ ] 全局 Agent 和项目 Agent 能够正确加载各自的配置
- [ ] System prompt 正确注入 workspace 文件内容
- [ ] Session 创建、运行、清理流程正常
- [ ] 配置文件修改后 Agent 能重新加载

### 性能验收
- [ ] Bootstrap 文件加载 < 100ms（使用缓存）
- [ ] Session 创建 < 200ms
- [ ] System prompt 生成 < 50ms

### 测试验收
- [ ] 单元测试覆盖率 > 80%
- [ ] 集成测试通过
- [ ] E2E 测试通过

---

**设计负责人：** Archersado
**审核状态：** 待审核
