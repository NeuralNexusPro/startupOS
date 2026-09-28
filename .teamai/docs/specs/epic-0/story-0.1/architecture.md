# 架构设计文档 - Story 0.1

**Story:** pi-agent-core 集成基础
**版本:** 3.0
**最后更新:** 2026-03-03
**变更:** 修正包名和 API 模式 - 使用 session-based API (@mariozechner/pi-coding-agent: createAgentSession)

---

## 🏗️ 架构概览

### 设计目标

为 OriginOS 集成 pi-agent-stack 作为核心调度层，建立基于 `createAgentSession` 的 session-based API 封装层。这是所有后续 Epics 的基础设施。

### AGENTS.md 规约符合性声明

本设计符合 [AGENTS.md](../../../AGENTS.md) 的以下规约：
- ✅ 技术栈约束（第 2 章）：使用 TypeScript 严格模式、Next.js 14、React 18
- ✅ 目录结构规约（第 3 章）：位于 `src/lib/integrations/` (Layer 1)
- ✅ 模块依赖规约（单向按序依赖）：只依赖更底层的 Layer 1 模块
- ✅ 核心架构约束（第 4 章）：遵循核心架构模式，无禁止的技术
- ✅ 性能约束（第 6 章）：初始化 < 1s，消息路由 < 100ms，健康检查 < 50ms

---

## 📦 技术栈

### 使用的技术

| 技术 | 版本 | 用途 | AGENTS.md 符合性 |
|------|------|------|-----------------|
| TypeScript | 5.x | 语言 | ✅ 必须使用 |
| @mariozechner/pi-coding-agent | Latest | Agent SDK (createAgentSession, SessionManager) | ✅ 核心依赖 |
| @mariozechner/pi-agent-core | Latest | Agent API (AgentMessage, Tool types) | ✅ pi-coding-agent 依赖 |
| @mariozechner/pi-ai | Latest | LLM 抽象层 (Model, streamSimple) | ✅ pi-coding-agent 依赖 |
| Vitest | 1.x | 测试框架 | ✅ 允许使用 |

### 禁止使用的技术

根据 AGENTS.md 第 2 章，以下技术禁止使用：
- ❌ Redux / MobX（必须使用 Zustand，但本 Story 不涉及状态管理）
- ❌ CSS Modules / Styled Components（必须使用 Tailwind，但本 Story 不涉及 UI）
- ❌ 数据库（使用 pi-agent-core 的内存存储）

---

## 📁 模块设计

### 文件结构

```
src/lib/integrations/pi-agent/
├── agent.ts                      # Agent 封装服务
├── config.ts                     # 配置加载和验证
├── message.ts                    # 消息类型和转换
├── health.ts                     # 健康检查机制
├── types.ts                      # 类型定义
├── store.ts                      # 状态管理 (Story 0.5)
├── tools/                        # 工具相关 (Story 0.3)
│   └── index.ts                  # 工具转换接口
└── __tests__/
    ├── agent.test.ts             # Agent 生命周期测试
    ├── config.test.ts            # 配置加载测试
    └── health.test.ts            # 健康检查测试
```

### 实际 API 参考

**来自 `@mariozechner/pi-coding-agent` 的 Session-based API:**

```typescript
// Session 创建
import {
  createAgentSession,
  SessionManager,
  DefaultResourceLoader,
  SettingsManager,
} from '@mariozechner/pi-coding-agent';

// Session 对象（返回值）
interface AgentSession {
  sessionId: string;           // 唯一会话 ID
  agent: Agent;                // 内部 Agent 实例（来自 pi-agent-core）
  messages: AgentMessage[];    // 消息历史
}

// Agent 实例（在 session.agent 中访问）
interface Agent {
  state: AgentState;           // 只读状态
}

// Agent 状态
interface AgentState {
  systemPrompt: string;
  model: Model<any>;
  thinkingLevel: ThinkingLevel;
  tools: AgentTool<any>[];
  messages: AgentMessage[];
  isStreaming: boolean;
  streamMessage: AgentMessage | null;
  pendingToolCalls: Set<string>;
}

// Session-based 事件订阅
// session.subscribe(handler: (e: AgentEvent) => void): () => void;
```

