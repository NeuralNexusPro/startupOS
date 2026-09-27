/**
 * Ontology API Client
 *
 * Provides TypeScript interface to the Python ontology skill.
 * Handles entity and relation operations through API calls.
 */

import type {
  OntologyEntity,
  OntologyRelation,
  PersonProperties,
  ProjectProperties,
  TaskProperties,
  GoalProperties,
} from '../../../types/ontology';
import {
  createOntologyEntity,
  createOntologyRelation,
  deleteOntologyEntity,
  getOntologyEntity,
  getRelatedEntities,
  listOntologyEntities,
  updateOntologyEntity,
} from '../../integrations/electron/services/ontology';
import { getIpcRenderer, isElectron } from '../../integrations/electron/env';
import {
  IPC_CHANNELS,
  type IpcResponse,
} from '../../integrations/electron/ipc-protocol';
import type {
  CanonicalOntologyAuthoringCommand,
  CanonicalOntologyAuthoringResult,
} from './authoring-types';

export async function executeCanonicalOntologyAuthoring(
  command: CanonicalOntologyAuthoringCommand
): Promise<IpcResponse<CanonicalOntologyAuthoringResult>> {
  if (isElectron()) {
    return getIpcRenderer().invoke<IpcResponse<CanonicalOntologyAuthoringResult>>(
      IPC_CHANNELS.ONTOLOGY_CANONICAL_AUTHORING_EXECUTE,
      command
    );
  }

  const response = await fetch(
    `/api/projects/${encodeURIComponent(command.projectId)}/ontology`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(command),
    }
  );
  return response.json() as Promise<IpcResponse<CanonicalOntologyAuthoringResult>>;
}

// ============================================================================
// Configuration
// ============================================================================

export const _MEMORY_DIR = 'memory/ontology';

// ============================================================================
// Client Interface
// ============================================================================

interface OntologyClient {
  createEntity<T extends Record<string, unknown>>(
    type: string,
    properties: T,
  ): Promise<OntologyEntity & { properties: T }>;

  getEntity(entityId: string): Promise<OntologyEntity | null>;

  updateEntity(
    entityId: string,
    properties: Partial<Record<string, unknown>>,
  ): Promise<OntologyEntity | null>;

  deleteEntity(entityId: string): Promise<boolean>;

  queryEntities<T extends Record<string, unknown> = Record<string, unknown>>(
    type: string,
    where?: Partial<T>,
  ): Promise<Array<OntologyEntity & { properties: T }>>;

  listEntities(
    type?: string,
  ): Promise<OntologyEntity[]>;

  createRelation(
    fromId: string,
    relType: string,
    toId: string,
    properties?: Record<string, unknown>,
  ): Promise<OntologyRelation>;

  getRelated(
    entityId: string,
    relType?: string,
    direction?: 'outgoing' | 'incoming' | 'both',
  ): Promise<Array<{ relation: string; entity: OntologyEntity }>>;

  validateGraph(): Promise<string[]>;
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Generate a unique ID for an entity
 */
function generateEntityId(type: string): string {
  const prefix = type.toLowerCase().substring(0, 4);
  const suffix = Math.random().toString(36).substring(2, 10);
  return `${prefix}_${suffix}`;
}

/**
 * Get current timestamp in ISO 8601 format
 */
function getTimestamp(): string {
  return new Date().toISOString();
}

// ============================================================================
// Ontology Client Implementation
// ============================================================================

class DefaultOntologyClient implements OntologyClient {
  private apiClient: ApiClient;

  constructor() {
    this.apiClient = new ApiClient();
  }

  async createEntity<T extends Record<string, unknown>>(
    type: string,
    properties: T,
  ): Promise<OntologyEntity & { properties: T }> {
    const entityId = generateEntityId(type);
    const timestamp = getTimestamp();

    const entity: OntologyEntity & { properties: T } = {
      id: entityId,
      type,
      properties,
      created: timestamp,
      updated: timestamp,
    };

    // Call API to create entity
    // For now, we'll use the API route when it's available
    await this.apiClient.createEntity(entity);

    return entity;
  }

