
import { agentSessionService } from '@originos/core/lib/features/agent';
import { agentManager } from '@originos/core/lib/features/agent/server';
import {
  createProjectContractRuntimeComposition,
  projectContractRuntimeHost,
  type OntologyCrossPackageRequest,
  type OntologyCrossPackageResponse,
  type OntologyCrossPackageService,
  type OntologyCrossPackageTransportPort,
  type ProjectTaskSubscription,
  type ProjectTaskSubscriptionInput,
  type ProjectTaskSubscriptionObserver,
} from '@originos/core/lib/features/project';
import { getDataRoot } from '@originos/core/lib/paths';
import { IPC_CHANNELS } from '../ipc-protocol';

import type { IpcResponse } from '@originos/core/lib/integrations/electron/ipc-protocol';
import type { IpcMainInvokeEvent } from 'electron';

interface IpcRegistrar {
  handle(
    channel: string,
    listener: (event: IpcMainInvokeEvent, request: unknown) => Promise<unknown>
  ): void;
}

type SubscriptionService = OntologyCrossPackageTransportPort & Partial<{
  subscribeProjectTasks(
    input: ProjectTaskSubscriptionInput,
    observer: ProjectTaskSubscriptionObserver,
  ): Promise<ProjectTaskSubscription>;
}>;

interface SenderSubscription {
  active: boolean;
  readonly sender: IpcMainInvokeEvent['sender'];
  readonly projectId: string;
  readonly onDestroyed: () => void;
  unsubscribe?: () => void;
  ready: Promise<IpcResponse<null>>;
}

const REQUEST_TYPES = new Set([
  'read_semantic_context',
  'query_facts',
  'query_projection',
  'submit_action',
  'start_bound_task',
  'list_project_tasks',
  'inspect_bound_task',
  'control_bound_task',
  'transition_project_task',
  'update_project_task_priority',
  'list_work_item_handoff_candidates',
  'handoff_work_item',
  'list_approved_task_templates',
  'create_approved_project_task',
]);

const TASK_STATUSES = new Set([
  'pending',
  'active',
  'blocked',
  'review',
  'done',
  'cancelled',
]);

const TASK_PRIORITIES = new Set(['low', 'medium', 'high', 'urgent']);

