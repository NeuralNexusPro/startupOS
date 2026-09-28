# 项目初始化架构设计

## 概述

当用户完成项目访谈后，系统需要创建一个完整的项目文件系统结构，包含标准化的目录和文件，并启动一个在项目上下文中运行的 Pi Agent。

## 核心需求

1. **项目创建** - 基于访谈结果创建项目元数据
2. **目录结构** - 创建标准化的项目目录结构
3. **技能复制** - 将相关技能复制到项目目录
4. **Agent 配置** - 创建 AGENT.md 文件定义项目规则
5. **Agent 启动** - 在项目上下文中启动 Pi Agent

## 架构设计

### 1. 项目目录结构

```
data/projects/{project-id}/
├── project.json              # 项目元数据
├── AGENT.md                  # Agent 行为规则和项目约定
├── reference/                # 参考文件和知识库
│   ├── business-model.json   # 访谈生成的业务模型
│   ├── domain-knowledge.md   # 领域知识文档
│   └── requirements.md       # 需求文档
├── skills/                   # 项目技能副本
│   ├── project-initialization/
│   │   └── SKILL.md
│   └── {other-skills}/
│       └── SKILL.md
├── output/                   # Agent 输出文件
│   ├── documents/            # 生成的文档
│   ├── diagrams/             # 生成的图表
│   └── code/                 # 生成的代码
└── sessions/                 # Agent 会话历史
    └── {session-id}.json
```

### 2. 数据流

```
用户完成访谈
    ↓
提取业务模型 JSON
    ↓
生成项目标题（基于业务模型）
    ↓
调用 POST /api/projects/initialize
    ↓
创建项目目录结构
    ↓
复制技能文件
    ↓
生成 AGENT.md
    ↓
保存业务模型到 reference/
    ↓
初始化 Pi Agent 会话（项目上下文）
    ↓
返回项目 ID 和 Agent 会话 ID
```

### 3. API 设计

#### POST /api/projects/initialize

创建项目并初始化完整的文件系统结构。

**Request:**
```typescript
{
  businessModel: {
    projectName: string;
    industry: string;
    background: string;
    scenarios: Array<{name: string; description: string}>;
    entities: Array<{
      name: string;
      definition: string;
      properties: Record<string, any>;
    }>;
    relationships: Array<{
      from: string;
      to: string;
      type: string;
      cardinality: string;
    }>;
    businessRules: Array<{
      name: string;
      description: string;
      condition: string;
      action: string;
    }>;
  };
  skillsToInclude?: string[];  // 默认包含 project-initialization
  userId?: string;
}
```

**Response:**
```typescript
{
  success: true;
  data: {
    project: Project;
    agentSessionId: string;
    projectPath: string;
  };
}
```

### 4. 核心服务

#### ProjectInitializationService

```typescript
class ProjectInitializationService {
  /**
   * 初始化项目
   */
  async initializeProject(params: {
    businessModel: BusinessModel;
    skillsToInclude?: string[];
    userId?: string;
  }): Promise<{
    project: Project;
    agentSessionId: string;
    projectPath: string;
  }>;

  /**
   * 创建项目目录结构
   */
  private async createProjectStructure(projectId: string): Promise<void>;

  /**
   * 复制技能到项目目录
   */
  private async copySkillsToProject(
    projectId: string,
    skillNames: string[]
  ): Promise<void>;

  /**
   * 生成 AGENT.md 文件
   */
  private async generateAgentMd(
    projectId: string,
    businessModel: BusinessModel
  ): Promise<void>;

  /**
   * 保存业务模型到 reference/
   */
  private async saveBusinessModel(
    projectId: string,
    businessModel: BusinessModel
  ): Promise<void>;

  /**
   * 初始化 Agent 会话
   */
  private async initializeAgentSession(
    projectId: string,
    projectName: string
  ): Promise<string>;
}
```

### 5. AGENT.md 模板

```markdown
# {Project Name} - Agent 行为规则

## 项目概述

**行业**: {industry}
**背景**: {background}

## 项目目录结构

- `reference/` - 参考文件和知识库，包含业务模型、领域知识
- `skills/` - 项目技能，定义 Agent 可执行的操作
- `output/` - Agent 输出文件，所有生成的内容都应放在这里
- `sessions/` - 会话历史记录

## Agent 行为规则

### 文件生成规则

1. **输出位置** - 所有生成的文件必须放在 `output/` 目录下
   - 文档 → `output/documents/`
   - 图表 → `output/diagrams/`
   - 代码 → `output/code/`

2. **文件命名** - 使用描述性名称，包含日期时间戳
   - 格式: `{type}-{description}-{timestamp}.{ext}`
   - 示例: `doc-user-journey-20260408.md`

3. **引用规则** - 引用项目文件时使用相对路径
   - 业务模型: `../reference/business-model.json`
   - 技能文档: `../skills/{skill-name}/SKILL.md`

### 知识库使用

1. **业务模型** (`reference/business-model.json`)
   - 包含完整的业务实体、关系、规则
   - 生成内容时必须遵循业务模型定义

2. **领域知识** (`reference/domain-knowledge.md`)
   - 行业特定的术语、概念、最佳实践
   - 确保生成内容符合行业规范

### 技能执行

1. **可用技能** - 查看 `skills/` 目录了解可用技能
2. **技能调用** - 按照 SKILL.md 中的指示执行
3. **技能扩展** - 可以建议添加新技能到项目

## 业务实体

{entities list}

## 业务规则

{business rules list}

## 注意事项

- 始终保持输出文件的组织性
- 生成内容前检查 reference/ 中的业务模型
- 遵循项目的命名和结构约定
- 记录重要决策和变更
```