**Session API 使用流程：**

```typescript
// 1. 创建 Session
const { session } = await createAgentSession({
  cwd: workspaceDir,
  agentDir: agentDir,
  authStorage: authStorage,
  modelRegistry: modelRegistry,
  model: model,
  thinkingLevel: 'low',
  tools: builtInTools,
  customTools: customTools,
  sessionManager: sessionManager,
  settingsManager: settingsManager,
  resourceLoader: resourceLoader,
});

// 2. 订阅事件
const unsubscribe = session.subscribe((event: AgentEvent) => {
  // 处理事件
});

// 3. Session 属性
const sessionId = session.sessionId;
const messages = session.messages;
const agentState = session.agent.state.isStreaming;
```

### 模块职责

#### 模块 1: Agent 封装服务 (agent.ts)

**路径:** `src/lib/integrations/pi-agent/agent.ts`

**职责:**
- 封装 `@mariozechner/pi-coding-agent` 的 Session API
- 提供 OriginOS 专用的消息发送接口
- 管理会话元数据（sessionId, messageCount 等）
- 统计运行指标（消息数量、运行时间等）

**依赖:**
- `@mariozechner/pi-coding-agent` - createAgentSession, SessionManager
- `@mariozechner/pi-agent-core` - AgentMessage 类型

**导出 API:**
```typescript
export class OriginOSSessionService {
  constructor(config: SessionConfig);

  // 初始化 Session
  async initialize(): Promise<void>;

  // 发送用户消息（通过内部 session 管理）
  async sendMessage(prompt: string): Promise<void>;

  // 订阅 Agent 事件（委托给 session.subscribe）
  subscribe(callback: (event: AgentEvent) => void): () => void;

  // 状态查询
  getState(): AgentState;
  isStreaming(): boolean;
  getHealth(): AgentHealthStatus;

  // 控制方法
  abort(): void;
  reset(): void;

  // Session 方法
  getMessages(): AgentMessage[];
  getSessionId(): string | undefined;
}
```

**实现示例:**
```typescript
import {
  createAgentSession,
  DefaultResourceLoader,
  SessionManager,
} from '@mariozechner/pi-coding-agent';
import type { AgentMessage, AgentTool } from '@mariozechner/pi-agent-core';
import type { SessionConfig } from './types';

export class OriginOSSessionService {
  private session: Awaited<ReturnType<typeof createAgentSession>>['session'] | undefined;
  private unsubscribe: (() => void) | undefined;
  private startTime: number = 0;
  private messageCount: number = 0;

  constructor(private config: SessionConfig) {
        isStreaming: false,
        streamMessage: null,
        pendingToolCalls: new Set()
      },
      convertToLlm: config.convertToLlm,
      transformContext: config.transformContext,
      getApiKey: config.getApiKey,
      sessionId: config.sessionId
    });
  }

  async sendMessage(prompt: string): Promise<void> {
    if (this.agent.state.isStreaming) {
      throw new Error('Agent is currently busy');
    }

    const startTime = performance.now();
    await this.agent.prompt(prompt);
    this.messageCount++;

    const duration = performance.now() - startTime;
    if (duration > 100) {
      console.warn(`[OriginOSAgent] Slow response: ${duration.toFixed(2)}ms`);
    }
  }

  subscribe(callback: (event: AgentEvent) => void): () => void {
    return this.agent.subscribe(callback);
  }

  getState() {
    return this.agent.state;
  }

  isStreaming() {
    return this.agent.state.isStreaming;
  }

  getHealth(): AgentHealthStatus {
    const uptime = Date.now() - this.startTime;
    return {
      isHealthy: !this.agent.state.error,
      isStreaming: this.agent.state.isStreaming,
      messageCount: this.messageCount,
      uptime,
      pendingToolCalls: this.agent.state.pendingToolCalls.size,
      error: this.agent.state.error
    };
  }

  abort() {
    this.agent.abort();
  }

  reset() {
    this.agent.reset();
    this.messageCount = 0;
  }

  setSystemPrompt(prompt: string) {
    this.agent.setSystemPrompt(prompt);
  }

  setModel(model: Model<any>) {
    this.agent.setModel(model);
  }

  setThinkingLevel(level: ThinkingLevel) {
    this.agent.setThinkingLevel(level);
  }

  setTools(tools: AgentTool<any>[]) {
    this.agent.setTools(tools);
  }
}
```

