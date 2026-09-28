# Story OS.7: Agent 托管服务 - 架构设计文档

**版本**: v1.0
**日期**: 2026-03-12
**状态**: 架构设计
**Architect**: System Architect

---

## 1. 概述

### 1.1 设计目标

创建 Agent 托管服务，让 AI Agent 在 OriginOS 中可视化运行和交互。

**核心能力:**
- **可视化渲染**: Agent 在 Desktop/Dock 中显示
- **对话交互**: Acrylic 材质对话窗口
- **状态管理**: 实时状态同步
- **多任务支持**: 多 Agent 并发运行

### 1.2 架构层次

```
┌─────────────────────────────────────────────────────────┐
│                    UI Layer                             │
│  (AgentIcon, AgentDialog, AgentStatusIndicator)        │
├─────────────────────────────────────────────────────────┤
│                   Component Layer                       │
│  (AgentDesktopItem, AgentDockIcon, AgentWindowManager) │
├─────────────────────────────────────────────────────────┤
│                    Hook Layer                           │
│  (useAgentLauncher, useAgentHost, useAgentWindow)      │
├─────────────────────────────────────────────────────────┤
│                   Service Layer                         │
│  (AgentHostService, AgentWindowManager, AgentFactory)  │
├─────────────────────────────────────────────────────────┤
│                    Store Layer                          │
│  (agentHostStore, agentLauncherStore, agentRegistry)   │
├─────────────────────────────────────────────────────────┤
│                    Type Layer                           │
│  (AgentObject, AgentStatus, AgentWindow, AgentSession) │
└─────────────────────────────────────────────────────────┘
```

---

## 2. 文件结构

```
src/
├── components/
│   └── os/
│       └── agent/
│           ├── AgentIcon.tsx           # Agent 图标组件
│           ├── AgentDialog.tsx         # Agent 对话窗口
│           ├── AgentStatusIndicator.tsx # 状态指示器
│           ├── AgentDesktopItem.tsx    # Desktop Agent 图标
│           ├── AgentDockIcon.tsx       # Dock Agent 图标
│           ├── AgentWindowManager.tsx  # 窗口管理器
│           └── index.ts                # 导出
│
├── hooks/
│   ├── useAgentLauncher.ts             # ✅ 已存在 - Agent 启动器
│   ├── useAgent.ts                     # ✅ 已存在 - Agent 查询
│   ├── useAgentHost.ts                 # 新增 - Agent 托管
│   ├── useAgentWindow.ts               # 新增 - 窗口管理
│   └── useAgentStatus.ts               # 新增 - 状态同步
│
├── services/
│   ├── AgentHostService.ts             # 新增 - 托管服务
│   ├── AgentWindowManager.ts           # 新增 - 窗口管理
│   └── AgentFactory.ts                 # 新增 - Agent 工厂
│
├── store/
│   ├── agentRegistry.ts                # ✅ 已存在 - Agent 注册表
│   ├── agentHostStore.ts               # ✅ 已存在 - 托管状态
│   └── agentLauncherStore.ts           # ✅ 已存在 - 启动器状态
│
└── types/
    ├── agent-object.ts                 # ✅ 已存在 - Agent 对象类型
    ├── agent-host.ts                   # 新增 - 托管类型
    └── agent-window.ts                 # 新增 - 窗口类型
```

---

## 3. 类型定义

### 3.1 Agent 托管类型

**文件:** `src/types/agent-host.ts`

```typescript
/**
 * OS.7: Agent 托管服务类型定义
 */

import { AgentObject, AgentStatus } from './agent-object';

// Agent 消息类型
export interface AgentMessage {
  id: string;
  agentId: string;
  sessionId: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: number;
  metadata?: {
    tokens?: number;
    model?: string;
    latency?: number;
  };
}

// Agent 会话类型
export interface AgentSession {
  id: string;
  agentId: string;
  projectId?: string;
  status: 'active' | 'paused' | 'completed' | 'error';
  messages: AgentMessage[];
  createdAt: number;
  updatedAt: number;
  metadata?: Record<string, unknown>;
}

// Agent 窗口位置
export interface AgentWindowPosition {
  x: number;
  y: number;
  width: number;
  height: number;
}

// Agent 窗口状态
export interface AgentWindowState {
  id: string;
  agentId: string;
  isOpen: boolean;
  isMinimized: boolean;
  isFocused: boolean;
  position: AgentWindowPosition;
  zIndex: number;
}

// Agent 托管状态
export interface AgentHostState {
  // 托管的 Agent 列表
  hostedAgents: AgentObject[];

  // 活跃会话
  activeSessions: Record<string, AgentSession>;

  // 窗口状态
  windowStates: Record<string, AgentWindowState>;

  // 当前聚焦窗口
  focusedWindowId: string | null;

  // 最大 z-index
  maxZIndex: number;
}

// Agent 托管操作
export interface AgentHostActions {
  // Agent 管理
  hostAgent: (agent: AgentObject) => void;
  unhostAgent: (agentId: string) => void;
  updateAgentStatus: (agentId: string, status: AgentStatus) => void;

  // 会话管理
  createSession: (agentId: string, projectId?: string) => AgentSession;
  endSession: (sessionId: string) => void;
  addMessage: (sessionId: string, message: Omit<AgentMessage, 'id' | 'timestamp'>) => void;

  // 窗口管理
  openWindow: (agentId: string) => void;
  closeWindow: (agentId: string) => void;
  minimizeWindow: (agentId: string) => void;
  focusWindow: (agentId: string) => void;
  updateWindowPosition: (agentId: string, position: Partial<AgentWindowPosition>) => void;
}

// Agent 托管返回类型
export type AgentHostStore = AgentHostState & AgentHostActions;
```

