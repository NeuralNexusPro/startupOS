# OriginOS 架构规约 (AGENTS.md)

**版本：** 2.5.2
**日期：** 2026-07-29
**状态：** 强制执行

---

## 📋 文档目的

本文档是 OriginOS 项目的**架构规约和项目地图**，定义了所有实施必须遵守的架构约束、技术决策和开发规范。

**所有实施工作不得违反本规约。**

**相关文档：**
- [文档协作管理规范](docs/DOCUMENTATION-MANAGEMENT.md) - Story 文档管理流程
- [文档索引](docs/index.md) - 所有文档的快速导航

---

## 🎯 项目概览

### 核心定位

OriginOS 是一个面向个人用户的 AI Native 操作系统，基于 Next.js App Router 的 Web 应用实现。核心交互由 **Pi Agent** 驱动，支持技能（Skills）和 Agent 的会话式交互。

### MVP 范围

- **首页内置应用**：配置驱动（`packages/web/src/config/homeApps.ts`），支持 skill 类型和 action 类型入口
- **技能系统**：多源加载（bundled / project / user），通过 `SkillDialog` 驱动 Pi Agent 会话
- **会话交互层**：Pi Agent 流式会话，支持历史记录与会话切换
- **文件管理层**：文件目录组织和版本追溯
- **工作空间编辑器**：Markdown 编辑
- **窗体与可视化**：基于 `AppWindowManager` 的多窗体管理
- **本体构建系统**：项目访谈模块 + 手动构建 + Ontology Skills 辅助

### Post-MVP（不在当前实施范围）

- 技能管理系统（FR32-37）
- 认知系统自动演化（FR38-42）

---

## 🏗️ 技术栈约束

### 必须使用的技术

| 层级 | 技术选型 | 版本要求 | 说明 |
|------|---------|---------|------|
| **框架** | Next.js (App Router) | 14.x+ | 必须使用 App Router，禁止 Pages Router |
| **UI 库** | React | 18.x+ | 函数式组件 + Hooks |
| **语言** | TypeScript | 5.x+ | 严格模式，禁止 any 类型 |
| **样式** | Tailwind CSS | 3.x+ | 禁止内联样式和 CSS Modules |
| **组件库** | shadcn/ui | latest | 基于 Radix UI |
| **状态管理** | Zustand | 4.x+ | 禁止 Redux、MobX 等其他方案 |
| **数据存储** | 本地文件系统 (JSON) | - | MVP 阶段禁止使用数据库 |

### 禁止使用的技术

❌ **禁止：**
- Pages Router（必须使用 App Router）
- Class 组件（必须使用函数式组件）
- CSS Modules、Styled Components（必须使用 Tailwind）
- Redux、MobX（必须使用 Zustand）
- 任何数据库（PostgreSQL、MongoDB 等）
- 任何后端框架（Express、Koa 等）

---

## 📁 目录结构规约

### 强制目录结构

```
originos/
├── packages/
│   ├── web/                      # Next.js App Router Web 应用
│   │   ├── src/
│   │   │   ├── app/              # 页面与 API Routes（禁止放业务逻辑）
│   │   │   │   ├── api/          # agent / skills / projects / ontology / collaboration 等 API
│   │   │   │   ├── desktop/      # 桌面主界面路由
│   │   │   │   ├── dock/         # Dock 路由
│   │   │   │   └── page.tsx      # 首页
│   │   │   ├── components/       # Web UI 组件
│   │   │   │   ├── framework/
│   │   │   │   ├── molecules/
│   │   │   │   ├── os/
│   │   │   │   ├── project/
│   │   │   │   ├── sandbox/
│   │   │   │   ├── skills/
│   │   │   │   ├── solution/
│   │   │   │   ├── taste/
│   │   │   │   └── ui/
│   │   │   ├── config/           # homeApps / system-apps 等入口配置
│   │   │   ├── services/         # Web 侧服务适配（如 AppWindowManager）
│   │   │   ├── store/            # Zustand stores
│   │   │   ├── styles/           # Tailwind / 全局样式入口
│   │   │   └── modules/          # Web 侧模块适配，不承载 core 业务主实现
│   │   ├── public/
│   │   └── data/                 # Web 开发态运行数据
│   │
│   ├── core/                     # 共享核心业务、集成、模块与类型
│   │   ├── src/
│   │   │   ├── lib/
│   │   │   │   ├── features/     # agent / skills / project / ontology / taste 等业务功能
│   │   │   │   ├── integrations/ # pi-agent / electron 等集成抽象
│   │   │   │   │   └── pi-agent/
│   │   │   │   │       ├── core/
│   │   │   │   │       ├── role-agent/
│   │   │   │   │       ├── project-agent/
│   │   │   │   │       ├── cognitive/
│   │   │   │   │       ├── hooks/
│   │   │   │   │       ├── system/
│   │   │   │   │       └── tools/
│   │   │   │   ├── storage/      # JSON / 文件存储基础设施
│   │   │   │   ├── hooks/
│   │   │   │   └── shared/
│   │   │   ├── modules/
│   │   │   │   ├── collaboration-runtime/
│   │   │   │   │   ├── engine/
│   │   │   │   │   ├── facade/
│   │   │   │   │   ├── protocol/
│   │   │   │   │   ├── sandbox/
│   │   │   │   │   ├── session/
│   │   │   │   │   └── ui/
│   │   │   │   ├── memory-core/
│   │   │   │   ├── scheduler/
│   │   │   │   ├── neural-channel/
│   │   │   │   ├── view-manager/
│   │   │   │   └── view-reconciler/
│   │   │   ├── components/       # core 可复用组件（非 Web 页面）
│   │   │   └── types/
│   │   └── vitest.config.ts
│   │
│   ├── desktop/                  # Electron 桌面壳与主进程服务
│   │   ├── src/
│   │   │   ├── main/             # Electron main / preload / IPC / 服务
│   │   │   │   └── services/     # agent-session / project / ontology / skill 等桌面服务
│   │   │   ├── lib/              # Electron 集成适配
│   │   │   └── renderer/         # 桌面渲染侧补充组件
│   │   ├── scripts/              # 打包、发布、校验脚本
│   │   ├── data/                 # 桌面开发态运行数据
│   │   └── dist-electron/        # 编译产物（禁止作为源码修改入口）
│   │
│   ├── agent/                    # @originos/pi-agent-adapter 运行时适配边界
│   ├── perception-plugins/       # 感知渠道插件（仅依赖 core Plugin SDK）
│   │   ├── email/
│   │   ├── wecom/
│   │   ├── feishu/
│   │   └── dingtalk/
│   └── service/                  # 服务包（按 package 边界维护）
│
├── docs/
│   ├── specs/                    # Epic / Story 规格文档
│   ├── templates/
│   │   └── story-spec-template/  # Story 模板（README/requirements/interaction/architecture/implementation/testing）
│   ├── changes/                  # 变更记录（全量流水 + 版本归档）
│   └── index.md
│
├── templates/
│   └── project-interview/        # Project Agent 初始化模板
│
├── .claude/
│   └── skills/                   # 系统内置技能定义（只读，禁止写入产物）
│
└── data/                         # 运行时数据根（见数据存储规约；桌面/Web 开发态也可能有包内 data）
```