#### 模块 2: 配置管理 (config.ts)

**路径:** `src/lib/integrations/pi-agent/config.ts`

**职责:**
- 从环境变量或配置文件加载配置
- 验证配置完整性
- 提供 Model 创建工具函数

**依赖:**
- `@mariozechner/pi-ai` - `getModel()`, `Model` 类型

**导出 API:**
```typescript
export interface AgentConfig {
  model: Model<any>;
  systemPrompt?: string;
  thinkingLevel?: ThinkingLevel;
  tools?: AgentTool<any>[];
  sessionId?: string;
  getApiKey?: (provider: string) => Promise<string | undefined> | string | undefined;
  convertToLlm?: (messages: AgentMessage[]) => Message[] | Promise<Message[]>;
  transformContext?: (messages: AgentMessage[], signal?: AbortSignal) => Promise<AgentMessage[]>;
}

export async function loadConfig(): Promise<AgentConfig>;
export function validateConfig(config: Partial<AgentConfig>): ValidationResult;
```

**实现示例:**
```typescript
import { getModel, type Model, type ThinkingLevel } from '@mariozechner/pi-ai';
import type { AgentMessage, Message, AgentTool } from '@mariozechner/pi-agent-core';

export interface AgentConfig {
  model: Model<any>;
  systemPrompt?: string;
  thinkingLevel?: ThinkingLevel;
  tools?: AgentTool<any>[];
  sessionId?: string;
  getApiKey?: (provider: string) => Promise<string | undefined> | string | undefined;
  convertToLlm?: (messages: AgentMessage[]) => Message[] | Promise<Message[]>;
  transformContext?: (messages: AgentMessage[], signal?: AbortSignal) => Promise<AgentMessage[]>;
}

export async function loadConfig(): Promise<AgentConfig> {
  const provider = process.env.ORIGINOS_LLM_PROVIDER || 'anthropic';
  const modelId = process.env.ORIGINOS_LLM_MODEL || 'claude-3-5-sonnet';

  return {
    model: getModel(provider, modelId),
    systemPrompt: process.env.ORIGINOS_SYSTEM_PROMPT,
    thinkingLevel: (process.env.ORIGINOS_THINKING_LEVEL as ThinkingLevel) || 'off',
    sessionId: generateSessionId(),
    getApiKey: async (provider: string) => {
      switch (provider) {
        case 'anthropic':
          return process.env.ANTHROPIC_API_KEY;
        case 'google':
          return process.env.GOOGLE_API_KEY;
        default:
          return process.env.OPENAI_API_KEY;
      }
    }
  };
}

function generateSessionId(): string {
  return `os-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}
```

#### 模块 3: 消息类型和转换 (message.ts)

**路径:** `src/lib/integrations/pi-agent/message.ts`

**职责:**
- 导出 pi-agent-core 的消息类型
- 提供消息转换工具函数

**依赖:**
- `@mariozechner/pi-agent-core` - 导入 AgentMessage
- `@mariozechner/pi-ai` - 导入消息类型 (UserMessage, AssistantMessage, ToolResultMessage)

**导出 API:**
```typescript
// 导出核心消息类型
export type {
  AgentMessage,
  UserMessage,
  AssistantMessage,
  ToolResultMessage,
  TextContent,
  ImageContent
} from '@mariozechner/pi-ai';

// AgentTool 类型
export type { AgentTool } from '@mariozechner/pi-agent-core';

export interface OriginOSMessage {
  id: string;
  type: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: number;
  meta?: Record<string, unknown>;
}