### 3.2 Agent 窗口类型

**文件:** `src/types/agent-window.ts`

```typescript
/**
 * Agent 窗口管理类型
 */

// 窗口配置
export interface AgentWindowConfig {
  defaultWidth: number;
  defaultHeight: number;
  minWidth: number;
  minHeight: number;
  maxWidth: number;
  maxHeight: number;
}

// 窗口约束
export interface AgentWindowConstraints {
  allowResize: boolean;
  allowDrag: boolean;
  allowMinimize: boolean;
  allowMaximize: boolean;
  keepInBounds: boolean;
}

// 窗口层级
export interface AgentWindowLayer {
  base: number;      // 基础层级
  dialog: number;    // 对话框层级
  modal: number;     // 模态框层级
  toast: number;     // Toast 层级
}

// 默认窗口配置
export const DEFAULT_WINDOW_CONFIG: AgentWindowConfig = {
  defaultWidth: 600,
  defaultHeight: 800,
  minWidth: 400,
  minHeight: 500,
  maxWidth: 1200,
  maxHeight: 900,
};

// 默认窗口约束
export const DEFAULT_WINDOW_CONSTRAINTS: AgentWindowConstraints = {
  allowResize: true,
  allowDrag: true,
  allowMinimize: true,
  allowMaximize: false,
  keepInBounds: true,
};

// 窗口层级常量
export const WINDOW_LAYERS: AgentWindowLayer = {
  base: 100,
  dialog: 200,
  modal: 300,
  toast: 400,
};
```

---

## 4. Store 层设计

### 4.1 Agent Host Store (增强版)

**文件:** `src/store/agentHostStore.ts`

```typescript
/**
 * OS.7: Agent Host Store (增强版)
 * 管理 Agent 托管状态、会话和窗口
 */

import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';
import {
  AgentObject,
  AgentStatus,
  AgentSession,
  AgentMessage,
  AgentWindowState,
  AgentWindowPosition,
  DEFAULT_WINDOW_CONFIG,
  WINDOW_LAYERS,
} from '@/types';

interface AgentHostState {
  // 状态
  hostedAgents: AgentObject[];
  activeSessions: Record<string, AgentSession>;
  windowStates: Record<string, AgentWindowState>;
  focusedWindowId: string | null;
  maxZIndex: number;
  messageCache: Record<string, AgentMessage[]>;

  // Agent 管理
  hostAgent: (agent: AgentObject) => void;
  unhostAgent: (agentId: string) => void;
  updateHostedAgentStatus: (agentId: string, status: AgentStatus) => void;

  // 会话管理
  createSession: (agentId: string, projectId?: string) => AgentSession;
  getSession: (sessionId: string) => AgentSession | undefined;
  endSession: (sessionId: string) => void;
  addMessage: (sessionId: string, message: Omit<AgentMessage, 'id' | 'timestamp'>) => void;
  clearSessionMessages: (sessionId: string) => void;

  // 窗口管理
  openWindow: (agentId: string) => void;
  closeWindow: (agentId: string) => void;
  closeAllWindows: () => void;
  minimizeWindow: (agentId: string) => void;
  focusWindow: (agentId: string) => void;
  updateWindowPosition: (agentId: string, position: Partial<AgentWindowPosition>) => void;
  getOpenWindowIds: () => string[];
  isWindowOpen: (agentId: string) => boolean;

  // 消息缓存
  cacheMessages: (sessionId: string, messages: AgentMessage[]) => void;
  getCachedMessages: (sessionId: string) => AgentMessage[];
}

// 生成唯一 ID
const generateId = () => `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

// 计算居中位置
const getCenteredPosition = (): AgentWindowPosition => {
  const width = DEFAULT_WINDOW_CONFIG.defaultWidth;
  const height = DEFAULT_WINDOW_CONFIG.defaultHeight;
  const centerX = (window.innerWidth - width) / 2;
  const centerY = (window.innerHeight - height) / 2;
  return { x: centerX, y: centerY, width, height };
};