### 目录规则

1. **禁止在 `packages/web/src/app/` 下放置业务逻辑**
   - `packages/web/src/app/` 仅用于 App Router 页面、布局和 API route 边界
   - API route 只能做参数解析、权限/环境拼装、调用下层服务和响应映射
   - 共享业务逻辑必须下沉到 `packages/core/src/lib/` 或 `packages/core/src/modules/`
   - Web 私有展示适配可放在 `packages/web/src/services/`、`packages/web/src/store/`、`packages/web/src/components/`

2. **组件分层必须严格遵守**
   - `packages/web/src/components/ui/`、`molecules/` 不依赖业务逻辑组件
   - `packages/web/src/components/os/`、`skills/`、`project/`、`solution/` 可依赖 `@originos/core` 公共 API
   - `packages/core/src/components/` 不得依赖 `packages/web/src/app/` 或 Electron main

3. **功能模块必须独立**
   - 每个 feature 必须有独立的 types.ts
   - 禁止跨 feature 直接导入内部实现
   - 必须通过 index.ts 导出公共 API

4. **`.claude/skills/` 是只读定义目录**
   - 仅存放技能定义文件（skill.md、参考文件）
   - Agent 不得向此目录写入任何产物

5. **编译与运行时产物不是源码入口**
   - 禁止把 `packages/desktop/dist-electron/`、`packages/web/.next/`、`packages/*/node_modules/` 作为修复入口
   - 如需修复打包运行问题，必须修改对应 `packages/*/src` 或 `packages/desktop/scripts`

6. **感知渠道必须通过插件边界接入**
   - 平台 SDK、协议解析与连接生命周期放在 `packages/perception-plugins/{plugin}/`
   - 插件只能依赖 `packages/core` 对外导出的 Perception Plugin SDK，禁止依赖 Web 或 Desktop 内部实现
   - Core 保留平台无关的事件、规则、授权、路由、Plugin Contract/Registry/Host

---

## 🔗 模块依赖规约

### 单向按序依赖原则（强制）

**核心原则：** 服务端的模块依赖只能是单向按序依赖，严格禁止双向依赖和循环依赖。

### 依赖层级定义

模块按照以下层级组织，**只能依赖同层或下层模块，禁止依赖上层模块**：

```
Layer 6: packages/desktop/src/main/        # Electron 主进程与 IPC 边界
         ↓ 单向依赖
Layer 5: packages/web/src/app/             # Next.js 应用层（页面、API routes）
         ↓ 单向依赖
Layer 4: packages/web/src/components/      # Web 组件层
         ↓ 单向依赖
Layer 3: packages/web/src/services/        # Web 服务适配层
         packages/web/src/store/           # Zustand 状态层
         ↓ 单向依赖
Layer 2: packages/core/src/lib/features/   # 共享业务功能层
         packages/core/src/modules/        # 共享模块层
         ↓ 单向依赖
Layer 1: packages/core/src/lib/storage/    # 存储层
         packages/core/src/lib/integrations/ # 集成层
         packages/core/src/lib/shared/     # 共享工具层
         packages/core/src/types/          # 类型层
```

### 依赖规则

#### 1. Electron 主进程层 (`packages/desktop/src/main/`)
- ✅ 可以依赖：`packages/core` 公共 API、`packages/desktop/src/lib/`、Node/Electron API
- ❌ 禁止依赖：`packages/web/src/app/`、`packages/web/src/components/` 的 UI 实现
- ❌ 禁止：把 core 业务逻辑复制到 desktop service；应通过 core 公共 API 复用

#### 2. Web 应用层 (`packages/web/src/app/`)
- ✅ 可以依赖：`packages/web/src/components/`、`packages/web/src/services/`、`packages/web/src/store/`、`@originos/core`
- ❌ 禁止依赖：无上层
- ❌ 禁止：在 `app/` 中定义业务逻辑

#### 3. Web 组件层 (`packages/web/src/components/`)
- ✅ 可以依赖：`packages/web/src/services/`、`packages/web/src/store/`、`@originos/core`
- ❌ 禁止依赖：`packages/web/src/app/`、`packages/desktop/src/main/`

#### 4. Web 服务与状态层 (`packages/web/src/services/`, `packages/web/src/store/`)
- ✅ 可以依赖：`@originos/core` 公共 API、Web 侧工具
- ❌ 禁止依赖：`packages/web/src/app/`、`packages/web/src/components/`、`packages/desktop/src/main/`

#### 5. 共享业务层 (`packages/core/src/lib/features/`, `packages/core/src/modules/`)
- ✅ 可以依赖：`packages/core/src/lib/storage/`、`packages/core/src/lib/integrations/`、`packages/core/src/lib/shared/`、`packages/core/src/types/`
- ❌ 禁止依赖：`packages/web/`、`packages/desktop/`、`packages/service/`
- **Feature 之间依赖规则：**
  - 必须通过 index.ts 导出公共 API
  - 禁止直接导入其他 feature 的内部实现

#### 6. 基础设施层 (`packages/core/src/lib/storage/`, `integrations/`, `shared/`, `types/`)
- ✅ 可以依赖：`packages/core/src/lib/shared/`、`packages/core/src/types/`
- ❌ 禁止依赖：`packages/web/`、`packages/desktop/`、`packages/core/src/lib/features/`、`packages/core/src/modules/`

