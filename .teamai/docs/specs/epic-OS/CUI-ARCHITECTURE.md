# CUI 会话模块架构设计

**文档 ID:** ARCH-CUI-001
**日期:** 2026-03-16
**作者:** CTO
**状态:** Final

---

## 1. 执行摘要

本架构设计解决 OriginOS CUI (Command User Interface) 会话模块的实现路径。关键发现：

**AgentDialog 当前是 Mock 实现** - 需要集成真实 pi-agent 核心。

### 关键决策

| 决策 | 选择 | 理由 |
|------|------|------|
| CUI 实现 | AgentDialogContent 替换 | 复用 AppWindow 系统，无需新建窗口层 |
| pi-agent 集成 | usePiAgent Hook | 已完整实现，直接使用 |
| 消息状态 | Zustand Store (pi-agent store) | 已有实现，无需重复 |
| 窗口管理 | useAppWindowManager | 已有实现，无需重复 |

---

## 2. 当前状态分析

### 2.1 已有组件

| 组件 | 状态 | 路径 |
|------|------|------|
| AgentDialog | Mock 实现 | `src/components/os/agent-host/AgentDialog.tsx` |
| AgentDialogContent | Mock 实现 (Dock) | `src/components/os/dock/index.tsx` |
| usePiAgent Hook | ✅ 完整实现 | `src/lib/integrations/pi-agent/hooks.ts` |
| PiAgentStore | ✅ 完整实现 | `src/lib/integrations/pi-agent/store.ts` |
| AppWindow | ✅ 完整实现 | `src/hooks/useAppWindowManager.ts` |
| AcrylicDialog | ✅ 完整实现 | `src/components/os/acrylic/AcrylicDialog.tsx` |

### 2.2 集成缺口

当前 `AgentDialog` 和 `AgentDialogContent` 是 **硬编码 Mock**:

```typescript
// 当前状态: AgentDialog.tsx
const messages = [
  { id: '1', role: 'assistant', content: `你好！我是 ${agent.displayName}。有什么我可以帮助你的吗？` },
];

const handleSendMessage = async (message: string) => {
  console.log(`[${agent.displayName}] 收到消息:`, message);
  // TODO: 实际的 pi-agent 消息处理
};
```

需要替换为真实 pi-agent 集成。

---

## 3. 推荐实现路径

### 3.1 架构图

```
┌─────────────────────────────────────────────────────────────┐
│                    Desktop Layer                             │
│  Desktop.tsx → Dock → AppWindowManager                      │
└─────────────────────────┬───────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────────┐
│                    AppWindow System                          │
│  useAppWindowManager.openWindow({ type: 'agent', ... })    │
└─────────────────────────┬───────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────────┐
│                    AgentDialogContent                        │
│  使用 usePiAgent Hook 连接真实 Agent                         │
│  ├── MessageList (消息历史)                                  │
│  ├── ChatInput (输入框)                                      │
│  └── StatusIndicator (状态指示)                              │
└─────────────────────────┬───────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────────┐
│                    PiAgent Store (Zustand)                   │
│  ├── agent: OriginOSAgent | null                            │
│  ├── isInitialized: boolean                                 │
│  ├── isRunning: boolean                                     │
│  ├── sessionId: string | null                               │
│  ├── projectContext: ProjectContext | null                  │
│  ├── messages (from agent.state)                            │
│  └── Actions: initialize, sendMessage, destroy, ...         │
└─────────────────────────┬───────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────────┐
│                    OriginOSAgent (pi-agent-core)             │
│  底层 Agent 实现，处理 LLM 对话                               │
└─────────────────────────────────────────────────────────────┘
```

### 3.2 实施步骤

#### 步骤 1: 创建 AgentDialogContent 真实实现

**文件:** `src/components/os/agent-dialog/AgentDialogContent.tsx`