export const useAgentHostStore = create<AgentHostState>()(
  subscribeWithSelector((set, get) => ({
    // 初始状态
    hostedAgents: [],
    activeSessions: {},
    windowStates: {},
    focusedWindowId: null,
    maxZIndex: WINDOW_LAYERS.base,
    messageCache: {},

    // ============ Agent 管理 ============

    hostAgent: (agent) =>
      set((state) => {
        const exists = state.hostedAgents.some((a) => a.id === agent.id);
        if (exists) return state;
        return {
          hostedAgents: [...state.hostedAgents, agent],
        };
      }),

    unhostAgent: (agentId) =>
      set((state) => {
        // 关闭窗口
        const { [agentId]: _, ...remainingWindows } = state.windowStates;
        // 结束相关会话
        const remainingSessions = Object.fromEntries(
          Object.entries(state.activeSessions).filter(([_, s]) => s.agentId !== agentId)
        );
        return {
          hostedAgents: state.hostedAgents.filter((a) => a.id !== agentId),
          windowStates: remainingWindows,
          activeSessions: remainingSessions,
          focusedWindowId: state.focusedWindowId === agentId ? null : state.focusedWindowId,
        };
      }),

    updateHostedAgentStatus: (agentId, status) =>
      set((state) => ({
        hostedAgents: state.hostedAgents.map((a) =>
          a.id === agentId ? { ...a, status, lastActivatedAt: Date.now() } : a
        ),
      })),

    // ============ 会话管理 ============

    createSession: (agentId, projectId) => {
      const sessionId = generateId();
      const session: AgentSession = {
        id: sessionId,
        agentId,
        projectId,
        status: 'active',
        messages: [],
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };

      set((state) => ({
        activeSessions: { ...state.activeSessions, [sessionId]: session },
      }));

      return session;
    },

    getSession: (sessionId) => get().activeSessions[sessionId],

    endSession: (sessionId) =>
      set((state) => {
        const { [sessionId]: _, ...remaining } = state.activeSessions;
        return {
          activeSessions: remaining,
        };
      }),

    addMessage: (sessionId, message) =>
      set((state) => {
        const session = state.activeSessions[sessionId];
        if (!session) return state;

        const newMessage: AgentMessage = {
          ...message,
          id: generateId(),
          timestamp: Date.now(),
        };

        return {
          activeSessions: {
            ...state.activeSessions,
            [sessionId]: {
              ...session,
              messages: [...session.messages, newMessage],
              updatedAt: Date.now(),
            },
          },
        };
      }),

    clearSessionMessages: (sessionId) =>
      set((state) => {
        const session = state.activeSessions[sessionId];
        if (!session) return state;

        return {
          activeSessions: {
            ...state.activeSessions,
            [sessionId]: {
              ...session,
              messages: [],
              updatedAt: Date.now(),
            },
          },
        };
      }),

    // ============ 窗口管理 ============

    openWindow: (agentId) =>
      set((state) => {
        const existingWindow = state.windowStates[agentId];
        if (existingWindow?.isOpen) {
          // 如果已打开，聚焦
          return {
            focusedWindowId: agentId,
            maxZIndex: state.maxZIndex + 1,
            windowStates: {
              ...state.windowStates,
              [agentId]: {
                ...existingWindow,
                isFocused: true,
                isMinimized: false,
                zIndex: state.maxZIndex + 1,
              },
            },
          };
        }

        // 新窗口
        const newWindow: AgentWindowState = {
          id: generateId(),
          agentId,
          isOpen: true,
          isMinimized: false,
          isFocused: true,
          position: getCenteredPosition(),
          zIndex: state.maxZIndex + 1,
        };

        // 取消之前窗口的聚焦
        const updatedWindows = Object.fromEntries(
          Object.entries(state.windowStates).map(([id, w]) => [
            id,
            { ...w, isFocused: false },
          ])
        );

        return {
          windowStates: { ...updatedWindows, [agentId]: newWindow },
          focusedWindowId: agentId,
          maxZIndex: state.maxZIndex + 1,
        };
      }),

    closeWindow: (agentId) =>
      set((state) => {
        const { [agentId]: _, ...remaining } = state.windowStates;
        const openWindows = Object.values(remaining).filter((w) => w.isOpen);
        const newFocusedId = openWindows.length > 0
          ? openWindows.reduce((a, b) => (a.zIndex > b.zIndex ? a : b)).agentId
          : null;

        return {
          windowStates: remaining,
          focusedWindowId: newFocusedId,
        };
      }),

    closeAllWindows: () =>
      set(() => ({
        windowStates: {},
        focusedWindowId: null,
      })),

    minimizeWindow: (agentId) =>
      set((state) => {
        const window = state.windowStates[agentId];
        if (!window) return state;

        return {
          windowStates: {
            ...state.windowStates,
            [agentId]: { ...window, isMinimized: true, isFocused: false },
          },
          focusedWindowId: state.focusedWindowId === agentId ? null : state.focusedWindowId,
        };
      }),

    focusWindow: (agentId) =>
      set((state) => {
        const window = state.windowStates[agentId];
        if (!window || !window.isOpen) return state;

        // 取消所有窗口的聚焦
        const updatedWindows = Object.fromEntries(
          Object.entries(state.windowStates).map(([id, w]) => [
            id,
            id === agentId
              ? { ...w, isFocused: true, isMinimized: false, zIndex: state.maxZIndex + 1 }
              : { ...w, isFocused: false },
          ])
        );

        return {
          windowStates: updatedWindows,
          focusedWindowId: agentId,
          maxZIndex: state.maxZIndex + 1,
        };
      }),

    updateWindowPosition: (agentId, position) =>
      set((state) => {
        const window = state.windowStates[agentId];
        if (!window) return state;

        return {
          windowStates: {
            ...state.windowStates,
            [agentId]: {
              ...window,
              position: { ...window.position, ...position },
            },
          },
        };
      }),

    getOpenWindowIds: () =>
      Object.values(get().windowStates)
        .filter((w) => w.isOpen && !w.isMinimized)
        .map((w) => w.agentId),

    isWindowOpen: (agentId) => {
      const window = get().windowStates[agentId];
      return window?.isOpen && !window.isMinimized;
    },

    // ============ 消息缓存 ============

    cacheMessages: (sessionId, messages) =>
      set((state) => ({
        messageCache: { ...state.messageCache, [sessionId]: messages },
      })),

    getCachedMessages: (sessionId) => get().messageCache[sessionId] || [],
  }))
);
```

---

## 5. Service 层设计

### 5.1 Agent Host Service

**文件:** `src/services/AgentHostService.ts`

```typescript
/**
 * OS.7: Agent Host Service
 * Agent 托管核心服务，协调 Agent 生命周期
 */

