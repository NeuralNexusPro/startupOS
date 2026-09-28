# Story 9.26: 多 Agent 协作 Prompt 构建 — Data.md + Process.md 注入 + DAG Human-in-the-Loop

**Epic:** 9 — Multi-Agent 协作运行时
**状态:** ✅ Complete
**优先级:** High
**估计工时:** 3-4 天（含 Human-in-the-Loop）
**依赖:** 9.6（PI Agent 桥接与子进程入口）

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

**交互流：**
```
DAG 执行 → Agent A 运行中（SSE 推送 DAG_PROGRESS 事件）
    ↓
Agent A 检测需要确认 → 发出 HUMAN_REVIEW_REQUEST 事件
    ↓
AgentExecutor 返回 waiting 状态
    ↓
DagExecutor 收到 → 节点: running → waiting → 发出 DAG_PROGRESS
    ↓ 阻塞下游触发（b、c 保持 pending）
    ↓
UI 拓扑图节点变"等待确认"状态
    ↓
用户点击节点 → CUI 面板弹出（显示请求内容 + 上下文）
    ↓
用户回复 → POST /api/collaboration/sessions/[id]/human-review
    ↓
Runtime 找到对应回调 → executor.resumeNode(agentId, userResponse)
    ↓
节点 completed → 触发下游
```

**三种协作模式的交互差异：**

| 维度 | DAG (Workflow) | Supervisor (层级) | Blackboard (System) |
|------|----------------|-------------------|---------------------|
| Human-in-Loop | Agent 请求确认时暂停，阻塞下游 | Supervisor 分配审查任务给用户 | 无暂停，Agent 自主请求 |
| 暂停影响 | 阻塞当前节点及其所有下游 | 只阻塞当前子任务 | 无阻塞 |
| 主入口 | DAG 拓扑图 + 节点实时状态 | Supervisor 任务树 | 黑板 + 事件时间线 |
| 推进机制 | 用户确认 → 恢复节点 → 自动触发下游 | Supervisor 重新分配或继续 | Agent 自主决定继续 |

**本次仅实现 DAG 模式，Supervisor/Blackboard 的 Human-in-the-Loop 在对应 Story 中实现。**

**新增事件类型：**

| 事件 | 方向 | 说明 |
|------|------|------|
| `DAG_PROGRESS` | Runtime → UI | DAG 全量节点状态快照（含 waiting 状态） |
| `HUMAN_REVIEW_REQUEST` | Agent → Runtime | Agent 请求用户审查确认 |
| `HUMAN_REVIEW_RESPONSE` | Runtime → Agent | 用户回复注入 |

**Agent prompt 注入：** `buildAgentPrompt()` 注入 Human Review 请求指令，包含触发条件和输出格式。

**技术文件：**
```
src/modules/collaboration-runtime/session/types.ts                      # MODIFY — 新增事件类型
src/modules/collaboration-runtime/engine/dag-executor.ts                 # MODIFY — waiting 状态 + pauseAtNode/resumeNode/getSnapshot
src/lib/collaboration-runtime-bridge/multi-agent-executor.ts             # MODIFY — Human Review 检测 + 回调注册 + prompt 注入
src/lib/collaboration-runtime-service/index.ts                           # MODIFY — respondToHumanReview + resume 回调
src/app/api/collaboration/sessions/[id]/human-review/route.ts            # NEW — 用户回复 API 端点
```

---

## 架构

详见 [docs/design/multi-agent-prompt-architecture.md](../../design/multi-agent-prompt-architecture.md)

```
agent-worker.mts — initialize()
  │
  ├─ agentType === "originos" || "skill"
  │   ├─ 检测到 Data.md + Process.md → initializeProjectAgent()
  │   │   └─ loadProjectCollaborationContext() → buildCollaborationPrompt()
  │   │      → 创建 OriginOSAgent，注入 7 层 prompt + 工具 + Memory
  │   │
  │   └─ 否则 → initializeOriginOSAgent()
  │       └─ buildProjectPromptLayers() → 6 层 prompt（interview 类型）
  │
  └─ 否则 → initializePersistentAgent()
      └─ PersistentAgent 内置 prompt 构建

DAG Human-in-the-Loop:
  Agent 子进程 → HUMAN_REVIEW_REQUEST 事件 → AgentExecutor 返回 waiting
    → DagExecutor.pauseAtNode() → 阻塞下游
    → POST /human-review → resumeNode() → 恢复下游
```

---

## 技术文件

```
src/lib/integrations/pi-agent/project-agent/project-collaboration-context.ts  # NEW — 上下文加载
src/lib/integrations/pi-agent/project-agent/collaboration-prompt.ts          # NEW — 7 层 prompt 构建
src/modules/collaboration-runtime/sandbox/agent-worker.mts                   # MODIFY — 新增 initializeProjectAgent() + 分发
src/modules/collaboration-runtime/session/types.ts                           # MODIFY — 新增 3 个事件类型
src/modules/collaboration-runtime/engine/dag-executor.ts                     # MODIFY — waiting 状态 + pause/resume
src/lib/collaboration-runtime-bridge/multi-agent-executor.ts                 # MODIFY — Human Review + prompt 注入
src/lib/collaboration-runtime-service/index.ts                               # MODIFY — respondToHumanReview
src/app/api/collaboration/sessions/[id]/human-review/route.ts                # NEW — 用户回复 API
docs/design/multi-agent-prompt-architecture.md                               # NEW — 架构设计文档
docs/specs/epic-9/story-9.26/README.md                                       # NEW — 本 Story
```

---

## 与现有代码的关系

- `project-context.ts` + `project-prompt.ts` **保持不变**，服务于 interview 类型 Agent
- 新建的 `project-collaboration-context.ts` + `collaboration-prompt.ts` 服务于多 Agent 协作场景
- `agent-worker.mts` 通过动态 import 按需加载，不影响现有代码路径
- `initializeOriginOSAgent()` 和 `initializePersistentAgent()` 行为完全不变

---

## 验收标准

- [ ] `ProjectCollaborationContext` 正确加载 Data.md + Process.md + Agent.md + Tool.md + Taste.md + Memory.md
- [ ] `buildCollaborationPrompt()` 生成包含 7 层结构的完整 prompt
- [ ] Layer 2 包含 Data.md 中的本体对象、字段、约束、操作权限、Agent 间数据边界
- [ ] Layer 3 包含 Process.md 中的处理步骤、验证规则、异常处理
- [ ] Layer 4 包含 Process.md 中的协作协议（被触发/触发其他）
- [ ] Layer 7 包含"禁止臆造数据"强制指令
- [ ] Agent Worker 分发逻辑正确（Data.md + Process.md 存在时走协作路径）
- [ ] `initializeOriginOSAgent()` 保持原有行为不变（单 Agent 场景不受影响）
- [ ] `initializePersistentAgent()` 保持原有行为不变（interview 场景不受影响）
- [ ] DAG `waiting` 节点状态正确（Agent 返回 waiting 时阻塞下游）
- [ ] `resumeNode()` 正确恢复节点并触发下游
- [ ] `getSnapshot()` 包含 waitingAgentIds 字段
- [ ] `respondToHumanReview()` 可通过 API 注入用户回复
- [ ] Agent prompt 中包含 Human Review 请求指令
- [ ] `npx tsc --noEmit --skipLibCheck` 零 TS 错误
- [ ] `npm run lint` 零 ESLint 错误
