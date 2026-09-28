# Story OS.3: Agent 对象定义 - 架构设计文档 (ADD)

**版本**: v1.0
**日期**: 2026-03-07
**状态**: 草稿
**批准状态**: 待批准

---

## 1. 架构概述

### 1.1 设计目标

将 Agent 定义为系统中的可托管对象，使其能在桌面空间和 Dock 中显示和交互。

### 1.2 架构原则

| 原则 | 实施 |
|-----|------|
| **类型安全** | 完整的 TypeScript 类型定义 |
| **状态可预测** | Zustand store 管理状态 |
| **注册扩展** | 开放的 Agent 注册系统 |
| **一致性** | 与 OS.1/OS.2 技术栈一致 |

### 1.3 技术栈

```
React 18 + TypeScript
├── Zustand (状态管理)
├── React Context (依赖注入)
└── pi-agent-core (底层集成)
```

---

## 2. Agent 类型定义

### 2.1 AgentType 枚举

```typescript
export enum AgentType {
  ARCHITECT = 'architect',      // 系统架构师
  DEVELOPER = 'developer',      // 开发者
  QA_ENGINEER = 'qa-engineer',  // QA 工程师
  UX_DESIGNER = 'ux-designer',  // UX 设计师
  PM = 'pm',                    // 产品经理
}

export type AgentTypeInfo = {
  id: AgentType;
  name: string;
  displayName: string;
  icon: string;
  color: string;
  capabilities: string[];
};

export const AGENT_TYPE_INFO: Record<AgentType, AgentTypeInfo> = {
  [AgentType.ARCHITECT]: {
    id: AgentType.ARCHITECT,
    name: 'architect',
    displayName: '架构师',
    icon: '🏗️',
    color: '#3B82F6',
    capabilities: ['architecture', 'design', 'review'],
  },
  [AgentType.DEVELOPER]: {
    id: AgentType.DEVELOPER,
    name: 'developer',
    displayName: '开发者',
    icon: '💻',
    color: '#10B981',
    capabilities: ['code', 'test', 'debug'],
  },
  [AgentType.QA_ENGINEER]: {
    id: AgentType.QA_ENGINEER,
    name: 'qa-engineer',
    displayName: 'QA 工程师',
    icon: '🧪',
    color: '#F59E0B',
    capabilities: ['test', 'review', 'quality'],
  },
  [AgentType.UX_DESIGNER]: {
    id: AgentType.UX_DESIGNER,
    name: 'ux-designer',
    displayName: 'UX 设计师',
    icon: '🎨',
    color: '#8B5CF6',
    capabilities: ['design', 'research', 'prototyping'],
  },
  [AgentType.PM]: {
    id: AgentType.PM,
    name: 'pm',
    displayName: '产品经理',
    icon: '📋',
    color: '#EC4899',
    capabilities: ['planning', 'requirements', 'coordination'],
  },
};
```

### 2.2 AgentStatus 枚举

```typescript
export enum AgentStatus {
  IDLE = 'idle',           // 空闲
  RUNNING = 'running',     // 运行中
  PAUSED = 'paused',       // 暂停
  ERROR = 'error',         // 错误
  UNREGISTERED = 'unregistered', // 未注册
}

export const AGENT_STATUS_ICON: Record<AgentStatus, string> = {
  [AgentStatus.IDLE]: '⚪',
  [AgentStatus.RUNNING]: '🟢',
  [AgentStatus.PAUSED]: '🟡',
  [AgentStatus.ERROR]: '🔴',
  [AgentStatus.UNREGISTERED]: '⚫',
};

export const AGENT_STATUS_COLOR: Record<AgentStatus, string> = {
  [AgentStatus.IDLE]: '#9CA3AF',
  [AgentStatus.RUNNING]: '#10B981',
  [AgentStatus.PAUSED]: '#F59E0B',
  [AgentStatus.ERROR]: '#EF4444',
  [AgentStatus.UNREGISTERED]: '#6B7280',
};
```

### 2.3 AgentObject 核心接口

```typescript
export interface AgentObject {
  id: string;
  name: string;
  displayName: string;
  type: AgentType;
  status: AgentStatus;
  icon: string;
  color: string;
  capabilities: string[];
  metadata?: Record<string, unknown>;
  createdAt: number;
  lastActivatedAt: number;
}

export interface AgentMetadata {
  version?: string;
  description?: string;
  author?: string;
  tags?: string[];
  config?: Record<string, unknown>;
}
```

---

