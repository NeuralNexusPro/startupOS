# Next.js 与 PI Agent 进程分离 — 架构设计

## 1. 现状问题

### 1.1 当前架构

```
┌─────────────────────────────────────────────────┐
│  Next.js 进程（全部运行在同一进程）               │
│                                                   │
│  Next.js App Router (src/app/)                   │
│  ├─ API routes (/api/chat, /api/agents/...)      │
│  └─ React Server Components (UI 渲染)             │
│                                                   │
│  PersistentAgentManager (单例)                    │
│  ├─ agents: Map<string, PersistentAgent>          │
│  └─ initialize() → createOriginOSAgent()          │
│                                                   │
│  OriginOSAgent → @mariozechner/agent              │
│  ├─ agent.prompt(message)                         │
│  ├─ agent.setTools(tools)                         │
│  └─ LLM SDK call (@mariozechner/pi-ai)            │
│                                                   │
│  @anthropic-ai/sandbox-runtime (工具沙箱)          │
│  └─ sandbox-exec / bubblewrap                     │
└─────────────────────────────────────────────────┘
```

**关键代码链路**：

```
src/app/api/chat/route.ts
  → persistentAgentManager.startAgent(projectId)
    → new PersistentAgent({ ... })
      → agent.initialize()
        → createOriginOSAgent(config)
          → new Agent({ ... })        // @mariozechner/agent
            → agent.prompt(message)    // 阻塞式 LLM 调用
```

### 1.2 四个硬问题

| 问题 | 现象 | 影响 |
|------|------|------|
| **事件循环阻塞** | LLM 调用（2-60s）在同一个 event loop 中排队 | 多窗体同时使用时，响应延迟叠加 |
| **上下文膨胀** | 每个 Agent 的对话历史存在进程内存中 | 多项目并发 → 内存持续增长，无回收 |
| **崩溃传播** | Agent 未捕获异常 → Next.js 进程崩溃 | 单个 Agent 出错影响所有用户 |
| **资源不可控** | 无法对单个 Agent 做内存/CPU/网络限制 | 恶意或失控 Agent 可以耗尽系统资源 |

### 1.3 多窗体场景

当前用户打开多个工作区窗体时：

```
Window A → POST /api/chat { projectId: "proj-1", message: "..." }
Window B → POST /api/chat { projectId: "proj-1", message: "..." }
Window C → POST /api/chat { projectId: "proj-2", message: "..." }
         ↓
   同一个 Next.js 进程
         ↓
   PersistentAgentManager (单例)
         ↓
   三个 prompt() 在同一个 event loop 中排队执行
```

LLM 调用是 CPU-bound + IO-bound 的混合操作（SDK 网络请求 + 响应流解析 + 工具执行），在单进程中无法真正并行。

## 2. 目标架构

### 2.1 三层进程隔离

```
┌──────────────────┐     HTTP/SSE       ┌──────────────────────┐
│  Next.js         │◄──────────────────►│  Agent Runtime       │
│  (Web 层)        │                    │  (独立 Node 进程)     │
│                  │                    │                      │
│  src/app/        │                    │  ┌────────────────┐  │
│  src/components/ │                    │  │ Agent Process 1 │  │
│                  │                    │  │ (sandbox)       │  │
│  职责:           │                    │  │ @mariozechner/  │  │
│  • UI 渲染       │                    │  │ agent           │  │
│  • API routing   │                    │  └────────────────┘  │
│  • SSE 推送      │                    │  ┌────────────────┐  │
│  • 用户认证      │                    │  │ Agent Process 2 │  │
│                  │                    │  │ (sandbox)       │  │
│  不做什么:       │                    │  └────────────────┘  │
│  • 不调用 LLM    │                    │  ┌────────────────┐  │
│  • 不执行业务逻辑 │                    │  │ Agent Process N │  │
│  • 不管理 Agent   │                    │  └────────────────┘  │
│                  │                    │                      │
│                  │                    │  职责:               │
│                  │                    │  • 多 Agent 编排      │
│                  │                    │  • LLM 调用           │
│                  │                    │  • 工具执行           │
│                  │                    │  • 黑板 + 事件流      │
└──────────────────┘                    └──────────────────────┘
```

