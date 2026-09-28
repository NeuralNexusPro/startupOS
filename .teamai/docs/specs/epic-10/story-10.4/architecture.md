# 架构设计 - Story 10.4

**Story:** 本地 Agent Runtime
**Epic:** 10 - OriginOS CE 客户端
**最后更新:** 2026-06-02

---

## 🏗️ 技术栈

| 技术 | 用途 |
|------|------|
| Node.js child_process | Agent 子进程管理 |
| IPC (stdio) | 主进程与 Agent 子进程通信 |
| IPC (electron) | 主进程与渲染进程通信 |
| collaboration-runtime | 复用现有 Agent 运行时模块 |
| EventEmitter | 事件驱动架构 |

---

## 📝 实现任务

### 1. 实现 LocalAgentBridge（Main Process）

**文件:** `electron/local-agent-bridge.ts`

```typescript
import { ChildProcess, spawn } from 'child_process';
import { ipcMain, app } from 'electron';
import path from 'path';
import { EventEmitter } from 'events';

interface AgentConfig {
  agentId: string;
  sessionId: string;
  workingDirectory: string;
  agentType: 'worker' | 'role' | 'project';
}

interface AgentMessage {
  type: 'text' | 'tool_call' | 'tool_result' | 'error';
  content: string;
  metadata?: Record<string, unknown>;
}

export class LocalAgentBridge extends EventEmitter {
  private agents = new Map<string, ChildProcess>();
  private dataDir: string;

  constructor(dataDir: string = path.join(app.getPath('userData'), 'data')) {
    super();
    this.dataDir = dataDir;
    this.registerIpcHandlers();
  }

  private registerIpcHandlers() {
    ipcMain.handle('agent:start', async (_event, config: AgentConfig) => {
      return this.startAgent(config);
    });

    ipcMain.handle('agent:stop', async (_event, agentId: string) => {
      return this.stopAgent(agentId);
    });

    ipcMain.handle('agent:message', async (_event, agentId: string, message: string) => {
      return this.sendMessage(agentId, message);
    });
  }

  async startAgent(config: AgentConfig): Promise<string> {
    const runtimePath = this.getRuntimePath();

    const child = spawn('node', [runtimePath], {
      env: {
        ...process.env,
        AGENT_ID: config.agentId,
        SESSION_ID: config.sessionId,
        WORKING_DIR: config.workingDirectory,
        AGENT_TYPE: config.agentType,
        DATA_DIR: this.dataDir,
      },
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    child.stdout?.on('data', (data: Buffer) => {
      this.handleAgentOutput(config.agentId, data.toString());
    });

    child.stderr?.on('data', (data: Buffer) => {
      console.error(`[Agent ${config.agentId}] stderr:`, data.toString());
    });

    child.on('exit', (code) => {
      this.agents.delete(config.agentId);
      this.emit('agent:exit', { agentId: config.agentId, code });
      this.notifyRenderer('agent:exit', { agentId: config.agentId, code });
    });

    child.on('error', (err) => {
      console.error(`[Agent ${config.agentId}] spawn error:`, err);
      this.emit('agent:error', { agentId: config.agentId, error: err.message });
    });

    this.agents.set(config.agentId, child);
    return config.agentId;
  }

  async stopAgent(agentId: string): Promise<void> {
    const child = this.agents.get(agentId);
    if (child) {
      child.kill('SIGTERM');
      // 等待进程退出，超时后强制杀死
      setTimeout(() => {
        if (this.agents.has(agentId)) {
          child.kill('SIGKILL');
        }
      }, 5000);
    }
  }

  async sendMessage(agentId: string, message: string): Promise<void> {
    const child = this.agents.get(agentId);
    if (!child || !child.stdin) {
      throw new Error(`Agent ${agentId} not found or not ready`);
    }

    const payload = JSON.stringify({ type: 'message', content: message }) + '\n';
    child.stdin.write(payload);
  }

  private handleAgentOutput(agentId: string, output: string) {
    const lines = output.split('\n').filter(Boolean);

    for (const line of lines) {
      try {
        const message: AgentMessage = JSON.parse(line);
        this.emit('agent:message', { agentId, message });
        this.notifyRenderer('agent:message', { agentId, message });
      } catch {
        // 非 JSON 输出，作为普通文本处理
        const message: AgentMessage = { type: 'text', content: line };
        this.emit('agent:message', { agentId, message });
        this.notifyRenderer('agent:message', { agentId, message });
      }
    }
  }

  private getRuntimePath(): string {
    // 开发模式使用源码，生产模式使用编译后的文件
    if (process.env.NODE_ENV === 'development') {
      return path.join(__dirname, '../src/modules/collaboration-runtime/sandbox/agent-worker.mts');
    }
    return path.join(__dirname, '../out/collaboration-runtime/agent-worker.js');
  }

  private notifyRenderer(channel: string, data: unknown) {
    const { BrowserWindow } = require('electron');
    BrowserWindow.getAllWindows().forEach((win) => {
      win.webContents.send(channel, data);
    });
  }

  async shutdown() {
    const killPromises = Array.from(this.agents.entries()).map(([id, child]) => {
      return new Promise<void>((resolve) => {
        child.on('exit', () => resolve());
        child.kill('SIGTERM');
        setTimeout(() => {
          if (this.agents.has(id)) {
            child.kill('SIGKILL');
          }
          resolve();
        }, 3000);
      });
    });

    await Promise.all(killPromises);
    this.agents.clear();
  }
}
```