### 依赖检查规则

#### ❌ 禁止的依赖模式

```typescript
// ❌ 错误：双向依赖
// ontology.ts
import { queryGraph } from './knowledge';
// knowledge.ts
import { buildOntology } from './ontology'; // 禁止！形成循环

// ❌ 错误：上层依赖下层
// packages/core/src/lib/features/ontology/index.ts
import { CUIComponent } from '@/components/organisms/CommandInterface'; // 禁止！

// ❌ 错误：跨 feature 直接导入内部实现
// packages/core/src/lib/features/ontology/ontology-builder.ts
import { GraphStore } from '@/lib/features/knowledge/graph-store'; // 禁止！
```

#### ✅ 正确的依赖模式

```typescript
// ✅ 正确：单向依赖
// packages/core/src/lib/features/knowledge/index.ts
import { OntologyService } from '@/lib/features/ontology'; // 通过公共 API

// ✅ 正确：依赖下层
// packages/core/src/lib/features/ontology/ontology-store.ts
import { JsonStore } from '@/lib/storage/json-store';

// ✅ 正确：组件依赖业务逻辑
// packages/web/src/components/skills/SkillDialog.tsx
import { usePiAgent } from '@originos/core/lib/integrations/pi-agent/hooks';
```

### 依赖验证

**在每次提交前必须运行：**

```bash
pnpm lint  # 自动检查 Web lint / 依赖违规
```

### 违规处理

**如果发现依赖违规：**

1. **立即停止开发**
2. **重构代码以符合单向依赖原则**
3. **可能的重构方案：**
   - 提取共享逻辑到下层模块
   - 使用依赖注入
   - 使用事件总线解耦
   - 重新设计模块边界

---

## 🔧 核心架构约束

### 1. 本体构建系统架构

**三层结构（强制）：**

```typescript
// 领域层 (Domain)
interface Domain {
  id: string;
  name: string;
  description: string;
  icon?: string;
  color?: string;
  createdAt: Date;
  updatedAt: Date;
}

// 概念对象层 (Concept)
interface Concept {
  id: string;
  domainId: string;
  name: string;
  type: string;
  attributes: Record<string, unknown>;
  description?: string;
  createdAt: Date;
  updatedAt: Date;
}

// 实例数据层 (Instance)
interface Instance {
  id: string;
  conceptId: string;
  data: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}
```

**存储约束：**
- 所有本体数据存储在 `{project-root}/data/ontology/` 目录
- 每个项目一个独立的 JSON 文件

### 2. 项目访谈模块架构

**访谈流程（强制）：**

```typescript
interface InterviewSession {
  id: string;
  projectId: string;
  questions: InterviewQuestion[];
  answers: Record<string, unknown>;
  status: 'in_progress' | 'completed' | 'skipped';
  createdAt: Date;
  completedAt?: Date;
}
```

**本体生成约束：**
- 访谈结果必须在 5 秒内生成初始本体
- 至少生成 1 个领域层和 2-3 个概念对象

### 3. 窗体管理架构

**基于 `AppWindowManager` 服务（强制）：**

```typescript
interface WindowState {
  id: string;
  title: string;
  component: React.ComponentType;
  position: { x: number; y: number };
  size: { width: number; height: number };
  zIndex: number;
  minimized: boolean;
  maximized: boolean;
}
```

**窗体约束：**
- 最小尺寸：400x300px
- 窗体必须支持拖拽、调整大小、最小化、最大化
- 窗体渲染必须在 < 1 秒内完成

### 4. Ontology Skills 架构

**推荐系统（强制）：**

```typescript
interface OntologySkill {
  id: string;
  type: 'domain_recommendation' | 'concept_recommendation' | 'relation_inference';
  execute: (context: OntologyContext) => Promise<Recommendation[]>;
}
```

**性能约束：**
- Ontology Skill 响应时间必须 < 5 秒
- MVP 阶段使用基于规则的推荐算法
- 禁止使用复杂的机器学习模型

---

## 🔌 集成架构约束

### 1. Pi Agent 核心架构

**已实施，位于 `packages/core/src/lib/integrations/pi-agent/`，包含：**

- `core/agent.ts`：OriginOSAgent 主体，管理会话生命周期
- `core/skills.ts`：技能多源加载（bundled / project / user）
- `hooks/`：React 端 `usePiAgent` Hook
- `tools/`：Agent 工具集（bash、file、skill、ontology、url）
- `agent-manager.ts`：Agent 实例管理，按 scope 过滤工具
- `session-store.ts`：会话持久化

### 2. RoleAgent 架构

**RoleAgent 专用的思维循环体系，位于 `packages/core/src/lib/integrations/pi-agent/role-agent/`，包含：**

- `role-context.ts`：角色上下文加载器（7 个 .md 文件 + 技能扫描）
- `state-machine.ts`：角色状态机解析与推进
- `skill-resolver.ts`：技能解析器（扫描 .skills/ 软链接，提取 icon/category/tags/frontmatter）
- `system-prompt.ts`：RoleAgent 专用 7 层分层 system prompt 构建
- `memory-tracker.ts`：内存累积器，每 N 轮落盘 Memory.md + JSONL 历史存储
- `dream.ts`：Dream 两阶段自动记忆维护（LLM 分析 + 精准文件编辑）
- `consolidator.ts`：Consolidator 预留接口（token 预算触发式压缩）
- `index.ts`：模块统一导出

**RoleAgent 7 层 System Prompt（`system-prompt.ts`）：**

1. **角色身份**（Agent.md 全文）
2. **状态与记忆**（阶段名 + 行为特征 + Memory.md + Knowledge.md + Patterns.md）
3. **思维循环指令**（5 步思考流程）
4. **工具箱**（已安装技能清单 + registry 驱动系统工具列表，含描述）
5. **风格指南**（Taste.md，无内容时跳过）
6. **工作目录 + 权限授权**
7. **安全约束**（固定 section）

**RoleAgent 工作目录文件：**