import { AgentObject, AgentStatus, AgentSession, AgentMessage } from '@/types';
import { useAgentHostStore } from '@/store/agentHostStore';
import { useAgentRegistryStore } from '@/store/agentRegistry';

export interface HostAgentOptions {
  agent: AgentObject;
  autoStart?: boolean;
  projectContext?: Record<string, unknown>;
}

export interface StartSessionOptions {
  agentId: string;
  projectId?: string;
  initialMessage?: string;
}

export class AgentHostService {
  private static instance: AgentHostService | null = null;

  private constructor() {}

  static getInstance(): AgentHostService {
    if (!AgentHostService.instance) {
      AgentHostService.instance = new AgentHostService();
    }
    return AgentHostService.instance;
  }

  /**
   * 托管 Agent
   */
  hostAgent(options: HostAgentOptions): AgentObject {
    const { agent, autoStart = false } = options;
    const hostStore = useAgentHostStore.getState();

    // 添加到托管列表
    hostStore.hostAgent(agent);

    // 同时注册到 Registry
    useAgentRegistryStore.getState().setAgent(agent.id, agent);

    // 自动启动
    if (autoStart) {
      this.activateAgent(agent.id);
    }

    return agent;
  }

  /**
   * 取消托管 Agent
   */
  unhostAgent(agentId: string): void {
    const hostStore = useAgentHostStore.getState();

    // 关闭窗口
    hostStore.closeWindow(agentId);

    // 移除托管
    hostStore.unhostAgent(agentId);

    // 更新状态
    useAgentRegistryStore.getState().setAgentStatus(agentId, AgentStatus.IDLE);
  }

  /**
   * 激活 Agent
   */
  activateAgent(agentId: string): void {
    const hostStore = useAgentHostStore.getState();
    const registryStore = useAgentRegistryStore.getState();

    // 打开窗口
    hostStore.openWindow(agentId);

    // 设置为运行状态
    registryStore.setAgentStatus(agentId, AgentStatus.RUNNING);
    registryStore.setActiveAgent(agentId);
  }

  /**
   * 停用 Agent
   */
  deactivateAgent(agentId: string): void {
    const hostStore = useAgentHostStore.getState();
    const registryStore = useAgentRegistryStore.getState();

    // 最小化窗口
    hostStore.minimizeWindow(agentId);

    // 设置为空闲状态
    registryStore.setAgentStatus(agentId, AgentStatus.IDLE);
  }

  /**
   * 启动会话
   */
  startSession(options: StartSessionOptions): AgentSession {
    const { agentId, projectId, initialMessage } = options;
    const hostStore = useAgentHostStore.getState();

    // 创建会话
    const session = hostStore.createSession(agentId, projectId);

    // 如果有初始消息，添加到会话
    if (initialMessage) {
      hostStore.addMessage(session.id, {
        agentId,
        sessionId: session.id,
        role: 'user',
        content: initialMessage,
      });
    }

    // 激活 Agent
    this.activateAgent(agentId);

    return session;
  }

  /**
   * 结束会话
   */
  endSession(sessionId: string): void {
    const hostStore = useAgentHostStore.getState();
    hostStore.endSession(sessionId);
  }

