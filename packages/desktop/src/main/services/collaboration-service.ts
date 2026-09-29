import { BrowserWindow, ipcMain } from 'electron';
import { IPC_CHANNELS } from '../ipc-protocol';
import type { IpcResponse } from '@originos/core/lib/integrations/electron';
import { addElectronForwarder } from '@originos/core/modules/collaboration-runtime/facade/event-bus';
import { persistRuntimeLLMConfig } from '@originos/core/lib/features/user-config';
import type { RuntimeLLMConfig } from '@originos/core/lib/integrations/pi-agent/llm-config';
import { loadProjectSolutionTopologyProjection } from '@originos/core/lib/features/solution';

// Dynamic import wrapper — collaboration-runtime is a heavy module
let facade: typeof import('@originos/core/modules/collaboration-runtime/facade') | null = null;

async function getFacade() {
  if (!facade) {
    facade = await import('@originos/core/modules/collaboration-runtime/facade');
  }
  return facade;
}

function summarizeRuntimeLLMConfig(config?: RuntimeLLMConfig): Record<string, unknown> {
  if (!config) return { provided: false };
  const credentialSource = config.anthropicCredentialSource
    ?? (config.anthropicAuthToken ? 'anthropicAuthToken' : undefined)
    ?? (config.anthropicApiKey ? 'anthropicApiKey' : undefined)
    ?? (config.authToken ? 'authToken' : undefined)
    ?? (config.apiKey ? 'apiKey' : undefined);
  return {
    provided: true,
    provider: config.provider ?? 'default',
    model: config.model ?? 'default',
    baseUrl: config.anthropicBaseUrl ?? config.baseUrl ?? 'default',
    hasCredential: Boolean(config.anthropicAuthToken || config.anthropicApiKey || config.authToken || config.apiKey),
    credentialSource: credentialSource ?? 'none',
    maxTokens: config.maxTokens ?? 'default',
  };
}

function logRuntime(phase: string, data: Record<string, unknown>): void {
  console.error(`[MultiAgentRuntime] ${phase} ${JSON.stringify(data)}`);
}

export class CollaborationService {
  private cleanupFn: (() => void) | null = null;

  constructor() {
    this.registerHandlers();
    this.setupEventForwarding();
  }

