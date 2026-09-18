# Epic 1: 项目初始化 Skill (Project Initialization Skill)

**Epic 编号:** 1
**Epic 名称:** 项目初始化 Skill (Project Initialization Skill)
**优先级:** 🔴 High
**状态:** Design
**负责人:** -

---

## 📋 Epic 描述

当用户点击"创建项目"时，通过 pi-agent 启动一个复合型的"项目初始化 Skill"。整个流程由 agent 驱动，通过灵活的对话访谈来收集项目信息，并动态使用 Ontology Skill 创建本体结构。

与旧版本的固化 5 步流程不同，新的设计使用 pi-agent 的 Skill 系统，让访谈过程自然流畅，由 agent 根据用户回答动态调整问题。

---

## 🎯 Epic 目标

### 核心目标

1. **Skill 驱动的访谈**: 使用 pi-agent 的 Skill 架构启动复合型项目初始化流程
2. **动态对话**: 由 agent 根据用户输入动态调整访谈方向，而非固化步骤
3. **实时本体构建**: 在访谈过程中实时使用 Ontology Skill 创建实体和关系
4. **灵活架构**: 基于 pi-agent-core 的调度系统，支持自定义 Skill 链

### 成功标准

- ✅ 用户启动项目初始化时，pi-agent 正确加载 project-initialization Skill
- ✅ 访谈流程由 agent 引导，根据用户回答智能追问
- ✅ 访谈过程中实时调用 Ontology Skill 创建 Project、Person、Task 等实体
- ✅ 用户可以在任何时候跳过或修改访谈内容
- ✅ 访谈完成后生成的本体结构完整且有效

---

## 🏗️ 架构设计

### 系统架构

```
┌─────────────────────────────────────────────────────────────────┐
│                      用户界面 (OriginOS)                         │
│  ┌────────────────┐                                              │
│  │  [创建项目]     │                                              │
│  └────────┬───────┘                                              │
└───────────┼──────────────────────────────────────────────────────┘
            │ 1. 启动 Skill 会话
            ↓
┌─────────────────────────────────────────────────────────────────┐
│                    pi-agent-core 调度层                          │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │  AgentSessionService                                      │   │
│  │  - createSession(projectId, projectName, agentType)       │   │
│  │  - addMessage(role, content, tools)                       │   │
│  │  - getSummary(sessionId)                                  │   │
│  └──────────────────────────────────────────────────────────┘   │
│            │                                                    │
└────────────┼────────────────────────────────────────────────────┘
             │ 2. 加载 project-initialization Skill
             ↓
┌─────────────────────────────────────────────────────────────────┐
│            project-initialization (复合 Skill)                   │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │  Skill 定义                                              │   │
│  │  name: project-initialization                             │   │
│  │  type: composite                                          │   │
│  │  dependencies: [ontology]                                  │   │
│  └──────────────────────────────────────────────────────────┘   │
│            │                                                    │
│  ┌────────┴──────────┐      ┌────────────────────────────┐    │
│  │                   │      │                            │    │
│  ↓                   ↓      ↓                            ↓    │
│ 访谈 Agent          →    Ontology Skill                │    │
│ (对话引导)              (实体创建)                      │    │
│  └───────┬──────────┘      └────────────────────────────┘    │
│          │                                                   │
└──────────┼────────────────────────────────────────────────────┘
           │ 3. 实时调用
           ↓
┌─────────────────────────────────────────────────────────────────┐
│                  memory/ontology/graph.jsonl                     │
│                                                                    │
│  {"op":"create","entity":{"id":"proj_001","type":"Project"...}}  │
│  {"op":"create","entity":{"id":"p_001","type":"Person"...}}     │
│  {"op":"relate","from":"proj_001","rel":"has_owner","to":"p_001"}}│
│                                                                    │
└─────────────────────────────────────────────────────────────────┘
```

### Skill 定义

