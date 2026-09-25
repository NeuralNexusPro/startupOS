import { describe, expect, it, vi } from 'vitest';

import {
  AuthorizedProjectTaskSubscriptions,
  PROJECT_ACCESS_DENIED_CODE,
  ProjectAccessDeniedError,
  ProjectTaskEventAggregator,
  projectAccessCapabilityForRequest,
  type ProjectAccessPort,
  type ProjectTaskChangeSourcePort,
  type ProjectTaskSourceEvent,
} from '../project-task-access-subscription';
import type { OntologyCrossPackageRequest } from '../ontology-cross-package-contract';
import {
  OntologyCrossPackageService,
  type OntologyCrossPackageServiceDeps,
} from '../ontology-cross-package-service';

class MemoryChangeSource implements ProjectTaskChangeSourcePort {
  private readonly listeners = new Set<(event: ProjectTaskSourceEvent) => void>();
  subscriptions = 0;
  releases = 0;

  subscribe(listener: (event: ProjectTaskSourceEvent) => void): () => void {
    this.subscriptions += 1;
    this.listeners.add(listener);
    let active = true;
    return () => {
      if (!active) return;
      active = false;
      this.releases += 1;
      this.listeners.delete(listener);
    };
  }

  emit(event: ProjectTaskSourceEvent): void {
    for (const listener of [...this.listeners]) listener(event);
  }
}

function deniedService(reads: ReturnType<typeof vi.fn>): {
  readonly service: OntologyCrossPackageService;
  readonly deps: OntologyCrossPackageServiceDeps;
} {
  const unavailable = async (): Promise<never> => {
    reads();
    throw new Error('must not read');
  };
  const deps: OntologyCrossPackageServiceDeps = {
    projectAccess: { async authorize() { return { authorized: false }; } },
    osdk: {
      queryFacts: unavailable,
      queryProjections: unavailable,
      resolveProjection: unavailable,
      submitAction: unavailable,
    },
    contractPort: { load: unavailable, verifyIntegrity: unavailable },
    executionPort: {
      start: unavailable,
      inspect: unavailable,
      listWorkItemHandoffCandidates: unavailable,
      handoffWorkItem: unavailable,
    },
    taskBoard: {
      listProjectTasks: unavailable,
      getProjectTask: unavailable,
      requestProjectTaskAction: unavailable,
      requestProjectTaskTransition: unavailable,
    },
    workItemRecovery: { reconcile: unavailable },
    taskPriority: { updateProjectTaskPriority: unavailable },
    contractCatalog: { listProject: unavailable },
    taskCreation: { create: unavailable },
  };
  return { service: new OntologyCrossPackageService(deps), deps };
}

