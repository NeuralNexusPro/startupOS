# 多 Agent 协作 Prompt 构建架构

**版本：** 1.0.0
**日期：** 2026-05-19
**状态：** 设计

> ⚠️ **2026-05-20 架构审查（ARCH-RT-08）：** 本文档定义的 `buildCollaborationPrompt()` 7 层 prompt
> 当前**未在生产 Agent Worker 初始化路径调用**。worker 仍走 `initializeOriginOSAgent / initializePersistentAgent`，
> 拿到的 prompt 不含 Data.md / Process.md / 协作协议。修复归集到 Story 9.27。
> 详见 [架构审查报告](./multi-agent-runtime-architecture-review-2026-05-20.md)。

## 1. 背景

多 Agent 协作运行时（Epic 9）中，每个项目 Agent（如需求调研 Agent、项目管理 Agent）都有完整的配置文件体系：

| 文件 | 职责 | 示例内容 |
|------|------|---------|
| `Agent.md` | 身份、职责、工作边界 | 名称、类型、核心职责、参与的业务流程 |
| `Data.md` | 数据契约 | 操作的本体对象、字段定义、约束、操作权限、Agent 间数据边界 |
| `Process.md` | 处理流程 | 处理步骤、验证规则、异常处理、协作协议 |
| `Tool.md` | 工具配置 | allowedTools 列表、已安装技能 |
| `Taste.md` | 风格指南 | 沟通风格、质量准则 |
| `Memory.md` | 历史记忆 | 会话摘要、经验沉淀 |

**当前问题：** Agent Worker 初始化时走 `initializeOriginOSAgent()` → `buildProjectPromptLayers()` 路径，该路径只加载 `Agent.md / Tool.md / Taste.md / Memory.md / Knowledge.md / Patterns.md`，完全缺失 `Data.md` 和 `Process.md`。这导致协作 Agent 不知道自己的数据契约、处理流程、协作协议。

**根因：** `buildProjectPromptLayers()` 是为 interview 类型项目（从 0 构建业务模型）设计的 6 层 prompt，面向"访谈发现 → 业务精炼 → 模型审阅"场景。多 Agent 协作场景的 Agent 已有完整的业务定义，需要注入数据契约和处理流程。

## 2. 设计目标

1. 多 Agent 协作 Agent 必须获得完整的 7 层 system prompt，包含 Data.md 和 Process.md
2. 与现有 interview 类型 Agent 的 prompt 构建机制分离，互不影响
3. Agent Worker 有三种独立的初始化入口，各自服务于不同场景
4. 向后兼容：已有单 Agent 和 interview 场景行为不变

## 3. 架构设计

### 3.1 三种 Agent 初始化入口

```
agent-worker.mts — initialize()
  │
  ├─ agentType === "originos" || "skill"
  │   ├─ 检测到 Data.md + Process.md → initializeProjectAgent()      ← 多 Agent 协作
  │   └─ 否则 → initializeOriginOSAgent()                             ← 单 Agent / 首页
  │
  └─ 否则 → initializePersistentAgent()                               ← interview 项目
```

| 入口 | 适用场景 | Prompt 构建 | 文件来源 |
|------|---------|------------|---------|
| `initializeProjectAgent()` | 多 Agent 协作（DAG 执行） | `buildCollaborationPrompt()` | Agent.md + Data.md + Process.md + Tool.md + Taste.md + Memory.md |
| `initializeOriginOSAgent()` | 单 Agent / 首页内置应用 | `buildProjectPromptLayers()` | Agent.md + Tool.md + Taste.md + Memory.md + Knowledge.md + Patterns.md |
| `initializePersistentAgent()` | interview 类型项目 | 现有 PersistentAgent 内置 | 同上 |

### 3.2 新建模块：`project-collaboration-context.ts`

**路径：** `src/lib/integrations/pi-agent/project-agent/project-collaboration-context.ts`

```typescript
export interface ProjectCollaborationContext {
  agentMd: string;           // 身份、职责、工作边界
  dataMd: string;            // 数据契约（本体对象、字段、约束、操作权限）
  processMd: string;         // 处理流程、异常处理、协作协议
  toolMd: string | null;     // 工具配置（allowedTools + 技能列表）
  tasteMd: string | null;    // 风格指南
  memoryMd: string | null;   // 历史记忆
  allowedTools: string[];    // Tool.md frontmatter 提取
  workingDirectory: string;  // 项目工作目录
  projectId: string;         // 项目 ID
  agentId: string;           // Agent ID
}
```

**函数：**

```typescript
export async function loadProjectCollaborationContext(
  projectDir: string,
  projectId: string,
  agentId: string
): Promise<ProjectCollaborationContext | null>
```

Agent.md 不存在时返回 null；其他文件不存在时对应字段为 null。

### 3.3 新建模块：`collaboration-prompt.ts`

**路径：** `src/lib/integrations/pi-agent/project-agent/collaboration-prompt.ts`

7 层 prompt 结构：

| Layer | 标题 | 内容 | 来源 |
|-------|------|------|------|
| 1 | Role Identity | Agent.md 全文（frontmatter 中的 name/type/domain + 身份/职责/工作边界/参与流程/工作模式/原则） | `ctx.agentMd` |
| 2 | Data Contract | Data.md 中的本体对象定义（对象名、字段类型/约束/默认值、操作类型、Agent 间数据边界） | `ctx.dataMd` |
| 3 | Process Flow | Process.md 中的处理步骤（触发条件、输入数据、验证规则、处理流程、输出数据、异常处理表） | `ctx.processMd` |
| 4 | Collaboration Protocol | Process.md 中的协作协议（被触发方/触发类型/传递数据 + 触发目标/触发类型/传递数据） | `ctx.processMd` |
| 5 | Toolbox | allowedTools 列表 + 已安装技能列表（从 Tool.md frontmatter + skills/ 目录扫描） | `ctx.toolMd` |
| 6 | Style Guide | Taste.md（沟通风格 + 质量准则，无则跳过） | `ctx.tasteMd` |
| 7 | Working Directory + Data Constraints | 工作目录 + "禁止臆造数据"强制指令 | hard-coded + `ctx.workingDirectory` |