### 2.2 职责划分

| 层 | 进程 | 职责 | 当前代码去向 |
|----|------|------|-------------|
| **Web 层** | Next.js (现有进程) | UI 渲染、SSE 推送、路由控制、用户认证 | 不动，保留 `src/app/`, `src/components/` |
| **Runtime 层** | 独立 Node 进程 | 多 Agent 编排、黑板、事件流、拓扑驱动、会话管理 | 新建 `src/modules/collaboration-runtime/` |
| **Agent 层** | 子进程（每 Agent 一个） | LLM 调用、工具执行、对话管理 | `src/lib/integrations/pi-agent/` 包装为子进程启动入口 |

### 2.3 通信机制

```
┌─────────────┐                    ┌──────────────┐                    ┌──────────────┐
│  Next.js    │  HTTP POST / SSE   │  Agent       │  stdio + sandbox   │  Agent       │
│  (Web)      │◄──────────────────►│  Runtime     │◄──────────────────►│  Sub-process │
│             │                    │              │                    │              │
│ POST /chat  │──msg─────────────► │ startAgent() │──command─────────► │ @mariozechner│
│             │                    │              │                    │ /agent        │
│ SSE events  │◄──event─────────── │              │◄──result────────── │              │
│             │                    │              │                    │              │
│ GET /status │──ping─────────────►│ getAgent()   │──query───────────► │              │
│             │◄──pong──────────── │              │◄──status────────── │              │
└─────────────┘                    └──────────────┘                    └──────────────┘
```

| 路径 | 协议 | 方向 | 内容 |
|------|------|------|------|
| Next.js → Runtime | HTTP POST | 请求 | 用户消息、创建会话、终止会话 |
| Runtime → Next.js | SSE (Server-Sent Events) | 推送 | Agent 思考过程、工具调用、结果 |
| Runtime → Agent 子进程 | stdio + `@anthropic-ai/sandbox-runtime` | 命令 | 启动 Agent、传入 prompt 和工具配置 |
| Agent 子进程 → Runtime | stdio | 响应 | LLM 输出流、工具执行结果 |

## 3. 详细设计

### 3.1 Agent Runtime 进程

```typescript
// src/modules/collaboration-runtime/runtime-server.ts
// 独立 Node.js 进程入口，通过 HTTP 对外提供服务

import { createServer } from 'http';
import { CollaborationEngine } from './engine/collaboration-engine';
import { Blackboard } from './session/blackboard';
import { FsEventStore } from './session/fs-event-store';
import { SandboxManager } from '@anthropic-ai/sandbox-runtime';

const engine = new CollaborationEngine({
  blackboard: new Blackboard(),
  eventStore: new FsEventStore(),
  sandboxManager: new SandboxManager(),
});

const server = createServer(async (req, res) => {
  // POST /sessions — 创建协作会话
  // POST /sessions/{id}/message — 发送消息
  // POST /sessions/{id}/abort — 终止
  // GET /sessions/{id}/events — SSE 事件流
  // GET /health — 健康检查
});

server.listen(process.env.AGENT_RUNTIME_PORT ?? 3100);
console.log(`Agent Runtime listening on :${process.env.AGENT_RUNTIME_PORT ?? 3100}`);
```

### 3.2 Agent 子进程启动