// 转换函数
export function toOriginOSMessage(agentMsg: AgentMessage): OriginOSMessage | null;
export function createAgentMessage(content: string): AgentMessage;
```

#### 模块 4: 健康检查 (health.ts)

**路径:** `src/lib/integrations/pi-agent/health.ts`

**职责:**
- 定义健康状态类型
- 提供健康检查函数

**依赖:**
- `@/lib/integrations/pi-agent/agent` - OriginOSAgentService
- `@/lib/integrations/pi-agent/types` - 健康状态类型

**导出 API:**
```typescript
export interface AgentHealthStatus {
  isHealthy: boolean;
  isStreaming: boolean;
  messageCount: number;
  uptime: number;
  pendingToolCalls: number;
  error?: string;
}

export function healthCheck(service: OriginOSAgentService): AgentHealthStatus;
```

**实现示例:**
```typescript
import type { OriginOSAgentService } from './agent';
import type { AgentHealthStatus } from './types';

export function healthCheck(service: OriginOSAgentService): AgentHealthStatus {
  return service.getHealth();
}
```

#### 模块 5: 类型定义 (types.ts)

**路径:** `src/lib/integrations/pi-agent/types.ts`

**职责:**
- 集中导出所有 pi-agent 相关类型
- 定义 OriginOS 专用类型

**依赖:**
- `@mariozechner/pi-coding-agent` - 导入 Session 相关类型
- `@mariozechner/pi-agent-core` - 导入 AgentMessage, AgentTool
- `@mariozechner/pi-ai` - 导入 LLM 相关类型

**导出 API:**
```typescript
// 导出 pi-coding-agent 核心类型
export type {
  // Session 相关类型（从 pi-coding-agent）
  SessionManager,
  DefaultResourceLoader,
  SettingsManager,
} from '@mariozechner/pi-coding-agent';

// 导出 pi-agent-core 核心类型
export type {
  AgentMessage,
  AgentTool,
  AgentState,
  UserMessage,
  AssistantMessage,
  ToolResultMessage
} from '@mariozechner/pi-agent-core';

// 导出 pi-ai 核心类型
export type {
  Model,
  Message,
  ThinkingLevel,
  TextContent,
  ImageContent
} from '@mariozechner/pi-ai';

// OriginOS 专用类型
export interface AgentHealthStatus {
  isHealthy: boolean;
  isStreaming: boolean;
  messageCount: number;
  uptime: number;
  pendingToolCalls: number;
  error?: string;
}

export interface OriginOSAgentConfig {
  provider?: string;
  modelId?: string;
  systemPrompt?: string;
  thinkingLevel?: ThinkingLevel;
}

export interface ValidationResult {
  isValid: boolean;
  errors: string[];
}
```

---

## 🔗 依赖关系

### 依赖层级图

```
┌─────────────────────────────────────────────────────┐
│  lib/integrations/pi-agent/                          │  Layer 1
│  - agent.ts (封装 Session API)                       │
│  - config.ts (配置管理)                              │
│  - message.ts (消息转换)                             │
│  - health.ts (健康检查)                              │
│  - types.ts (类型导出)                               │
└──────────┬──────────────────────────────────────────┘
           ↓
┌─────────────────────────────────────────────────────┐
│  外部依赖 (不在本项目依赖层级中)                     │
│  - @mariozechner/pi-coding-agent (createAgentSession)│
│  - @mariozechner/pi-agent-core (AgentMessage, AgentTool)│
│  - @mariozechner/pi-ai (Model, stream functions)     │
└─────────────────────────────────────────────────────┘
```

### 依赖规约检查

- ✅ 位于 `src/lib/integrations/` (Layer 1)
- ✅ 不依赖更高层模块 (features, components, app)
- ✅ 无双向依赖
- ✅ 无循环依赖
- ✅ 符合单向按序依赖原则

---

## 📊 数据结构

### 核心类型

```typescript
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 来自 @mariozechner/pi-coding-agent (Session API)
// 来自 @mariozechner/pi-agent-core (AgentMessage, AgentTool)
// 来自 @mariozechner/pi-ai (LLM 抽象)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