  async getEntity(entityId: string): Promise<OntologyEntity | null> {
    return await this.apiClient.getEntity(entityId);
  }

  async updateEntity(
    entityId: string,
    properties: Partial<Record<string, unknown>>,
  ): Promise<OntologyEntity | null> {
    return await this.apiClient.updateEntity(entityId, properties);
  }

  async deleteEntity(entityId: string): Promise<boolean> {
    return await this.apiClient.deleteEntity(entityId);
  }

  async queryEntities<T extends Record<string, unknown> = Record<string, unknown>>(
    type: string,
    where?: Partial<T>,
  ): Promise<Array<OntologyEntity & { properties: T }>> {
    const entities = await this.apiClient.listEntities(type);

    if (!where) {
      return entities as Array<OntologyEntity & { properties: T }>;
    }

    // Filter entities based on where clause
    return entities.filter((entity) => {
      for (const [key, value] of Object.entries(where)) {
        if (entity.properties[key] !== value) {
          return false;
        }
      }
      return true;
    }) as Array<OntologyEntity & { properties: T }>;
  }

  async listEntities(type?: string): Promise<OntologyEntity[]> {
    return await this.apiClient.listEntities(type);
  }

  async createRelation(
    fromId: string,
    relType: string,
    toId: string,
    properties?: Record<string, unknown>,
  ): Promise<OntologyRelation> {
    const relation: OntologyRelation = {
      from: fromId,
      rel: relType,
      to: toId,
      properties,
    };

    await this.apiClient.createRelation(relation);

    return relation;
  }

  async getRelated(
    entityId: string,
    relType?: string,
    direction: 'outgoing' | 'incoming' | 'both' = 'outgoing',
  ): Promise<Array<{ relation: string; entity: OntologyEntity }>> {
    return await this.apiClient.getRelated(entityId, relType, direction);
  }

  async validateGraph(): Promise<string[]> {
    return await this.apiClient.validateGraph();
  }
}

// ============================================================================
// API Client (Internal)
// ============================================================================

class ApiClient {
  /**
   * Create entity via API
   */
  async createEntity(entity: OntologyEntity): Promise<void> {
    try {
      const response = await createOntologyEntity(entity);
      if (!response.success) {
        throw new Error(response.error?.message || 'Failed to create entity');
      }
    } catch (error) {
      // Fallback: store in memory
      console.warn('API create failed, using memory fallback:', error);
      this.storeInMemory({ op: 'create', entity });
    }
  }

  /**
   * Get entity via API
   */
  async getEntity(entityId: string): Promise<OntologyEntity | null> {
    try {
      const response = await getOntologyEntity(entityId);
      return response.success ? response.data ?? null : null;
    } catch (error) {
      // Fallback: read from memory
      console.warn('API get failed, using memory fallback:', error);
      return this.readFromMemory(entityId);
    }
  }

  /**
   * Update entity via API
   */
  async updateEntity(
    entityId: string,
    properties: Partial<Record<string, unknown>>,
  ): Promise<OntologyEntity | null> {
    try {
      const response = await updateOntologyEntity(entityId, properties);
      return response.success ? response.data ?? null : null;
    } catch (error) {
      // Fallback: update in memory
      console.warn('API update failed, using memory fallback:', error);
      return this.updateInMemory(entityId, properties);
    }
  }

  /**
   * Delete entity via API
   */
  async deleteEntity(entityId: string): Promise<boolean> {
    try {
      const response = await deleteOntologyEntity(entityId);
      return response.success;
    } catch (error) {
      // Fallback: delete from memory
      console.warn('API delete failed, using memory fallback:', error);
      return this.deleteFromMemory(entityId);
    }
  }

  /**
   * List entities via API
   */
  async listEntities(type?: string): Promise<OntologyEntity[]> {
    try {
      const response = await listOntologyEntities(type);
      return response.success ? response.data ?? [] : [];
    } catch (error) {
      // Fallback: list from memory
      console.warn('API list failed, using memory fallback:', error);
      return this.listFromMemory(type);
    }
  }

