import { EventEmitter } from 'node:events';
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import path from 'node:path';
import { getMonorepoRoot } from './paths';
import { BrowserWindow, ipcMain } from 'electron';
import { IPC_CHANNELS } from './ipc-protocol';

export interface LocalAgentConfig {
  agentId: string;
  sessionId: string;
  projectId: string;
  workingDirectory: string;
  agentType?: 'persistent' | 'originos' | 'skill' | 'role-agent' | 'supervisor';
  systemPrompt?: string;
}

export interface LocalAgentEventEnvelope {
  agentId: string;
  sessionId: string;
  event: unknown;
}

interface WorkerCommand {
  type: 'initialize' | 'prompt' | 'abort' | 'shutdown';
  config?: {
    projectId: string;
    agentId: string;
    workingDirectory: string;
    agentType?: 'persistent' | 'originos' | 'skill' | 'role-agent' | 'supervisor';
    systemPrompt?: string;
  };
  message?: string;
}

interface WorkerMessage {
  type: 'ready' | 'waiting' | 'event' | 'error';
  event?: unknown;
  message?: string;
  error?: string;
}

interface AgentProcessState {
  config: LocalAgentConfig;
  process: ChildProcessWithoutNullStreams;
  buffer: string;
}

export class LocalAgentBridge extends EventEmitter {
  private readonly agents = new Map<string, AgentProcessState>();

  constructor() {
    super();
    this.registerIpcHandlers();
  }

  private registerIpcHandlers(): void {
    ipcMain.handle(IPC_CHANNELS.AGENT_START, async (_event, config: LocalAgentConfig) => {
      return this.startAgent(config);
    });

    ipcMain.handle(IPC_CHANNELS.AGENT_STOP, async (_event, agentId: string) => {
      await this.stopAgent(agentId);
      return true;
    });

    ipcMain.handle(IPC_CHANNELS.AGENT_MESSAGE, async (_event, payload: { agentId: string; message: string }) => {
      await this.sendMessage(payload.agentId, payload.message);
      return true;
    });

    ipcMain.handle(IPC_CHANNELS.AGENT_ABORT, async (_event, agentId: string) => {
      await this.abortAgent(agentId);
      return true;
    });
  }

  async startAgent(config: LocalAgentConfig): Promise<string> {
    const existing = this.agents.get(config.agentId);
    if (existing) {
      return config.agentId;
    }

    const workerPath = path.join(getMonorepoRoot(), 'src/modules/collaboration-runtime/sandbox/agent-worker.mts');
    const child = spawn(process.execPath, ['--import', 'tsx', workerPath], {
      cwd: getMonorepoRoot(),
      stdio: ['pipe', 'pipe', 'pipe'],
      env: {
        ...process.env,
        NODE_OPTIONS: process.env['NODE_OPTIONS'],
      },
    });

    const state: AgentProcessState = {
      config,
      process: child,
      buffer: '',
    };

    child.stdout.on('data', (chunk: Buffer) => {
      this.handleWorkerOutput(config.agentId, chunk.toString('utf-8'));
    });

    child.stderr.on('data', (chunk: Buffer) => {
      console.error(`[LocalAgentBridge:${config.agentId}]`, chunk.toString('utf-8'));
    });

    child.on('exit', (code) => {
      this.agents.delete(config.agentId);
      this.notifyRenderer(IPC_CHANNELS.AGENT_EXIT, {
        agentId: config.agentId,
        sessionId: config.sessionId,
        code,
      });
    });

    this.agents.set(config.agentId, state);

    this.sendCommand(config.agentId, {
      type: 'initialize',
      config: {
        projectId: config.projectId,
        agentId: config.agentId,
        workingDirectory: config.workingDirectory,
        agentType: config.agentType ?? 'originos',
        systemPrompt: config.systemPrompt,
      },
    });

    return config.agentId;
  }

  async stopAgent(agentId: string): Promise<void> {
    const state = this.agents.get(agentId);
    if (!state) {
      return;
    }
    this.sendCommand(agentId, { type: 'shutdown' });
    await new Promise<void>((resolve) => {
      let settled = false;
      const finish = (): void => {
        if (settled) return;
        settled = true;
        clearTimeout(forceKillTimer);
        resolve();
      };
      const forceKillTimer = setTimeout(() => {
        if (!state.process.killed) {
          state.process.kill('SIGKILL');
        }
        finish();
      }, 3000);
      state.process.once('exit', finish);
      if (state.process.exitCode !== null || state.process.signalCode !== null) {
        finish();
      }
    });
  }

  async abortAgent(agentId: string): Promise<void> {
    if (!this.agents.has(agentId)) {
      return;
    }
    this.sendCommand(agentId, { type: 'abort' });
  }

  async sendMessage(agentId: string, message: string): Promise<void> {
    if (!this.agents.has(agentId)) {
      throw new Error(`Agent not found: ${agentId}`);
    }
    this.sendCommand(agentId, { type: 'prompt', message });
  }

  private sendCommand(agentId: string, command: WorkerCommand): void {
    const state = this.agents.get(agentId);
    if (!state) {
      throw new Error(`Agent not found: ${agentId}`);
    }
    state.process.stdin.write(`${JSON.stringify(command)}\n`);
  }

  private handleWorkerOutput(agentId: string, chunk: string): void {
    const state = this.agents.get(agentId);
    if (!state) {
      return;
    }

    state.buffer += chunk;
    const lines = state.buffer.split('\n');
    state.buffer = lines.pop() ?? '';

    for (const line of lines) {
      if (!line.trim()) {
        continue;
      }

      try {
        const message = JSON.parse(line) as WorkerMessage;
        if (message.type === 'event') {
          const envelope: LocalAgentEventEnvelope = {
            agentId,
            sessionId: state.config.sessionId,
            event: message.event,
          };
          this.emit('agent:event', envelope);
          this.notifyRenderer(IPC_CHANNELS.AGENT_EVENT, envelope);
        } else if (message.type === 'error') {
          this.notifyRenderer(IPC_CHANNELS.AGENT_EVENT, {
            agentId,
            sessionId: state.config.sessionId,
            event: {
              type: 'agent_error',
              error: {
                message: message.message ?? 'Unknown agent worker error',
              },
            },
          } satisfies LocalAgentEventEnvelope);
        }
      } catch (error) {
        console.error('[LocalAgentBridge] Failed to parse worker output:', error);
      }
    }
  }

  private notifyRenderer(channel: string, payload: unknown): void {
    for (const window of BrowserWindow.getAllWindows()) {
      window.webContents.send(channel, payload);
    }
  }

  async shutdown(): Promise<void> {
    await Promise.all(Array.from(this.agents.keys()).map((agentId) => this.stopAgent(agentId)));
    this.agents.clear();
  }
}
