# Story OS.3: Agent 对象定义

**状态:** Development Complete
**优先级:** Critical
**完成时间**: ~20 分钟

---

## 用户故事

> 作为系统,我希望将 Agent 定义为可托管的系统对象,这样它们能在桌面空间中显示和交互。

---

## 功能需求

### 核心功能
- **Agent 数据模型**: 定义 Agent 元数据(ID、名称、图标、状态)
- **Agent 注册系统**: Agent 可注册到系统
- **Agent 类型系统**: 区分不同 Agent 类型(架构师、开发者、QA、UX、PM)
- **Agent 状态管理**: 运行中、空闲、暂停、错误状态

---

## 验收标准

- [x] Agent 数据模型定义完整(包含所有必需字段)
- [x] Agent 注册系统可用(注册、查询、注销)
- [x] 至少 5 种 Agent 类型定义
- [x] 状态管理正确切换(idle ↔ running ↔ paused)
- [x] 元数据可扩展
- [x] 与 Dock 集成可工作

---

## 交付物

### 类型定义 (`src/types/agent.ts`)
- AgentType 枚举 (5 种类型)
- AgentStatus 枚举 (5 种状态)
- AgentObject 接口
- AgentTypeInfo 接口
- AgentRegistryState 接口

### Store (`src/store/agentRegistry.ts`)
- useAgentRegistryStore (Zustand)
- 选择器 (selectAgents, selectAgent, etc.)
- 5 种默认 Agents

### Hooks (`src/hooks/agent.ts`)
- useAgentRegistry
- useAgent
- useAgentType
- useAgentSearch

### Registry 实现 (`src/lib/agents/`)
- registry.ts (AgentRegistry 错误类, validateAgent, agentsToDockApps)
- defaults.ts (DEFAULT_AGENTS)

### 集成
- Dock 组件更新为使用 Agents
- 点击 Agent 图标切换状态 (IDLE ↔ RUNNING)

---

## 依赖关系

**前置依赖:** OS.2 (Dock 任务栏) ✅ 已完成
**后置依赖:** OS.7 (Agent 托管服务)

---

## 相关文档

- Epic README: `docs/specs/epic-OS/README.md`
- PRD: `docs/specs/epic-OS/story-OS.3/prd.md`
- IDD: `docs/specs/epic-OS/story-OS.3/interaction.md`
- ADD: `docs/specs/epic-OS/story-OS.3/architecture.md`
- pi-agent-core 文档: `src/lib/integrations/pi-agent/`
