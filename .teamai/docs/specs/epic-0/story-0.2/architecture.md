# 架构设计文档 - Story 0.2

**Story:** CUI 与核心调度层连接
**版本:** 1.0
**最后更新:** 2026-03-03

---

## 🏗️ 架构概览

### 设计目标

将 CUI（命令用户界面）与 pi-agent-core 核心调度层紧密连接，实现：
1. 用户消息提交到核心调度层
2. 实时响应流显示（文本流式输出、工具执行状态）
3. 消息历史管理（自动保存、查看、清空）

### 前置依赖

- ✅ Story 0.1 - pi-agent-core 集成基础已完成
  - `OriginOSAgent` 类已实现
  - `HealthMonitor` 健康检查已实现
  - 消息类型转换已实现

### AGENTS.md 规约符合性声明

本设计符合 [AGENTS.md](../../../AGENTS.md) 的以下规约：
- ✅ 技术栈约束：Next.js 14 (App Router), React 18, TypeScript 严格模式
- ✅ 目录结构规约：位于 `src/components/` (Layer 4)
- ✅ 模块依赖规约：只依赖 Layer 1 (lib/integrations/pi-agent) 和 Layer 2 (features)
- ✅ 组件分层：atoms → molecules → organisms

---

## 📦 技术栈

### 使用的技术

| 技术 | 版本 | 用途 | AGENTS.md 符合性 |
|------|------|------|-----------------|
| React | 18.x | UI 组件 | ✅ 必须使用 |
| Next.js | 14.x | App Router | ✅ 必须使用 |
| TypeScript | 5.x | 类型安全 | ✅ 必须使用（严格模式） |
| Zustand | 4.x | 状态管理 | ✅ 必须使用 |
| Tailwind CSS | 3.x | 样式 | ✅ 必须使用 |
| @mariozechner/agent | Latest | pi-agent-core | ✅ Story 0.1 依赖 |

---

## 📁 模块设计

### 文件结构

```
src/
├── lib/
│   └── integrations/pi-agent/           # Layer 1: 核心调度层 (Story 0.1)
│       ├── core/agent.ts               # OriginOSAgent 类
│       ├── store.ts                    # Zustand 状态管理
│       └── hooks.ts                    # React Hooks ✅ 已实现
│
├── components/                         # Layer 4: 组件层
│   ├── atoms/                          # 原子组件 ✅ 已有
│   │   └── ...
│   │
│   ├── molecules/                      # 分子组件 ✅ 已有
│   │   ├── ChatInput.tsx              # 聊天输入框
│   │   └── MessageList.tsx            # 消息列表
│   │
│   └── organisms/                      # 有机组件
│       └── CommandInterface.tsx       # CUI 主组件 ⏳ 本 Story
```

### 模块职责

#### 模块 1: React Hooks (Layer 1)

**路径:** `src/lib/integrations/pi-agent/hooks.ts` ✅ 已实现

**职责:**
- 提供 `usePiAgent` Hook 用于访问核心调度层状态和能力
- 提供 `usePiAgentEvent` Hook 用于订阅事件流
- 提供 `usePiAgentStatus` Hook 用于获取 UI 状态

**关键 API:**
```typescript
export interface UsePiAgentState {
  // 状态
  isInitialized: boolean;
  isThinking: boolean;
  isRunning: boolean;
  sessionId: string | null;
  projectContext: ProjectContext | null;
  uiState: {
    isThinking: boolean;
    activeTools: Array<{toolName: string; startTime: number}>;
    errorMessage: string | null;
  };
  messages?: AgentMessage[];

  // 操作
  initialize(sessionId, context): Promise<void>;
  sendMessage(text): Promise<void>;
  abort(): void;
  subscribe(listener): () => void;
}
```

#### 模块 2: Zustand Store (Layer 1)

**路径:** `src/lib/integrations/pi-agent/store.ts`

**职责:**
- 管理 Agent 实例和状态
- 提供状态订阅和更新方法
- 处理事件流订阅

**关键 API:**
```typescript
interface PiAgentStore {
  agent: OriginOSAgent | null;
  isInitialized: boolean;
  isThinking: boolean;
  isRunning: boolean;
  messages: AgentMessage[];

  initialize(): void;
  sendMessage(text: string): Promise<void>;
  subscribe(listener: (event: AgentEvent) => void): () => void;
}
```

#### 模块 3: CommandInterface 组件 (Layer 4)