```typescript
import { useEffect, useState, useCallback } from 'react';
import { usePiAgent } from '@/lib/integrations/pi-agent/hooks';
import { useAgentRegistryStore } from '@/store/agentRegistry';
import { AgentStatus } from '@/types/agent';
import MessageList from './MessageList';
import ChatInput from './ChatInput';
import StatusIndicator from './StatusIndicator';

interface AgentDialogContentProps {
  agentId: string;
}

export default function AgentDialogContent({ agentId }: AgentDialogContentProps) {
  const agent = useAgentRegistryStore((state) => state.agents[agentId]);
  const setAgentStatus = useAgentRegistryStore((state) => state.setAgentStatus);

  // 使用 pi-agent hook
  const {
    initialize,
    sendMessage,
    isInitialized,
    isRunning,
    isThinking,
    uiState,
    messages,
    sessionId,
    projectContext,
  } = usePiAgent();

  // 初始化 Agent
  useEffect(() => {
    if (!agent || isInitialized) return;

    const initAgent = async () => {
      try {
        setAgentStatus(agentId, AgentStatus.RUNNING);
        await initialize(
          `session-${agentId}-${Date.now()}`,
          {
            projectId: 'default-project',
            projectName: agent.displayName,
            userId: 'default-user',
          },
          {
            userName: 'User',
            projectName: agent.displayName,
          }
        );
      } catch (error) {
        console.error('[AgentDialogContent] Failed to initialize agent:', error);
        setAgentStatus(agentId, AgentStatus.ERROR);
      }
    };

    initAgent();
  }, [agent?.id, isInitialized]);

  // 发送消息
  const handleSendMessage = useCallback(async (content: string) => {
    if (!isInitialized || !content.trim()) return;

    try {
      await sendMessage(content);
    } catch (error) {
      console.error('[AgentDialogContent] Failed to send message:', error);
    }
  }, [isInitialized, sendMessage]);

  if (!agent) {
    return <div className="flex items-center justify-center h-full text-gray-500">Agent not found</div>;
  }

  return (
    <div className="flex flex-col h-full text-gray-800 dark:text-gray-200">
      {/* Header */}
      <div className="p-4 border-b border-white/20 dark:border-white/10">
        <div className="flex items-center gap-3">
          <span className="text-3xl">{agent.icon}</span>
          <div>
            <h2 className="font-semibold text-lg text-gray-900 dark:text-white">
              {agent.displayName}
            </h2>
            <StatusIndicator status={agent.status} isThinking={isThinking} />
          </div>
        </div>
      </div>

      {/* Message List */}
      <MessageList
        messages={messages || []}
        isLoading={isThinking}
      />

      {/* Input */}
      <ChatInput
        onSend={handleSendMessage}
        disabled={!isInitialized || isRunning}
        placeholder={`向 ${agent.displayName} 发送消息...`}
      />

      {/* Error Display */}
      {uiState.errorMessage && (
        <div className="px-4 py-2 text-sm text-red-500 bg-red-50 dark:bg-red-900/20">
          {uiState.errorMessage}
        </div>
      )}
    </div>
  );
}
```

#### 步骤 2: 更新 Dock 集成

**文件:** `src/components/os/dock/index.tsx` (修改)

```typescript
// 替换 Mock AgentDialogContent 导入
import AgentDialogContent from '@/components/os/agent-dialog/AgentDialogContent';

// 其余逻辑保持不变，AppWindowManager 已支持组件渲染
```

#### 步骤 3: 创建支持组件

**文件:** `src/components/os/agent-dialog/MessageList.tsx`

```typescript
import { useRef, useEffect } from 'react';
import type { AgentMessage } from '@mariozechner/agent';

interface MessageListProps {
  messages: AgentMessage[];
  isLoading: boolean;
}

export default function MessageList({ messages, isLoading }: MessageListProps) {
  const listRef = useRef<HTMLDivElement>(null);

  // 自动滚动到底部
  useEffect(() => {
    if (listRef.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight;
    }
  }, [messages]);

  return (
    <div ref={listRef} className="flex-1 overflow-y-auto p-4 space-y-4">
      {messages.length === 0 && !isLoading && (
        <div className="text-center text-gray-500 dark:text-gray-400 text-sm">
          开始对话...
        </div>
      )}

      {messages.map((msg, idx) => (
        <div
          key={msg.id || idx}
          className={`flex ${
            msg.role === 'user' ? 'justify-end' : 'justify-start'
          }`}
        >
          <div
            className={`max-w-[80%] rounded-2xl px-4 py-2 ${
              msg.role === 'user'
                ? 'bg-primary text-white'
                : 'bg-white/20 dark:bg-gray-800/50 text-gray-900 dark:text-white'
            }`}
          >
            <div className="text-sm whitespace-pre-wrap">{msg.content}</div>
          </div>
        </div>
      ))}

      {isLoading && (
        <div className="flex justify-start">
          <div className="bg-white/20 dark:bg-gray-800/50 rounded-2xl px-4 py-2">
            <div className="flex items-center gap-2 text-gray-600 dark:text-gray-400">
              <div className="w-2 h-2 bg-blue-500 rounded-full animate-pulse" />
              <span className="text-sm">思考中...</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
```

**文件:** `src/components/os/agent-dialog/ChatInput.tsx`