## 3. Agent Registry 系统架构

### 3.1 Registry 模式

```typescript
export interface AgentRegistry {
  // 查询
  getAgent(id: string): AgentObject | null;
  getAgentsByType(type: AgentType): AgentObject[];
  getAgentsByStatus(status: AgentStatus): AgentObject[];
  getAllAgents(): AgentObject[];

  // 注册管理
  registerAgent(agent: AgentObject): void;
  unregisterAgent(id: string): void;
  updateAgent(id: string, updates: Partial<AgentObject>): void;

  // 状态管理
  setAgentStatus(id: string, status: AgentStatus): void;
  setActive(id: string, isActive: boolean): void;

  // 搜索
  searchAgents(query: string): AgentObject[];
}
```

### 3.2 Registry Store

```typescript
export interface AgentRegistryState {
  agents: Record<string, AgentObject>;
  activeAgentId: string | null;
  isLoading: boolean;

  // Actions
  setAgent: (id: string, agent: AgentObject) => void;
  removeAgent: (id: string) => void;
  updateAgent: (id: string, updates: Partial<AgentObject>) => void;
  setActiveAgent: (id: string | null) => void;
  setAgentStatus: (id: string, status: AgentStatus) => void;
  bulkSetAgents: (agents: AgentObject[]) => void;
  clearAll: () => void;
}

export const useAgentRegistryStore = create<AgentRegistryState>((set, get) => ({
  agents: {},
  activeAgentId: null,
  isLoading: false,

  setAgent: (id, agent) =>
    set((state) => ({
      agents: { ...state.agents, [id]: agent },
    })),

  removeAgent: (id) =>
    set((state) => {
      const { [id]: removed, ...rest } = state.agents;
      return { agents: rest };
    }),

  updateAgent: (id, updates) =>
    set((state) => ({
      agents: {
        ...state.agents,
        [id]: state.agents[id] ? { ...state.agents[id], ...updates } : undefined,
      },
    })),

  setActiveAgent: (id) =>
    set({ activeAgentId: id }),

  setAgentStatus: (id, status) =>
    set((state) => ({
      agents: {
        ...state.agents,
        [id]: state.agents[id]
          ? { ...state.agents[id], status, lastActivatedAt: Date.now() }
          : undefined,
      },
    })),

  bulkSetAgents: (agents) =>
    set(() => ({
      agents: agents.reduce((acc, agent) => ({ ...acc, [agent.id]: agent }), {}),
    })),

  clearAll: () => set({ agents: {}, activeAgentId: null }),
}));
```

### 3.3 默认 Agents

```typescript
export const DEFAULT_AGENTS: AgentObject[] = [
  {
    id: 'agent-pm-1',
    name: 'pm-1',
    displayName: '产品经理',
    type: AgentType.PM,
    status: AgentStatus.IDLE,
    icon: '📋',
    color: '#EC4899',
    capabilities: ['planning', 'requirements', 'coordination'],
    createdAt: Date.now(),
    lastActivatedAt: Date.now(),
  },
  {
    id: 'agent-architect-1',
    name: 'architect-1',
    displayName: '架构师',
    type: AgentType.ARCHITECT,
    status: AgentStatus.IDLE,
    icon: '🏗️',
    color: '#3B82F6',
    capabilities: ['architecture', 'design', 'review'],
    createdAt: Date.now(),
    lastActivatedAt: Date.now(),
  },
  {
    id: 'agent-ux-designer-1',
    name: 'ux-designer-1',
    displayName: 'UX 设计师',
    type: AgentType.UX_DESIGNER,
    status: AgentStatus.IDLE,
    icon: '🎨',
    color: '#8B5CF6',
    capabilities: ['design', 'research', 'prototyping'],
    createdAt: Date.now(),
    lastActivatedAt: Date.now(),
  },
  {
    id: 'agent-developer-1',
    name: 'developer-1',
    displayName: '开发者',
    type: AgentType.DEVELOPER,
    status: AgentStatus.IDLE,
    icon: '💻',
    color: '#10B981',
    capabilities: ['code', 'test', 'debug'],
    createdAt: Date.now(),
    lastActivatedAt: Date.now(),
  },
  {
    id: 'agent-qa-1',
    name: 'qa-1',
    displayName: 'QA 工程师',
    type: AgentType.QA_ENGINEER,
    status: AgentStatus.IDLE,
    icon: '🧪',
    color: '#F59E0B',
    capabilities: ['test', 'review', 'quality'],
    createdAt: Date.now(),
    lastActivatedAt: Date.now(),
  },
];
```

