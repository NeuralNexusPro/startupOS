import { ipcMain } from 'electron';
import { IPC_CHANNELS } from '../ipc-protocol';
import type { IpcResponse } from '@originos/core/lib/integrations/electron/ipc-protocol';
import { interviewService } from '@originos/core/lib/features/ontology';
import { getNotificationManager, NotificationStatus, NotificationType } from '@originos/core/lib/integrations/pi-agent/notification-system';
import { launch } from '@originos/core/lib/features/services/launcher/registry';
import type { EntryType, LaunchContext } from '@originos/core/lib/features/services/launcher/base';
import { getSessionService } from '@originos/core/lib/features/culture/services/CultureSessionService';
import { getDetectionService } from '@originos/core/lib/features/culture/services/CultureDetectionService';
import { listSandboxApps } from '@originos/core/lib/features/sandbox/app-scanner';
import { readUserConfigWithProductDefaults, updateUserConfig } from '@originos/core/lib/features/user-config';
import { showNativeSystemNotification } from './native-notification-service';

export class MiscService {
  constructor() {
    this.registerHandlers();
  }

  private registerHandlers(): void {
    // ── Interviews ──────────────────────────────────────────────

    ipcMain.handle(
      IPC_CHANNELS.INTERVIEW_LIST,
      async (_event, projectId: string): Promise<IpcResponse<unknown>> => {
        try {
          return {
            success: true,
            data: await interviewService.getProjectInterviews(projectId),
            timestamp: new Date().toISOString(),
          };
        } catch (error) {
          return this.toErrorResponse(error, '[MiscService] List interviews failed');
        }
      }
    );

    ipcMain.handle(
      IPC_CHANNELS.INTERVIEW_CREATE,
      async (_event, request: { projectId: string; skipOptionalQuestions?: boolean }): Promise<IpcResponse<unknown>> => {
        try {
          if (!request.projectId) {
            return {
              success: false,
              error: { code: 'INVALID_REQUEST', message: 'projectId is required' },
              timestamp: new Date().toISOString(),
            };
          }
          return {
            success: true,
            data: await interviewService.createInterview(request.projectId, request.skipOptionalQuestions ?? false),
            timestamp: new Date().toISOString(),
          };
        } catch (error) {
          return this.toErrorResponse(error, '[MiscService] Create interview failed');
        }
      }
    );

    ipcMain.handle(
      IPC_CHANNELS.INTERVIEW_GET,
      async (_event, interviewId: string): Promise<IpcResponse<unknown>> => {
        try {
          const interview = await interviewService.getInterview(interviewId);
          if (!interview) {
            return {
              success: false,
              error: { code: 'NOT_FOUND', message: 'Interview not found' },
              timestamp: new Date().toISOString(),
            };
          }
          return {
            success: true,
            data: interview,
            timestamp: new Date().toISOString(),
          };
        } catch (error) {
          return this.toErrorResponse(error, '[MiscService] Get interview failed');
        }
      }
    );

    ipcMain.handle(
      IPC_CHANNELS.INTERVIEW_COMPLETE,
      async (_event, interviewId: string): Promise<IpcResponse<unknown>> => {
        try {
          return {
            success: true,
            data: await interviewService.completeInterview(interviewId),
            timestamp: new Date().toISOString(),
          };
        } catch (error) {
          return this.toErrorResponse(error, '[MiscService] Complete interview failed');
        }
      }
    );

    ipcMain.handle(
      IPC_CHANNELS.INTERVIEW_ANSWER_SUBMIT,
      async (_event, _request: { interviewId: string; questionId: string; answer: string }): Promise<IpcResponse<unknown>> => {
        try {
          return {
            success: true,
            data: { submitted: true },
            timestamp: new Date().toISOString(),
          };
        } catch (error) {
          return this.toErrorResponse(error, '[MiscService] Submit interview answer failed');
        }
      }
    );

    // ── Notifications ───────────────────────────────────────────

    ipcMain.handle(
      IPC_CHANNELS.NOTIFICATION_LIST,
      async (_event, filters?: { status?: NotificationStatus; type?: NotificationType; sessionId?: string; projectId?: string }): Promise<IpcResponse<unknown>> => {
        try {
          const manager = getNotificationManager();
          return {
            success: true,
            data: await manager.listNotifications(filters || {}),
            timestamp: new Date().toISOString(),
          };
        } catch (error) {
          return this.toErrorResponse(error, '[MiscService] List notifications failed');
        }
      }
    );

    ipcMain.handle(
      IPC_CHANNELS.NOTIFICATION_UPDATE,
      async (_event, request: { id: string; updates: { status?: string } }): Promise<IpcResponse<unknown>> => {
        try {
          const manager = getNotificationManager();
          const updated = await manager.updateNotificationStatus(request.id, request.updates.status as NotificationStatus);
          return {
            success: true,
            data: updated,
            timestamp: new Date().toISOString(),
          };
        } catch (error) {
          return this.toErrorResponse(error, '[MiscService] Update notification failed');
        }
      }
    );

    ipcMain.handle(
      IPC_CHANNELS.NOTIFICATION_SHOW,
      async (_event, request: { title?: string; body?: string; silent?: boolean; activationTarget?: unknown }): Promise<IpcResponse<unknown>> => {
        try {
          const title = typeof request.title === 'string' ? request.title.trim() : '';
          const body = typeof request.body === 'string' ? request.body.trim() : '';
          if (!title) {
            return {
              success: false,
              error: { code: 'INVALID_REQUEST', message: 'title is required' },
              timestamp: new Date().toISOString(),
            };
          }

          const result = await showNativeSystemNotification({
            title,
            body,
            silent: request.silent,
            activationTarget: request.activationTarget,
          });

          return {
            success: true,
            data: result,
            timestamp: new Date().toISOString(),
          };
        } catch (error) {
          return this.toErrorResponse(error, '[MiscService] Show notification failed');
        }
      }
    );

    // ── Launch ──────────────────────────────────────────────────

    ipcMain.handle(
      IPC_CHANNELS.LAUNCH,
      async (_event, context: { entryType: EntryType; entryId: string; sessionId?: string }): Promise<IpcResponse<unknown>> => {
        console.log('[IPC] LAUNCH', context);
        try {
          const launchContext: LaunchContext = {
            entryType: context.entryType,
            entryId: context.entryId,
            sessionId: context.sessionId,
          };
          const result = await launch(launchContext);
          console.log('[IPC] LAUNCH result', {
            success: result.success,
            sessionId: result.sessionId,
            baseDir: result.baseDir,
            error: result.error,
          });
          return {
            success: true,
            data: result,
            timestamp: new Date().toISOString(),
          };
        } catch (error) {
          return this.toErrorResponse(error, '[MiscService] Launch failed');
        }
      }
    );

    // ── User Config ─────────────────────────────────────────────

    ipcMain.handle(
      IPC_CHANNELS.USER_CONFIG_GET,
      async (): Promise<IpcResponse<unknown>> => {
        try {
          const config = readUserConfigWithProductDefaults();
          return { success: true, data: config, timestamp: new Date().toISOString() };
        } catch (error) {
          return this.toErrorResponse(error, '[MiscService] Get user config failed');
        }
      }
    );

    ipcMain.handle(
      IPC_CHANNELS.USER_CONFIG_SET,
      async (_event, patch: { llm?: Record<string, unknown>; preferences?: Record<string, unknown> }): Promise<IpcResponse<unknown>> => {
        try {
          const updated = updateUserConfig(patch);
          return { success: true, data: updated, timestamp: new Date().toISOString() };
        } catch (error) {
          return this.toErrorResponse(error, '[MiscService] Set user config failed');
        }
      }
    );

    // ── Debug ───────────────────────────────────────────────────

    ipcMain.handle(
      IPC_CHANNELS.DEBUG_ENV,
      async (): Promise<IpcResponse<Record<string, string | undefined>>> => {
        try {
          const envVars: Record<string, string | undefined> = {
            ANTHROPIC_BASE_URL: process.env['ANTHROPIC_BASE_URL'],
            ANTHROPIC_API_KEY: process.env['ANTHROPIC_API_KEY'] ? process.env['ANTHROPIC_API_KEY'].substring(0, 10) + '...' : undefined,
            ANTHROPIC_AUTH_TOKEN: process.env['ANTHROPIC_AUTH_TOKEN'] ? process.env['ANTHROPIC_AUTH_TOKEN'].substring(0, 10) + '...' : undefined,
            ANTHROPIC_MODEL: process.env['ANTHROPIC_MODEL'],
            LLM_PROVIDER: process.env['LLM_PROVIDER'],
            OPENAI_BASE_URL: process.env['OPENAI_BASE_URL'],
            OPENAI_API_KEY: process.env['OPENAI_API_KEY'] ? process.env['OPENAI_API_KEY'].substring(0, 10) + '...' : undefined,
            OPENAI_MODEL: process.env['OPENAI_MODEL'],
          };
          return {
            success: true,
            data: envVars,
            timestamp: new Date().toISOString(),
          };
        } catch (error) {
          return this.toErrorResponse(error, '[MiscService] Debug env failed');
        }
      }
    );

    // ── Taste Detection ───────────────────────────────────────

    ipcMain.handle(
      IPC_CHANNELS.TASTE_DETECTION_START,
      async (_event, request: { userId: string; projectId?: string; maxTurns?: number }): Promise<IpcResponse<unknown>> => {
        try {
          if (!request.userId) {
            return {
              success: false,
              error: { code: 'INVALID_REQUEST', message: 'userId is required' },
              timestamp: new Date().toISOString(),
            };
          }
          const validMaxTurns = Math.max(3, Math.min(5, request.maxTurns || 3));
          const sessionService = getSessionService();
          const session = await sessionService.createSession(request.userId, request.projectId, validMaxTurns);
          const firstQuestion = await sessionService.getFirstQuestion(session.sessionId);
          return {
            success: true,
            data: {
              sessionId: session.sessionId,
              userId: session.userId,
              status: session.status,
              currentTurn: session.currentTurn,
              maxTurns: session.maxTurns,
              firstQuestion,
              createdAt: session.createdAt,
            },
            timestamp: new Date().toISOString(),
          };
        } catch (error) {
          return this.toErrorResponse(error, '[MiscService] Start taste detection failed');
        }
      }
    );

    ipcMain.handle(
      IPC_CHANNELS.TASTE_DETECTION_MESSAGE,
      async (_event, request: { sessionId: string; content: string; turn?: number }): Promise<IpcResponse<unknown>> => {
        try {
          if (!request.sessionId || !request.content) {
            return {
              success: false,
              error: { code: 'INVALID_REQUEST', message: 'sessionId and content are required' },
              timestamp: new Date().toISOString(),
            };
          }
          const sessionService = getSessionService();
          const session = await sessionService.getSession(request.sessionId);
          if (!session) {
            return {
              success: false,
              error: { code: 'NOT_FOUND', message: 'Session not found' },
              timestamp: new Date().toISOString(),
            };
          }
          if (session.status === 'completed') {
            return {
              success: false,
              error: { code: 'SESSION_COMPLETED', message: 'Session already completed' },
              timestamp: new Date().toISOString(),
            };
          }
          if (session.status === 'analyzing') {
            return {
              success: false,
              error: { code: 'ANALYSIS_IN_PROGRESS', message: 'Session is analyzing' },
              timestamp: new Date().toISOString(),
            };
          }
          const result = await sessionService.addMessage(request.sessionId, request.content, request.turn);
          return {
            success: true,
            data: {
              sessionId: session.sessionId,
              message: result.message,
              role: 'assistant',
              turn: result.turn,
              isComplete: result.isComplete,
              suggestedNextQuestion: result.nextQuestion,
              nextAction: result.isComplete ? 'analyze' : 'continue',
            },
            timestamp: new Date().toISOString(),
          };
        } catch (error) {
          return this.toErrorResponse(error, '[MiscService] Taste detection message failed');
        }
      }
    );

    ipcMain.handle(
      IPC_CHANNELS.TASTE_DETECTION_ANALYZE,
      async (_event, request: { sessionId: string; forceReanalyze?: boolean }): Promise<IpcResponse<unknown>> => {
        try {
          if (!request.sessionId) {
            return {
              success: false,
              error: { code: 'INVALID_REQUEST', message: 'sessionId is required' },
              timestamp: new Date().toISOString(),
            };
          }
          const sessionService = getSessionService();
          const session = await sessionService.getSession(request.sessionId);
          if (!session) {
            return {
              success: false,
              error: { code: 'NOT_FOUND', message: 'Session not found' },
              timestamp: new Date().toISOString(),
            };
          }
          if (!sessionService.isReadyForAnalysis(session) && !request.forceReanalyze) {
            return {
              success: false,
              error: { code: 'SESSION_NOT_READY', message: 'Session not ready for analysis' },
              timestamp: new Date().toISOString(),
            };
          }
          if (session.status === 'analyzing') {
            return {
              success: false,
              error: { code: 'ANALYSIS_IN_PROGRESS', message: 'Analysis already in progress' },
              timestamp: new Date().toISOString(),
            };
          }
          if (session.status === 'completed' && !request.forceReanalyze) {
            return {
              success: false,
              error: { code: 'SESSION_ALREADY_COMPLETED', message: 'Session already analyzed' },
              timestamp: new Date().toISOString(),
            };
          }
          const detectionService = getDetectionService();
          const result = await detectionService.analyzeDialogue(request.sessionId);
          return {
            success: true,
            data: {
              sessionId: session.sessionId,
              analysisId: `analysis-${request.sessionId}-${Date.now()}`,
              status: 'completed',
              cultureLayer: result.cultureLayer,
              confidence: result.confidence,
              tasteDraftId: result.tasteDraftId,
            },
            timestamp: new Date().toISOString(),
          };
        } catch (error) {
          return this.toErrorResponse(error, '[MiscService] Taste detection analyze failed');
        }
      }
    );

    ipcMain.handle(
      IPC_CHANNELS.TASTE_DETECTION_DRAFT,
      async (_event, request: { sessionId: string }): Promise<IpcResponse<unknown>> => {
        try {
          if (!request.sessionId) {
            return {
              success: false,
              error: { code: 'INVALID_REQUEST', message: 'sessionId is required' },
              timestamp: new Date().toISOString(),
            };
          }
          const sessionService = getSessionService();
          const session = await sessionService.getSession(request.sessionId);
          if (!session) {
            return {
              success: false,
              error: { code: 'NOT_FOUND', message: 'Session not found' },
              timestamp: new Date().toISOString(),
            };
          }
          if (session.status !== 'completed') {
            return {
              success: false,
              error: { code: 'ANALYSIS_NOT_COMPLETE', message: 'Analysis not yet completed' },
              timestamp: new Date().toISOString(),
            };
          }
          const detectionService = getDetectionService();
          const draft = await detectionService.getTasteDraft(request.sessionId);
          return {
            success: true,
            data: {
              sessionId: session.sessionId,
              userId: session.userId,
              projectId: session.projectId,
              draft: draft.tasteProfile,
              isComplete: true,
              generatedAt: draft.analysisCompletedAt,
              confidence: draft.confidence,
            },
            timestamp: new Date().toISOString(),
          };
        } catch (error) {
          return this.toErrorResponse(error, '[MiscService] Taste detection draft failed');
        }
      }
    );

    // ── Sandbox ───────────────────────────────────────────────

    ipcMain.handle(
      IPC_CHANNELS.SANDBOX_APP_LIST,
      async (): Promise<IpcResponse<unknown>> => {
        try {
          const apps = await listSandboxApps();
          return {
            success: true,
            data: { apps },
            timestamp: new Date().toISOString(),
          };
        } catch (error) {
          return this.toErrorResponse(error, '[MiscService] List sandbox apps failed');
        }
      }
    );
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
