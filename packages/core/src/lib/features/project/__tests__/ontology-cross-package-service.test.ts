import { describe, expect, it } from 'vitest';

import type { CanonicalContextProjectionRecord, CanonicalOntologyOSDK } from '../../ontology';
import type { ProjectTaskBoardService, ProjectTaskDetail, ProjectTaskPage } from '../task-board';
import { OntologyCrossPackageService } from '../ontology-cross-package-service';

const projection: CanonicalContextProjectionRecord = {
  id: 'projection-1',
  kind: 'goal',
  context: {
    projectId: 'project-1',
    ontologyId: 'ontology-1',
    ontologyVersion: '1',
    contextInstanceId: 'context-1',
  },
  revision: 2,
  createdAt: new Date('2026-09-22T00:00:00.000Z'),
};

const page: ProjectTaskPage = {
  items: [],
  revision: 1,
};

const taskDetail: ProjectTaskDetail = {
  projectId: 'project-1',
  taskId: 'task-1',
  title: 'Task 1',
  status: 'active',
  revision: 1,
  progress: 0,
  blockerCount: 0,
  evidenceCount: 0,
  actions: [],
  workItemCount: 0,
  task: {
    taskId: 'task-1',
    title: 'Task 1',
    status: 'active',
    progress: 0,
    currentStep: null,
    steps: [],
    criteria: [],
    blockers: [],
    warnings: [],
    evidenceCount: 0,
    actions: [],
    revision: 1,
    cursor: null,
    stateHash: 'task-state-1',
    truncated: false,
  },
  workItems: [],
};

function osdk(): Pick<CanonicalOntologyOSDK, 'queryFacts' | 'queryProjections' | 'resolveProjection'> {
  return {
    async queryFacts() {
      return { ok: true, facts: [] };
    },
    async queryProjections() {
      return { ok: true, projections: [projection] };
    },
    async resolveProjection() {
      return { ok: true, projection, facts: [] };
    },
  };
}

function taskBoard(): Pick<ProjectTaskBoardService, 'listProjectTasks' | 'getProjectTask'> {
  return {
    async listProjectTasks() {
      return page;
    },
    async getProjectTask() {
      return taskDetail;
    },
  };
}

describe('OntologyCrossPackageService', () => {
  it('reads semantic context with projections and task board', async () => {
    const service = new OntologyCrossPackageService({ osdk: osdk(), taskBoard: taskBoard() });
    const response = await service.invoke({
      contractVersion: '1',
      requestId: 'request-1',
      actorId: 'actor-1',
      projectId: 'project-1',
      type: 'read_semantic_context',
      ontologyId: 'ontology-1',
      ontologyVersion: '1',
    });
    expect(response).toMatchObject({
      ok: true,
      requestId: 'request-1',
      revision: 1,
      data: {
        ontologyId: 'ontology-1',
        ontologyVersion: '1',
        projections: [projection],
        projectTasks: page,
      },
    });
  });

  it('returns unavailable when projections are missing', async () => {
    const service = new OntologyCrossPackageService({
      osdk: {
        ...osdk(),
        async queryProjections() {
          return { ok: false, issues: [{ code: 'ONTOLOGY_NOT_FOUND', path: 'projectId', message: 'Missing', severity: 'error' }] };
        },
      },
      taskBoard: taskBoard(),
    });
    const response = await service.invoke({
      contractVersion: '1',
      requestId: 'request-1',
      actorId: 'actor-1',
      projectId: 'project-1',
      type: 'read_semantic_context',
      ontologyId: 'ontology-1',
      ontologyVersion: '1',
    });
    expect(response).toMatchObject({
      ok: false,
      error: {
        category: 'unavailable',
        code: 'ONTOLOGY_PROJECTION_UNAVAILABLE',
      },
    });
  });

  it('returns unavailable for mutation requests until recovery is implemented', async () => {
    const service = new OntologyCrossPackageService({ osdk: osdk(), taskBoard: taskBoard() });
    const response = await service.invoke({
      contractVersion: '1',
      requestId: 'request-1',
      actorId: 'actor-1',
      projectId: 'project-1',
      type: 'control_bound_task',
      taskId: 'task-1',
      action: 'pause',
      expectedRevision: 1,
    });
    expect(response).toMatchObject({
      ok: false,
      error: {
        category: 'unavailable',
        code: 'CAPABILITY_NOT_READY',
      },
    });
  });

  it('inspects a bound task through the public project board boundary', async () => {
    const service = new OntologyCrossPackageService({ osdk: osdk(), taskBoard: taskBoard() });
    const response = await service.invoke({
      contractVersion: '1',
      requestId: 'request-1',
      actorId: 'actor-1',
      projectId: 'project-1',
      type: 'inspect_bound_task',
      taskId: 'task-1',
    });
    expect(response).toMatchObject({
      ok: true,
      revision: 1,
      data: taskDetail,
    });
  });
});