```yaml
# skills/project-initialization/SKILL.md
name: project-initialization
description: Composite skill for project initialization through conversational interview and ontology building
type: composite

ontology:
  reads: [Project, Person, Task, Goal, Organization]
  writes: [Project, Person, Task, Goal, Action]
  preconditions:
    - "User wants to create a new project"
  postconditions:
    - "Created Project entity"
    - "Created Person entities for team members"
    - "Created Task entities from interview"
    - "Relations established between entities"

skills:
  - ontology  # Uses ontology skill for entity creation

system_prompt: |
  You are a project initialization assistant. Help users create their project ontology through natural conversation.

  Goals:
  1. Collect project information naturally through dialogue
  2. Use the ontology skill to create entities as information is gathered
  3. Adapt your questions based on the user's context and responses
  4. Allow users to skip or redirect the conversation at any time

  Available Entity Types:
  - Project: { name, description, status, owner, team[], goals[] }
  - Person: { name, email, organization? }
  - Task: { title, status, priority?, assignee?, due?, project? }
  - Goal: { description, target_date?, metrics[] }
  - Organization: { name, type? }

  Available Relation Types:
  - has_owner: Project -> Person
  - member_of: Person -> Organization
  - has_task: Project -> Task
  - has_goal: Project -> Goal
  - assigned_to: Task -> Person
  - blocks: Task -> Task
  - depends_on: Task -> Task

  Workflow:
  1. Start with an open question about the project
  2. After gathering key information, create the Project entity
  3. Ask about team members - create Person entities and relate to project
  4. Ask about goals and tasks - create Goal and Task entities
  5. Create appropriate relations between entities
  6. Offer to review and modify before completion

  Important:
  - Be conversational, not questionnaire-style
  - Let the user's answers guide the conversation direction
  - Create entities immediately when information is clear
  - Show the user what entities you're creating
  - Be ready to adjust based on user feedback
```

### 访谈流程对比

#### 旧版本 (固化流程)
```
步骤 1/5: 工作领域
├─ 固定问题: "你的工作领域是什么?"
├─ 用户输入: [文本框]
└─ 点击"下一步" →

步骤 2/5: 主要挑战
├─ 固定问题: "主要挑战是什么?"
├─ 用户输入: [文本框]
└─ 点击"下一步" →
...
```

#### 新版本 (Agent 驱动)
```
Agent: "你好！我想帮你创建一个新项目。你能先告诉我这个项目大概是什么吗？"
         ↑
    用户自然输入

Agent: "听起来是个很棒的想法！这个项目主要用来解决什么问题？"
         ↑
    根据用户回答动态追问

Agent: "明白了。让我先创建这个项目的本体结构..."
         ↑
    调用 Ontology Skill

[系统创建 Project 实体]

Agent: "项目已经创建好了。接下来，这个项目有哪些团队成员参与？"
         ↑
    绘制关系时自然的下一问
```

---

## 📝 Stories 列表

| Story | 标题 | 状态 | 优先级 |
|-------|------|------|--------|
| 1.1 | project-initialization Skill 定义 | 🔄 Design | Critical |
| 1.2 | pi-agent Skill 加载与路由 | ⏸️ Blocked | Critical |
| 1.3 | 对话引导 Agent (访谈逻辑) | ⏸️ Pending | High |
| 1.4 | Ontology Skill 集成 (实时创建) | ⏸️ Pending | High |
| 1.5 | 本体预览与编辑界面 | ⏸️ Pending | Medium |
| 1.6 | 项目创建完成与跳转 | ⏸️ Pending | High |

---

## 🔗 依赖关系

### 前置依赖
| 依赖内容 | 来源 Epic | 来源位置 | 状态 |
|---------|----------|---------|------|
| pi-agent-core 集成 | Epic 0 | `src/lib/features/agent/` | ✅ Complete |
| Agent Session 管理 | Epic 0 | `src/lib/features/agent/session-service.ts` | ✅ Complete |
| Ontology Skill | 外部 | `awesome-openclaw-skills-1/skills/ontology/` | ✅ Available |
| AppWindow 系统 | Epic OS | `src/components/os/window/` | ✅ Complete |

### 被依赖的模块
| 依赖模块 | 目的 |
|---------|------|
| OS 主页面/仪表板 | 提供创建项目入口 |
| 本体管理模块 | 存储和展示访谈结果 |
| 项目工作区 | 创建后跳转目标 |