| 文件 | 说明 | 生命周期 |
|------|------|---------|
| `Agent.md` | 角色身份定义 | 创建时写入，手动维护 |
| `Role.md` | 状态机定义（阶段、转换条件） | 创建时写入，可更新 |
| `Tool.md` | 工具配置（allowedTools frontmatter） | 创建时写入，自动更新 |
| `Taste.md` | 风格指南 | 创建时写入，手动维护 |
| `Memory.md` | 历史会话摘要 | 每 N 轮落盘（Dream 自动整理） |
| `Knowledge.md` | 知识库索引快照 | 周期更新（session-end 或每 N 轮） |
| `Patterns.md` | 经验模式索引快照 | 周期更新（session-end 或每 N 轮） |

**RoleAgent Dream 自动记忆维护：**

```
turn_end hook
  ├─ 状态机检查 + 阶段转换（现有）
  ├─ MemoryTracker：记录 turn，JSONL 追加写入 memory/history.jsonl
  │   └─ 达到 flush 阈值 → 追加到 Memory.md
  └─ Dream：每 20 turn 触发
      ├─ Phase 1: LLM 分析对话历史 → [ADD]/[UPDATE]/[REMOVE]/[SKILL] 指令
      └─ Phase 2: 解析指令 → 精准编辑 Memory.md
```

- 运行记忆：pi-agent 消息历史（每轮自动）
- 持久记忆：Memory.md（每 N 轮落盘，默认 50）
- 自动整理：Dream 每 20 turn 触发，去重/过时清理/事实提取
- 历史存储：JSONL 格式，支持 cursor 增量读取

**RoleAgent 通过 `launcher/role-agent.ts` 启动，不影响其他 Agent 类型。**

### 3. Project Agent 架构

**Project Agent（interview 类型项目），位于 `packages/core/src/lib/integrations/pi-agent/project-agent/`，包含：**

- `project-context.ts`：项目上下文加载器（7 个 .md 文件 + 技能扫描）
- `project-prompt.ts`：7 层分层 prompt 构建器（与 RoleAgent 对齐）
- `index.ts`：模块统一导出

**Project Agent 7 层 System Prompt（`project-prompt.ts`）：**

1. **身份**（Agent.md 全文）
2. **状态与记忆**（Memory.md + business-model.json + Knowledge.md + Patterns.md）
3. **思维循环指令**（5 步思考流程，project-agent 版本）
4. **工具箱**（已安装技能 + registry 驱动系统工具列表，`project` scope）
5. **风格指南**（Taste.md，无内容时跳过）
6. **工作目录 + 权限授权**
7. **安全约束**（固定 section）

**Project Agent 工作目录文件：**

| 文件 | 说明 | 生命周期 |
|------|------|---------|
| `Agent.md` | 项目身份定义 | 创建时写入 |
| `Tool.md` | 工具配置（allowedTools frontmatter） | 创建时写入，自动更新 |
| `Taste.md` | 风格指南 | 创建时写入，可手动维护 |
| `Memory.md` | 历史会话记录 | 每轮/周期更新 |
| `Knowledge.md` | 知识库索引快照 | 周期更新 |
| `Patterns.md` | 经验模式索引快照 | 周期更新 |

**Project Agent 通过 `persistent-agent-manager.ts` 启动，在 `startAgent()` 时加载 `ProjectContext`，构建 7 层 prompt，传入 `PersistentAgent`。**

**Frozen Snapshot 模式**：Knowledge.md 和 Patterns.md 在 Agent 启动时加载到 system prompt（Layer 2: StateMemory），中途生成的知识只写入磁盘，不修改内存中的快照，保持 LLM prefix cache 稳定。

### 4. 认知系统架构

**认知系统使 Agent 在服务用户过程中积累知识、沉淀经验、持续进化。位于 `docs/specs/epic-C/`，包含 Stories C.1-C.7。**

**三个核心组件：**

| 组件 | 职责 | 目录 |
|------|------|------|
| **知识库 (Knowledge Base)** | 理解世界 — 领域知识、事实、概念的结构化存储 | `{agentOrProject}/knowledge/` |
| **实践日志 (Practice Log)** | 记录行为 — Agent 决策、工具选择、执行结果的日志 | `{agentOrProject}/practice/` |
| **经验模式库 (Pattern Library)** | 优化行为 — 从实践中提炼的最佳路径、反模式 | `{agentOrProject}/patterns/` |

**每轮 vs 周期性职责分离：**

| 触发时机 | 操作 | 重量级 |
|----------|------|--------|
| `on_turn_end` | 记录实践日志到 JSONL | 轻量（只写磁盘） |
| `on_session_end` | 批量分析日志 → 提取知识 + 沉淀模式 | 重量（LLM 分析） |
| 每 N 轮（可选） | 增量分析最近未处理的日志 | 重量（LLM 分析） |
| Agent 启动 | 加载 Knowledge.md + Patterns.md 快照到 prompt | 轻量（读文件） |

**Frozen Snapshot 模式（借鉴 hermes-agent MemoryManager）：**

```
Agent 启动
  └─ 加载 knowledge/ 快照 → Knowledge.md → Layer 2: StateMemory
  └─ 加载 patterns/ 快照 → Patterns.md → Layer 2: StateMemory

每轮 (on_turn_end)
  └─ 记录实践日志 → practice/turns/turn-{N}.json

Session 结束 / 每 N 轮 (on_session_end)
  ├─ 批量分析实践日志 → 提取新知识
  │   ├─ 创建/更新 knowledge/wiki/ 实体页面
  │   └─ 创建/更新 knowledge/ontology/ 本体知识
  └─ 提炼经验模式 → 沉淀到 patterns/
      ├─ 更新 patterns/registry.json
      └─ 生成 pattern-{id}.md
```

**认知管理器（CognitiveManager）设计（借鉴 hermes-agent Provider 模式）：**

```
CognitiveManager
├── KnowledgeProvider
│   ├── load_snapshot()     → 启动时加载知识快照
│   ├── run_periodic(logs)  → 周期分析日志，提取知识
│   └── system_prompt_block() → 静态指令注入
├── PatternProvider
│   ├── load_snapshot()     → 启动时加载模式快照
│   ├── run_periodic(logs)  → 周期分析日志，沉淀模式
│   └── system_prompt_block() → 模式使用指南
└── 生命周期钩子
    ├── on_turn_end(turn_data)     → 每轮：记录实践日志
    ├── on_session_end(messages)   → 周期：知识提取 + 模式沉淀
    └── on_delegation(task, result) → 子任务完成后知识合并
```

