import { ipcMain } from 'electron';
import { IPC_CHANNELS } from '../ipc-protocol';
import type {
  IpcResponse,
  SkillContentRequest,
  SkillContentResponse,
  SkillExecutionCompleteRequest,
  SkillExecutionCompleteResponse,
  SkillExecutionMessageRequest,
  SkillExecutionMessageResponse,
  SkillExecutionStartRequest,
  SkillExecutionStartResponse,
  SkillExecutionStreamEvent,
  SkillExecutionStreamRequest,
  SkillExecutionTimelineRequest,
  SkillExecutionTimelineResponse,
  SkillEvolutionRequest,
  SkillEvolutionResult,
  SkillListRequest,
  SkillListResponse,
  SkillSessionsRequest,
  SkillSessionsResponse,
} from '../../../../core/src/lib/integrations/electron/ipc-protocol';
import { handleSkillEvolution } from '../../../../core/src/lib/features/agent/server/index';
import {
  completeSkillExecution,
  getSkillExecutionTimeline,
  getSkillContent,
  listSkillSessions,
  listSkills,
  refreshSkills,
  sendSkillExecutionMessage,
  SkillServiceError,
  startSkillExecution,
  streamSkillExecutionMessage,
} from '../../../../core/src/lib/features/skills/service';
import { StreamEventBatcher } from './stream-event-batcher';

export class SkillService {
  constructor() {
    this.registerHandlers();
  }

  private registerHandlers(): void {
    ipcMain.handle(
      IPC_CHANNELS.SKILL_LIST,
      async (_event, request: SkillListRequest = {}): Promise<IpcResponse<SkillListResponse>> => {
        try {
          return {
            success: true,
            data: listSkills(request),
            timestamp: new Date().toISOString(),
          };
        } catch (error) {
          return this.toErrorResponse(error, '[SkillService] List skills failed');
        }
      }
    );

    ipcMain.handle(
      IPC_CHANNELS.SKILL_REFRESH,
      async (): Promise<IpcResponse<SkillListResponse>> => {
        try {
          return {
            success: true,
            data: refreshSkills(),
            timestamp: new Date().toISOString(),
          };
        } catch (error) {
          return this.toErrorResponse(error, '[SkillService] Refresh skills failed');
        }
      }
    );

    ipcMain.handle(
      IPC_CHANNELS.SKILL_CONTENT,
      async (_event, request: SkillContentRequest): Promise<IpcResponse<SkillContentResponse>> => {
        try {
          return {
            success: true,
            data: getSkillContent(request),
            timestamp: new Date().toISOString(),
          };
        } catch (error) {
          return this.toErrorResponse(error, '[SkillService] Get skill content failed');
        }
      }
    );

    ipcMain.handle(
      IPC_CHANNELS.SKILL_SESSION_LIST,
      async (_event, request: SkillSessionsRequest): Promise<IpcResponse<SkillSessionsResponse>> => {
        try {
          return {
            success: true,
            data: await listSkillSessions(request),
            timestamp: new Date().toISOString(),
          };
        } catch (error) {
          return this.toErrorResponse(error, '[SkillService] List skill sessions failed');
        }
      }
    );

    ipcMain.handle(
      IPC_CHANNELS.SKILL_EXECUTION_START,
      async (_event, request: SkillExecutionStartRequest): Promise<IpcResponse<SkillExecutionStartResponse>> => {
        try {
          const result = await startSkillExecution(request);
          return {
            success: true,
            data: result.data,
            timestamp: new Date().toISOString(),
          };
        } catch (error) {
          return this.toErrorResponse(error, '[SkillService] Start skill execution failed');
        }
      }
    );

    ipcMain.handle(
      IPC_CHANNELS.SKILL_EXECUTION_COMPLETE,
      async (_event, request: SkillExecutionCompleteRequest): Promise<IpcResponse<SkillExecutionCompleteResponse>> => {
        try {
          return {
            success: true,
            data: await completeSkillExecution(request),
            timestamp: new Date().toISOString(),
          };
        } catch (error) {
          return this.toErrorResponse(error, '[SkillService] Complete skill execution failed');
        }
      }
    );

    ipcMain.handle(
      IPC_CHANNELS.SKILL_EXECUTION_MESSAGE,
      async (_event, request: SkillExecutionMessageRequest): Promise<IpcResponse<SkillExecutionMessageResponse>> => {
        try {
          const result = await sendSkillExecutionMessage(request);
          return {
            success: true,
            data: result.data,
            error: result.error,
            timestamp: new Date().toISOString(),
          };
        } catch (error) {
          return this.toErrorResponse(error, '[SkillService] Send skill execution message failed');
        }
      }
    );

    ipcMain.handle(
      IPC_CHANNELS.SKILL_EXECUTION_MESSAGE_STREAM,
      async (event, request: SkillExecutionStreamRequest): Promise<IpcResponse<{ streamId?: string }>> => {
        const sender = event.sender;
        const sendEvent = (streamEvent: { type: string; data: unknown }) => {
          if (!sender.isDestroyed()) {
            sender.send(IPC_CHANNELS.SKILL_EXECUTION_EVENT, {
              ...streamEvent,
              executionId: request.executionId,
              streamId: request.streamId,
            });
          }
        };
        const batcher = new StreamEventBatcher({
          onFlush: (events) => {
            for (const streamEvent of events) {
              sendEvent(streamEvent);
            }
          },
        });
        try {
          await streamSkillExecutionMessage(request, (streamEvent: SkillExecutionStreamEvent) => {
            const data = streamEvent.data as { isStreaming?: unknown } | null;
            if (streamEvent.type === 'assistant_message' && data?.isStreaming === true) {
              batcher.push({ type: streamEvent.type, data: streamEvent.data });
              return;
            }
            batcher.flush();
            sendEvent(streamEvent);
          });
          batcher.dispose();

          return {
            success: true,
            data: { streamId: request.streamId },
            timestamp: new Date().toISOString(),
          };
        } catch (error) {
          batcher.flush();
          sendEvent({
            type: 'error',
            data: {
              message: error instanceof Error ? error.message : 'Unknown error',
            },
          });
          batcher.dispose();

          return this.toErrorResponse(error, '[SkillService] Stream skill execution message failed');
        }
      }
    );

    ipcMain.handle(
      IPC_CHANNELS.SKILL_EXECUTION_TIMELINE,
      async (_event, request: SkillExecutionTimelineRequest): Promise<IpcResponse<SkillExecutionTimelineResponse>> => {
        try {
          return {
            success: true,
            data: await getSkillExecutionTimeline(request),
            timestamp: new Date().toISOString(),
          };
        } catch (error) {
          return this.toErrorResponse(error, '[SkillService] Get skill execution timeline failed');
        }
      }
    );

    ipcMain.handle(
      IPC_CHANNELS.SKILL_EVOLUTION_RUN,
      async (_event, request: SkillEvolutionRequest): Promise<IpcResponse<SkillEvolutionResult>> => {
        try {
          const result = await handleSkillEvolution(request);
          return result.response;
        } catch (error) {
          console.error('[SkillService] Skill evolution failed:', error);
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
    );
  }

  private toErrorResponse<T>(error: unknown, logMessage: string): IpcResponse<T> {
    console.error(logMessage, error);

    if (error instanceof SkillServiceError) {
      return {
        success: false,
        error: {
          code: error.code,
          message: error.message,
        },
        timestamp: new Date().toISOString(),
      };
    }

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