---

## 📊 技术实现

### Skill 文件结构

```
skills/project-initialization/
├── SKILL.md              # Skill 定义 (frontmatter + 文档)
├── scripts/
│   ├── interview.py      # 访谈对话逻辑 (Python Agent)
│   └── skill.py          # Skill 入口和工具注册
└── references/
    ├── agent-prompts.md  # Agent 系统提示词
    └── examples.md       # 访谈示例
```

### TypeScript 集成

```typescript
// src/lib/skills/project-initialization/index.ts

export interface ProjectInitializationConfig {
  projectId: string;
  projectName: string;
  initialContext?: Record<string, unknown>;
}

export class ProjectInitializationSkill {
  constructor(private sessionService: AgentSessionService) {}

  async initialize(config: ProjectInitializationConfig): Promise<AgentSession> {
    // 创建 agent session，指定 composite skill
    const session = await this.sessionService.createSession({
      projectId: config.projectId,
      projectName: config.projectName,
      agentType: 'project-initialization',  // 使用 skill 类型
      systemPrompt: this.buildSystemPrompt(),
      projectContext: {
        ...config.initialContext,
        skillName: 'project-initialization',
      },
    });

    // 发送系统初始化消息
    await this.sessionService.addMessage(session.sessionId, {
      role: 'system',
      content: 'Project initialization skill loaded. Ready to interview.',
    });

    return session;
  }

  private buildSystemPrompt(): string {
    return readFileSync(
      path.join(process.cwd(), 'skills/project-initialization/SKILL.md'),
      'utf-8',
    ).split('---')[2]; // 读取 SKILL.md 的 system_prompt 部分
  }
}

export const projectInitializationSkill = new ProjectInitializationSkill(
  agentSessionService,
);
```

### API Route

```typescript
// src/app/api/projects/init/route.ts

import { NextRequest, NextResponse } from 'next/server';
import { projectInitializationSkill } from '@/lib/skills/project-initialization';

export async function POST(request: NextRequest) {
  const body = await request.json();
  const { projectId, projectName, initialContext } = body;

  const session = await projectInitializationSkill.initialize({
    projectId,
    projectName,
    initialContext,
  });

  return NextResponse.json({
    success: true,
    data: {
      sessionId: session.sessionId,
      projectContext: session.projectContext,
    },
  });
}
```

### React Hook

```typescript
// src/hooks/useProjectInitialization.ts

import { useState, useCallback } from 'react';
import { projectInitializationSkill } from '@/lib/skills/project-initialization';
import { useAppWindowManager } from '@/hooks/useAppWindowManager';
import AgentDialogContent from '@/components/os/agent-dialog/AgentDialogContent';

export function useProjectInitialization() {
  const [session, setSession] = useState<AgentSession | null>(null);
  const { openWindow } = useAppWindowManager();

  const startInitialization = useCallback(async (projectName: string) => {
    const projectId = `proj-${Date.now()}`;

    const agentSession = await projectInitializationSkill.initialize({
      projectId,
      projectName,
    });

    setSession(agentSession);

    // 打开 Agent 对话窗口
    openWindow({
      id: `window-${agentSession.sessionId}`,
      type: 'agent',
      title: `初始化项目: ${projectName}`,
      content: {
        type: 'component',
        component: AgentDialogContent,
        props: {
          agentId: 'project-initialization',
          sessionId: agentSession.sessionId,
        },
      },
      position: { x: 100, y: 100, width: 800, height: 600 },
    });
  }, [openWindow]);

  return {
    session,
    startInitialization,
  };
}
```

### Ontology 集成示例

```python
# scripts/interview.py 中的 Agent 工具调用

from ontology import OntologySkill

class InterviewAgent:
    def __init__(self):
        self.ontology = OntologySkill()

    async def create_project_from_interview(self, name: str, description: str):
        """访谈中收集到项目信息后立即创建"""
        project = self.ontology.create("Project", {
            "name": name,
            "description": description,
            "status": "planning"
        })
        return project

    async def add_team_member(self, project_id: str, member_name: str, role: str):
        """添加团队成员"""
        person = self.ontology.create("Person", {
            "name": member_name,
            "notes": f"Role: {role}"
        })
        self.ontology.relate(project_id, "has_owner", person["id"])
        return person

    async def add_goal(self, project_id: str, goal_text: str, deadline: str = None):
        """添加项目目标"""
        goal = self.ontology.create("Goal", {
            "description": goal_text,
            "target_date": deadline,
            "status": "active"
        })
        self.ontology.relate(project_id, "has_goal", goal["id"])
        return goal
```

