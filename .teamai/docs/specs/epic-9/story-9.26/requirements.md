# 需求 - Story 9.26

**Story:** 多 Agent 协作 Prompt 构建 — Data.md + Process.md 注入 + DAG Human-in-the-Loop
**Epic:** Epic 9 — Multi-Agent 协作运行时
**最后更新:** 2026-07-20

---

## 用户故事

> 作为协作运行时的项目 Agent（如需求调研 Agent、项目管理 Agent），我需要拿到完整的 system prompt，包含我的数据契约（Data.md）、处理流程（Process.md）、协作协议和工具技能。否则我只知道职责描述，不知道自己能操作哪些本体、字段约束是什么、处理步骤怎么做、与其他 Agent 如何协作。

> 作为 DAG 多 Agent 协作的用户，我需要在 Agent 遇到需要确认的情况时介入，而不是等 DAG 跑完。主入口是 DAG 拓扑图，实时显示节点状态，点击等待确认的节点可以进入 CUI 对话回复 Agent 的问题，确认后 DAG 自动推进下游。

---

## 问题

当前 Agent Worker 初始化走 `initializeOriginOSAgent()` → `buildProjectPromptLayers()` 路径，该路径只加载 `Agent.md / Tool.md / Taste.md / Memory.md / Knowledge.md / Patterns.md`，完全缺失 `Data.md` 和 `Process.md`。

这导致协作 Agent：
1. 不知道自己可以操作哪些本体对象、字段、权限
2. 不知道处理流程是什么步骤、遇到异常怎么处理
3. 不知道与其他 Agent 的数据边界
4. 不知道协作协议（被谁触发、触发谁、传递什么数据）

**根因：** `buildProjectPromptLayers()` 是为 interview 类型项目（从 0 构建业务模型）设计的 6 层 prompt，面向"访谈发现 → 业务精炼 → 模型审阅"场景。多 Agent 协作场景的 Agent 已有完整的业务定义，需要注入数据契约和处理流程。

**额外问题：** DAG 执行模式是 Fire-and-Forget，用户无法在执行过程中介入。当 Agent 需要人类确认时（数据缺失、规则冲突、审查结果不达标），用户无法及时回复。

---

## 功能需求

### 1. 新建 `ProjectCollaborationContext` — 多 Agent 协作上下文加载

**文件：** `src/lib/integrations/pi-agent/project-agent/project-collaboration-context.ts`

从 Agent 工作目录加载协作场景所需的所有 .md 文件：

```typescript
export interface ProjectCollaborationContext {
  agentMd: string;           // Agent.md — 身份、职责、工作边界
  dataMd: string;            // Data.md — 数据契约（本体对象、字段、约束、操作权限）
  processMd: string;         // Process.md — 处理流程、异常处理、协作协议
  toolMd: string | null;     // Tool.md — allowedTools + 技能列表
  tasteMd: string | null;    // Taste.md — 风格指南
  memoryMd: string | null;   // Memory.md — 历史记忆
  allowedTools: string[];    // Tool.md frontmatter 提取
  installedSkills: SkillInfo[];  // skills/ 目录扫描到的已安装技能
  workingDirectory: string;
  projectId: string;
  agentId: string;
}
```

**规则：** `Agent.md` 不存在时返回 null（这是协作 Agent 的必要条件）；其他文件不存在时对应字段为 null 或空字符串。

### 2. 新建 `buildCollaborationPrompt` — 协作 Agent 7 层 prompt 构建

**文件：** `src/lib/integrations/pi-agent/project-agent/collaboration-prompt.ts`

7 层 prompt 结构（对齐 RoleAgent 风格）：

| Layer | 标题 | 内容 | 来源 |
|-------|------|------|------|
| 1 | Role Identity | Agent.md 全文（frontmatter 元数据 + 身份/职责/工作边界/参与流程/工作模式/原则） | `ctx.agentMd` |
| 2 | Data Contract | Data.md 中的本体对象定义（对象名、字段类型/约束/默认值、操作类型、Agent 间数据边界） | `ctx.dataMd` |
| 3 | Process Flow | Process.md 中的处理步骤（触发条件、输入数据、验证规则、处理流程、输出数据、异常处理表） | `ctx.processMd` |
| 4 | Collaboration Protocol | Process.md 中的协作协议（被触发方/触发类型/传递数据 + 触发目标/触发类型/传递数据） | `ctx.processMd` |
| 5 | Toolbox | allowedTools 列表 + 已安装技能列表（从 Tool.md frontmatter + skills/ 目录扫描） | `ctx.toolMd` |
| 6 | Style Guide | Taste.md（沟通风格 + 质量准则，无则跳过） | `ctx.tasteMd` |
| 7 | Working Directory + Data Constraints | 工作目录 + "禁止臆造数据"强制指令 | hard-coded + `ctx.workingDirectory` |

**Layer 7 数据约束指令（强制注入）：**

```
## 数据约束（强制）
- 执行任何操作前，必须先检查所需数据实例是否存在
- 如果数据缺失 → 禁止臆造，必须向用户确认
- 获得用户确认后，如有 create 权限可自行创建所需实例
- 绝对禁止编造不存在的数据
```

### 3. Agent Worker 三种初始化入口

| 入口 | 适用场景 | Prompt 构建 | 文件来源 |
|------|---------|------------|---------|
| `initializeProjectAgent()` | 多 Agent 协作（DAG 执行） | `buildCollaborationPrompt()` | Agent.md + Data.md + Process.md + Tool.md + Taste.md + Memory.md |
| `initializeOriginOSAgent()` | 单 Agent / 首页内置应用 | `buildProjectPromptLayers()` | Agent.md + Tool.md + Taste.md + Memory.md + Knowledge.md + Patterns.md |
| `initializePersistentAgent()` | interview 类型项目 | 现有 PersistentAgent 内置 | 同上 |

**分发逻辑：** `agentType === "originos" || "skill"` 时，检测 `Data.md` + `Process.md` 是否同时存在。

### 4. DAG Human-in-the-Loop

DAG 执行过程中 Agent 请求用户审查确认时暂停，阻塞下游节点，用户确认后恢复。

**新增事件类型：**

| 事件 | 方向 | 说明 |
|------|------|------|
| `DAG_PROGRESS` | Runtime → UI | DAG 全量节点状态快照（含 waiting 状态） |
| `HUMAN_REVIEW_REQUEST` | Agent → Runtime | Agent 请求用户审查确认 |
| `HUMAN_REVIEW_RESPONSE` | Runtime → Agent | 用户回复注入 |

**Agent prompt 注入：** `buildAgentPrompt()` 注入 Human Review 请求指令，包含触发条件和输出格式。

---

## 依赖关系

- 依赖: 9.6（PI Agent 桥接与子进程入口）

---

## 非目标

- 本次仅实现 DAG 模式的 Human-in-the-Loop，Supervisor/Blackboard 的 Human-in-the-Loop 在对应 Story 中实现

---

## 相关文档

- [多 Agent 协作 Prompt 架构设计](../../design/multi-agent-prompt-architecture.md)