export function createOntologyCrossPackageService(): OntologyCrossPackageService {
  return createProjectContractRuntimeComposition({
    dataRoot: getDataRoot(),
    host: projectContractRuntimeHost(agentSessionService, agentManager),
    projectAccess: {
      async authorize({ actorId }) {
        return { authorized: /^desktop-sender:\d+$/.test(actorId) };
      },
    },
  }).service;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object';
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function isSemanticInputs(value: unknown): boolean {
  return Array.isArray(value) && value.every((entry) => {
    if (!isRecord(entry) || !isNonEmptyString(entry['slotId']) || !isRecord(entry['factRef'])) {
      return false;
    }
    const factRef = entry['factRef'];
    return ['ontologyId', 'ontologyVersion', 'conceptId', 'factTypeId', 'factId', 'factVersion']
      .every((field) => isNonEmptyString(factRef[field]));
  });
}

function isCrossPackageRequest(value: unknown): value is OntologyCrossPackageRequest {
  if (!isRecord(value)) {
    return false;
  }
  const requestId = value['requestId'];
  const projectId = value['projectId'];
  const type = value['type'];
  const expectedRevision = value['expectedRevision'];
  const cursor = value['cursor'];
  const limit = value['limit'];
  const taskId = value['taskId'];
  const targetStatus = value['targetStatus'];
  const expectedLeaseEpoch = value['expectedLeaseEpoch'];
  const reason = value['reason'];
  const priority = value['priority'];
  const expectedCursor = value['expectedCursor'];
  const bridgeEpoch = value['bridgeEpoch'];
  const runId = value['runId'];
  const workItemId = value['workItemId'];
  const targetAgentId = value['targetAgentId'];
  const expectedRunRevision = value['expectedRunRevision'];
  const expectedWorkItemRevision = value['expectedWorkItemRevision'];
  return value['contractVersion'] === '1'
    && typeof requestId === 'string'
    && requestId.trim().length > 0
    && typeof projectId === 'string'
    && projectId.trim().length > 0
    && typeof type === 'string'
    && REQUEST_TYPES.has(type)
    && (type !== 'list_project_tasks'
      || ((cursor === undefined || (typeof cursor === 'string' && cursor.trim().length > 0))
        && (limit === undefined || (typeof limit === 'number'
          && Number.isSafeInteger(limit) && limit >= 1 && limit <= 50))))
    && ((type !== 'submit_action' && type !== 'control_bound_task'
      && type !== 'transition_project_task' && type !== 'update_project_task_priority')
      || (Number.isSafeInteger(expectedRevision) && (expectedRevision as number) >= 0))
    && (type !== 'transition_project_task'
      || (typeof taskId === 'string'
        && taskId.trim().length > 0
        && typeof targetStatus === 'string'
        && TASK_STATUSES.has(targetStatus)
        && (expectedLeaseEpoch === undefined
          || (Number.isSafeInteger(expectedLeaseEpoch) && (expectedLeaseEpoch as number) >= 0))
        && (reason === undefined || (typeof reason === 'string' && reason.trim().length > 0))))
    && (type !== 'update_project_task_priority'
      || (typeof taskId === 'string'
        && taskId.trim().length > 0
        && typeof priority === 'string'
        && TASK_PRIORITIES.has(priority)
        && (expectedCursor === null
          || (typeof expectedCursor === 'string' && expectedCursor.trim().length > 0))
        && Number.isSafeInteger(bridgeEpoch)
        && (bridgeEpoch as number) >= 0))
    && (type !== 'list_work_item_handoff_candidates'
      || (typeof runId === 'string' && runId.trim().length > 0
        && typeof workItemId === 'string' && workItemId.trim().length > 0))
    && (type !== 'handoff_work_item'
      || (typeof runId === 'string' && runId.trim().length > 0
        && typeof workItemId === 'string' && workItemId.trim().length > 0
        && typeof targetAgentId === 'string' && targetAgentId.trim().length > 0
        && Number.isSafeInteger(expectedRunRevision)
        && (expectedRunRevision as number) >= 0
        && Number.isSafeInteger(expectedWorkItemRevision)
        && (expectedWorkItemRevision as number) >= 0
        && Number.isSafeInteger(expectedLeaseEpoch)
        && (expectedLeaseEpoch as number) >= 0))
    && (type !== 'create_approved_project_task'
      || (isNonEmptyString(value['solutionId'])
        && isNonEmptyString(value['solutionVersion'])
        && isNonEmptyString(value['contractId'])
        && typeof value['contractHash'] === 'string'
        && /^sha256:[a-f0-9]{64}$/i.test(value['contractHash'])
        && isNonEmptyString(value['taskTemplateId'])
        && isNonEmptyString(value['objective'])
        && isSemanticInputs(value['semanticInputs'])));
}

function success(data: OntologyCrossPackageResponse): IpcResponse<OntologyCrossPackageResponse> {
  return {
    success: true,
    data,
    timestamp: new Date().toISOString(),
  };
}

function transportFailure(code: string): IpcResponse<never> {
  return {
    success: false,
    error: {
      code,
      message: 'The request was rejected at the transport boundary',
    },
    timestamp: new Date().toISOString(),
  };
}

function subscriptionSuccess(): IpcResponse<null> {
  return {
    success: true,
    data: null,
    timestamp: new Date().toISOString(),
  };
}

function capabilityFailure(requestId: string): IpcResponse<OntologyCrossPackageResponse> {
  const response: Extract<OntologyCrossPackageResponse, { ok: false }> = {
    ok: false,
    requestId,
    error: {
      category: 'unavailable',
      code: 'CAPABILITY_NOT_READY',
      issues: [{
        code: 'CAPABILITY_NOT_READY',
        message: 'The request was rejected at the transport boundary',
      }],
      retryable: true,
      remediation: 'Correct the request or retry with the current references.',
    },
  };
  return {
    success: false,
    error: {
      code: 'CAPABILITY_NOT_READY',
      message: 'The request was rejected at the transport boundary',
      details: response,
    },
    timestamp: new Date().toISOString(),
  };
}

function serviceFailure(
  response: Extract<OntologyCrossPackageResponse, { ok: false }>
): IpcResponse<OntologyCrossPackageResponse> {
  return {
    success: false,
    error: {
      code: response.error.code,
      message: response.error.remediation,
      details: response,
    },
    timestamp: new Date().toISOString(),
  };
}

export interface OntologyCrossPackageIpcControllerOptions {
  readonly ipc: IpcRegistrar;
  readonly service: SubscriptionService;
  readonly isTrustedSender: (sender: IpcMainInvokeEvent['sender']) => boolean;
}

export class OntologyCrossPackageIpcController {
  private readonly subscriptions = new Map<string, SenderSubscription>();

  constructor(private readonly options: OntologyCrossPackageIpcControllerOptions) {}

  registerHandlers(): void {
    this.options.ipc.handle(
      IPC_CHANNELS.ONTOLOGY_CROSS_PACKAGE_INVOKE,
      async (event, rawRequest) => {
        if (!this.options.isTrustedSender(event.sender)) {
          return transportFailure('UNTRUSTED_SENDER');
        }
        if (!isCrossPackageRequest(rawRequest)) {
          return transportFailure('INVALID_REQUEST');
        }

        try {
          const response = await this.options.service.invoke({
            ...rawRequest,
            actorId: `desktop-sender:${event.sender.id}`,
          });
          return response.ok ? success(response) : serviceFailure(response);
        } catch (error) {
          const message = error instanceof Error ? error.message : '';
          if (
            message === 'PROJECT_TASK_SOURCE_UNAVAILABLE'
            || message === 'WORK_ITEM_RECOVERY_UNAVAILABLE'
          ) {
            return capabilityFailure(rawRequest.requestId);
          }
          return transportFailure('INTERNAL_ERROR');
        }
      }
    );
    this.options.ipc.handle(
      IPC_CHANNELS.ONTOLOGY_PROJECT_TASKS_SUBSCRIBE,
      async (event, rawProjectId) => {
        if (!this.options.isTrustedSender(event.sender)) {
          return transportFailure('UNTRUSTED_SENDER');
        }
        if (!isNonEmptyString(rawProjectId) || rawProjectId.length > 256) {
          return transportFailure('INVALID_REQUEST');
        }
        if (!this.options.service.subscribeProjectTasks) {
          return transportFailure('CAPABILITY_NOT_READY');
        }

        const key = this.subscriptionKey(event.sender.id, rawProjectId);
        const existing = this.subscriptions.get(key);
        if (existing) return existing.ready;

        const entry: SenderSubscription = {
          active: true,
          sender: event.sender,
          projectId: rawProjectId,
          onDestroyed: () => this.releaseSubscription(key),
          ready: Promise.resolve(subscriptionSuccess()),
        };
        this.subscriptions.set(key, entry);
        event.sender.once('destroyed', entry.onDestroyed);
        entry.ready = this.openSubscription(key, entry);
        return entry.ready;
      }
    );
    this.options.ipc.handle(
      IPC_CHANNELS.ONTOLOGY_PROJECT_TASKS_UNSUBSCRIBE,
      async (event, rawProjectId) => {
        if (!this.options.isTrustedSender(event.sender)) {
          return transportFailure('UNTRUSTED_SENDER');
        }
        if (!isNonEmptyString(rawProjectId) || rawProjectId.length > 256) {
          return transportFailure('INVALID_REQUEST');
        }
        this.releaseSubscription(this.subscriptionKey(event.sender.id, rawProjectId));
        return subscriptionSuccess();
      }
    );
  }

  private async openSubscription(
    key: string,
    entry: SenderSubscription,
  ): Promise<IpcResponse<null>> {
    try {
      const subscription = await this.options.service.subscribeProjectTasks!({
        actorId: `desktop-sender:${entry.sender.id}`,
        projectId: entry.projectId,
      }, {
        next: event => {
          if (!entry.active || entry.sender.isDestroyed()) return;
          entry.sender.send(IPC_CHANNELS.ONTOLOGY_PROJECT_TASKS_EVENT, {
            projectId: entry.projectId,
            payload: event,
          });
        },
        close: termination => {
          if (entry.active && !entry.sender.isDestroyed()) {
            entry.sender.send(IPC_CHANNELS.ONTOLOGY_PROJECT_TASKS_EVENT, {
              projectId: entry.projectId,
              payload: termination,
            });
          }
          this.releaseSubscription(key);
        },
      });
      if (!entry.active || entry.sender.isDestroyed()) {
        subscription.unsubscribe();
      } else {
        entry.unsubscribe = () => subscription.unsubscribe();
      }
      return subscriptionSuccess();
    } catch (error) {
      const code = isRecord(error) && error['code'] === 'PROJECT_ACCESS_DENIED'
        ? 'PROJECT_ACCESS_DENIED'
        : 'CAPABILITY_NOT_READY';
      if (code === 'PROJECT_ACCESS_DENIED' && entry.active && !entry.sender.isDestroyed()) {
        entry.sender.send(IPC_CHANNELS.ONTOLOGY_PROJECT_TASKS_EVENT, {
          projectId: entry.projectId,
          payload: { code },
        });
      }
      this.releaseSubscription(key);
      return transportFailure(code);
    }
  }

  private releaseSubscription(key: string): void {
    const entry = this.subscriptions.get(key);
    if (!entry) return;
    this.subscriptions.delete(key);
    entry.active = false;
    entry.sender.removeListener('destroyed', entry.onDestroyed);
    try { entry.unsubscribe?.(); } catch { /* release remains best effort */ }
  }

  private subscriptionKey(senderId: number, projectId: string): string {
    return `${senderId}\u0000${projectId}`;
  }
}