describe('project task authorization', () => {
  it('fails closed with one fixed response before any business read', async () => {
    const reads = vi.fn();
    const requests: readonly OntologyCrossPackageRequest[] = [
      { contractVersion: '1', requestId: 'list-denied', actorId: 'actor-a', projectId: 'private-project', type: 'list_project_tasks' },
      { contractVersion: '1', requestId: 'get-denied', actorId: 'actor-a', projectId: 'private-project', type: 'inspect_bound_task', taskId: 'task' },
      { contractVersion: '1', requestId: 'control-denied', actorId: 'actor-a', projectId: 'private-project', type: 'transition_project_task', taskId: 'task', targetStatus: 'review', expectedRevision: 1 },
      { contractVersion: '1', requestId: 'create-denied', actorId: 'actor-a', projectId: 'private-project', type: 'create_approved_project_task', solutionId: 'solution', solutionVersion: '1', contractId: 'contract', contractHash: `sha256:${'a'.repeat(64)}`, taskTemplateId: 'template', objective: 'objective', semanticInputs: [] },
      { contractVersion: '1', requestId: 'assign-denied', actorId: 'actor-a', projectId: 'private-project', type: 'update_project_task_priority', taskId: 'task', priority: 'high', expectedRevision: 1, expectedCursor: null, bridgeEpoch: 1 },
    ];
    const service = deniedService(reads).service;
    for (const request of requests) {
      const response = await service.invoke(request);
      expect(response).toEqual({
        ok: false,
        requestId: request.requestId,
        error: {
          category: 'authorization',
          code: PROJECT_ACCESS_DENIED_CODE,
          issues: [{ code: PROJECT_ACCESS_DENIED_CODE, message: 'Project access is denied' }],
          retryable: false,
          remediation: 'Request access to the project before retrying.',
        },
      });
    }
    expect(reads).not.toHaveBeenCalled();
  });

  it('uses the same fail-closed response when no access adapter exists', async () => {
    const reads = vi.fn();
    const { deps: dependencies } = deniedService(reads);
    const { projectAccess: _projectAccess, ...withoutAccess } = dependencies;
    const response = await new OntologyCrossPackageService(withoutAccess).invoke({
      contractVersion: '1', requestId: 'missing-adapter', actorId: 'actor-a',
      projectId: 'private-project', type: 'inspect_bound_task', taskId: 'unknown-task',
    });

    expect(reads).not.toHaveBeenCalled();
    expect(response).toMatchObject({
      ok: false,
      error: { category: 'authorization', code: PROJECT_ACCESS_DENIED_CODE },
    });
  });

  it('maps current read, control, create and assignment request surfaces explicitly', () => {
    const requests: readonly OntologyCrossPackageRequest[] = [
      { contractVersion: '1', requestId: 'read', actorId: 'actor', projectId: 'project', type: 'list_project_tasks' },
      { contractVersion: '1', requestId: 'control', actorId: 'actor', projectId: 'project', type: 'transition_project_task', taskId: 'task', targetStatus: 'review', expectedRevision: 1 },
      { contractVersion: '1', requestId: 'create', actorId: 'actor', projectId: 'project', type: 'create_approved_project_task', solutionId: 'solution', solutionVersion: '1', contractId: 'contract', contractHash: `sha256:${'a'.repeat(64)}`, taskTemplateId: 'template', objective: 'objective', semanticInputs: [] },
      { contractVersion: '1', requestId: 'priority', actorId: 'actor', projectId: 'project', type: 'update_project_task_priority', taskId: 'task', priority: 'high', expectedRevision: 1, expectedCursor: null, bridgeEpoch: 1 },
      { contractVersion: '1', requestId: 'handoff', actorId: 'actor', projectId: 'project', type: 'handoff_work_item', runId: 'run', workItemId: 'item', targetAgentId: 'agent', expectedRunRevision: 1, expectedWorkItemRevision: 1, expectedLeaseEpoch: 1 },
    ];

    expect(requests.map(projectAccessCapabilityForRequest)).toEqual([
      'read', 'control', 'create', 'assign', 'assign',
    ]);
  });

  it('gates the Ontology service subscription entry before delegation', async () => {
    const reads = vi.fn();
    const { deps } = deniedService(reads);
    const subscribeProjectTasks = vi.fn();
    const service = new OntologyCrossPackageService({
      ...deps,
      taskSubscriptions: { subscribeProjectTasks },
    });

    await expect(service.subscribeProjectTasks(
      { actorId: 'actor', projectId: 'private-project' }, { next() {} },
    )).rejects.toMatchObject({ code: PROJECT_ACCESS_DENIED_CODE });
    expect(subscribeProjectTasks).not.toHaveBeenCalled();
    expect(reads).not.toHaveBeenCalled();
  });
});