**各层设计说明：**

- **Layer 1（Role Identity）**：注入 Agent.md 全文，让 LLM 完整理解 Agent 的身份定义，包括 frontmatter 中的结构化元数据和正文中的职责说明、工作边界、参与的业务流程、工作模式（启动/处理流程）、重要原则。

- **Layer 2（Data Contract）**：Data.md 是 Agent 的数据契约，定义了 Agent 可以操作的本体对象（名称、字段表含类型/约束/默认值、操作权限 read/create/update）、与其他 Agent 的数据边界（独占写入 vs 只读访问）。这是 Agent 知道"我能操作什么数据、怎么操作"的关键。

- **Layer 3（Process Flow）**：Process.md 是 Agent 的处理流程手册，包含分步骤的流程定义（触发条件、输入数据、验证规则、处理步骤、输出数据）和异常处理表（异常场景、检测条件、处理策略）。这是 Agent 知道"我收到任务后怎么一步步执行"的关键。

- **Layer 4（Collaboration Protocol）**：从 Process.md 中提取协作协议部分，包含"被触发"信息（谁触发我、什么触发类型、传递什么数据）和"触发其他"信息（我触发谁、什么触发类型、传递什么数据）。这是 Agent 知道"我在协作网络中的位置"的关键。

- **Layer 5（Toolbox）**：Tool.md 中 `allowedTools` frontmatter 定义的工具白名单 + `skills/` 目录中扫描到的已安装技能（SKILL.md 文件）。Agent 通过这些工具和技能完成实际工作。

**Layer 7 新增数据约束指令（强制注入）：**

```
## 数据约束（强制）
- 执行任何操作前，必须先检查所需数据实例是否存在
- 如果数据缺失 → 禁止臆造，必须向用户确认
- 获得用户确认后，如有 create 权限可自行创建所需实例
- 绝对禁止编造不存在的数据
```

**导出函数：**

```typescript
export interface CollaborativePromptLayers {
  identity: string;
  dataContract: string;
  processFlow: string;
  collaborationProtocol: string;
  toolbox: string;
  style: string;
  permissions: string;
}

export function buildCollaborationPrompt(
  ctx: ProjectCollaborationContext,
  extraInstructions?: string
): string

export function assembleCollaborationPrompt(layers: CollaborativePromptLayers): string
```

### 3.4 Agent Worker 修改

**文件：** `src/modules/collaboration-runtime/sandbox/agent-worker.mts`

**修改 `initialize()` 分发逻辑：**

```typescript
if (this.agentType === "originos" || this.agentType === "skill") {
  // 检测是否为多 Agent 协作场景
  const dataMdPath = path.join(this.workingDirectory, 'Data.md');
  const processMdPath = path.join(this.workingDirectory, 'Process.md');
  const isCollaboration = existsSync(dataMdPath) && existsSync(processMdPath);

  if (isCollaboration) {
    await this.initializeProjectAgent(extra);
  } else {
    await this.initializeOriginOSAgent(extra);
  }
  return;
}
```

**新建 `initializeProjectAgent()` 方法：**

```typescript
private async initializeProjectAgent(
  extra?: {
    systemPrompt?: string;
    model?: { provider: string; id: string; baseUrl?: string; apiKey?: string };
    tools?: Array<{ name: string; description: string }>;
  }
): Promise<void> {
  // 1. 加载协作上下文
  const collabCtx = await loadProjectCollaborationContext(
    this.workingDirectory, this.projectId, this.agentId
  );

  // 2. 构建 7 层协作 prompt
  let systemPrompt = buildCollaborationPrompt(collabCtx);

  // 3. 创建 OriginOSAgent（对齐 initializeOriginOSAgent 的 Agent 创建流程）
  //    - 创建模型（auto model）
  //    - 注册工具（getAgentTools() 完整工具集）
  //    - 设置工具执行上下文
  //    - 创建 Agent 实例
  //    - 注入 Memory Core
  //    - 订阅事件
}
```

核心差异在于 prompt 构建，Agent 实例化流程与 `initializeOriginOSAgent()` 对齐（模型、工具、Memory、事件订阅）。

## 4. 与现有代码的关系

| 现有模块 | 用途 | 变更 |
|---------|------|------|
| `project-context.ts` | interview 类型项目上下文加载 | **不变** |
| `project-prompt.ts` | interview 类型 6 层 prompt 构建 | **不变** |
| `agent.ts`（OriginOSAgent） | Agent 核心包装类 | **不变** |
| `agent-worker.mts` | Agent Worker 初始化 | **新增** `initializeProjectAgent()` + 分发逻辑 |

新建模块与现有模块完全隔离，通过 `agent-worker.mts` 的动态 import 按需加载。

## 5. 文件清单

| 文件 | 操作 | 说明 |
|------|------|------|
| `src/lib/integrations/pi-agent/project-agent/project-collaboration-context.ts` | **NEW** | 多 Agent 协作上下文加载 |
| `src/lib/integrations/pi-agent/project-agent/collaboration-prompt.ts` | **NEW** | 协作 Agent 7 层 prompt 构建 |
| `src/modules/collaboration-runtime/sandbox/agent-worker.mts` | **MODIFY** | 新增 `initializeProjectAgent()` + 分发逻辑 |
| `docs/design/multi-agent-prompt-architecture.md` | **NEW** | 本设计文档 |