  /**
   * 发送消息
   */
  sendMessage(sessionId: string, content: string, role: 'user' | 'assistant' = 'user'): AgentMessage {
    const hostStore = useAgentHostStore.getState();
    const session = hostStore.getSession(sessionId);

    if (!session) {
      throw new Error(`Session ${sessionId} not found`);
    }

    hostStore.addMessage(sessionId, {
      agentId: session.agentId,
      sessionId,
      role,
      content,
    });

    // 返回最新消息
    const messages = hostStore.getSession(sessionId)?.messages || [];
    return messages[messages.length - 1];
  }

  /**
   * 获取托管的 Agent 列表
   */
  getHostedAgents(): AgentObject[] {
    return useAgentHostStore.getState().hostedAgents;
  }

  /**
   * 获取打开的窗口 ID
   */
  getOpenWindowIds(): string[] {
    return useAgentHostStore.getState().getOpenWindowIds();
  }

  /**
   * 获取活跃会话
   */
  getActiveSessions(): Record<string, AgentSession> {
    return useAgentHostStore.getState().activeSessions;
  }

  /**
   * 聚焦窗口
   */
  focusWindow(agentId: string): void {
    useAgentHostStore.getState().focusWindow(agentId);
  }

  /**
   * 关闭所有窗口
   */
  closeAllWindows(): void {
    useAgentHostStore.getState().closeAllWindows();
  }
}

// 导出单例
export const agentHostService = AgentHostService.getInstance();
```

### 5.2 Agent Factory

**文件:** `src/services/AgentFactory.ts`

```typescript
/**
 * OS.7: Agent Factory
 * 创建和配置 Agent 实例
 */

import { AgentObject, AgentType, AgentStatus, AGENT_TYPE_INFO } from '@/types/agent-object';

export interface CreateAgentOptions {
  type: AgentType;
  name?: string;
  displayName?: string;
  customCapabilities?: string[];
  customIcon?: string;
  customColor?: string;
  metadata?: Record<string, unknown>;
}

export class AgentFactory {
  /**
   * 创建 Agent 实例
   */
  static createAgent(options: CreateAgentOptions): AgentObject {
    const { type, name, displayName, customCapabilities, customIcon, customColor, metadata } = options;
    const typeInfo = AGENT_TYPE_INFO[type];
    const id = `agent-${type}-${Date.now()}`;

    return {
      id,
      name: name || typeInfo.name,
      displayName: displayName || typeInfo.displayName,
      type,
      status: AgentStatus.IDLE,
      icon: customIcon || typeInfo.icon,
      color: customColor || typeInfo.color,
      capabilities: customCapabilities || typeInfo.capabilities,
      metadata,
      createdAt: Date.now(),
      lastActivatedAt: 0,
    };
  }

  /**
   * 创建默认 Agent 集合
   */
  static createDefaultAgents(): AgentObject[] {
    return [
      AgentFactory.createAgent({ type: AgentType.ARCHITECT }),
      AgentFactory.createAgent({ type: AgentType.DEVELOPER }),
      AgentFactory.createAgent({ type: AgentType.QA_ENGINEER }),
      AgentFactory.createAgent({ type: AgentType.UX_DESIGNER }),
      AgentFactory.createAgent({ type: AgentType.PM }),
    ];
  }

  /**
   * 创建自定义 Agent
   */
  static createCustomAgent(options: Omit<CreateAgentOptions, 'type'> & { type: AgentType }): AgentObject {
    return AgentFactory.createAgent(options);
  }

  /**
   * 克隆 Agent
   */
  static cloneAgent(agent: AgentObject, overrides?: Partial<AgentObject>): AgentObject {
    return {
      ...agent,
      id: `agent-${agent.type}-${Date.now()}`,
      createdAt: Date.now(),
      lastActivatedAt: 0,
      ...overrides,
    };
  }

  /**
   * 验证 Agent
   */
  static validateAgent(agent: AgentObject): boolean {
    return (
      typeof agent.id === 'string' &&
      typeof agent.name === 'string' &&
      typeof agent.displayName === 'string' &&
      Object.values(AgentType).includes(agent.type) &&
      Object.values(AgentStatus).includes(agent.status) &&
      Array.isArray(agent.capabilities) &&
      typeof agent.createdAt === 'number'
    );
  }
}
```

---

## 6. Hook 层设计

### 6.1 useAgentHost Hook

**文件:** `src/hooks/useAgentHost.ts`

```typescript
/**
 * OS.7: useAgentHost Hook
 * 管理 Agent 托管状态和操作
 */

import { useMemo, useCallback } from 'react';
import { useAgentHostStore } from '@/store/agentHostStore';
import { AgentObject, AgentStatus, AgentSession, AgentMessage } from '@/types';

export interface UseAgentHostReturn {
  // 状态
  hostedAgents: AgentObject[];
  activeSessions: Record<string, AgentSession>;
  openWindowIds: string[];
  focusedWindowId: string | null;

  // Agent 操作
  hostAgent: (agent: AgentObject) => void;
  unhostAgent: (agentId: string) => void;
  updateStatus: (agentId: string, status: AgentStatus) => void;