**知识体系：**
- 结构化知识通过 Ontology 系统存储（实体-关系-属性）
- 非结构化知识通过 wiki markdown 文件存储（LLM 自动编写、更新、交叉引用）
- Agent/Project 维度知识隔离
- 模式有效性评估：工具调用链越短→效率越高，用户纠正次数越多→效果越差

**RoleAgent/Project Agent 通过 7 层 System Prompt 的 Layer 2: StateMemory 注入 Knowledge.md 和 Patterns.md 快照。**

**Agent 工作目录（CWD）优先级（`bash-tools.ts`，从高到低）：**

1. `agentBaseDir`（会话级覆盖，最高优先级）
2. `projectContext.currentPath`
3. 工具调用参数 `workingDirectory`
4. `process.cwd()`

**技能调用流程：**

```
首页 AppCard (type:'skill')
  → SkillDialog 加载技能内容（GET /api/skills/{name}/content）
  → buildSkillSystemPrompt（注入 CLAUDE_SKILL_DIR、工作目录）
  → initialize()（POST /api/agent/sessions，设置 agentBaseDir）
  → 流式会话（POST /api/agent/sessions/{id}/messages）
```

---

## 📊 性能约束

### 强制性能指标

| 指标 | 要求 | 验证方式 |
|------|------|---------|
| CUI 消息响应 | < 500ms | 自动化测试 |
| 本体图谱查询 | < 5s (MVP) | 性能测试 |
| Ontology Skill 响应 | < 5s (MVP) | 性能测试 |
| 窗体渲染 | < 1s | 性能测试 |
| 首次页面加载 | < 3s | Lighthouse |
| 并发用户支持 | ≥ 10 (MVP) | 负载测试 |

### 性能优化策略

**必须实施：**
- 本体图谱虚拟化渲染（>50 节点时）
- 图谱查询索引优化
- 窗体内容懒加载
- 代码分割和动态导入

**禁止：**
- 阻塞主线程的同步操作
- 未优化的大规模数据渲染
- 内存泄漏

---

## 🔒 数据存储规约

### 文件系统结构（强制）

```
{project-root}/
└── data/
    ├── projects/                 # 项目数据
    │   └── {project-id}/
    │       ├── project.json      # 项目元数据
    │       ├── sessions/         # 项目会话
    │       │   └── {sessionId}.json
    │       └── files/            # 项目文件
    │
    ├── sessions/                 # 全局会话（非项目会话）
    │   └── {sessionId}.json
    │
    ├── skills/                   # 技能运行时产物
    │   └── {skillName}/          # 从首页内置应用入口触发时的输出目录
    │
    ├── agents/                   # Agent 运行时产物
    │   └── {agentName}/
    │       ├── Agent.md            # Agent 角色定义（身份）
    │       ├── Role.md             # 状态机定义（阶段、转换）
    │       ├── Tool.md             # 工具配置（allowedTools 声明）
    │       ├── Taste.md            # 风格指南
    │       ├── Memory.md           # 历史记忆（每 N 轮落盘）
    │       ├── Knowledge.md        # 知识库索引快照（周期更新）
    │       ├── Patterns.md         # 经验模式索引快照（周期更新）
    │       ├── .skills/            # 已安装技能（软链接）
    │       ├── memory/             # 记忆存储
    │       │   └── history.jsonl   # JSONL 历史记录
    │       ├── knowledge/          # 知识库（认知系统）
    │       │   ├── schema.md
    │       │   ├── index.md
    │       │   ├── log.md
    │       │   ├── sources/        # 原始来源
    │       │   ├── ontology/       # 本体知识
    │       │   └── wiki/           # 非结构化 wiki
    │       ├── patterns/           # 经验模式（认知系统）
    │       │   ├── registry.json
    │       │   └── analysis/
    │       └── practice/           # 实践日志
    │           ├── turns/          # 按 turn 编号组织
    │           └── summary.json
    │
    ├── interviews/               # 访谈数据
    │   └── {session-id}.json
    │
    ├── ontology/                 # 本体数据
    ├── chats/                    # 聊天历史
    └── tmp/                      # 临时文件
```

### 技能与 Agent 产物目录规则（强制）

| 调用来源 | 产物输出目录 |
|---------|------------|
| **首页内置应用入口**（系统内置技能） | `data/skills/{skillName}/` |
| **首页内置应用入口**（内置 Agent） | `data/agents/{agentName}/` |
| **项目上下文** | `projectContext.currentPath`（项目工作目录） |
| **RoleAgent / Agent 调用技能** | 继承调用方的 CWD |

- **`.claude/skills/`** 是只读的技能定义目录，Agent 绝对不得向此目录写入产物
- `CLAUDE_SKILL_DIR` 变量指向技能**源目录**（供读取参考文件），与产物输出目录无关
- 会话创建时（`POST /api/agent/sessions`），若 `agentBaseDir` 不存在则必须自动创建

### 数据格式约束

**所有 JSON 文件必须包含：**
```typescript
interface DataFile {
  version: string;        // 数据格式版本
  createdAt: string;      // ISO 8601 格式
  updatedAt: string;      // ISO 8601 格式
  data: unknown;          // 实际数据
}
```

### 版本追溯约束

**文件版本管理：**
- 每次保存创建新版本
- 版本文件命名：`{filename}.v{version}.json`
- 保留最近 10 个版本
- 版本元数据存储在 `{filename}.versions.json`

---

## 🎨 UI/UX 规约

### 设计系统约束

**颜色系统（强制使用 Tailwind 预设）：**
- Primary: `blue-600`
- Secondary: `gray-600`
- Success: `green-600`
- Warning: `yellow-600`
- Error: `red-600`

**字体系统：**
- 标题：`font-bold`
- 正文：`font-normal`
- 代码：`font-mono`

**间距系统：**
- 必须使用 Tailwind 间距单位（4px 基准）
- 禁止使用任意值（如 `p-[13px]`）

### 交互规约

**CUI 交互：**
- 输入框必须自动获得焦点
- 支持 Enter 发送，Shift+Enter 换行
- 消息响应必须 < 500ms

**窗体交互：**
- 拖拽必须流畅（60fps）
- 调整大小必须实时预览
- 最小化/最大化必须有动画过渡

