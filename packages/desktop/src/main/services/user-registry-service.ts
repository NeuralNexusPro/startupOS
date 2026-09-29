import { ipcMain } from 'electron';
import { IPC_CHANNELS } from '../ipc-protocol';
import type { IpcResponse } from '@originos/core/lib/integrations/electron/ipc-protocol';
import type { UserAgent, UserSkill } from '@originos/core/lib/features/user-registry';
import {
  listUserAgents,
  getUserAgent,
  listUserSkills,
  getUserSkill,
  deleteUserAgent as deleteUserAgentFromRegistry,
  deleteUserSkill as deleteUserSkillFromRegistry,
} from '@originos/core/lib/features/user-registry';

export class UserRegistryService {
  constructor() {
    this.registerHandlers();
  }

  private registerHandlers(): void {
    ipcMain.handle(
      IPC_CHANNELS.USER_AGENT_LIST,
      async (): Promise<IpcResponse<UserAgent[]>> => {
        try {
          return {
            success: true,
            data: listUserAgents(),
            timestamp: new Date().toISOString(),
          };
        } catch (error) {
          return this.toErrorResponse(error, '[UserRegistryService] List user agents failed');
        }
      }
    );

    ipcMain.handle(
      IPC_CHANNELS.USER_AGENT_GET,
      async (_event, id: string): Promise<IpcResponse<UserAgent | null>> => {
        try {
          const agent = getUserAgent(id);
          if (!agent) {
            return {
              success: false,
              error: { code: 'NOT_FOUND', message: `User agent not found: ${id}` },
              timestamp: new Date().toISOString(),
            };
          }
          return {
            success: true,
            data: agent,
            timestamp: new Date().toISOString(),
          };
        } catch (error) {
          return this.toErrorResponse(error, '[UserRegistryService] Get user agent failed');
        }
      }
    );

    ipcMain.handle(
      IPC_CHANNELS.USER_SKILL_LIST,
      async (): Promise<IpcResponse<UserSkill[]>> => {
        try {
          return {
            success: true,
            data: listUserSkills(),
            timestamp: new Date().toISOString(),
          };
        } catch (error) {
          return this.toErrorResponse(error, '[UserRegistryService] List user skills failed');
        }
      }
    );

    ipcMain.handle(
      IPC_CHANNELS.USER_SKILL_GET,
      async (_event, id: string): Promise<IpcResponse<UserSkill | null>> => {
        try {
          const skill = getUserSkill(id);
          if (!skill) {
            return {
              success: false,
              error: { code: 'NOT_FOUND', message: `User skill not found: ${id}` },
              timestamp: new Date().toISOString(),
            };
          }
          return {
            success: true,
            data: skill,
            timestamp: new Date().toISOString(),
          };
        } catch (error) {
          return this.toErrorResponse(error, '[UserRegistryService] Get user skill failed');
        }
      }
    );

    ipcMain.handle(
      IPC_CHANNELS.USER_AGENT_DELETE,
      async (_event, id: string): Promise<IpcResponse<unknown>> => {
        try {
          deleteUserAgentFromRegistry(id);
          return {
            success: true,
            data: { deleted: true },
            timestamp: new Date().toISOString(),
          };
        } catch (error) {
          return this.toErrorResponse(error, '[UserRegistryService] Delete user agent failed');
        }
      }
    );

    ipcMain.handle(
      IPC_CHANNELS.USER_SKILL_DELETE,
      async (_event, id: string): Promise<IpcResponse<unknown>> => {
        try {
          deleteUserSkillFromRegistry(id);
          return {
            success: true,
            data: { deleted: true },
            timestamp: new Date().toISOString(),
          };
        } catch (error) {
          return this.toErrorResponse(error, '[UserRegistryService] Delete user skill failed');
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