**路径:** `src/components/organisms/CommandInterface.tsx`

**职责:**
- CUI 主组件，整合所有子组件
- 管理消息历史和显示
- 处理用户输入和提交
- 显示工具执行状态

**结构:**
```
CommandInterface
├── Header (状态显示、项目信息)
├── MessageList (消息历史)
├── ActiveToolsIndicator (工具执行显示)
├── ErrorHandler (错误消息显示)
└── ChatInput (输入框)
```

---

## 🔗 依赖关系

### 依赖层级图

```
┌─────────────────────────────────────────────────────┐
│  src/app/                      # Layer 5             │
│  └── page.tsx                                         │
└──────────────┬──────────────────────────────────────┘
               ↓
┌─────────────────────────────────────────────────────┐
│  src/components/              # Layer 4             │
│  └── organisms/CommandInterface.tsx                │
├─────────────────────────────────────────────────────┤
│  src/components/molecules/                           │
│  ├── ChatInput.tsx                                  │
│  └── MessageList.tsx                                 │
└──────────────┬──────────────────────────────────────┘
               ↓
┌─────────────────────────────────────────────────────┐
│  src/lib/integrations/pi-agent/ # Layer 1           │
│  ├── store.ts                                       │
│  ├── hooks.ts                                       │
│  └── core/agent.ts                                  │
└─────────────────────────────────────────────────────┘
```

### 依赖规则

- ✅ `CommandInterface` 可以依赖 `ChatInput`, `MessageList`
- ✅ `CommandInterface` 可以引入 `usePiAgent` Hook
- ✅ `usePiAgent` Hook 依赖 `usePiAgentStore` (Zustand)
- ✅ `usePiAgentStore` 依赖 Layer 1 的 `OriginOSAgent`
- ✅ 禁止循环依赖

---

## 📊 数据流

### 消息发送流程

```
用户输入 (CommandInterface)
  ↓
ChatInput.onSubmit()
  ↓
usePiAgent.sendMessage()
  ↓
usePiAgentStore.sendMessage()
  ↓
OriginOSAgent.prompt()
  ↓
pi-agent-core Agent.prompt()
  ↓
LLM 响应
  ↓
事件流 (AgentEvent)
  ↓
usePiAgentStore (更新状态)
  ↓
usePiAgent Hook (响应式更新)
  ↓
CommandInterface UI 更新
```

### 事件流处理

```typescript
// Agent 事件类型
type AgentEvent =
  | { type: "agent_start" }
  | { type: "message_start"; message: AgentMessage }
  | { type: "message_update"; message: AgentMessage }
  | { type: "message_end"; message: AgentMessage }
  | { type: "tool_execution_start"; toolCallId: string; toolName: string }
  | { type: "tool_execution_end"; toolCallId: string; toolName: string }
  | { type: "agent_end"; messages: AgentMessage[] }
  | { type: "agent_error"; error: string };

// UI 状态映射
AgentEvent → UI 状态
-------------------------------------------
agent_start        → isThinking = true
message_start      → 显示消息气泡
message_update      → 追加文本内容
message_end        → 消息完成
tool_execution_start → 添加到 activeTools
tool_execution_end   → 从 activeTools 移除
agent_end          → isThinking = false
agent_error        → 显示错误消息
```

---

## 🔌 API 设计

### API 1: usePiAgent Hook (已实现)

```typescript
/**
 * React hook for interacting with the Pi Agent
 */
function usePiAgent(): UsePiAgentState
```

**返回值:**
- `sendMessage(text)`: 发送消息
- `subscribe(listener)`: 订阅事件
- `isThinking`: 是否正在思考
- `uiState`: UI 状态对象

### API 2: usePiAgentEvent Hook (已实现)

```typescript
/**
 * Hook to subscribe to agent events and handle them in a component
 */
function usePiAgentEvent(
  handler: (event: AgentEvent) => void,
  deps?: React.DependencyList
): void
```

**示例用法:**
```typescript
usePiAgentEvent((event) => {
  switch (event.type) {
    case 'message_start':
      // 显示消息气泡
      break;
    case 'tool_execution_start':
      // 显示工具开始
      break;
  }
}, []);
```

### API 3: usePiAgentStatus Hook (已实现)

```typescript
/**
 * Hook to get agent status for UI display
 */
function usePiAgentStatus(): {
  status: "idle" | "thinking" | "running" | "error";
  message: string;
}
```

---

## 🔒 性能优化

### 优化策略