// Agent 状态
interface AgentState {
  systemPrompt: string;
  model: Model<any>;
  thinkingLevel: ThinkingLevel;
  tools: AgentTool<any>[];
  messages: AgentMessage[];        // 包含历史消息
  isStreaming: boolean;            // 是否正在生成响应
  streamMessage: AgentMessage | null;  // 当前流式消息
  pendingToolCalls: Set<string>;   // 待执行的工具调用
  error?: string;
}

// Agent 事件
type AgentEvent =
  | { type: "agent_start" }
  | { type: "agent_end"; messages: AgentMessage[] }
  | { type: "turn_start" }
  | { type: "turn_end"; message: AgentMessage; toolResults: ToolResultMessage[] }
  | { type: "message_start"; message: AgentMessage }
  | { type: "message_update"; message: AgentMessage; assistantMessageEvent: any }
  | { type: "message_end"; message: AgentMessage }
  | { type: "tool_execution_start"; toolCallId: string; toolName: string; args: any }
  | { type: "tool_execution_update"; toolCallId: string; toolName: string; args: any; partialResult: any }
  | { type: "tool_execution_end"; toolCallId: string; toolName: string; result: any; isError: boolean };

// Agent 工具
interface AgentTool<TParameters extends TSchema = TSchema, TDetails = any> extends Tool<TParameters> {
  label: string;  // UI 显示标签
  execute: (
    toolCallId: string,
    params: Static<TParameters>,
    signal?: AbortSignal,
    onUpdate?: (partialResult: AgentToolResult<TDetails>) => void
  ) => Promise<AgentToolResult<TDetails>>;
}

// 思考级别
type ThinkingLevel = "off" | "minimal" | "low" | "medium" | "high" | "xhigh";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 来自 @mariozechner/pi-ai
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

// 用户消息
interface UserMessage {
  role: 'user';
  content: ContentBlock[];
  timestamp?: number;
  api?: string;
  provider?: string;
  model?: string;
}

// 助手消息
interface AssistantMessage {
  role: 'assistant';
  content: ContentBlock[];
  timestamp?: number;
  api?: string;
  provider?: string;
  model?: string;
  stopReason?: string;
  usage?: TokenUsage;
  errorMessage?: string;
}

// 工具结果消息
interface ToolResultMessage {
  role: 'toolResult';
  toolCallId: string;
  content: ContentBlock[];
  isError?: boolean;
  timestamp?: number;
}

// 内容块
type ContentBlock = TextContent | ImageContent | ThinkingContent | ToolCallContent;

interface TextContent {
  type: 'text';
  text: string;
}

interface ImageContent {
  type: 'image';
  source: { type: 'url' | 'base64'; value: string };
}

interface ThinkingContent {
  type: 'thinking';
  thinking: string;
}