**本体图谱交互：**
- 支持鼠标滚轮缩放
- 支持拖拽平移
- 节点点击必须高亮显示关联

---

## 🧪 测试规约

### 测试覆盖率要求

| 层级 | 覆盖率要求 | 测试类型 |
|------|-----------|---------|
| 核心业务逻辑 | ≥ 80% | 单元测试 |
| UI 组件 | ≥ 60% | 组件测试 |
| 集成点 | 100% | 集成测试 |
| 关键用户流程 | 100% | E2E 测试 |

### 必须测试的场景

**本体构建系统：**
- 创建领域、概念、实例
- 定义关系
- 查询和过滤
- 编辑和删除

**项目访谈模块：**
- 完整访谈流程
- 跳过访谈
- 本体生成算法

**窗体管理：**
- 打开、关闭、最小化、最大化
- 拖拽和调整大小
- 多窗体管理

### Epic / Story 测试闭环

- 实施任何 Epic 中的 Story 前，必须先确认 Story 文档中包含该功能的测试 case 或验收用例；若缺失，必须先补齐测试 case 后再开始实现。
- Story 测试 case 必须覆盖核心成功路径、关键失败路径、边界条件，以及涉及 UI/接口/持久化/跨进程通信时的集成验证点。
- Story 功能实现完成后，必须创建一个自动化测试验证 goal；该 goal 的目标必须明确为“通过该 Story 中定义的测试 case”。
- 自动化测试验证 goal 必须执行对应单元测试、集成测试、E2E 或脚本化验收；若某项无法自动化，必须在 goal 输出中说明原因、人工验证步骤和剩余风险。

### Epic / Story 模板约束

**目录命名（强制）：**

```
docs/specs/
└── epic-{N}/
    ├── README.md
    └── story-{N}.{M}/
        ├── README.md
        ├── requirements.md
        ├── interaction.md
        ├── architecture.md
        ├── implementation.md
        ├── testing.md
        └── assets/
            ├── diagrams/
            ├── mockups/
            └── wireframes/
```

**模板来源（强制）：**
- 新建 Story 必须使用 `pnpm docs:init-story <epic-number> <story-number> "<story-title>"` 或等价地复制 `docs/templates/story-spec-template/` 的完整内容。
- Story 目录必须包含 6 个模板文件：`README.md`、`requirements.md`、`interaction.md`、`architecture.md`、`implementation.md`、`testing.md`。
- Epic 目录必须包含 `README.md`，列出 Story 清单、状态、依赖和当前实施进度；缺失时由 `scripts/init-story-spec.js` 自动创建或手工补齐。

**模板填充（强制）：**
- 提交前不得残留模板占位符：`{Story Title}`、`{Date}`、`{Name}`、`{N}`、`{M}`、`{X}`、`{需求描述}`、`{功能描述}` 等。
- `README.md` 必须包含 Story 编号、标题、状态、Owner、User Story、简要验收标准、文档导航和变更历史。
- `requirements.md` 必须包含需求来源、详细需求、Given/When/Then 验收标准、边界条件、异常场景、依赖关系和非功能需求。
- `interaction.md` 对纯后端/纯文档 Story 可标记为“不适用”，但必须说明原因；涉及 UI/UX 时必须包含用户流程、状态、错误提示、响应式/可访问性要求。
- `architecture.md` 必须列出影响模块、依赖方向、数据结构/API/状态方案、性能与安全考虑，并明确证明没有违反本 AGENTS.md。
- `implementation.md` 必须列出实施步骤、文件级改动范围、迁移/兼容策略、审查要点和回滚风险。
- `testing.md` 必须列出测试矩阵、每条 AC 对应的测试 case、自动化命令、测试数据、无法自动化项的人工验证步骤和剩余风险。

**实施门禁（强制）：**
- 未按模板补齐 Story 文档时，禁止开始功能实现。
- Story 文档与代码实现发生偏离时，必须先更新 Story 文档或在实现 PR 中同步更新。
- Story 状态变更必须同时更新 Epic README 的 Story 清单；完成 Story 时必须把测试结果写入 `testing.md`。
- 架构围栏、数据路径、依赖层级或公共 API 发生变化时，必须同步更新 `AGENTS.md` 和 `docs/changes/`。

### Story、OpenSpec Proposal 与 Worktree 隔离（强制）

**核心原则：** Story 是产品需求与验收边界，OpenSpec Proposal 是代码实施与合并边界。Story 不直接对应 Git 分支；Story 中每个可独立实施、测试和验收的 Task 必须一对一创建 OpenSpec Proposal，Git 集成分支必须一对一对应 Proposal。

#### 术语与映射

```text
Epic
  -> Story（需求、交互、架构、验收）
       -> Executable Task（可独立实施和验收的变更单元）
            -> OpenSpec Proposal（1:1）
                 -> proposal.md / design.md / tasks.md / spec deltas
                 -> Proposal integration branch（1:1）
                 -> Subagent work packages（1:N）
                      -> Task branch + worktree（1:1）
```

- “每个 Task 一个 Proposal”中的 Task，指 Story 中可独立交付的实施单元。
- OpenSpec `tasks.md` 中的 checklist item 是 Proposal 内部工作包，不递归创建新的 Proposal。
- 一个 Story 可以对应一个或多个 Proposal；一个 Proposal 只能归属于一个 Story Task。
- Proposal 必须记录 `epic-id`、`story-id` 和 `task-id`，保证需求、实施和变更可追溯。

#### OpenSpec Proposal 门禁

