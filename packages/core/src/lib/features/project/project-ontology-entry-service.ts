import { access, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { getDataRoot } from '../../paths';
import type {
  ProjectCanonicalOntologySummary,
  ProjectOntologyEntryResult,
  ProjectOntologyRef,
} from '../../../types/project-ontology-entry';
import {
  CanonicalOntologyStore,
  migrateLegacyOntology,
  validateCanonicalOntology,
  type CanonicalOntology,
  type CanonicalValidationIssue,
  type LegacyMigrationOptions,
} from '../ontology';

export type { ProjectCanonicalOntologySummary, ProjectOntologyEntryResult, ProjectOntologyRef };

export class ProjectOntologyInitializationError extends Error {
  readonly code: 'INVALID_CANONICAL_ONTOLOGY';

  constructor(readonly issues: readonly CanonicalValidationIssue[]) {
    super('Initial canonical ontology failed validation');
    this.name = 'ProjectOntologyInitializationError';
    this.code = 'INVALID_CANONICAL_ONTOLOGY';
  }
}

interface StoredProjectMetadata extends Record<string, unknown> {
  id: string;
  ontologyId?: string;
  metadata?: Record<string, unknown>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function isOntologyRef(value: unknown): value is ProjectOntologyRef {
  return isRecord(value)
    && typeof value['ontologyId'] === 'string'
    && value['ontologyId'].length > 0
    && typeof value['ontologyVersion'] === 'string'
    && value['ontologyVersion'].length > 0;
}

function summary(ontology: CanonicalOntology): ProjectCanonicalOntologySummary {
  return {
    ontologyId: ontology.id,
    ontologyVersion: ontology.version,
    name: ontology.name,
    domainCount: ontology.domains.length,
    conceptCount: ontology.concepts.length,
    relationCount: ontology.relations.length,
    factTypeCount: ontology.factTypes.length,
    actionCount: ontology.actions.length,
    ruleCount: ontology.rules.length,
    businessStateCount: ontology.businessStates.length,
    transitionCount: ontology.transitions.length,
  };
}

async function pathExists(filePath: string): Promise<boolean> {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

/**
 * Project lifecycle boundary for canonical ontology reads and explicit migration.
 * It never reads legacy file contents during normal lookup and never uses them as
 * an automatic fallback.
 */
export class ProjectOntologyEntryService {
  private readonly projectsRoot: string;

  constructor(
    private readonly dataRoot = getDataRoot(),
    private readonly ontologyStore = new CanonicalOntologyStore(dataRoot),
  ) {
    this.projectsRoot = path.join(dataRoot, 'projects');
  }

  async initializeCanonicalOntology(
    projectId: string,
    ontology: CanonicalOntology,
  ): Promise<ProjectCanonicalOntologySummary> {
    const validation = validateCanonicalOntology(ontology);
    if (!validation.valid) {
      throw new ProjectOntologyInitializationError(validation.issues);
    }
    if (ontology.projectId !== projectId) {
      throw new TypeError(`Ontology projectId ${ontology.projectId} does not match ${projectId}`);
    }
    await this.ontologyStore.writeOntology(projectId, ontology, { createOnly: true });
    return summary(ontology);
  }

  async resolve(projectId: string, ontologyRef?: ProjectOntologyRef): Promise<ProjectOntologyEntryResult> {
    if (ontologyRef) {
      const stored = await this.ontologyStore.readOntology(projectId);
      if (!stored || stored.data.id !== ontologyRef.ontologyId || stored.data.version !== ontologyRef.ontologyVersion) {
        return { kind: 'not_found' };
      }
      return { kind: 'canonical', ontology: summary(stored.data) };
    }

    return (await this.hasLegacySource(projectId))
      ? { kind: 'legacy_migration_required', migrationAvailable: true }
      : { kind: 'not_found' };
  }

  async resolveProject(projectId: string): Promise<ProjectOntologyEntryResult> {
    const metadata = await this.readProjectMetadata(projectId);
    if (!metadata) return { kind: 'not_found' };
    const ontologyRef = isOntologyRef(metadata.metadata?.['ontologyRef'])
      ? metadata.metadata['ontologyRef']
      : undefined;
    return this.resolve(projectId, ontologyRef);
  }

  /**
   * Explicit migration entrypoint. The caller must supply the selected source;
   * this method never discovers, reads, or migrates a legacy file on lookup.
   */
  async migrateAndBindLegacyOntology(options: LegacyMigrationOptions): Promise<ProjectCanonicalOntologySummary> {
    const migration = await migrateLegacyOntology(options, this.dataRoot, this.ontologyStore);
    if (!migration.ontology) {
      throw new Error('Legacy migration did not produce a canonical ontology');
    }
    return this.bindCanonicalOntology(options.projectId, migration.ontology);
  }

  async bindCanonicalOntology(projectId: string, ontology: CanonicalOntology): Promise<ProjectCanonicalOntologySummary> {
    const metadata = await this.readProjectMetadata(projectId);
    if (!metadata) throw new Error(`Project metadata not found for ${projectId}`);
    if (ontology.projectId !== projectId) throw new TypeError('Ontology does not belong to project');

    const current = await this.ontologyStore.readOntology(projectId);
    if (!current || current.data.id !== ontology.id || current.data.version !== ontology.version) {
      throw new Error('Canonical ontology does not match the persisted project snapshot');
    }

    const ref: ProjectOntologyRef = { ontologyId: ontology.id, ontologyVersion: ontology.version };
    const updated: StoredProjectMetadata = {
      ...metadata,
      ontologyId: ontology.id,
      metadata: { ...(metadata.metadata ?? {}), ontologyRef: ref },
    };
    await writeFile(this.projectMetadataPath(projectId), JSON.stringify(updated, null, 2), 'utf8');
    return summary(ontology);
  }

  private async hasLegacySource(projectId: string): Promise<boolean> {
    const projectRoot = path.join(this.projectsRoot, projectId);
    const candidates = [
      path.join(projectRoot, 'output', 'business-model.json'),
      path.join(projectRoot, 'reference', 'business-model.json'),
      path.join(projectRoot, 'ontology', 'ontology.json'),
    ];
    for (const candidate of candidates) {
      if (await pathExists(candidate)) return true;
    }
    return false;
  }

  private projectMetadataPath(projectId: string): string {
    return path.join(this.projectsRoot, projectId, 'project.json');
  }

  private async readProjectMetadata(projectId: string): Promise<StoredProjectMetadata | null> {
    try {
      const parsed: unknown = JSON.parse(await readFile(this.projectMetadataPath(projectId), 'utf8'));
      if (!isRecord(parsed) || typeof parsed['id'] !== 'string' || parsed['id'] !== projectId) return null;
      const metadata = isRecord(parsed['metadata']) ? parsed['metadata'] : undefined;
      return {
        ...parsed,
        id: projectId,
        ontologyId: typeof parsed['ontologyId'] === 'string' ? parsed['ontologyId'] : undefined,
        metadata,
      };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
      throw error;
    }
  }
}