```typescript
import { useState, useCallback } from 'react';

interface ChatInputProps {
  onSend: (message: string) => void;
  disabled?: boolean;
  placeholder?: string;
}

export default function ChatInput({ onSend, disabled, placeholder }: ChatInputProps) {
  const [value, setValue] = useState('');

  const handleSubmit = useCallback(() => {
    if (value.trim() && !disabled) {
      onSend(value.trim());
      setValue('');
    }
  }, [value, disabled, onSend]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  }, [handleSubmit]);

  return (
    <div className="p-4 border-t border-white/20 dark:border-white/10">
      <div className="flex gap-2">
        <input
          type="text"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={disabled}
          placeholder={placeholder}
          className="flex-1 px-4 py-2 bg-white/30 dark:bg-black/20 backdrop-blur-sm
                     border border-white/30 dark:border-white/20 rounded-lg
                     text-gray-900 dark:text-white placeholder-gray-500
                     focus:outline-none focus:ring-2 focus:ring-primary/50
                     disabled:opacity-50 disabled:cursor-not-allowed"
        />
        <button
          onClick={handleSubmit}
          disabled={disabled || !value.trim()}
          className="px-4 py-2 bg-primary hover:bg-primary/80 text-white rounded-lg
                     transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          发送
        </button>
      </div>
    </div>
  );
}
```

**文件:** `src/components/os/agent-dialog/StatusIndicator.tsx`

```typescript
import { AgentStatus } from '@/types/agent';

interface StatusIndicatorProps {
  status: AgentStatus;
  isThinking?: boolean;
}

export default function StatusIndicator({ status, isThinking }: StatusIndicatorProps) {
  if (isThinking) {
    return (
      <span className="text-xs text-blue-500 flex items-center gap-1">
        <div className="w-2 h-2 bg-blue-500 rounded-full animate-pulse" />
        思考中...
      </span>
    );
  }

  switch (status) {
    case AgentStatus.RUNNING:
      return <span className="text-xs text-green-500">● 在线</span>;
    case AgentStatus.IDLE:
      return <span className="text-xs text-gray-500">○ 空闲</span>;
    case AgentStatus.ERROR:
      return <span className="text-xs text-red-500">⚠ 错误</span>;
    default:
      return <span className="text-xs text-gray-400">○ 离线</span>;
  }
}
```

---

## 4. 文件结构

```
src/components/os/agent-dialog/
├── AgentDialogContent.tsx    # 主组件（使用 usePiAgent）
├── MessageList.tsx           # 消息列表
├── ChatInput.tsx             # 输入框
├── StatusIndicator.tsx       # 状态指示器
└── index.ts                  # 导出
```

---

## 5. 与现有系统集成

### 5.1 Dock → AppWindow → AgentDialogContent

```
Dock.tsx
  └── handleIconClick(appId)
        └── openWindow({ type: 'agent', content: { component: AgentDialogContent, props: { agentId } } })
              └── AppWindowManager
                    └── AppWindow (渲染 AgentDialogContent)
                          └── AgentDialogContent
                                └── usePiAgent()
```

### 5.2 Agent 状态同步

```
AgentDialogContent
  └── usePiAgent()
        └── initialize() → setAgentStatus(agentId, RUNNING)
        └── destroy() → setAgentStatus(agentId, IDLE)
```

---

## 6. 工作量估算

| 任务 | 工作量 | 优先级 |
|------|--------|--------|
| AgentDialogContent 真实实现 | 0.5 天 | P0 |
| MessageList 组件 | 0.25 天 | P0 |
| ChatInput 组件 | 0.25 天 | P0 |
| StatusIndicator 组件 | 0.25 天 | P1 |
| Dock 集成修改 | 0.25 天 | P0 |
| AgentDialog 替换 (独立窗口) | 0.5 天 | P1 |
| 测试与调试 | 0.5 天 | P0 |
| **总计** | **2.5 天** | - |

---

## 7. 验收标准

- [ ] 点击 Dock 图标打开 Agent 对话窗口
- [ ] 对话窗口使用真实 pi-agent 核心
- [ ] 可以发送消息并收到回复
- [ ] 显示 Agent 思考状态
- [ ] 显示错误状态
- [ ] 窗口可关闭、最小化、聚焦
- [ ] 多 Agent 可同时运行

---

## 8. 后续优化

1. **TASTE 集成** - 在 `initialize()` 时加载 TASTE Profile
2. **会话持久化** - 使用 `sessionStore` 保存对话历史
3. **流式响应** - 支持 LLM 流式输出
4. **工具调用可视化** - 显示工具执行状态

---

**批准签名:**

- [ ] PM
- [ ] Developer
- [x] CTO