  private registerHandlers(): void {
    // ── Topology ──────────────────────────────────────────────

    ipcMain.handle(
      IPC_CHANNELS.COLLAB_TOPOLOGY_GET,
      async (_event, request: { projectId: string }): Promise<IpcResponse<unknown>> => {
        try {
          if (!request.projectId) {
            return {
              success: false,
              error: { code: 'INVALID_REQUEST', message: 'projectId is required' },
              timestamp: new Date().toISOString(),
            };
          }
          const topology = await loadProjectSolutionTopologyProjection({ projectId: request.projectId });
          if (!topology) {
            return {
              success: false,
              error: { code: 'NOT_FOUND', message: 'No topology found for project' },
              timestamp: new Date().toISOString(),
            };
          }
          return {
            success: true,
            data: topology,
            timestamp: new Date().toISOString(),
          };
        } catch (error) {
          return this.toErrorResponse(error, '[CollaborationService] Get topology failed');
        }
      }
    );

    // ── Session List ──────────────────────────────────────────

    ipcMain.handle(
      IPC_CHANNELS.COLLAB_SESSION_LIST,
      async (): Promise<IpcResponse<unknown>> => {
        try {
          const f = await getFacade();
          const sessions = await f.listSessions();
          return {
            success: true,
            data: sessions,
            timestamp: new Date().toISOString(),
          };
        } catch (error) {
          return this.toErrorResponse(error, '[CollaborationService] List sessions failed');
        }
      }
    );

    // ── Session Create ────────────────────────────────────────

    ipcMain.handle(
      IPC_CHANNELS.COLLAB_SESSION_CREATE,
      async (_event, request: Record<string, unknown>): Promise<IpcResponse<unknown>> => {
        try {
          const llmConfig = request['llmConfig'] && typeof request['llmConfig'] === 'object'
            ? request['llmConfig'] as RuntimeLLMConfig
            : undefined;
          logRuntime('ipc.session.create.received', {
            projectId: typeof request['projectId'] === 'string' ? request['projectId'] : 'unknown',
            mode: typeof request['mode'] === 'string' ? request['mode'] : 'unknown',
            hasGlobalGoal: typeof request['globalGoal'] === 'string' && request['globalGoal'].length > 0,
            llmConfig: summarizeRuntimeLLMConfig(llmConfig),
          });
          const f = await getFacade();
          const session = await f.createSession(request as unknown as Parameters<typeof f.createSession>[0]);
          logRuntime('ipc.session.create.result', {
            sessionId: session.id,
            projectId: session.projectId,
            status: session.status,
            llmConfig: summarizeRuntimeLLMConfig(session.config.llmConfig),
          });
          return {
            success: true,
            data: session,
            timestamp: new Date().toISOString(),
          };
        } catch (error) {
          return this.toErrorResponse(error, '[CollaborationService] Create session failed');
        }
      }
    );

    // ── Session Get ───────────────────────────────────────────

    ipcMain.handle(
      IPC_CHANNELS.COLLAB_SESSION_GET,
      async (_event, request: { sessionId: string }): Promise<IpcResponse<unknown>> => {
        try {
          if (!request.sessionId) {
            return {
              success: false,
              error: { code: 'INVALID_REQUEST', message: 'sessionId is required' },
              timestamp: new Date().toISOString(),
            };
          }
          const f = await getFacade();
          const session = await f.getSession(request.sessionId);
          if (!session) {
            return {
              success: false,
              error: { code: 'NOT_FOUND', message: 'Session not found' },
              timestamp: new Date().toISOString(),
            };
          }
          const blackboard = await f.getBlackboardState(request.sessionId);
          return {
            success: true,
            data: { session, blackboard },
            timestamp: new Date().toISOString(),
          };
        } catch (error) {
          return this.toErrorResponse(error, '[CollaborationService] Get session failed');
        }
      }
    );

    // ── Session Abort ─────────────────────────────────────────

    ipcMain.handle(
      IPC_CHANNELS.COLLAB_SESSION_ABORT,
      async (_event, request: { sessionId: string }): Promise<IpcResponse<unknown>> => {
        try {
          if (!request.sessionId) {
            return {
              success: false,
              error: { code: 'INVALID_REQUEST', message: 'sessionId is required' },
              timestamp: new Date().toISOString(),
            };
          }
          const f = await getFacade();
          await f.abortSession(request.sessionId);
          return {
            success: true,
            data: { status: 'aborted' },
            timestamp: new Date().toISOString(),
          };
        } catch (error) {
          return this.toErrorResponse(error, '[CollaborationService] Abort session failed');
        }
      }
    );

    // ── Session Execute ───────────────────────────────────────

    ipcMain.handle(
      IPC_CHANNELS.COLLAB_SESSION_EXECUTE,
      async (_event, request: { sessionId: string }): Promise<IpcResponse<unknown>> => {
        try {
          if (!request.sessionId) {
            return {
              success: false,
              error: { code: 'INVALID_REQUEST', message: 'sessionId is required' },
              timestamp: new Date().toISOString(),
            };
          }
          const f = await getFacade();
          const result = await f.executeSession(request.sessionId);
          return {
            success: true,
            data: result,
            timestamp: new Date().toISOString(),
          };
        } catch (error) {
          return this.toErrorResponse(error, '[CollaborationService] Execute session failed');
        }
      }
    );

    // ── Session Message ───────────────────────────────────────

    ipcMain.handle(
      IPC_CHANNELS.COLLAB_SESSION_MESSAGE_POST,
      async (_event, request: { sessionId: string; message: string; workerId?: string; llmConfig?: unknown }): Promise<IpcResponse<unknown>> => {
        try {
          if (!request.sessionId || !request.message) {
            return {
              success: false,
              error: { code: 'INVALID_REQUEST', message: 'sessionId and message are required' },
              timestamp: new Date().toISOString(),
            };
          }
          const llmConfig = request.llmConfig && typeof request.llmConfig === 'object'
            ? request.llmConfig as RuntimeLLMConfig
            : undefined;
          logRuntime('ipc.message.received', {
            sessionId: request.sessionId,
            workerId: request.workerId ?? null,
            messageChars: request.message.length,
            llmConfig: summarizeRuntimeLLMConfig(llmConfig),
          });
          persistRuntimeLLMConfig(llmConfig);
          const f = await getFacade();
          const result = await f.sendMessageToSupervisor(request.sessionId, request.message, request.workerId, llmConfig);
          logRuntime('ipc.message.result', {
            sessionId: request.sessionId,
            success: result.success,
            error: result.error ?? null,
          });
          if (!result.success) {
            return {
              success: false,
              error: { code: 'MESSAGE_FAILED', message: result.error ?? 'Failed to send message' },
              timestamp: new Date().toISOString(),
            };
          }
          return {
            success: true,
            data: { success: true, to: 'supervisor' },
            timestamp: new Date().toISOString(),
          };
        } catch (error) {
          return this.toErrorResponse(error, '[CollaborationService] Send message failed');
        }
      }
    );

    // ── Blackboard ────────────────────────────────────────────

    ipcMain.handle(
      IPC_CHANNELS.COLLAB_BLACKBOARD_GET,
      async (_event, request: { sessionId: string }): Promise<IpcResponse<unknown>> => {
        try {
          if (!request.sessionId) {
            return {
              success: false,
              error: { code: 'INVALID_REQUEST', message: 'sessionId is required' },
              timestamp: new Date().toISOString(),
            };
          }
          const f = await getFacade();
          const state = await f.getBlackboardState(request.sessionId);
          if (!state) {
            return {
              success: false,
              error: { code: 'NOT_FOUND', message: 'Session not found' },
              timestamp: new Date().toISOString(),
            };
          }
          return {
            success: true,
            data: state,
            timestamp: new Date().toISOString(),
          };
        } catch (error) {
          return this.toErrorResponse(error, '[CollaborationService] Get blackboard failed');
        }
      }
    );

    // ── Human Review (deprecated) ─────────────────────────────

    ipcMain.handle(
      IPC_CHANNELS.COLLAB_HUMAN_REVIEW,
      async (_event, request: { sessionId: string; agentId: string; response: string }): Promise<IpcResponse<unknown>> => {
        try {
          if (!request.sessionId || !request.agentId || !request.response) {
            return {
              success: false,
              error: { code: 'INVALID_REQUEST', message: 'sessionId, agentId, and response are required' },
              timestamp: new Date().toISOString(),
            };
          }
          const f = await getFacade();
          const result = await f.respondToHumanReview(request.sessionId, request.agentId, request.response);
          if (!result.success) {
            return {
              success: false,
              error: { code: 'REVIEW_FAILED', message: result.error ?? 'Failed to respond' },
              timestamp: new Date().toISOString(),
            };
          }
          return {
            success: true,
            data: { success: true, deprecated: 'Use POST /messages instead' },
            timestamp: new Date().toISOString(),
          };
        } catch (error) {
          return this.toErrorResponse(error, '[CollaborationService] Human review failed');
        }
      }
    );
  }

  /**
   * Forward collaboration runtime events to all renderer windows via IPC.
   * Uses addElectronForwarder — synchronous registration, no race with executeSession.
   */
  private setupEventForwarding(): void {
    this.cleanupFn = addElectronForwarder((event) => {
      const data = JSON.stringify(event);
      for (const window of BrowserWindow.getAllWindows()) {
        if (!window.isDestroyed()) {
          window.webContents.send(IPC_CHANNELS.COLLAB_EVENT, data);
        }
      }
    });
  }

  dispose(): void {
    this.cleanupFn?.();
  }

  private toErrorResponse<T>(error: unknown, logMessage: string): IpcResponse<T> {
    console.error(logMessage, error);
    return {
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      timestamp: new Date().toISOString(),
    };
  }
}
