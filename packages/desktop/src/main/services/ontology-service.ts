import { ipcMain } from 'electron';
import { IPC_CHANNELS } from '../ipc-protocol';
import type { IpcResponse } from '@originos/core/lib/integrations/electron/ipc-protocol';
import type { OntologyEntity, OntologyRelation } from '@originos/core/types';
import type { ChatRequest, GenerateOntologyRequest, OntologyEditOperation } from '@originos/core/types';
import type { InterviewSession } from '@originos/core/lib/features/ontology/types';
import { ontologyStorage } from '@originos/core/lib/features/ontology/storage';
import { ontologyService, interviewService } from '@originos/core/lib/features/ontology';

export class OntologyService {
  constructor() {
    this.registerHandlers();
  }

  private registerHandlers(): void {
    ipcMain.handle(
      IPC_CHANNELS.ONTOLOGY_ENTITY_LIST,
      async (_event, type?: string): Promise<IpcResponse<OntologyEntity[]>> => {
        try {
          return {
            success: true,
            data: ontologyStorage.listEntities(type),
            timestamp: new Date().toISOString(),
          };
        } catch (error) {
          return this.toErrorResponse(error, '[OntologyService] List entities failed');
        }
      }
    );

    ipcMain.handle(
      IPC_CHANNELS.ONTOLOGY_ENTITY_GET,
      async (_event, entityId: string): Promise<IpcResponse<OntologyEntity | null>> => {
        try {
          const entity = ontologyStorage.getEntity(entityId);
          if (!entity) {
            return {
              success: false,
              error: { code: 'NOT_FOUND', message: `Entity not found: ${entityId}` },
              timestamp: new Date().toISOString(),
            };
          }
          return {
            success: true,
            data: entity,
            timestamp: new Date().toISOString(),
          };
        } catch (error) {
          return this.toErrorResponse(error, '[OntologyService] Get entity failed');
        }
      }
    );

    ipcMain.handle(
      IPC_CHANNELS.ONTOLOGY_ENTITY_CREATE,
      async (_event, request: { entity?: OntologyEntity; relation?: OntologyRelation }): Promise<IpcResponse<OntologyEntity | OntologyRelation>> => {
        try {
          if (request.entity) {
            const entity = ontologyStorage.createEntity(request.entity);
            return {
              success: true,
              data: entity,
              timestamp: new Date().toISOString(),
            };
          }
          if (request.relation) {
            const relation = ontologyStorage.createRelation(request.relation);
            return {
              success: true,
              data: relation,
              timestamp: new Date().toISOString(),
            };
          }
          return {
            success: false,
            error: { code: 'INVALID_REQUEST', message: 'Entity or relation required' },
            timestamp: new Date().toISOString(),
          };
        } catch (error) {
          return this.toErrorResponse(error, '[OntologyService] Create entity failed');
        }
      }
    );

    ipcMain.handle(
      IPC_CHANNELS.ONTOLOGY_ENTITY_UPDATE,
      async (_event, entityId: string, properties: Record<string, unknown>): Promise<IpcResponse<OntologyEntity | null>> => {
        try {
          const entity = ontologyStorage.updateEntity(entityId, properties);
          if (!entity) {
            return {
              success: false,
              error: { code: 'NOT_FOUND', message: `Entity not found: ${entityId}` },
              timestamp: new Date().toISOString(),
            };
          }
          return {
            success: true,
            data: entity,
            timestamp: new Date().toISOString(),
          };
        } catch (error) {
          return this.toErrorResponse(error, '[OntologyService] Update entity failed');
        }
      }
    );

    ipcMain.handle(
      IPC_CHANNELS.ONTOLOGY_ENTITY_DELETE,
      async (_event, entityId: string): Promise<IpcResponse<{ deleted: true }>> => {
        try {
          const deleted = ontologyStorage.deleteEntity(entityId);
          if (!deleted) {
            return {
              success: false,
              error: { code: 'NOT_FOUND', message: `Entity not found: ${entityId}` },
              timestamp: new Date().toISOString(),
            };
          }
          return {
            success: true,
            data: { deleted: true },
            timestamp: new Date().toISOString(),
          };
        } catch (error) {
          return this.toErrorResponse(error, '[OntologyService] Delete entity failed');
        }
      }
    );

    ipcMain.handle(
      IPC_CHANNELS.ONTOLOGY_ENTITY_RELATED,
      async (_event, entityId: string, relType?: string, direction?: 'outgoing' | 'incoming' | 'both'): Promise<IpcResponse<Array<{ relation: string; entity: OntologyEntity }>>> => {
        try {
          return {
            success: true,
            data: ontologyStorage.getRelated(entityId, relType, direction),
            timestamp: new Date().toISOString(),
          };
        } catch (error) {
          return this.toErrorResponse(error, '[OntologyService] Get related entities failed');
        }
      }
    );

    ipcMain.handle(
      IPC_CHANNELS.ONTOLOGY_GENERATE,
      async (_event, request: GenerateOntologyRequest): Promise<IpcResponse<unknown>> => {
        try {
          let interview: InterviewSession;

          if (request.answers) {
            // Build mock interview from answers
            interview = {
              id: request.interviewId || `interview-${Date.now()}`,
              projectId: request.projectId,
              status: 'completed' as const,
              questions: [],
              currentQuestionIndex: 3,
              answers: {
                work_domain: {
                  questionId: 'work_domain',
                  answer: request.answers.work_domain || '',
                  timestamp: Date.now(),
                },
                work_mode: {
                  questionId: 'work_mode',
                  answer: request.answers.work_mode || '',
                  timestamp: Date.now(),
                },
                main_tasks: {
                  questionId: 'main_tasks',
                  answer: request.answers.main_tasks || '',
                  timestamp: Date.now(),
                },
              },
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
              completedAt: new Date().toISOString(),
            };
          } else if (request.interviewId) {
            const storedInterview = await interviewService.getInterview(request.interviewId);
            if (!storedInterview) {
              return {
                success: false,
                error: { code: 'NOT_FOUND', message: 'Interview not found' },
                timestamp: new Date().toISOString(),
              };
            }
            if (storedInterview.status !== 'completed') {
              return {
                success: false,
                error: { code: 'INVALID_STATE', message: 'Interview must be completed before generating ontology' },
                timestamp: new Date().toISOString(),
              };
            }
            interview = storedInterview;
          } else {
            return {
              success: false,
              error: { code: 'INVALID_REQUEST', message: 'Either interviewId or answers must be provided' },
              timestamp: new Date().toISOString(),
            };
          }

          const result = await ontologyService.generateFromInterview(interview);
          return {
            success: true,
            data: {
              ontology: result.ontology,
              generationTime: result.generationTime,
              source: result.source,
            },
            timestamp: new Date().toISOString(),
          };
        } catch (error) {
          return this.toErrorResponse(error, '[OntologyService] Generate ontology failed');
        }
      }
    );

    ipcMain.handle(
      IPC_CHANNELS.ONTOLOGY_VALIDATE,
      async (): Promise<IpcResponse<string[]>> => {
        try {
          const errors = ontologyStorage.validateGraph();
          return {
            success: errors.length === 0,
            data: errors,
            timestamp: new Date().toISOString(),
          };
        } catch (error) {
          return this.toErrorResponse(error, '[OntologyService] Validate ontology failed');
        }
      }
    );

    ipcMain.handle(
      IPC_CHANNELS.ONTOLOGY_GET,
      async (_event, request: { ontologyId: string }): Promise<IpcResponse<unknown>> => {
        try {
          const ontology = await ontologyService.getOntology(request.ontologyId);
          if (!ontology) {
            return {
              success: false,
              error: { code: 'NOT_FOUND', message: 'Ontology not found' },
              timestamp: new Date().toISOString(),
            };
          }
          return {
            success: true,
            data: ontology,
            timestamp: new Date().toISOString(),
          };
        } catch (error) {
          return this.toErrorResponse(error, '[OntologyService] Get ontology failed');
        }
      }
    );

    ipcMain.handle(
      IPC_CHANNELS.ONTOLOGY_UPDATE,
      async (_event, request: { ontologyId: string; operations: OntologyEditOperation[] }): Promise<IpcResponse<unknown>> => {
        try {
          const result = await ontologyService.applyEdits(request.ontologyId, request.operations);
          if (!result.success) {
            return {
              success: false,
              error: { code: 'UPDATE_FAILED', message: 'Failed to update ontology', details: result.errors },
              timestamp: new Date().toISOString(),
            };
          }
          return {
            success: true,
            data: result.ontology,
            timestamp: new Date().toISOString(),
          };
        } catch (error) {
          return this.toErrorResponse(error, '[OntologyService] Update ontology failed');
        }
      }
    );

    ipcMain.handle(
      IPC_CHANNELS.ONTOLOGY_CONFIRM,
      async (_event, request: { ontologyId: string; confirmed: boolean }): Promise<IpcResponse<unknown>> => {
        try {
          const ontology = await ontologyService.getOntology(request.ontologyId);
          if (!ontology) {
            return {
              success: false,
              error: { code: 'NOT_FOUND', message: 'Ontology not found' },
              timestamp: new Date().toISOString(),
            };
          }
          return {
            success: true,
            data: {
              ontologyId: request.ontologyId,
              confirmed: request.confirmed,
              timestamp: new Date().toISOString(),
            },
            timestamp: new Date().toISOString(),
          };
        } catch (error) {
          return this.toErrorResponse(error, '[OntologyService] Confirm ontology failed');
        }
      }
    );

    ipcMain.handle(
      IPC_CHANNELS.ONTOLOGY_CHAT,
      async (_event, request: ChatRequest): Promise<IpcResponse<unknown>> => {
        try {
          const response = this.generateOntologyChatResponse(request.message);
          return {
            success: true,
            data: {
              message: response,
              chatId: `${request.ontologyId}-chat`,
              historyLength: 2,
            },
            timestamp: new Date().toISOString(),
          };
        } catch (error) {
          return this.toErrorResponse(error, '[OntologyService] Ontology chat failed');
        }
      }
    );
  }

  private generateOntologyChatResponse(message: string): string {
    const lowerMessage = message.toLowerCase();
    if (
      lowerMessage.includes('add') &&
      (lowerMessage.includes('domain') || lowerMessage.includes('概念') || lowerMessage.includes('领域'))
    ) {
      return 'I can help you add a new domain. What would you like to name it?';
    }
    if (
      lowerMessage.includes('add') &&
      (lowerMessage.includes('concept') || lowerMessage.includes('概念'))
    ) {
      return 'I can help you add a new concept. Which domain should it belong to?';
    }
    if (lowerMessage.includes('delete') || lowerMessage.includes('移除') || lowerMessage.includes('删除')) {
      return 'Please specify which element you would like to delete from the ontology.';
    }
    if (lowerMessage.includes('relation') || lowerMessage.includes('relationship') || lowerMessage.includes('关系')) {
      return 'I can help you define relationships between concepts. Which entities would you like to connect?';
    }
    return `I understand you said: "${message}". For ontology editing, you can ask me to add/remove domains, concepts, or define relationships. I can also help clarify the structure of your ontology.`;
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