---

## 📚 相关文档

### 设计文档
- [Epic 0 - 技术架构实施层](../epic-0/README.md) - pi-agent-core 集成
- [Epic OS - OS Interaction Experience](../epic-os/README.md) - AppWindow 系统
- [AGENTS.md](../../AGENTS.md) - 整体架构规约

### 外部参考
- [Ontology Skill](../../../awesome-openclaw-skills-1/skills/ontology/SKILL.md) - 本体技能文档
- [Ontology Schema](../../../awesome-openclaw-skills-1/skills/ontology/references/schema.md) - 实体类型定义
- [Ontology Python API](../../../awesome-openclaw-skills-1/skills/ontology/scripts/ontology.py) - Python 接口

---

## 🔄 变更历史

| 日期 | 变更内容 | 变更人 |
|------|---------|--------|
| 2026-03-02 | Epic 1 初始化 - 固化 5 步访谈流程 | original |
| 2026-03-20 | **重大重构**: 替换为 pi-agent + Skill 架构 | user |
| 2026-03-20 | 集成 Ontology Skill 用于实时本体构建 | user |

---

## 🎨 设计决策

### 为什么选择 Skill 而非固化流程？

| 方面 | 固化流程 | Skill 架构 |
|------|---------|-----------|
| 访谈灵活性 | 预定义问题，用户被限制 | Agent 动态追问，自然对话 |
| 信息收集 | 固定字段，可能遗漏 | 根据用户回答智能深入 |
| 本体创建 | 收集完一次性生成 | 收集过程中实时创建 |
| 用户体验 | 表单填写感强 | 对话式体验自然 |
| 可扩展性 | 修改需要改代码 | 配置系统提示词即可 |
| 认知负担 | 需要理解分类体系 | 自然语言描述即可 |

### 为什么需要在访谈过程中实时创建本体？

1. **反馈及时**: 用户看到实体被创建时，知道信息已被记录
2. **纠错容易**: 发现错误可以立即修正，不会等到最后才发现
3. **渐进式构建**: 复杂本体可以通过多轮对话逐步完善
4. **上下文感知**: Agent 可以根据已创建的实体决定下一步问什么

---

## 🚀 实施计划

### Phase 1: Skill 基础设施 (Story 1.1, 1.2)
- [ ] 创建 `skills/project-initialization/` 目录结构
- [ ] 编写 SKILL.md 定义文档
- [ ] 实现 Skill加载和路由逻辑
- [ ] 集成到 pi-agent-core 的调度系统

### Phase 2: 访谈对话 Agent (Story 1.3)
- [ ] 设计对话引导策略
- [ ] 实现自然语言处理和追问逻辑
- [ ] 编写 agent-prompts.md
- [ ] 实现对话状态管理

### Phase 3: Ontology 集成 (Story 1.4)
- [ ] 封装 Ontology Skill 的 Python 调用
- [ ] 实现实体创建工具函数
- [ ] 实现关系创建工具函数
- [ ] 处理实体冲突和错误

### Phase 4: 用户界面 (Story 1.5, 1.6)
- [ ] 实现本体预览组件
- [ ] 实现本体编辑功能
- [ ] 处理项目创建完成
- [ ] 集成到 OS 主页面入口

## 2026-09-14：访谈语义作为设计输入

后续项目设计需消费访谈确认的概念ID、定义、关系、业务状态和证据引用；未确认项保留为澄清项。同义合并与版本确认由ONT公共API承担，访谈UI负责呈现与确认。旧business-model.json迁移和兼容投影归ONT.3，不创建第二写入源。见[项目语义执行主线](../epic-ONT/project-semantic-execution-plan.md)。本条为规划，不改变现有实现状态。