---

## 4. Hooks 设计

### 4.1 useAgentRegistry Hook

```typescript
export interface UseAgentRegistryReturn {
  // 查询
  agents: AgentObject[];
  agentMap: Record<string, AgentObject>;
  activeAgent: AgentObject | null;

  // 注册
  registerAgent: (agent: AgentObject) => void;
  unregisterAgent: (id: string) => void;
  updateAgent: (id: string, updates: Partial<AgentObject>) => void;

  // 状态管理
  setAgentStatus: (id: string, status: AgentStatus) => void;
  setActiveAgent: (id: string | null) => void;

  // 搜索
  searchAgents: (query: string) => AgentObject[];
  getAgentsByType: (type: AgentType) => AgentObject[];
  getAgentsByStatus: (status: AgentStatus) => AgentObject[];
}

export function useAgentRegistry(): UseAgentRegistryReturn
```

### 4.2 useAgent Hook

```typescript
export interface UseAgentReturn {
  agent: AgentObject | null;
  status: AgentStatus;
  typeInfo: AgentTypeInfo;
  isRunning: boolean;
  isIdle: boolean;
  isError: boolean;
  isPaused: boolean;
  setStatus: (status: AgentStatus) => void;
  activate: () => void;
  deactivate: () => void;
}

export function useAgent(id: string): UseAgentReturn
```

### 4.3 useAgentType Hook

```typescript
export interface UseAgentTypeReturn {
  typeInfo: AgentTypeInfo;
  agents: AgentObject[];
  getAgentIcon: () => string;
  getStatusIcon: () => string;
  getColor: () => string;
}

export function useAgentType(type: AgentType): UseAgentTypeReturn
```

### 4.4 useAgentSearch Hook

```typescript
export interface UseAgentSearchReturn {
  query: string;
  results: AgentObject[];
  setQuery: (query: string) => void;
  hasResults: boolean;
  resultCount: number;
}

export function useAgentSearch(): UseAgentSearchReturn
```

---

## 5. 与 Dock 集成

### 5.1 Dock Apps from Agents

```typescript
// Agent registry → Dock apps
export function agentsToDockApps(agents: AgentObject[]): DockApp[] {
  return Object.values(agents).map((agent) => ({
    id: agent.id,
    name: agent.displayName,
    icon: agent.icon,
    iconType: 'emoji' as const,
    isRunning: agent.status === AgentStatus.RUNNING,
    isPinned: true,
    index: 0, // Will be calculated by Dock
  }));
}
```

### 5.2 Status Sync

```typescript
// Agent status → Dock indicator
export function syncAgentStatusToDock(agentId: string, status: AgentStatus): void {
  const dockStore = useDockStore.getState();
  dockStore.setAppRunning(agentId, status === AgentStatus.RUNNING);
}
```

---

## 6. 文件结构

```
src/
├── types/
│   └── agent.ts              # Agent 类型定义
├── store/
│   └── agentRegistry.ts      # Agent registry Zustand store
├── hooks/
│   └── agent.ts              # Agent-related hooks
├── lib/
│   └── agents/
│       ├── registry.ts       # Registry 实现
│       └── defaults.ts       # 默认 agents
└── constants/
    └── agents.ts             # Agent 常量
```

---

## 7. 状态转换

### 7.1 Agent 状态机

```
                    ┌─────────────┐
                    │ UNREGISTERED │
                    └──────┬──────┘
                           │
                    register
                           │
                           ▼
                    ┌───────────┐
                    │   IDLE    │ ◄──────────┐
                    └─────┬─────┘           │
                          │                │
                    activate         deactivate
                          │                │
                          ▼                │
                    ┌───────────┐          │
                    │  RUNNING  ├──────────┘
                    └─────┬─────┘
                          │
                    pause/error
                    ┌─────┴─────┐
                    │           │
                    ▼           ▼
                PAUSED        ERROR
                    │           │
                resume      fix/restart
                    │           │
                    └─────┬─────┘
                          │
                          ▼
                    ┌───────────┐
                    │   IDLE    │
                    └───────────┘
```

### 7.2 状态转换规则

| From | To | Condition | Action |
|------|----|-----------|--------|
| UNREGISTERED | IDLE | register() | Add to registry |
| IDLE | RUNNING | activate() | Start agent |
| RUNNING | PAUSED | pause() | Pause agent |
| RUNNING | ERROR | error() | Handle error |
| PAUSED | RUNNING | resume() | Resume agent |
| PAUSED | IDLE | deactivate() | Stop agent |
| ERROR | IDLE | fix/restart | Recover agent |
| ERROR | RUNNING | retry() | Retry agent |