#### 策略 1: 状态订阅优化

使用 Zustand 的选择性订阅，避免不必要的重渲染：

```typescript
// ❌ 错误：订阅整个 store
const store = usePiAgentStore();

// ✅ 正确：只订阅需要的状态
const messages = usePiAgentStore(state => state.messages);
const isThinking = usePiAgentStore(state => state.isThinking);
```

#### 策略 2: 事件节流

对于频繁的 `message_update` 事件，使用 React 的状态批处理：

```typescript
// 使用 startTransition 处理非紧急 UI 更新
import { startTransition } from 'react';

const handleMessage = (event: AgentEvent) => {
  if (event.type === 'message_update') {
    startTransition(() => {
      // 更新 UI，非阻塞
      updateMessageContent(event.message);
    });
  }
};
```

#### 策略 3: 消息列表虚拟化

对于大量消息历史，实现虚拟滚动：

```typescript
// 只渲染视口可见的消息
const visibleMessages = useMemo(() => {
  // 基于滚动位置计算可见消息
  return getVisibleMessages(messages, scrollPosition);
}, [messages, scrollPosition]);
```

---

## 🧪 可测试性设计

### 测试策略

#### 单元测试

```typescript
// hooks.test.ts
describe('usePiAgent', () => {
  it('should initialize agent', async () => {
    const { result } = renderHook(() => usePiAgent());

    await act(async () => {
      await result.current.initialize('test-session', {});
    });

    expect(result.current.isInitialized).toBe(true);
  });

  it('should send message and receive response', async () => {
    const { result } = renderHook(() => usePiAgent());

    await act(async () => {
      await result.current.sendMessage('Hello');
    });

    // 验证消息发送
  });
});
```

#### 组件测试

```typescript
// CommandInterface.test.tsx
describe('CommandInterface', () => {
  it('should render with initial state', () => {
    render(<CommandInterface />);

    expect(screen.getByPlaceholder('输入命令...')).toBeInTheDocument();
  });

  it('should send message on submit', async () => {
    const { result } = renderHook(() => usePiAgent());
    render(<CommandInterface />);

    const input = screen.getByPlaceholder('输入命令...');
    fireEvent.change(input, { target: { value: 'Hello' } });
    fireEvent.keyDown(input, { key: 'Enter' });

    await waitFor(() => {
      expect(result.current.messages).toContainEqual(
        expect.arrayContaining([
          expect.objectContaining({ role: 'user', content: 'Hello' })
        ])
      );
    });
  });
});
```

---

## 🔍 架构审查

### 审查清单

- [x] 技术栈符合 AGENTS.md (React, Next.js, TypeScript, Zustand, Tailwind)
- [x] 模块位于 Layer 4 (src/components/)
- [x] 模块依赖符合单向原则 (Layer 4 → Layer 1)
- [x] Hooks 已正确实现 (usePiAgent, usePiAgentEvent, usePiAgentStatus)
- [x] 组件结构清晰 (atoms → molecules → organisms)
- [x] 事件流处理完整
- [x] 性能优化策略明确

### 审查记录

| 日期 | 审查人 | 结果 | 备注 |
|------|--------|------|------|
| 2026-03-03 | Architect | ✅ Approved | 架构设计完成 |

---

## 📌 相关文档

- [Story README](./README.md)
- [Story 0.1 Architecture](./story-0.1/architecture.md) - 前置依赖
- [Epic 0 README](../README.md)
- [AGENTS.md](../../../AGENTS.md)

---

## 🎯 与 Story 0.1 的关系

### Story 0.1 提供的基础

| 模块 | Story 0.1 | Story 0.2 使用 |
|------|-----------|----------------|
| `OriginOSAgent` | ✅ Agent 生命周期管理 | Hook 通过 store 间接使用 |
| `HealthMonitor` | ✅ 健康检查 | 显示健康状态 |
| `message.ts` | ✅ 消息类型和转换 | MessageList 显示消息 |
| `store.ts` | ✅ Zustand 状态管理 | Hooks 使用 |

### Story 0.2 新增内容

- ✅React Hooks 封装层
- ✅ CommandUI 主组件集成
- ✅ MessageList 和 ChatInput 组件
- ✅ 实时事件流处理
- ✅ 工具执行状态显示

---

## 📝 变更历史

| 版本 | 日期 | 变更说明 | 变更人 |
|------|------|---------|--------|
| 1.0 | 2026-03-03 | 初始版本 | Architect |