- 实施任何 Story Task 前，必须完成 OpenSpec 初始化，并遵循 `openspec/config.yaml`、当前 schema instructions/templates 和仓库生成的 OpenSpec agent skills。
- OpenSpec 文档的标题、说明、需求、场景、设计、任务和验收正文必须使用中文。仅保留 schema/CLI 要求的固定关键字（如 `ADDED Requirements`、`Requirement`、`Scenario`、`WHEN`、`THEN`、`SHALL`、`MUST`）、代码标识、类型名、路径、命令、包名、协议名和无法准确翻译的专有名词。
- 不得因为 OpenSpec CLI 返回英文模板而直接生成英文正文；生成后必须按上一条完成中文化，再执行 strict validation。
- OpenSpec 1.4.x 的最小项目结构以 `openspec/config.yaml` 为入口；不得强制假设旧版 `openspec/AGENTS.md` 或 `openspec/project.md` 必然存在。
- 开始 Proposal 前必须运行 `openspec list --json`、`openspec list --specs` 和 `openspec status --change {change-id} --json`（创建前可省略 status），并使用 CLI 返回的 `planningHome`、`changeRoot`、`artifactPaths` 和 `actionContext`，不得硬编码旧版目录推断。
- 必须先检查现有 specs 和 active changes，避免重复 Proposal 或冲突能力定义。
- Proposal change-id 必须唯一、kebab-case、动词开头，例如 `add-agent-task-runtime`。
- 每个 Proposal 至少包含：
  - `openspec/changes/{change-id}/proposal.md`
  - `openspec/changes/{change-id}/tasks.md`
  - 涉及跨模块、公共 API、数据结构、性能、安全或迁移时必须包含 `design.md`
  - 对受影响 capability 的 spec delta 及规范化 Scenario
- Proposal 必须运行 `openspec validate {change-id} --strict` 并通过。
- Proposal 未完成审查和批准前，禁止创建实施 worktree、修改应用源码或启动 subagent 实施。
- Story 文档与 Proposal 冲突时，必须先修订 Story 或 Proposal，使两者一致后再实施。
- OpenSpec 生成的通用 `openspec-apply-change` skill 在本项目只作为 Proposal 选择、状态读取和任务编排入口；其中“直接实现 tasks”的通用指令不得覆盖本节规则，应用源码仍必须分派给独立 subagent Task worktree。

#### Proposal 分支与 Worktree

- `dev` 是 Proposal 的最终集成分支。
- Proposal 集成分支从最新 `dev` 创建，命名为 `proposal/{change-id}`。
- Proposal 主 worktree 使用仓库同级目录：`../startupos-proposal-{change-id}`。
- Proposal 集成分支只承载该 Proposal 的规格、实现、测试和变更记录，不混入其他 Proposal。
- 禁止直接在 `dev` 或 `main` 上实施 Proposal。

```bash
# 1. 同步 dev
git switch dev
git pull --ff-only

# 2. 创建 Proposal 集成分支和主 worktree
git worktree add ../startupos-proposal-add-agent-task-runtime \
  -b proposal/add-agent-task-runtime dev

# 3. 在主 worktree 编写、校验并审批 Proposal
cd ../startupos-proposal-add-agent-task-runtime
openspec validate add-agent-task-runtime --strict
```

#### Subagent 并行实施

Proposal 获批后，应依据 `tasks.md` 的依赖关系拆分可并行工作包，并使用 subagents 在多个独立 worktree 中实施：

- Proposal 至少必须创建一个 subagent Task 分支/worktree；应用源码不得直接在 Proposal 主 worktree 中实施。
- Proposal 主 worktree 只用于 Proposal 文档、任务编排、Task 分支集成、冲突处理、完整回归和合并准备。
- 每个 subagent 必须获得明确、互不重叠的写入范围和验收命令。
- 每个 subagent 使用独立 Task 分支，命名为 `proposal-task/{change-id}-{task-id}-{short-slug}`。
- 每个 Task 分支使用独立 worktree，建议命名为 `../startupos-{change-id}-task-{task-id}`。
- 存在两个或以上无依赖且写入范围不重叠的工作包时，必须并行启动多个 subagents/worktrees。
- 有依赖关系或写入范围重叠的工作包不得并行；必须按 `tasks.md` 顺序实施。
- Subagent 不得直接合并到 `dev`，只能提交到自己的 Task 分支。
- Subagent 完成后必须返回改动文件、测试结果、未解决问题和 commit。

```bash
# 在 Proposal 主 worktree 中，为可并行工作包创建独立分支/worktree
git worktree add ../startupos-add-agent-task-runtime-task-1 \
  -b proposal-task/add-agent-task-runtime-1-core \
  proposal/add-agent-task-runtime

git worktree add ../startupos-add-agent-task-runtime-task-2 \
  -b proposal-task/add-agent-task-runtime-2-ui \
  proposal/add-agent-task-runtime
```

#### 合并与完成

1. 每个 subagent Task 分支先完成自身测试和审查。
2. Task 分支逐个合并回 Proposal 集成分支；冲突必须在 Proposal 主 worktree 解决。
3. 每次合并后运行受影响测试；全部工作包合并后运行 Proposal 的完整回归测试。
4. 更新 `tasks.md`，只有真实完成并有 Evidence 的项目才能标记为 `[x]`。
5. 再次运行 `openspec validate {change-id} --strict`、Story 测试验证 goal 和架构检查。
6. Proposal 完整验证和审查通过后，才能将 `proposal/{change-id}` 合并到 `dev`。
7. 合并后清理 Proposal/Task worktree 和已合并分支；部署完成后按 OpenSpec 流程归档 Proposal。

#### 禁止与例外

- 禁止以 Story 分支代替 Proposal 分支。
- 禁止一个 Proposal 分支承载多个 Story Task。
- 禁止多个 subagent 共用分支或 worktree。
- 禁止未审查 Proposal 就修改应用源码。
- 禁止在 Proposal 主 worktree 直接实施应用源码。
- 禁止把 subagent Task 分支直接合并到 `dev` 或 `main`。
- 多个 Proposal 存在共享前置能力时，必须先建立独立前置 Task/Proposal 并合并到 `dev`，后续 Proposal 再从更新后的 `dev` 创建或同步。
- 紧急修复若无法遵循该流程，必须获得明确批准，并在 `docs/changes/` 记录原因、范围和补偿措施。

---

## 🚫 禁止事项清单

### 架构层面

❌ **严格禁止：**
1. 违反目录结构规约
2. 使用禁止的技术栈
3. 在 MVP 阶段实施 Post-MVP 功能
4. 跨 feature 直接导入内部实现
5. 在 `packages/web/src/app/` 中放置业务逻辑
6. 使用数据库（MVP 阶段）
7. 向 `.claude/skills/` 目录写入任何产物（只读定义目录）
8. 系统内置技能在首页入口场景下将产物写入技能源目录
9. 使用 Story 分支代替 OpenSpec Proposal 分支实施代码
10. 在同一分支或 worktree 中混合实施多个 Proposal
11. 未经批准 Proposal 就修改 Story 对应的应用源码
12. 多个 subagent 共用分支或 worktree
13. 将 subagent Task 分支直接合并到 `dev` 或 `main`
14. 在 Proposal 主 worktree 直接实施应用源码