### 6. 实现步骤

#### Step 1: 创建 API 路由
- `src/app/api/projects/initialize/route.ts`

#### Step 2: 实现初始化服务
- `src/lib/services/project-initialization-service.ts`

#### Step 3: 更新 InterviewWindow
- 在访谈完成时调用初始化 API
- 传递业务模型 JSON
- 处理返回的项目和会话信息

#### Step 4: 文件系统操作
- 创建目录结构
- 复制技能文件
- 生成 AGENT.md
- 保存业务模型

#### Step 5: Agent 会话集成
- 使用项目路径作为工作目录
- 将 AGENT.md 内容注入到 systemPrompt
- 配置文件访问权限

### 7. 技术细节

#### 项目标题生成

```typescript
function generateProjectTitle(businessModel: BusinessModel): string {
  // 优先使用 projectName
  if (businessModel.projectName) {
    return businessModel.projectName;
  }

  // 基于行业和核心实体生成
  const mainEntity = businessModel.entities[0]?.name || '业务';
  return `${businessModel.industry} - ${mainEntity}管理系统`;
}
```

#### 技能复制

```typescript
async function copySkill(skillName: string, targetDir: string) {
  const sourceDir = path.join(process.cwd(), 'src/lib/skills/bundled', skillName);
  const targetPath = path.join(targetDir, skillName);

  // 复制 SKILL.md
  await fs.copyFile(
    path.join(sourceDir, 'SKILL.md'),
    path.join(targetPath, 'SKILL.md')
  );

  // 可选：复制 references/ 目录
  const referencesDir = path.join(sourceDir, 'references');
  if (existsSync(referencesDir)) {
    await fs.cp(referencesDir, path.join(targetPath, 'references'), {
      recursive: true
    });
  }
}
```

#### Agent 会话初始化

```typescript
async function initializeProjectAgent(
  projectId: string,
  projectName: string,
  agentMdContent: string
): Promise<string> {
  // 创建会话
  const session = await agentSessionService.createSession({
    projectId,
    projectName,
    systemPrompt: agentMdContent,
    agentType: 'project-agent',
  });

  // 配置工作目录
  const projectPath = getProjectPath(projectId);
  session.metadata = {
    ...session.metadata,
    workingDirectory: projectPath,
    outputDirectory: path.join(projectPath, 'output'),
  };

  return session.sessionId;
}
```

### 8. 安全考虑

1. **路径验证** - 确保所有文件操作在项目目录内
2. **权限控制** - Agent 只能访问项目目录
3. **文件大小限制** - 限制生成文件的大小
4. **并发控制** - 防止同时创建重复项目

### 9. 错误处理

1. **目录创建失败** - 回滚已创建的文件
2. **技能复制失败** - 记录错误但继续
3. **Agent 初始化失败** - 返回项目但标记为未初始化
4. **业务模型无效** - 验证必需字段

### 10. 扩展性

1. **模板系统** - 支持自定义 AGENT.md 模板
2. **技能市场** - 从技能库选择要包含的技能
3. **项目类型** - 不同类型项目使用不同模板
4. **版本控制** - 集成 Git 进行版本管理

## 实现优先级

### P0 (核心功能)
- [ ] 创建项目目录结构
- [ ] 生成 AGENT.md
- [ ] 保存业务模型
- [ ] 初始化 Agent 会话

### P1 (重要功能)
- [ ] 复制技能文件
- [ ] 项目标题生成
- [ ] 错误处理和回滚

### P2 (增强功能)
- [ ] 模板定制
- [ ] 技能选择
- [ ] 版本控制集成

## 测试计划

1. **单元测试**
   - 目录创建
   - 文件复制
   - AGENT.md 生成
   - 标题生成

2. **集成测试**
   - 完整初始化流程
   - Agent 会话创建
   - 文件系统操作

3. **端到端测试**
   - 从访谈到项目创建
   - Agent 在项目上下文中运行
   - 文件生成和组织