  // 窗口操作
  openWindow: (agentId: string) => void;
  closeWindow: (agentId: string) => void;
  closeAllWindows: () => void;
  focusWindow: (agentId: string) => void;
  isWindowOpen: (agentId: string) => boolean;

  // 会话操作
  createSession: (agentId: string, projectId?: string) => AgentSession;
  getSession: (sessionId: string) => AgentSession | undefined;
  sendMessage: (sessionId: string, content: string, role?: 'user' | 'assistant') => void;
}

export function useAgentHost(): UseAgentHostReturn {
  const store = useAgentHostStore();

  const hostedAgents = useMemo(() => store.hostedAgents, [store.hostedAgents]);
  const activeSessions = useMemo(() => store.activeSessions, [store.activeSessions]);
  const focusedWindowId = useMemo(() => store.focusedWindowId, [store.focusedWindowId]);
  const openWindowIds = useMemo(() => store.getOpenWindowIds(), [store.windowStates]);

  const sendMessage = useCallback(
    (sessionId: string, content: string, role: 'user' | 'assistant' = 'user') => {
      const session = store.getSession(sessionId);
      if (!session) return;

      store.addMessage(sessionId, {
        agentId: session.agentId,
        sessionId,
        role,
        content,
      });
    },
    [store]
  );

  return {
    // 状态
    hostedAgents,
    activeSessions,
    openWindowIds,
    focusedWindowId,

    // Agent 操作
    hostAgent: store.hostAgent,
    unhostAgent: store.unhostAgent,
    updateStatus: store.updateHostedAgentStatus,

    // 窗口操作
    openWindow: store.openWindow,
    closeWindow: store.closeWindow,
    closeAllWindows: store.closeAllWindows,
    focusWindow: store.focusWindow,
    isWindowOpen: store.isWindowOpen,

    // 会话操作
    createSession: store.createSession,
    getSession: store.getSession,
    sendMessage,
  };
}
```

### 6.2 useAgentWindow Hook

**文件:** `src/hooks/useAgentWindow.ts`

```typescript
/**
 * OS.7: useAgentWindow Hook
 * 管理单个 Agent 窗口状态
 */

import { useMemo, useCallback } from 'react';
import { useAgentHostStore } from '@/store/agentHostStore';
import { AgentWindowState, AgentWindowPosition, DEFAULT_WINDOW_CONFIG } from '@/types';

export interface UseAgentWindowOptions {
  agentId: string;
  autoFocus?: boolean;
}

export interface UseAgentWindowReturn {
  // 状态
  window: AgentWindowState | undefined;
  isOpen: boolean;
  isFocused: boolean;
  isMinimized: boolean;
  position: AgentWindowPosition;
  zIndex: number;

  // 操作
  open: () => void;
  close: () => void;
  minimize: () => void;
  focus: () => void;
  move: (x: number, y: number) => void;
  resize: (width: number, height: number) => void;
  setPosition: (position: Partial<AgentWindowPosition>) => void;
}

export function useAgentWindow(options: UseAgentWindowOptions): UseAgentWindowReturn {
  const { agentId, autoFocus = false } = options;
  const store = useAgentHostStore();

  const window = useMemo(
    () => store.windowStates[agentId],
    [store.windowStates, agentId]
  );

  const isOpen = useMemo(() => window?.isOpen ?? false, [window]);
  const isFocused = useMemo(() => window?.isFocused ?? false, [window]);
  const isMinimized = useMemo(() => window?.isMinimized ?? false, [window]);
  const position = useMemo(
    () => window?.position ?? DEFAULT_WINDOW_CONFIG,
    [window]
  );
  const zIndex = useMemo(() => window?.zIndex ?? 0, [window]);

  const open = useCallback(() => {
    store.openWindow(agentId);
  }, [store, agentId]);

  const close = useCallback(() => {
    store.closeWindow(agentId);
  }, [store, agentId]);

  const minimize = useCallback(() => {
    store.minimizeWindow(agentId);
  }, [store, agentId]);

  const focus = useCallback(() => {
    store.focusWindow(agentId);
  }, [store, agentId]);

  const move = useCallback(
    (x: number, y: number) => {
      store.updateWindowPosition(agentId, { x, y });
    },
    [store, agentId]
  );

  const resize = useCallback(
    (width: number, height: number) => {
      // 约束尺寸
      const constrainedWidth = Math.min(
        Math.max(width, DEFAULT_WINDOW_CONFIG.minWidth),
        DEFAULT_WINDOW_CONFIG.maxWidth
      );
      const constrainedHeight = Math.min(
        Math.max(height, DEFAULT_WINDOW_CONFIG.minHeight),
        DEFAULT_WINDOW_CONFIG.maxHeight
      );
      store.updateWindowPosition(agentId, {
        width: constrainedWidth,
        height: constrainedHeight,
      });
    },
    [store, agentId]
  );

  const setPosition = useCallback(
    (newPosition: Partial<AgentWindowPosition>) => {
      store.updateWindowPosition(agentId, newPosition);
    },
    [store, agentId]
  );

  return {
    // 状态
    window,
    isOpen,
    isFocused,
    isMinimized,
    position,
    zIndex,

    // 操作
    open,
    close,
    minimize,
    focus,
    move,
    resize,
    setPosition,
  };
}
```

---

## 7. 组件层设计

### 7.1 Agent Dialog 组件

**文件:** `src/components/os/agent/AgentDialog.tsx`

```typescript
/**
 * OS.7: Agent Dialog Component
 * 使用 Acrylic 材质的 Agent 对话窗口
 */

