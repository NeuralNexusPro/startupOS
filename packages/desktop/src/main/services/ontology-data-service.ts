import { ipcMain } from 'electron';
import { existsSync } from 'fs';
import { IPC_CHANNELS } from '../ipc-protocol';
import type { IpcResponse } from '@originos/core/lib/integrations/electron/ipc-protocol';
import { schemaPath } from '@originos/core/lib/features/ontology-data-store/config';
import {
  loadOrCreateOntology,
} from '@originos/core/lib/features/ontology-data-store/ontology-ops';
import { listInstanceRelations } from '@originos/core/lib/features/ontology-data-store/instance-relations';
import {
  queryInstances,
} from '@originos/core/lib/features/ontology-data-store/query-engine';
import { loadConceptSchema } from '@originos/core/lib/features/ontology-data-store/schema-validator';
import {
  CanonicalOntologyAuthoringService,
  parseCanonicalOntologyAuthoringCommand,
  type CanonicalOntologyAuthoringResult,
} from '@originos/core/lib/features/ontology';

export class OntologyDataService {
  constructor(
    private readonly authoringService: Pick<CanonicalOntologyAuthoringService, 'execute'> =
      new CanonicalOntologyAuthoringService()
  ) {
    this.registerHandlers();
  }

  private registerHandlers(): void {
    ipcMain.handle(
      IPC_CHANNELS.ONTOLOGY_CANONICAL_AUTHORING_EXECUTE,
      async (_event, envelope: unknown): Promise<IpcResponse<CanonicalOntologyAuthoringResult>> => {
        const parsed = parseCanonicalOntologyAuthoringCommand(envelope);
        if (!parsed.ok) {
          return {
            success: false,
            error: {
              code: 'INVALID_AUTHORING_COMMAND',
              message: 'Canonical ontology authoring command is invalid.',
              details: parsed.issues,
            },
            timestamp: new Date().toISOString(),
          };
        }
        try {
          return {
            success: true,
            data: await this.authoringService.execute(parsed.command),
            timestamp: new Date().toISOString(),
          };
        } catch (error) {
          return this.toErrorResponse(
            error,
            '[OntologyDataService] Execute canonical authoring failed',
            { projectId: parsed.command.projectId, operationId: parsed.command.operationId }
          );
        }
      }
    );

    ipcMain.handle(
      IPC_CHANNELS.ONTOLOGY_DATA_DOMAIN_CREATE,
      async (): Promise<IpcResponse<never>> => this.canonicalWriteUnavailable()
    );

    ipcMain.handle(
      IPC_CHANNELS.ONTOLOGY_DATA_DOMAIN_DELETE,
      async (): Promise<IpcResponse<never>> => this.canonicalWriteUnavailable()
    );

    ipcMain.handle(
      IPC_CHANNELS.ONTOLOGY_DATA_CONCEPT_LIST,
      async (_event, ontologyId: string): Promise<IpcResponse<unknown>> => {
        try {
          console.log('[OntologyDataService] concept:list request', {
            ontologyId,
            schemaPath: ontologyId ? schemaPath(ontologyId) : null,
            exists: ontologyId ? existsSync(schemaPath(ontologyId)) : false,
          });
          const ontology = await loadOrCreateOntology(ontologyId);
          console.log('[OntologyDataService] concept:list result', {
            ontologyId,
            conceptsCount: ontology.concepts.length,
            domainsCount: ontology.domains.length,
            relationsCount: ontology.relations?.length ?? 0,
          });
          return {
            success: true,
            data: { concepts: ontology.concepts, count: ontology.concepts.length },
            timestamp: new Date().toISOString(),
          };
        } catch (error) {
          return this.toErrorResponse(error, '[OntologyDataService] List concepts failed', { ontologyId });
        }
      }
    );

    ipcMain.handle(
      IPC_CHANNELS.ONTOLOGY_DATA_CONCEPT_CREATE,
      async (): Promise<IpcResponse<never>> => this.canonicalWriteUnavailable()
    );

    ipcMain.handle(
      IPC_CHANNELS.ONTOLOGY_DATA_INSTANCE_LIST,
      async (_event, request: { ontologyId: string; conceptId: string; page?: number; limit?: number }): Promise<IpcResponse<unknown>> => {
        try {
          if (!request.ontologyId || !request.conceptId) {
            return {
              success: false,
              error: { code: 'INVALID_REQUEST', message: 'ontologyId and conceptId are required' },
              timestamp: new Date().toISOString(),
            };
          }
          const result = await queryInstances(request.ontologyId, request.conceptId, {
            page: request.page,
            limit: request.limit,
          });
          return {
            success: true,
            data: result,
            timestamp: new Date().toISOString(),
          };
        } catch (error) {
          return this.toErrorResponse(error, '[OntologyDataService] List instances failed');
        }
      }
    );

    ipcMain.handle(
      IPC_CHANNELS.ONTOLOGY_DATA_INSTANCE_CREATE,
      async (): Promise<IpcResponse<never>> => this.canonicalWriteUnavailable()
    );

    ipcMain.handle(
      IPC_CHANNELS.ONTOLOGY_DATA_INSTANCE_UPDATE,
      async (): Promise<IpcResponse<never>> => this.canonicalWriteUnavailable()
    );

    ipcMain.handle(
      IPC_CHANNELS.ONTOLOGY_DATA_INSTANCE_DELETE,
      async (): Promise<IpcResponse<never>> => this.canonicalWriteUnavailable()
    );

    // ── Historical sync boundary ────────────────────────────────────

    ipcMain.handle(
      IPC_CHANNELS.ONTOLOGY_DATA_SYNC,
      async (): Promise<IpcResponse<never>> => this.canonicalWriteUnavailable()
    );

    // ── Concept Schema ────────────────────────────────────────────

    ipcMain.handle(
      IPC_CHANNELS.ONTOLOGY_DATA_CONCEPT_SCHEMA_GET,
      async (_event, request: { conceptId: string; ontologyId: string }): Promise<IpcResponse<unknown>> => {
        try {
          console.log('[OntologyDataService] concept:schema:get request', {
            ontologyId: request.ontologyId,
            conceptId: request.conceptId,
            schemaPath: schemaPath(request.ontologyId),
            exists: existsSync(schemaPath(request.ontologyId)),
          });
          const schema = await loadConceptSchema(request.ontologyId, request.conceptId);
          console.log('[OntologyDataService] concept:schema:get result', {
            ontologyId: request.ontologyId,
            conceptId: request.conceptId,
            fieldsCount: schema.fields.length,
          });
          return {
            success: true,
            data: schema,
            timestamp: new Date().toISOString(),
          };
        } catch (error) {
          return this.toErrorResponse(error, '[OntologyDataService] Get concept schema failed', request);
        }
      }
    );

    ipcMain.handle(
      IPC_CHANNELS.ONTOLOGY_DATA_CONCEPT_SCHEMA_UPDATE,
      async (): Promise<IpcResponse<never>> => this.canonicalWriteUnavailable()
    );

    ipcMain.handle(
      IPC_CHANNELS.ONTOLOGY_DATA_CONCEPT_DELETE,
      async (): Promise<IpcResponse<never>> => this.canonicalWriteUnavailable()
    );

    // ── Relations ─────────────────────────────────────────────────

    ipcMain.handle(
      IPC_CHANNELS.ONTOLOGY_DATA_RELATION_INSTANCE_LIST,
      async (_event, request: { ontologyId: string }): Promise<IpcResponse<unknown>> => {
        try {
          const relations = await listInstanceRelations(request.ontologyId);
          return {
            success: true,
            data: relations,
            timestamp: new Date().toISOString(),
          };
        } catch (error) {
          return this.toErrorResponse(error, '[OntologyDataService] List instance relations failed');
        }
      }
    );

    ipcMain.handle(
      IPC_CHANNELS.ONTOLOGY_DATA_RELATION_CONCEPT_LIST,
      async (_event, request: { ontologyId: string }): Promise<IpcResponse<unknown>> => {
        try {
          console.log('[OntologyDataService] relation:concept:list request', {
            ontologyId: request.ontologyId,
            schemaPath: request.ontologyId ? schemaPath(request.ontologyId) : null,
            exists: request.ontologyId ? existsSync(schemaPath(request.ontologyId)) : false,
          });
          const ontology = await loadOrCreateOntology(request.ontologyId);
          console.log('[OntologyDataService] relation:concept:list result', {
            ontologyId: request.ontologyId,
            relationsCount: ontology.relations?.length ?? 0,
          });
          return {
            success: true,
            data: { relations: ontology.relations ?? [] },
            timestamp: new Date().toISOString(),
          };
        } catch (error) {
          return this.toErrorResponse(error, '[OntologyDataService] List concept relations failed', request);
        }
      }
    );

    ipcMain.handle(
      IPC_CHANNELS.ONTOLOGY_DATA_RELATION_CONCEPT_CREATE,
      async (): Promise<IpcResponse<never>> => this.canonicalWriteUnavailable()
    );

    ipcMain.handle(
      IPC_CHANNELS.ONTOLOGY_DATA_RELATION_CONCEPT_DELETE,
      async (): Promise<IpcResponse<never>> => this.canonicalWriteUnavailable()
    );

    ipcMain.handle(
      IPC_CHANNELS.ONTOLOGY_DATA_RELATION_INSTANCE_CREATE,
      async (): Promise<IpcResponse<never>> => this.canonicalWriteUnavailable()
    );

    ipcMain.handle(
      IPC_CHANNELS.ONTOLOGY_DATA_RELATION_INSTANCE_DELETE,
      async (): Promise<IpcResponse<never>> => this.canonicalWriteUnavailable()
    );
  }

  private canonicalWriteUnavailable(): IpcResponse<never> {
    return {
      success: false,
      error: {
        code: 'CANONICAL_EDIT_UNAVAILABLE',
        message: 'Canonical ontology editing is not available through the legacy ontology-data IPC.',
      },
      timestamp: new Date().toISOString(),
    };
  }

  private toErrorResponse<T>(error: unknown, logMessage: string, context?: unknown): IpcResponse<T> {
    console.error(logMessage, context ?? '', error);
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
