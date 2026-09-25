import { randomUUID } from 'node:crypto';

import type { OntologyCrossPackageRequest } from './ontology-cross-package-contract';

export const PROJECT_ACCESS_DENIED_CODE = 'PROJECT_ACCESS_DENIED';

export type ProjectAccessCapability =
  | 'read'
  | 'control'
  | 'create'
  | 'assign'
  | 'subscribe';

export interface ProjectAccessRequest {
  readonly actorId: string;
  readonly projectId: string;
  readonly capability: ProjectAccessCapability;
}

export interface ProjectAccessDecision {
  readonly authorized: boolean;
}

/**
 * Host-owned project authorization boundary. Core deliberately has no implicit
 * owner or local-user bypass: an absent or failing adapter is a denial.
 */
export interface ProjectAccessPort {
  authorize(input: ProjectAccessRequest): Promise<ProjectAccessDecision>;
}

export async function isProjectAccessAuthorized(
  access: ProjectAccessPort | undefined,
  input: ProjectAccessRequest,
): Promise<boolean> {
  if (!access) return false;
  try {
    return (await access.authorize(input)).authorized === true;
  } catch {
    return false;
  }
}

export function projectAccessCapabilityForRequest(
  request: OntologyCrossPackageRequest,
): Exclude<ProjectAccessCapability, 'subscribe'> {
  switch (request.type) {
    case 'create_approved_project_task':
      return 'create';
    case 'update_project_task_priority':
    case 'list_work_item_handoff_candidates':
    case 'handoff_work_item':
      return 'assign';
    case 'start_bound_task':
    case 'submit_action':
    case 'control_bound_task':
    case 'transition_project_task':
      return 'control';
    case 'read_semantic_context':
    case 'query_facts':
    case 'query_projection':
    case 'inspect_bound_task':
    case 'list_project_tasks':
    case 'list_approved_task_templates':
      return 'read';
  }
}

export type ProjectTaskChangeKind = 'task_runtime' | 'collaboration';

/** Summary emitted by an existing Task Runtime or collaboration event adapter. */
export interface ProjectTaskSourceEvent {
  readonly projectId: string;
  readonly taskId: string;
  readonly revision: number;
  readonly kind: ProjectTaskChangeKind;
}

/**
 * Adapter boundary for existing public event sources. Implementations normalize
 * their public event without exposing message bodies or creating a second log.
 */
export interface ProjectTaskChangeSourcePort {
  subscribe(listener: (event: ProjectTaskSourceEvent) => void): () => void;
}

export interface ProjectTaskSubscriptionEvent extends ProjectTaskSourceEvent {
  readonly hostId: string;
  readonly sequence: number;
}

export interface ProjectTaskSubscriptionTermination {
  readonly code: typeof PROJECT_ACCESS_DENIED_CODE;
}

export interface ProjectTaskSubscriptionObserver {
  next(event: ProjectTaskSubscriptionEvent): void;
  close?(termination: ProjectTaskSubscriptionTermination): void;
}

export interface ProjectTaskSubscriptionInput {
  readonly actorId: string;
  readonly projectId: string;
}

export interface ProjectTaskSubscription {
  unsubscribe(): void;
}

export interface ProjectTaskSubscriptionPort {
  subscribeProjectTasks(
    input: ProjectTaskSubscriptionInput,
    observer: ProjectTaskSubscriptionObserver,
  ): Promise<ProjectTaskSubscription>;
}

export class ProjectAccessDeniedError extends Error {
  readonly code = PROJECT_ACCESS_DENIED_CODE;

  constructor() {
    super('Project access is denied');
    this.name = 'ProjectAccessDeniedError';
  }
}

type ProjectListener = (event: ProjectTaskSubscriptionEvent) => void;

/**
 * Multiplexes existing event sources into one project-scoped, host-local stream.
 * Sequence numbers are per project, so unrelated projects cannot create false
 * gaps. Source subscriptions exist only while at least one consumer is active.
 */
export class ProjectTaskEventAggregator {
  private readonly listeners = new Map<string, Set<ProjectListener>>();
  private readonly sequences = new Map<string, number>();
  private sourceReleases: Array<() => void> = [];

  constructor(
    private readonly sources: readonly ProjectTaskChangeSourcePort[],
    readonly hostId: string = randomUUID(),
  ) {}

  subscribeProject(projectId: string, listener: ProjectListener): () => void {
    const listeners = this.listeners.get(projectId) ?? new Set<ProjectListener>();
    listeners.add(listener);
    this.listeners.set(projectId, listeners);
    this.ensureSourcesSubscribed();

    let active = true;
    return () => {
      if (!active) return;
      active = false;
      const current = this.listeners.get(projectId);
      current?.delete(listener);
      if (current?.size === 0) this.listeners.delete(projectId);
      if (this.listeners.size === 0) this.releaseSources();
    };
  }

  private ensureSourcesSubscribed(): void {
    if (this.sourceReleases.length > 0 || this.sources.length === 0) return;
    this.sourceReleases = this.sources.map((source) => source.subscribe((event) => {
      const listeners = this.listeners.get(event.projectId);
      if (!listeners || listeners.size === 0) return;
      const sequence = (this.sequences.get(event.projectId) ?? 0) + 1;
      this.sequences.set(event.projectId, sequence);
      const summary: ProjectTaskSubscriptionEvent = {
        projectId: event.projectId,
        taskId: event.taskId,
        revision: event.revision,
        kind: event.kind,
        hostId: this.hostId,
        sequence,
      };
      for (const listener of [...listeners]) {
        try { listener(summary); } catch { /* isolate a broken transport listener */ }
      }
    }));
  }

  private releaseSources(): void {
    for (const release of this.sourceReleases.splice(0)) {
      try { release(); } catch { /* release every source even if one adapter fails */ }
    }
  }
}

/**
 * Authorization-aware subscription facade. Access is checked before attaching
 * to any source and again before each delivery so permission revocation closes
 * the stream without leaking the pending event.
 */
export class AuthorizedProjectTaskSubscriptions implements ProjectTaskSubscriptionPort {
  constructor(
    private readonly access: ProjectAccessPort | undefined,
    private readonly events: ProjectTaskEventAggregator,
  ) {}

  async subscribeProjectTasks(
    input: ProjectTaskSubscriptionInput,
    observer: ProjectTaskSubscriptionObserver,
  ): Promise<ProjectTaskSubscription> {
    const accessRequest: ProjectAccessRequest = {
      actorId: input.actorId,
      projectId: input.projectId,
      capability: 'subscribe',
    };
    if (!await isProjectAccessAuthorized(this.access, accessRequest)) {
      throw new ProjectAccessDeniedError();
    }

    let active = true;
    let releaseSource = (): void => {};
    let delivery = Promise.resolve();
    const unsubscribe = (): void => {
      if (!active) return;
      active = false;
      releaseSource();
    };
    releaseSource = this.events.subscribeProject(input.projectId, (event) => {
      delivery = delivery.then(async () => {
        if (!active) return;
        if (!await isProjectAccessAuthorized(this.access, accessRequest)) {
          unsubscribe();
          try { observer.close?.({ code: PROJECT_ACCESS_DENIED_CODE }); } catch { /* closed */ }
          return;
        }
        if (active) {
          try { observer.next(event); } catch { unsubscribe(); }
        }
      });
    });

    return { unsubscribe };
  }
}