import React, { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { AcrylicPanel } from '@/components/os/acrylic';
import { useAgentWindow } from '@/hooks/useAgentWindow';
import { useAgent } from '@/hooks/useAgent';
import { AgentMessage } from '@/types';
import { DEFAULT_WINDOW_CONFIG } from '@/types/agent-window';

export interface AgentDialogProps {
  agentId: string;
  sessionId?: string;
  messages?: AgentMessage[];
  onSendMessage?: (content: string) => void;
  onClose?: () => void;
}

export function AgentDialog({
  agentId,
  sessionId,
  messages = [],
  onSendMessage,
  onClose,
}: AgentDialogProps) {
  const { agent } = useAgent(agentId);
  const { isOpen, isFocused, position, close, focus, move, setPosition } = useAgentWindow({
    agentId,
    autoFocus: true,
  });

  const dialogRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [inputValue, setInputValue] = React.useState('');
  const [isDragging, setIsDragging] = React.useState(false);
  const [dragOffset, setDragOffset] = React.useState({ x: 0, y: 0 });

  // 聚焦管理
  useEffect(() => {
    if (isOpen && isFocused && dialogRef.current) {
      dialogRef.current.focus();
    }
  }, [isOpen, isFocused]);

  // ESC 关闭
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isFocused) {
        close();
        onClose?.();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isFocused, close, onClose]);

  // 拖拽处理
  const handleMouseDown = (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest('[data-drag-exclude]')) return;
    setIsDragging(true);
    setDragOffset({
      x: e.clientX - position.x,
      y: e.clientY - position.y,
    });
    focus();
  };

  useEffect(() => {
    if (!isDragging) return;

    const handleMouseMove = (e: MouseEvent) => {
      move(e.clientX - dragOffset.x, e.clientY - dragOffset.y);
    };

    const handleMouseUp = () => {
      setIsDragging(false);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging, dragOffset, move]);

  // 发送消息
  const handleSend = () => {
    if (!inputValue.trim()) return;
    onSendMessage?.(inputValue.trim());
    setInputValue('');
    inputRef.current?.focus();
  };

  if (!isOpen || !agent) return null;

  const dialog = (
    <div
      ref={dialogRef}
      className="fixed outline-none"
      style={{
        left: position.x,
        top: position.y,
        width: position.width,
        height: position.height,
        zIndex: position.zIndex || 100,
      }}
      tabIndex={-1}
      onClick={focus}
    >
      <AcrylicPanel
        variant="standard"
        className="h-full flex flex-col"
      >
        {/* 标题栏 */}
        <div
          className="flex items-center justify-between px-4 py-2 cursor-move select-none border-b border-white/10"
          onMouseDown={handleMouseDown}
        >
          <div className="flex items-center gap-2">
            <span className="text-2xl">{agent.icon}</span>
            <span className="font-medium text-gray-900 dark:text-white">
              {agent.displayName}
            </span>
          </div>
          <div className="flex items-center gap-2" data-drag-exclude>
            <button
              onClick={() => close()}
              className="w-6 h-6 rounded hover:bg-white/20 flex items-center justify-center text-gray-600 dark:text-gray-400"
              aria-label="Close"
            >
              ✕
            </button>
          </div>
        </div>

        {/* 消息区 */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {messages.map((msg) => (
            <div
              key={msg.id}
              className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              <div
                className={`max-w-[80%] px-4 py-2 rounded-lg ${
                  msg.role === 'user'
                    ? 'bg-blue-500 text-white'
                    : 'bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-white'
                }`}
              >
                {msg.content}
              </div>
            </div>
          ))}
        </div>

        {/* 输入区 */}
        <div className="px-4 py-3 border-t border-white/10">
          <div className="flex gap-2">
            <input
              ref={inputRef}
              type="text"
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSend()}
              placeholder="Type a message..."
              className="flex-1 px-4 py-2 rounded-lg bg-white/50 dark:bg-gray-800/50 border border-gray-200 dark:border-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <button
              onClick={handleSend}
              disabled={!inputValue.trim()}
              className="px-4 py-2 rounded-lg bg-blue-500 text-white hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Send
            </button>
          </div>
        </div>
      </AcrylicPanel>
    </div>
  );

  return createPortal(dialog, document.body);
}
```

---

## 8. 数据流

```
┌──────────────────────────────────────────────────────────────┐
│                        User Interaction                       │
│                 (Click Agent Icon, Send Message)             │
└─────────────────────────┬────────────────────────────────────┘
                          │
                          ▼