---

## 8. 性能优化

### 8.1 Memoization

```typescript
// Agent selector
export const selectAgent = (id: string) => (state: AgentRegistryState) =>
  state.agents[id];

// Agents array selector (memoized)
export const selectAgents = createSelector(
  [(state: AgentRegistryState) => state.agents],
  (agents) => Object.values(agents)
);

// Filtered agents (memoized)
export const selectAgentsByType = (type: AgentType) =>
  createSelector([selectAgents], (agents) =>
    agents.filter((agent) => agent.type === type)
  );
```

### 8.2 React.memo

```typescript
export const AgentIcon = React.memo(function AgentIcon({
  agent,
  onClick,
}: {
  agent: AgentObject;
  onClick: () => void;
}) {
  // Component implementation
}, (prev, next) => prev.agent.status === next.agent.status);
```

---

## 9. 测试策略

### 9.1 单元测试

```typescript
describe('Agent Registry', () => {
  it('should register agent', () => {
    // Test agent registration
  });

  it('should update agent status', () => {
    // Test status update
  });

  it('should filter agents by type', () => {
    // Test type filtering
  });
});
```

### 9.2 集成测试

```typescript
describe('Agent → Dock Integration', () => {
  it('should sync agent status to dock', () => {
    // Test status sync
  });
});
```

---

## 10. 安全性考虑

### 10.1 输入验证

```typescript
export function validateAgent(agent: unknown): agent is AgentObject {
  return (
    typeof agent === 'object' &&
    agent !== null &&
    typeof (agent as AgentObject).id === 'string' &&
    typeof (agent as AgentObject).name === 'string' &&
    Object.values(AgentType).includes((agent as AgentObject).type) &&
    Object.values(AgentStatus).includes((agent as AgentObject).status)
  );
}
```

### 10.2 错误处理

```typescript
export class AgentRegistryError extends Error {
  constructor(
    message: string,
    public code: string,
    public agentId?: string
  ) {
    super(message);
    this.name = 'AgentRegistryError';
  }
}
```

---

## 11. 附录

### 11.1 完整类型定义

```typescript
// src/types/agent.ts

export enum AgentType {
  ARCHITECT = 'architect',
  DEVELOPER = 'developer',
  QA_ENGINEER = 'qa-engineer',
  UX_DESIGNER = 'ux-designer',
  PM = 'pm',
}

export enum AgentStatus {
  IDLE = 'idle',
  RUNNING = 'running',
  PAUSED = 'paused',
  ERROR = 'error',
  UNREGISTERED = 'unregistered',
}

export interface AgentObject {
  id: string;
  name: string;
  displayName: string;
  type: AgentType;
  status: AgentStatus;
  icon: string;
  color: string;
  capabilities: string[];
  metadata?: Record<string, unknown>;
  createdAt: number;
  lastActivatedAt: number;
}

export interface AgentTypeInfo {
  id: AgentType;
  name: string;
  displayName: string;
  icon: string;
  color: string;
  capabilities: string[];
}

export interface AgentRegistryState {
  agents: Record<string, Object>;
  activeAgentId: string | null;
  isLoading: boolean;
  setAgent: (id: string, agent: AgentObject) => void;
  removeAgent: (id: string) => void;
  updateAgent: (id: string, updates: Partial<AgentObject>) => void;
  setActiveAgent: (id: string | null) => void;
  setAgentStatus: (id: string, status: AgentStatus) => void;
  bulkSetAgents: (agents: AgentObject[]) => void;
  clearAll: () => void;
}
```

### 11.2 依赖清单

```json
{
  "dependencies": {
    "zustand": "^4.5.0",
    "react": "^18.2.0",
    "typescript": "^5.3.0"
  }
}
```

### 11.3 集成点

| 集成点 | Story | 状态 |
|-------|-------|------|
| Dock Apps | OS.2 | ✅ 已完成 |
| Spotlight Search | OS.4 | ⏳ 待开发 |
| Agent Windows | OS.5 | ⏳ 待开发 |
| Agent Hosting Service | OS.7 | ⏳ 待开发 |

---

**批准签名**：

- [ ] 产品经理 (PM)
- [ ] UX 设计师
- [ ] 系统架构师
- [ ] 开发负责人