interface ToolCallContent {
  type: 'toolCall';
  name: string;
  input: Record<string, unknown>;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// OriginOS 专用类型
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

interface AgentHealthStatus {
  isHealthy: boolean;
  isStreaming: boolean;
  messageCount: number;
  uptime: number;
  pendingToolCalls: number;
  error?: string;
}

interface OriginOSAgentConfig {
  provider?: string;
  modelId?: string;
  systemPrompt?: string;
  thinkingLevel?: ThinkingLevel;
}
```

---

## 🔌 API 设计

### 核心 API: OriginOSAgentService

**文件:** `src/lib/integrations/pi-agent/agent.ts`

#### API 1: 构造函数

```typescript
/**
 * 创建 OriginOS Agent 服务实例
 *
 * @param config - Agent 配置对象
 */
constructor(config: AgentConfig)
```

**性能约束:** < 100ms（构造函数是同步的）

---

#### API 2: 发送消息

```typescript
/**
 * 发送用户消息给 Agent
 *
 * @param prompt - 文本提示
 * @throws Error - 如果 Agent 正在忙
 *
 * @example
 * const service = new OriginOSAgentService(config);
 * await service.sendMessage('Hello, how are you?');
 */
async sendMessage(prompt: string): Promise<void>

/**
 * 发送结构化消息
 *
 * @param message - AgentMessage 对象
 */
async sendMessage(message: AgentMessage): Promise<void>
```

**性能约束:** 消息路由 < 100ms（不包括 LLM 响应时间）

---

#### API 3: 订阅事件

```typescript
/**
 * 订阅 Agent 事件
 *
 * @param callback - 事件回调函数
 * @returns 取消订阅的函数
 *
 * @example
 * const unsubscribe = service.subscribe((event) => {
 *   if (event.type === 'message_start') {
 *     console.log('开始生成响应');
 *   } else if (event.type === 'message_end') {
 *     console.log('响应完成');
 *   }
 * });
 */
subscribe(callback: (event: AgentEvent) => void): () => void
```

---

#### API 4: 状态查询

```typescript
/**
 * 获取 Agent 状态
 */
getState(): AgentState

/**
 * 检查 Agent 是否正在流式输出
 */
isStreaming(): boolean

/**
 * 获取健康状态
 */
getHealth(): AgentHealthStatus
```

---

#### API 5: 控制方法

```typescript
/**
 * 中断当前操作
 */
abort(): void

/**
 * 重置 Agent 状态（清空消息历史）
 */
reset(): void
```

---

#### API 6: 配置更新

```typescript
/**
 * 设置系统提示词
 */
setSystemPrompt(prompt: string): void

/**
 * 设置模型
 */
setModel(model: Model<any>): void

/**
 * 设置思考级别
 */
setThinkingLevel(level: ThinkingLevel): void

/**
 * 设置工具
 */
setTools(tools: AgentTool<any>[]): void
```

---

## ⚡ 性能优化

### 性能约束

| 指标 | 约束 | 测量方式 |
|------|------|---------|
| 构造函数 | < 100ms | `new OriginOSAgentService()` 执行时间 |
| 消息路由 | < 100ms | `sendMessage()` 到事件触发时间 |
| 健康检查 | < 50ms | `getHealth()` 执行时间 |
| 内存占用 | < 50MB | 基础状态内存 |

### 优化策略

#### 策略 1: 使用 Agent 内置优化

pi-agent-core 的 `Agent` 类已经实现了以下优化：
- 消息历史自动管理
- 流式输出支持
- 工具调用队列管理
- 状态变更事件通知

OriginOS 封装层只需：
1. 添加必要的元数据跟踪（消息计数、运行时间）
2. 提供符合 OriginOS 风格的 API

#### 策略 2: 性能监控

```typescript
async sendMessage(prompt: string): Promise<void> {
  if (this.agent.state.isStreaming) {
    throw new Error('Agent is busy');
  }

  const startTime = performance.now();

  // 订阅事件以测量流式输出延迟
  const unsubscribe = this.agent.subscribe((event) => {
    if (event.type === 'message_start') {
      const ttlm = performance.now() - startTime;
      if (ttlm > 100) {
        console.warn(`[Performance] Time to first message: ${ttlm.toFixed(2)}ms`);
      }
    }
  });

  await this.agent.prompt(prompt);
  unsubscribe();

  this.messageCount += 1;
}
```

---

## 🔒 安全考虑

### API 密钥管理

**策略:** 通过 `getApiKey` 函数动态获取密钥

```typescript
export async function loadConfig(): Promise<AgentConfig> {
  return {
    model: getModel('anthropic', 'claude-3-5-sonnet'),
    getApiKey: async (provider: string) => {
      // 从环境变量获取，不在代码中硬编码
      switch (provider) {
        case 'anthropic':
          return process.env.ANTHROPIC_API_KEY;
        case 'google':
          return process.env.GOOGLE_API_KEY;
        default:
          return undefined;
      }
    }
  };
}
```

### 消息验证

使用 pi-agent-core 的类型系统确保类型安全：

```typescript
import type { AgentMessage } from '@mariozechner/pi-agent-core';

function isValidAgentMessage(msg: unknown): msg is AgentMessage {
  return (
    typeof msg === 'object' &&
    msg !== null &&
    'role' in msg &&
    'content' in msg
  );
}
```

---

## 🧪 可测试性设计

### 示例测试

```typescript
import { describe, it, expect, vi } from 'vitest';
import { OriginOSSessionService } from '../agent';
import type { SessionConfig } from '../types';

// Mock createAgentSession
vi.mock('@mariozechner/pi-coding-agent', () => ({
  createAgentSession: vi.fn(async () => ({
    session: {
      sessionId: 'test-session-id',
      agent: {
        state: {
          isStreaming: false,
          messages: [],
          pendingToolCalls: new Set()
        }
      },
      messages: [],
      subscribe: vi.fn(() => () => {})
    }
  })),
  SessionManager: vi.fn(),
  DefaultResourceLoader: vi.fn()
}));

// Mock pi-ai
vi.mock('@mariozechner/pi-ai', () => ({
  getModel: vi.fn()
}));

describe('OriginOSAgentService', () => {
  it('should create an instance from config', () => {
    const config = {
      model: { id: 'test-model', provider: 'test', api: 'test' }
    } as AgentConfig;

    const service = new OriginOSAgentService(config);
    expect(service).toBeDefined();
  });

  it('should send a message', async () => {
    const config = {
      model: { id: 'test-model', provider: 'test', api: 'test' }
    } as AgentConfig;

    const service = new OriginOSAgentService(config);
    await expect(service.sendMessage('test')).resolves.not.toThrow();
  });
});
```

---

## 🔍 架构审查

### 审查清单

- [x] 技术栈符合 AGENTS.md (TypeScript, no forbidden tech)
- [x] 模块位于 Layer 1 (src/lib/integrations/)
- [x] 模块依赖符合单向原则
- [x] API 设计与实际 session-based API 对齐 (@mariozechner/pi-coding-agent: createAgentSession)
- [x] 事件系统使用 session.subscribe() 模式
- [x] 消息类型使用 AgentMessage from pi-agent-core
- [x] 包名使用正确的 pi-stack (@mariozechner/pi-coding-agent, @mariozechner/pi-agent-core, @mariozechner/pi-ai)
- [x] 性能约束已考虑

### 审查记录

| 日期 | 审查人 | 结果 | 备注 |
|------|--------|------|------|
| 2026-03-03 | team-lead | ✅ Approved (v1.0) | 架构设计完成 |
| 2026-03-03 | Architect | ✅ Approved (v2.0) | 修复 API 匹配问题 |

---

## 📌 相关文档

- [Story README](./README.md)
- [需求文档](./requirements.md)
- [AGENTS.md](../../../AGENTS.md)
- [Epic 0](../README.md)
- [pi-agent-core](../../../pi-mono/packages/agent/README.md)
- [pi-ai](../../../pi-mono/packages/ai/README.md)

---

## 🎯 与 OpenClaw 的对齐

| OpenClaw 模块 | OriginOS 对应 | 说明 |
|--------------|--------------|------|
| `src/agents/pi-embedded-runner/run.ts` | `src/lib/integrations/pi-agent/agent.ts` | 使用相同的 Agent 类 |
| `src/core/agent-session.ts` | (Story 0.5) | SessionManager 集成 |
| `src/core/session-manager.ts` | `src/lib/integrations/pi-agent/store.ts` | 会话持久化 |

### 关键设计决策

1. **直接封装 Agent 类**: 使用组合模式而非继承，保持灵活性
2. **保持原始 API 兼容**: 可以通过 service.agent 访问原始 Agent 实例
3. **事件驱动**: 使用 Agent.subscribe() 处理所有事件流
4. **配置简化**: MVP 阶段只支持基础配置

---

## 📝 变更历史

| 版本 | 日期 | 变更说明 | 变更人 |
|------|------|---------|--------|
| 1.0 | 2026-03-02 | 初始版本 | team-lead |
| 2.0 | 2026-03-03 | 修复 API 匹配问题 | Architect |