### 2. 实现 useLocalAgent Hook（Renderer）

**文件:** `src/hooks/useLocalAgent.ts`

```typescript
import { useCallback, useEffect, useState, useRef } from 'react';
import { isElectron, getIpcRenderer } from '@/lib/integrations/electron/env';

interface AgentMessage {
  type: 'text' | 'tool_call' | 'tool_result' | 'error';
  content: string;
  metadata?: Record<string, unknown>;
}

interface UseLocalAgentOptions {
  agentId: string;
  sessionId: string;
  workingDirectory: string;
  agentType?: 'worker' | 'role' | 'project';
  onMessage?: (message: AgentMessage) => void;
  onExit?: (code: number | null) => void;
}

export function useLocalAgent(options: UseLocalAgentOptions) {
  const [isRunning, setIsRunning] = useState(false);
  const [messages, setMessages] = useState<AgentMessage[]>([]);
  const cleanupRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    if (!isElectron()) return;

    const ipcRenderer = getIpcRenderer();

    // 监听 Agent 消息
    const messageHandler = (_event: unknown, data: { agentId: string; message: AgentMessage }) => {
      if (data.agentId === options.agentId) {
        setMessages((prev) => [...prev, data.message]);
        options.onMessage?.(data.message);
      }
    };

    // 监听 Agent 退出
    const exitHandler = (_event: unknown, data: { agentId: string; code: number | null }) => {
      if (data.agentId === options.agentId) {
        setIsRunning(false);
        options.onExit?.(data.code);
      }
    };

    ipcRenderer.on('agent:message', messageHandler);
    ipcRenderer.on('agent:exit', exitHandler);

    cleanupRef.current = () => {
      ipcRenderer.removeListener('agent:message', messageHandler);
      ipcRenderer.removeListener('agent:exit', exitHandler);
    };

    return () => {
      cleanupRef.current?.();
    };
  }, [options.agentId]);

  const start = useCallback(async () => {
    if (!isElectron()) {
      throw new Error('useLocalAgent is only available in Electron');
    }

    const ipcRenderer = getIpcRenderer();
    await ipcRenderer.invoke('agent:start', {
      agentId: options.agentId,
      sessionId: options.sessionId,
      workingDirectory: options.workingDirectory,
      agentType: options.agentType || 'worker',
    });

    setIsRunning(true);
    setMessages([]);
  }, [options]);

  const stop = useCallback(async () => {
    if (!isElectron()) return;

    const ipcRenderer = getIpcRenderer();
    await ipcRenderer.invoke('agent:stop', options.agentId);
    setIsRunning(false);
  }, [options.agentId]);

  const send = useCallback(async (message: string) => {
    if (!isElectron()) {
      throw new Error('useLocalAgent is only available in Electron');
    }

    const ipcRenderer = getIpcRenderer();
    await ipcRenderer.invoke('agent:message', options.agentId, message);
  }, [options.agentId]);

  return {
    isRunning,
    messages,
    start,
    stop,
    send,
  };
}
```