```typescript
// src/modules/collaboration-runtime/sandbox/agent-spawner.ts
// 通过 @anthropic-ai/sandbox-runtime 启动隔离的 Agent 子进程

import { SandboxManager, SandboxRuntimeConfig } from '@anthropic-ai/sandbox-runtime';
import { spawn } from 'child_process';

export async function spawnAgentProcess(
  projectId: string,
  config: {
    systemPrompt: string;
    allowedTools: string[];
    workingDirectory: string;
    timeoutMs?: number;
  }
): Promise<AgentProcessHandle> {
  // 通过 sandbox 包装启动 Agent 子进程
  const sandboxConfig: SandboxRuntimeConfig = {
    filesystem: {
      allowWrite: [config.workingDirectory],
      denyWrite: ['~/.claude/**', '~/.ssh/**', '~/.gitconfig'],
    },
  };

  // Agent 子进程入口: node src/lib/integrations/pi-agent/agent-worker.ts
  const command = `node dist/lib/integrations/pi-agent/agent-worker.js ${projectId}`;
  const wrappedCommand = await sandboxManager.wrapWithSandbox(command, undefined, sandboxConfig);

  // 通过 stdio 与子进程通信
  const child = spawn(/* ... */, { stdio: ['pipe', 'pipe', 'pipe'] });

  return { child, sandboxHandle: wrappedCommand };
}
```

### 3.3 Agent Worker 子进程

```typescript
// src/lib/integrations/pi-agent/agent-worker.ts
// Agent 子进程入口，通过 stdio 与 Runtime 通信

import { PersistentAgent } from './persistent-agent';

// 接收 Runtime 的指令
process.stdin.on('data', async (data) => {
  const message = JSON.parse(data.toString());
  switch (message.type) {
    case 'initialize':
      const agent = await PersistentAgent.create(message.projectId);
      await agent.initialize();
      respond({ type: 'initialized' });
      break;
    case 'prompt':
      await agent.handleMessage(message.content);
      respond({ type: 'done' });
      break;
    case 'abort':
      agent.abort();
      break;
    case 'shutdown':
      await agent.shutdown();
      process.exit(0);
      break;
  }
});

// 向 Runtime 发送事件流
function respond(event: object) {
  process.stdout.write(JSON.stringify(event) + '\n');
}
```

### 3.4 Next.js 侧调用

```typescript
// src/app/api/chat/route.ts
// Next.js 不再直接创建 Agent，改为调用 Agent Runtime HTTP API

export async function POST(req: Request) {
  const { projectId, message } = await req.json();

  // 向 Agent Runtime 发送消息
  const response = await fetch(
    `${process.env.AGENT_RUNTIME_URL}/sessions/${projectId}/message`,
    { method: 'POST', body: JSON.stringify({ content: message }) }
  );

  // 返回 SSE 流给前端
  return new Response(response.body, {
    headers: { 'Content-Type': 'text/event-stream' },
  });
}
```

## 4. 迁移路径

### Phase 1: 创建 Agent Runtime 进程骨架 ✅ Complete

- [x] 创建 `src/modules/collaboration-runtime/runtime-server.ts`
- [x] 实现 HTTP API（sessions CRUD + SSE）
- [x] Next.js 侧改为调用 Runtime API（替代直接 import）
- [x] 验证：单 Agent 对话通过 Runtime 中转正常

### Phase 2: Agent 子进程隔离 ✅ Complete

- [x] 创建 `src/lib/integrations/pi-agent/agent-worker.ts`
- [x] 通过 `@anthropic-ai/sandbox-runtime` 包装启动
- [x] stdio 通信协议定义
- [x] 验证：Agent 在子进程中运行，崩溃不影响 Runtime

### Phase 3: 多 Agent 编排 ✅ Complete

- [x] 实现 Blackboard + Event Sourcing
- [x] 实现 Collaboration Engine（拓扑解析 + DAG 执行）
- [x] ACL 消息协议
- [x] 验证：多 Agent 按 Solution Manifest 协作

## 5. 风险与缓解

| 风险 | 影响 | 缓解 |
|------|------|------|
| Runtime 进程崩溃 | 所有 Agent 会话丢失 | 重启后从事件流恢复黑板状态 |
| stdio 管道断开 | Agent 子进程与 Runtime 失联 | 心跳检测 + 自动重启子进程 |
| SSE 连接中断 | 前端丢失事件流 | Next.js 侧缓存最后事件 ID，重连后继续 |
| 多进程调试困难 | 问题定位困难 | 统一日志格式，按进程 ID 标记，集中收集 |