describe('project task subscription aggregation', () => {
  it('isolates projects, preserves source order and releases both public sources', async () => {
    const taskRuntime = new MemoryChangeSource();
    const collaboration = new MemoryChangeSource();
    const access: ProjectAccessPort = {
      async authorize() { return { authorized: true }; },
    };
    const subscriptions = new AuthorizedProjectTaskSubscriptions(
      access,
      new ProjectTaskEventAggregator([taskRuntime, collaboration], 'host-a'),
    );
    const projectA = vi.fn();
    const projectB = vi.fn();
    const a = await subscriptions.subscribeProjectTasks(
      { actorId: 'actor-a', projectId: 'project-a' },
      { next: projectA },
    );
    const b = await subscriptions.subscribeProjectTasks(
      { actorId: 'actor-b', projectId: 'project-b' },
      { next: projectB },
    );

    const taskRuntimeEvent = {
      projectId: 'project-a', taskId: 'task-1', revision: 2,
      kind: 'task_runtime' as const, rawMessageBody: 'must-not-cross-summary-boundary',
    };
    taskRuntime.emit(taskRuntimeEvent);
    collaboration.emit({ projectId: 'project-b', taskId: 'task-9', revision: 3, kind: 'collaboration' });
    collaboration.emit({ projectId: 'project-a', taskId: 'task-1', revision: 4, kind: 'collaboration' });

    await vi.waitFor(() => expect(projectA).toHaveBeenCalledTimes(2));
    await vi.waitFor(() => expect(projectB).toHaveBeenCalledTimes(1));
    expect(projectA.mock.calls.map(([event]) => event)).toEqual([
      { projectId: 'project-a', taskId: 'task-1', revision: 2, kind: 'task_runtime', hostId: 'host-a', sequence: 1 },
      { projectId: 'project-a', taskId: 'task-1', revision: 4, kind: 'collaboration', hostId: 'host-a', sequence: 2 },
    ]);
    expect(projectB).toHaveBeenCalledWith({
      projectId: 'project-b', taskId: 'task-9', revision: 3,
      kind: 'collaboration', hostId: 'host-a', sequence: 1,
    });

    a.unsubscribe();
    taskRuntime.emit({ projectId: 'project-a', taskId: 'task-1', revision: 5, kind: 'task_runtime' });
    await Promise.resolve();
    expect(projectA).toHaveBeenCalledTimes(2);
    expect(taskRuntime.releases).toBe(0);

    b.unsubscribe();
    expect(taskRuntime.releases).toBe(1);
    expect(collaboration.releases).toBe(1);
  });

  it('attaches no event source when subscribe authorization is denied or missing', async () => {
    const source = new MemoryChangeSource();
    const denied = new AuthorizedProjectTaskSubscriptions(
      { async authorize() { return { authorized: false }; } },
      new ProjectTaskEventAggregator([source], 'host-a'),
    );
    const missing = new AuthorizedProjectTaskSubscriptions(
      undefined,
      new ProjectTaskEventAggregator([source], 'host-a'),
    );

    await expect(denied.subscribeProjectTasks(
      { actorId: 'actor', projectId: 'project' }, { next() {} },
    )).rejects.toBeInstanceOf(ProjectAccessDeniedError);
    await expect(missing.subscribeProjectTasks(
      { actorId: 'actor', projectId: 'project' }, { next() {} },
    )).rejects.toMatchObject({ code: PROJECT_ACCESS_DENIED_CODE });
    expect(source.subscriptions).toBe(0);
  });

  it('closes without delivering an event when project access is revoked', async () => {
    const source = new MemoryChangeSource();
    let authorized = true;
    const subscriptions = new AuthorizedProjectTaskSubscriptions(
      { async authorize() { return { authorized }; } },
      new ProjectTaskEventAggregator([source], 'host-a'),
    );
    const next = vi.fn();
    const close = vi.fn();
    await subscriptions.subscribeProjectTasks(
      { actorId: 'actor', projectId: 'project' }, { next, close },
    );

    authorized = false;
    source.emit({ projectId: 'project', taskId: 'task', revision: 2, kind: 'task_runtime' });

    await vi.waitFor(() => expect(close).toHaveBeenCalledWith({ code: PROJECT_ACCESS_DENIED_CODE }));
    expect(next).not.toHaveBeenCalled();
    expect(source.releases).toBe(1);
  });
});