### 3. 创建统一的 useAgentSession Hook

**文件:** `src/hooks/useAgentSessionUnified.ts`

```typescript
import { useLocalAgent } from './useLocalAgent';
import { usePiAgent } from '@/lib/integrations/pi-agent/hooks';
import { isElectron } from '@/lib/integrations/electron/env';

interface AgentSessionOptions {
  sessionId: string;
  projectId?: string;
  agentType?: 'worker' | 'role' | 'project';
  workingDirectory?: string;
}

/**
 * 统一的 Agent 会话 API，自动选择本地 Runtime 或远程 HTTP API
 */
export function useAgentSessionUnified(options: AgentSessionOptions) {
  const agentId = `agent-${options.sessionId}`;

  // Electron 环境：本地 Runtime
  const localAgent = useLocalAgent({
    agentId,
    sessionId: options.sessionId,
    workingDirectory: options.workingDirectory || '',
    agentType: options.agentType,
  });

  // 浏览器环境：远程 HTTP API
  const remoteAgent = usePiAgent({
    sessionId: options.sessionId,
    projectId: options.projectId,
  });

  if (isElectron()) {
    return {
      isRunning: localAgent.isRunning,
      messages: localAgent.messages,
      start: localAgent.start,
      stop: localAgent.stop,
      send: localAgent.send,
    };
  }

  return {
    isRunning: remoteAgent.isLoading,
    messages: remoteAgent.messages,
    start: async () => remoteAgent.initialize(),
    stop: async () => remoteAgent.clearSession(),
    send: async (message: string) => remoteAgent.sendMessage(message),
  };
}
```

### 4. 初始化 LocalAgentBridge

**文件:** `electron/main.ts`

```typescript
import { app } from 'electron';
import { LocalFileSystem } from './local-fs';
import { LocalAgentBridge } from './local-agent-bridge';
import { ElectronWindowManager } from './window-manager';

let localFS: LocalFileSystem;
let agentBridge: LocalAgentBridge;
let windowManager: ElectronWindowManager;

app.whenReady().then(() => {
  // 初始化文件系统
  localFS = new LocalFileSystem();

  // 初始化 Agent 桥接
  agentBridge = new LocalAgentBridge();

  // 初始化窗口管理器
  windowManager = new ElectronWindowManager();

  // 创建主窗口
  // ...
});

app.on('before-quit', async () => {
  // 优雅关闭所有 Agent
  await agentBridge.shutdown();
});
```

---

## 📁 相关文件

| 文件 | 说明 |
|------|------|
| `electron/local-agent-bridge.ts` | 本地 Agent 桥接器 |
| `src/hooks/useLocalAgent.ts` | 本地 Agent Hook |
| `src/hooks/useAgentSessionUnified.ts` | 统一 Agent 会话 API |
| `src/modules/collaboration-runtime/sandbox/agent-worker.mts` | Agent Worker 子进程 |
| `electron/main.ts` | 主进程入口（初始化） |

---

## 📚 相关文档

- [需求规格](./requirements.md) - 用户故事和验收标准
- [测试策略](./testing.md) - 测试用例和验证方法
- [返回 Story 概览](./README.md)