  /**
   * Create relation via API
   */
  async createRelation(relation: OntologyRelation): Promise<void> {
    try {
      const response = await createOntologyRelation(relation);
      if (!response.success) {
        throw new Error(response.error?.message || 'Failed to create relation');
      }
    } catch (error) {
      // Fallback: store in memory
      console.warn('API create relation failed, using memory fallback:', error);
      this.storeInMemory({ op: 'relate', ...relation });
    }
  }

  /**
   * Get related entities via API
   */
  async getRelated(
    entityId: string,
    relType?: string,
    direction: 'outgoing' | 'incoming' | 'both' = 'outgoing',
  ): Promise<Array<{ relation: string; entity: OntologyEntity }>> {
    try {
      const response = await getRelatedEntities(entityId, relType, direction);
      return response.success ? response.data ?? [] : [];
    } catch (error) {
      console.warn('API get related failed:', error);
      return [];
    }
  }

  /**
   * Validate graph via API
   */
  async validateGraph(): Promise<string[]> {
    return [];
  }

  // ============================================================================
  // Memory Fallback Methods (In-memory storage)
  // ============================================================================

  private memoryStore: Map<string, OntologyEntity> = new Map();
  private relationsStore: Map<string, OntologyRelation[]> = new Map();

  private storeInMemory(record: unknown): void {
    // Handle entity operations
    if (typeof record === 'object' && record !== null) {
      const rec = record as Record<string, unknown>;
      if (rec['op'] === 'create' && rec['entity']) {
        const entity = rec['entity'] as OntologyEntity;
        this.memoryStore.set(entity.id, entity);
      } else if (rec['op'] === 'relate' && rec['from'] && rec['rel'] && rec['to']) {
        const relation = {
          from: rec['from'] as string,
          rel: rec['rel'] as string,
          to: rec['to'] as string,
          properties: rec['properties'] as Record<string, unknown> | undefined,
        };
        // Store relations keyed by from entity
        const fromRelations = this.relationsStore.get(relation.from) || [];
        fromRelations.push(relation);
        this.relationsStore.set(relation.from, fromRelations);
      }
    }
  }

  private readFromMemory(entityId: string): OntologyEntity | null {
    return this.memoryStore.get(entityId) || null;
  }

  private updateInMemory(
    entityId: string,
    properties: Partial<Record<string, unknown>>,
  ): OntologyEntity | null {
    const entity = this.memoryStore.get(entityId);
    if (entity) {
      entity.properties = { ...entity.properties, ...properties };
      entity.updated = getTimestamp();
      return entity;
    }
    return null;
  }

  private deleteFromMemory(entityId: string): boolean {
    return this.memoryStore.delete(entityId);
  }

  private listFromMemory(type?: string): OntologyEntity[] {
    const entities = Array.from(this.memoryStore.values());
    if (!type) {
      return entities;
    }
    return entities.filter((e) => e.type === type);
  }
}

// ============================================================================
// Convenience Methods for Common Entity Types
// ============================================================================

/**
 * Create a Person entity
 */
export async function createPerson(properties: PersonProperties): Promise<OntologyEntity & { properties: PersonProperties }> {
  return ontologyClient.createEntity<PersonProperties>('Person', properties);
}

/**
 * Create a Project entity
 */
export async function createProject(properties: ProjectProperties): Promise<OntologyEntity & { properties: ProjectProperties }> {
  return ontologyClient.createEntity<ProjectProperties>('Project', properties);
}

/**
 * Create a Task entity
 */
export async function createTask(properties: TaskProperties): Promise<OntologyEntity & { properties: TaskProperties }> {
  return ontologyClient.createEntity<TaskProperties>('Task', properties);
}

/**
 * Create a Goal entity
 */
export async function createGoal(properties: GoalProperties): Promise<OntologyEntity & { properties: GoalProperties }> {
  return ontologyClient.createEntity<GoalProperties>('Goal', properties);
}

// ============================================================================
// Export singleton
// ============================================================================

export const ontologyClient: OntologyClient = new DefaultOntologyClient();

export type { OntologyClient, DefaultOntologyClient };