┌──────────────────────────────────────────────────────────────┐
│                      Component Layer                          │
│  AgentDialog, AgentDockIcon, AgentDesktopItem               │
└─────────────────────────┬────────────────────────────────────┘
                          │
                          ▼
┌──────────────────────────────────────────────────────────────┐
│                       Hook Layer                              │
│  useAgentHost, useAgentWindow, useAgentLauncher             │
└─────────────────────────┬────────────────────────────────────┘
                          │
                          ▼
┌──────────────────────────────────────────────────────────────┐
│                      Store Layer                              │
│  agentHostStore, agentLauncherStore, agentRegistry          │
└─────────────────────────┬────────────────────────────────────┘
                          │
                          ▼
┌──────────────────────────────────────────────────────────────┐
│                     Service Layer                             │
│  AgentHostService, AgentFactory                             │
└──────────────────────────────────────────────────────────────┘
```

---

## 9. 与现有系统集成

### 9.1 与 OS.3 Agent Registry 集成

```typescript
// Agent Host 与 Agent Registry 双向同步
import { useAgentRegistryStore } from '@/store/agentRegistry';
import { useAgentHostStore } from '@/store/agentHostStore';

// 托管时同步注册
hostAgent: (agent) => {
  useAgentHostStore.getState().hostAgent(agent);
  useAgentRegistryStore.getState().setAgent(agent.id, agent);
}
```

### 9.2 与 OS.5 Acrylic 集成

```typescript
// Agent Dialog 使用 Acrylic 材质
import { AcrylicPanel } from '@/components/os/acrylic';

<AcrylicPanel variant="standard" className="h-full flex flex-col">
  {/* Dialog content */}
</AcrylicPanel>
```

### 9.3 与 OS.6 Fluent Animation 集成

```typescript
// Agent 窗口使用 Fluent 动画
import { useTransition } from '@/hooks/useTransition';

const { state, enter, exit } = useTransition(false, {
  duration: 'normal',
  easing: 'decelerate',
});
```

---

## 10. 性能优化

### 10.1 窗口渲染优化

```typescript
// 使用 React.memo 避免不必要的重渲染
const AgentDialog = React.memo(AgentDialogComponent);

// 使用虚拟滚动处理长消息列表
import { VirtualList } from '@/components/ui/VirtualList';
```

### 10.2 状态订阅优化

```typescript
// 使用 Zustand 选择器避免不必要的订阅
const isOpen = useAgentHostStore((state) => state.windowStates[agentId]?.isOpen);
```

### 10.3 消息缓存

```typescript
// 使用消息缓存避免重复加载
const cachedMessages = useAgentHostStore((state) => state.getCachedMessages(sessionId));
```

---

## 11. 测试策略

### 11.1 单元测试

```typescript
// __tests__/useAgentWindow.test.ts
describe('useAgentWindow', () => {
  it('should open window', () => {
    const { open, isOpen } = renderHook(() => useAgentWindow({ agentId: 'test' }));
    act(() => open());
    expect(isOpen).toBe(true);
  });
});
```

### 11.2 集成测试

```typescript
// __tests__/AgentHostService.test.ts
describe('AgentHostService', () => {
  it('should host agent and open window', () => {
    const agent = AgentFactory.createAgent({ type: AgentType.DEVELOPER });
    agentHostService.hostAgent({ agent, autoStart: true });
    expect(agentHostService.getOpenWindowIds()).toContain(agent.id);
  });
});
```

---

## 12. 实施计划

### 12.1 阶段一: 类型定义和 Store (P0)

- [ ] 创建 `src/types/agent-host.ts`
- [ ] 创建 `src/types/agent-window.ts`
- [ ] 增强 `src/store/agentHostStore.ts`

### 12.2 阶段二: Service 层 (P1)

- [ ] 创建 `src/services/AgentHostService.ts`
- [ ] 创建 `src/services/AgentFactory.ts`

### 12.3 阶段三: Hook 层 (P1)

- [ ] 创建 `src/hooks/useAgentHost.ts`
- [ ] 创建 `src/hooks/useAgentWindow.ts`

### 12.4 阶段四: 组件层 (P2)

- [ ] 创建 `src/components/os/agent/AgentDialog.tsx`
- [ ] 创建 `src/components/os/agent/AgentIcon.tsx`
- [ ] 创建 `src/components/os/agent/AgentStatusIndicator.tsx`

---

## 13. 变更历史

| 日期 | 版本 | 变更内容 | 变更人 |
|-----|------|----------|--------|
| 2026-03-12 | v1.0 | 初始架构设计 | Architect |

---

**批准签名**:

- [ ] 产品经理 (PM)
- [ ] UX 设计师
- [x] 系统架构师
- [ ] 开发负责人