### 代码层面

❌ **严格禁止：**
1. 使用 `any` 类型
2. 使用 Class 组件
3. 内联样式和 CSS Modules
4. 阻塞主线程的同步操作
5. 未处理的 Promise rejection
6. 内存泄漏
7. 硬编码的配置值

### 性能层面

❌ **严格禁止：**
1. 超过性能指标的实现
2. 未优化的大规模数据渲染
3. 不必要的重渲染
4. 未使用虚拟化的长列表

---

## ✅ 实施检查清单

### 开始实施前必须确认

- [ ] 已阅读并理解本架构规约
- [ ] 已确认技术栈符合要求
- [ ] 已确认目录结构符合规约
- [ ] 已确认不会实施 Post-MVP 功能
- [ ] 已确认性能指标可达成
- [ ] 若正在新建 Epic/Story，已使用 `docs/templates/story-spec-template/` 完整初始化文档
- [ ] 若正在实施 Epic/Story，已确认 Story 文档包含功能测试 case；缺失时已先补齐
- [ ] Story 文档中无模板占位符残留，Epic README 状态与 Story README 一致
- [ ] 当前 Story Task 已一对一创建 OpenSpec Proposal，并记录 Epic/Story/Task ID
- [ ] Proposal 已通过 `openspec validate {change-id} --strict`、审查和批准
- [ ] 已从最新 `dev` 创建 Proposal 集成分支和主 worktree
- [ ] 当前 worktree 不包含其他 Proposal 的未提交改动

### 实施过程中必须遵守

- [ ] 每个 PR 必须符合架构规约
- [ ] 每个功能必须有对应测试
- [ ] Epic/Story 的实现必须对齐 Story 中定义的测试 case
- [ ] 代码实现偏离 Story 设计时，已同步更新 requirements/architecture/implementation/testing
- [ ] 当前分支、提交和 PR 只包含一个 Proposal 或其单个工作包的改动
- [ ] 并行 subagent 具有互不重叠的写入范围和独立 Task 分支/worktree
- [ ] 应用源码只在 subagent Task worktree 实施，Proposal 主 worktree 仅负责集成
- [ ] 有依赖或写入冲突的工作包按 `tasks.md` 顺序实施
- [ ] 每个性能指标必须验证
- [ ] 每个集成必须通过抽象层
- [ ] 每个数据文件必须符合格式约束
- [ ] 技能/Agent 产物输出到正确的 `data/` 子目录

### 实施完成后必须验证

- [ ] 已创建自动化测试验证 goal，且 goal 目标为通过该 Story 的测试 case
- [ ] 所有性能指标达标
- [ ] 所有测试通过
- [ ] 代码覆盖率达标
- [ ] 无架构规约违反
- [ ] Story `testing.md` 已记录自动化命令、结果、无法自动化项和剩余风险
- [ ] Epic README 已同步 Story 状态和实施进度
- [ ] 所有 subagent Task 分支已审查并合并回 Proposal 集成分支
- [ ] Proposal 的 `tasks.md` 已按实际完成情况更新
- [ ] Proposal 完整回归、OpenSpec strict validation 和 Story 测试验证 goal 已通过
- [ ] Proposal 集成分支已完成审查并合并到 `dev`
- [ ] Proposal 和 Task worktree 已在合并后清理
- [ ] 文档已更新

---

## 📝 变更管理

### 每次变更必须完成的文档更新

每次需求变更或 bug 修复完成后，**必须**在 `docs/changes/` 下更新变更记录，并按发布版本归档：

- **全量流水**：在 `docs/changes/changelog.md` 追加一条变更摘要（日期、类型、影响模块、简述）
- **版本归档**：在当前发布版本目录 `docs/changes/releases/v<version>/changelog.md` 追加对应变更；目录名必须带版本号，例如 `docs/changes/releases/v0.1.14/changelog.md`
- **架构调整**：同时更新 AGENTS.md 对应章节，并升级版本号
- **Bug 修复**：记录根因和修复方式，更新受影响模块的说明

变更摘要格式（同时用于 `docs/changes/changelog.md` 和 `docs/changes/releases/v<version>/changelog.md`）：

```
## YYYY-MM-DD — <类型>：<标题>

**类型**：feat / fix / refactor / docs
**影响模块**：<模块路径列表>
**摘要**：<1-3 句话描述变更原因和结果>
```

### 架构规约变更流程

1. **提出变更请求**
   - 说明变更原因
   - 评估影响范围
   - 提供替代方案

2. **架构评审**
   - 技术负责人审核
   - 团队讨论
   - 决策记录

3. **更新文档**
   - 在 `docs/changes/changelog.md` 追加变更摘要
   - 在当前版本目录 `docs/changes/releases/v<version>/changelog.md` 追加或整理版本更新说明
   - 更新 AGENTS.md 相关章节及版本号
   - 通知所有开发者

### 紧急变更

如遇到阻塞性问题需要紧急变更架构规约：
1. 立即通知技术负责人
2. 在 `docs/changes/changelog.md` 和当前版本目录 `docs/changes/releases/v<version>/changelog.md` 记录问题和解决方案
3. 24 小时内完成 AGENTS.md 更新

---

## 📞 联系方式

**架构问题咨询：**
- 技术负责人：Archersado
- 文档维护：BMAD 工作流

**规约违反报告：**
- 通过 PR Review 流程
- 通过 Issue 跟踪

---

## 📚 相关文档

- [PRD 文档](/_bmad-output/planning-artifacts/prd.md)
- [架构文档](/_bmad-output/planning-artifacts/architecture.md)
- [UX 设计规范](/_bmad-output/planning-artifacts/ux-design-specification.md)
- [Epic 和 Story](/_bmad-output/planning-artifacts/epics.md)

---

**最后更新：** 2026-07-29（v2.5.2：要求 OpenSpec 文档除规范关键字、代码标识和专有名词外统一使用中文）
**下次审查：** 实施完成后
