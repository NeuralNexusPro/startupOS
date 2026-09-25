import type { IpcMainInvokeEvent } from 'electron';

import type { IpcResponse } from '@originos/core/lib/integrations/electron/ipc-protocol';
import type {
  OntologyCrossPackageRequest,
  OntologyCrossPackageResponse,
  OntologyCrossPackageTransportPort,
  ProjectTaskSubscriptionObserver,
} from '@originos/core/lib/features/project';
import { describe, expect, it, vi } from 'vitest';

import { IPC_CHANNELS } from '../../ipc-protocol';
import { OntologyCrossPackageIpcController } from '../ontology-cross-package-ipc';

type RegisteredHandler = (
  event: IpcMainInvokeEvent,
  request: unknown
) => Promise<unknown>;

const baseRequest = {
  contractVersion: '1',
  requestId: 'request-1',
  actorId: 'request-actor',
  projectId: 'project-1',
  type: 'inspect_bound_task',
  taskId: 'task-1',
};

function successResponse(): OntologyCrossPackageResponse {
  return {
    ok: true,
    requestId: 'request-1',
    data: { taskId: 'task-1' },
    revision: 1,
  };
}

function createHarness(service: OntologyCrossPackageTransportPort, trusted = true) {
  const handlers = new Map<string, RegisteredHandler>();
  const destroyedListeners = new Set<() => void>();
  let destroyed = false;
  const sender = {
    id: 7,
    send: vi.fn(),
    isDestroyed: () => destroyed,
    once: (_event: string, listener: () => void) => {
      destroyedListeners.add(listener);
      return sender;
    },
    removeListener: (_event: string, listener: () => void) => {
      destroyedListeners.delete(listener);
      return sender;
    },
  };
  const controller = new OntologyCrossPackageIpcController({
    ipc: {
      handle: (channel, listener) => {
        handlers.set(channel, listener as RegisteredHandler);
      },
    },
    service,
    isTrustedSender: () => trusted,
  });
  controller.registerHandlers();

  const invoke = async (
    request: unknown
  ): Promise<IpcResponse<OntologyCrossPackageResponse>> => {
    const handler = handlers.get(IPC_CHANNELS.ONTOLOGY_CROSS_PACKAGE_INVOKE);
    if (!handler) throw new Error('Missing handler');
    const response = await handler({ sender } as unknown as IpcMainInvokeEvent, request);
    return response as IpcResponse<OntologyCrossPackageResponse>;
  };

  const call = async (channel: string, request: unknown): Promise<IpcResponse<unknown>> => {
    const handler = handlers.get(channel);
    if (!handler) throw new Error(`Missing handler: ${channel}`);
    return handler({ sender } as unknown as IpcMainInvokeEvent, request) as Promise<IpcResponse<unknown>>;
  };
  const destroy = () => {
    destroyed = true;
    for (const listener of [...destroyedListeners]) listener();
  };

  return { handlers, invoke, call, sender, destroy };
}

describe('OntologyCrossPackageIpcController', () => {
  it('registers the cross-package channel', () => {
    const service = { invoke: vi.fn() };
    const harness = createHarness(service);

    expect([...harness.handlers.keys()]).toEqual([
      IPC_CHANNELS.ONTOLOGY_CROSS_PACKAGE_INVOKE,
      IPC_CHANNELS.ONTOLOGY_PROJECT_TASKS_SUBSCRIBE,
      IPC_CHANNELS.ONTOLOGY_PROJECT_TASKS_UNSUBSCRIBE,
    ]);
    expect(IPC_CHANNELS.ONTOLOGY_CROSS_PACKAGE_INVOKE).toBe('ontology:cross-package:invoke');
  });

  it('uses allowlisted channels, injects the sender actor, and forwards summary events', async () => {
    let observer: ProjectTaskSubscriptionObserver | undefined;
    const unsubscribe = vi.fn();
    const service = {
      invoke: vi.fn(),
      subscribeProjectTasks: vi.fn(async (_input, value: ProjectTaskSubscriptionObserver) => {
        observer = value;
        return { unsubscribe };
      }),
    };
    const harness = createHarness(service);

    const response = await harness.call(
      IPC_CHANNELS.ONTOLOGY_PROJECT_TASKS_SUBSCRIBE,
      'project-1',
    );
    const update = { hostId: 'host-1', sequence: 1, projectId: 'project-1', taskId: 'task-1', revision: 2, kind: 'task_runtime' } as const;
    observer?.next(update);

    expect(response.success).toBe(true);
    expect(service.subscribeProjectTasks).toHaveBeenCalledWith(
      { actorId: 'desktop-sender:7', projectId: 'project-1' },
      expect.any(Object),
    );
    expect(harness.sender.send).toHaveBeenCalledWith(
      IPC_CHANNELS.ONTOLOGY_PROJECT_TASKS_EVENT,
      { projectId: 'project-1', payload: update },
    );
  });

  it('reuses duplicate renderer/project subscriptions and releases exactly once', async () => {
    const unsubscribe = vi.fn();
    const service = {
      invoke: vi.fn(),
      subscribeProjectTasks: vi.fn(async () => ({ unsubscribe })),
    };
    const harness = createHarness(service);

    await harness.call(IPC_CHANNELS.ONTOLOGY_PROJECT_TASKS_SUBSCRIBE, 'project-1');
    await harness.call(IPC_CHANNELS.ONTOLOGY_PROJECT_TASKS_SUBSCRIBE, 'project-1');
    await harness.call(IPC_CHANNELS.ONTOLOGY_PROJECT_TASKS_UNSUBSCRIBE, 'project-1');
    await harness.call(IPC_CHANNELS.ONTOLOGY_PROJECT_TASKS_UNSUBSCRIBE, 'project-1');

    expect(service.subscribeProjectTasks).toHaveBeenCalledTimes(1);
    expect(unsubscribe).toHaveBeenCalledTimes(1);
  });

  it('releases subscriptions when the sender is destroyed without leaking events', async () => {
    let observer: ProjectTaskSubscriptionObserver | undefined;
    const unsubscribe = vi.fn();
    const service = {
      invoke: vi.fn(),
      subscribeProjectTasks: vi.fn(async (_input, value: ProjectTaskSubscriptionObserver) => {
        observer = value;
        return { unsubscribe };
      }),
    };
    const harness = createHarness(service);
    await harness.call(IPC_CHANNELS.ONTOLOGY_PROJECT_TASKS_SUBSCRIBE, 'project-1');

    harness.destroy();
    observer?.next({ hostId: 'host-1', sequence: 1, projectId: 'project-1', taskId: 'task-1', revision: 2, kind: 'task_runtime' });

    expect(unsubscribe).toHaveBeenCalledTimes(1);
    expect(harness.sender.send).not.toHaveBeenCalled();
  });

  it('rejects an untrusted subscription sender before authorization', async () => {
    const service = { invoke: vi.fn(), subscribeProjectTasks: vi.fn() };
    const harness = createHarness(service, false);

    const response = await harness.call(
      IPC_CHANNELS.ONTOLOGY_PROJECT_TASKS_SUBSCRIBE,
      'project-1',
    );

    expect(response.success).toBe(false);
    expect(response.error?.code).toBe('UNTRUSTED_SENDER');
    expect(service.subscribeProjectTasks).not.toHaveBeenCalled();
  });

  it('returns and emits the fixed authorization failure without leaking details', async () => {
    const denied = Object.assign(new Error('/private/project/secret'), {
      code: 'PROJECT_ACCESS_DENIED',
    });
    const service = {
      invoke: vi.fn(),
      subscribeProjectTasks: vi.fn(async () => { throw denied; }),
    };
    const harness = createHarness(service);

    const response = await harness.call(
      IPC_CHANNELS.ONTOLOGY_PROJECT_TASKS_SUBSCRIBE,
      'project-1',
    );

    expect(response.success).toBe(false);
    expect(response.error?.code).toBe('PROJECT_ACCESS_DENIED');
    expect(JSON.stringify(response)).not.toContain('/private/project/secret');
    expect(harness.sender.send).toHaveBeenCalledWith(
      IPC_CHANNELS.ONTOLOGY_PROJECT_TASKS_EVENT,
      { projectId: 'project-1', payload: { code: 'PROJECT_ACCESS_DENIED' } },
    );
  });

  it('accepts a trusted sender and injects the desktop actor', async () => {
    const service = {
      invoke: vi.fn(async (
        _request: OntologyCrossPackageRequest
      ): Promise<OntologyCrossPackageResponse> => successResponse()),
    };
    const harness = createHarness(service);

    const response = await harness.invoke(baseRequest);

    expect(service.invoke).toHaveBeenCalledWith({
      ...baseRequest,
      actorId: 'desktop-sender:7',
    });
    expect(response.success).toBe(true);
    expect(response.data).toEqual(successResponse());
  });

  it('accepts a bounded project task page request without an ontology version', async () => {
    const service = {
      invoke: vi.fn(async (
        _request: OntologyCrossPackageRequest
      ): Promise<OntologyCrossPackageResponse> => successResponse()),
    };
    const harness = createHarness(service);
    const request = {
      contractVersion: '1',
      requestId: 'request-2',
      actorId: 'request-actor',
      projectId: 'project-1',
      type: 'list_project_tasks',
      cursor: 'cursor-1',
      limit: 50,
    } as const;

    await harness.invoke(request);

    expect(service.invoke).toHaveBeenCalledWith({
      ...request,
      actorId: 'desktop-sender:7',
    });
  });

  it('passes approved template catalog and create requests without translating fields', async () => {
    const service = {
      invoke: vi.fn(async (
        _request: OntologyCrossPackageRequest
      ): Promise<OntologyCrossPackageResponse> => successResponse()),
    };
    const harness = createHarness(service);
    const catalog = {
      contractVersion: '1', requestId: 'catalog-1', actorId: 'untrusted',
      projectId: 'project-1', type: 'list_approved_task_templates',
    } as const;
    const create = {
      contractVersion: '1', requestId: 'create-1', actorId: 'untrusted',
      projectId: 'project-1', type: 'create_approved_project_task',
      solutionId: 'solution-1', solutionVersion: '1', contractId: 'contract-1',
      contractHash: `sha256:${'a'.repeat(64)}`, taskTemplateId: 'template-1',
      objective: '处理订单', semanticInputs: [],
    } as const;

    await harness.invoke(catalog);
    await harness.invoke(create);

    expect(service.invoke).toHaveBeenNthCalledWith(1, {
      ...catalog, actorId: 'desktop-sender:7',
    });
    expect(service.invoke).toHaveBeenNthCalledWith(2, {
      ...create, actorId: 'desktop-sender:7',
    });
  });

  it('rejects malformed task creation input at the IPC boundary', async () => {
    const service = { invoke: vi.fn() };
    const harness = createHarness(service);
    const response = await harness.invoke({
      contractVersion: '1', requestId: 'create-1', actorId: 'untrusted',
      projectId: 'project-1', type: 'create_approved_project_task',
      solutionId: 'solution-1', solutionVersion: '1', contractId: 'contract-1',
      contractHash: 'secret-path', taskTemplateId: 'template-1',
      objective: '处理订单', semanticInputs: [],
    });

    expect(response.success).toBe(false);
    expect(response.error?.code).toBe('INVALID_REQUEST');
    expect(service.invoke).not.toHaveBeenCalled();
  });

  it('preserves structured Task Runtime recovery feedback from Core', async () => {
    const coreResponse: OntologyCrossPackageResponse = {
      ok: true,
      requestId: 'request-2',
      data: {
        items: [{
          taskId: 'task-1',
          runtimeStatus: 'paused',
          runtimeAvailability: 'recovery_required',
        }],
        revision: 4,
      },
      revision: 4,
    };
    const service = {
      invoke: vi.fn(async (): Promise<OntologyCrossPackageResponse> => coreResponse),
    };
    const harness = createHarness(service);

    const response = await harness.invoke({
      contractVersion: '1',
      requestId: 'request-2',
      actorId: 'request-actor',
      projectId: 'project-1',
      type: 'list_project_tasks',
    });

    expect(response.success).toBe(true);
    expect(response.data).toEqual(coreResponse);
    expect(response.data).toMatchObject({
      data: {
        items: [{
          runtimeStatus: 'paused',
          runtimeAvailability: 'recovery_required',
        }],
      },
    });
  });

  it('passes target transition intent and CAS fields through without translating status', async () => {
    const service = {
      invoke: vi.fn(async (
        _request: OntologyCrossPackageRequest
      ): Promise<OntologyCrossPackageResponse> => successResponse()),
    };
    const harness = createHarness(service);
    const request = {
      ...baseRequest,
      type: 'transition_project_task',
      targetStatus: 'review',
      expectedRevision: 3,
      expectedLeaseEpoch: 9,
      reason: 'Ready for review',
    } as const;

    await harness.invoke(request);

    expect(service.invoke).toHaveBeenCalledWith({
      ...request,
      actorId: 'desktop-sender:7',
    });
  });

  it('passes retry through as a controlled task action', async () => {
    const service = {
      invoke: vi.fn(async (
        _request: OntologyCrossPackageRequest
      ): Promise<OntologyCrossPackageResponse> => successResponse()),
    };
    const harness = createHarness(service);
    const request = {
      ...baseRequest,
      type: 'control_bound_task',
      action: 'retry',
      expectedRevision: 1,
    } as const;

    await harness.invoke(request);

    expect(service.invoke).toHaveBeenCalledWith({
      ...request,
      actorId: 'desktop-sender:7',
    });
  });

  it('passes priority and handoff CAS scopes through unchanged', async () => {
    const service = {
      invoke: vi.fn(async (
        _request: OntologyCrossPackageRequest
      ): Promise<OntologyCrossPackageResponse> => successResponse()),
    };
    const harness = createHarness(service);
    const priority = {
      ...baseRequest,
      type: 'update_project_task_priority',
      priority: 'high',
      expectedRevision: 3,
      expectedCursor: 'cursor-3',
      bridgeEpoch: 2,
    } as const;
    const candidates = {
      ...baseRequest,
      type: 'list_work_item_handoff_candidates',
      runId: 'run-1',
      workItemId: 'work-1',
    } as const;
    const handoff = {
      ...candidates,
      type: 'handoff_work_item',
      targetAgentId: 'agent-2',
      expectedRunRevision: 9,
      expectedWorkItemRevision: 4,
      expectedLeaseEpoch: 2,
    } as const;

    await harness.invoke(priority);
    await harness.invoke(candidates);
    await harness.invoke(handoff);

    expect(service.invoke).toHaveBeenNthCalledWith(1, {
      ...priority,
      actorId: 'desktop-sender:7',
    });
    expect(service.invoke).toHaveBeenNthCalledWith(2, {
      ...candidates,
      actorId: 'desktop-sender:7',
    });
    expect(service.invoke).toHaveBeenNthCalledWith(3, {
      ...handoff,
      actorId: 'desktop-sender:7',
    });
  });

  it('rejects an untrusted sender before calling core', async () => {
    const service = { invoke: vi.fn() };
    const harness = createHarness(service, false);

    const response = await harness.invoke(baseRequest);

    expect(service.invoke).not.toHaveBeenCalled();
    expect(response.success).toBe(false);
    expect(response.error?.code).toBe('UNTRUSTED_SENDER');
  });

  it('rejects an invalid contract version', async () => {
    const service = { invoke: vi.fn() };
    const harness = createHarness(service);

    const response = await harness.invoke({ ...baseRequest, contractVersion: '2' });

    expect(service.invoke).not.toHaveBeenCalled();
    expect(response.error?.code).toBe('INVALID_REQUEST');
  });

  it('rejects mutations without a safe revision', async () => {
    const service = { invoke: vi.fn() };
    const harness = createHarness(service);
    const request = {
      ...baseRequest,
      type: 'control_bound_task',
      action: 'pause',
    };

    const response = await harness.invoke(request);

    expect(service.invoke).not.toHaveBeenCalled();
    expect(response.error?.code).toBe('INVALID_REQUEST');
  });

  it('rejects malformed transition intent before calling core', async () => {
    const service = { invoke: vi.fn() };
    const harness = createHarness(service);

    const invalidStatus = await harness.invoke({
      ...baseRequest,
      type: 'transition_project_task',
      targetStatus: 'invented-status',
      expectedRevision: 1,
    });
    const invalidLease = await harness.invoke({
      ...baseRequest,
      type: 'transition_project_task',
      targetStatus: 'done',
      expectedRevision: 1,
      expectedLeaseEpoch: -1,
    });

    expect(service.invoke).not.toHaveBeenCalled();
    expect(invalidStatus.error?.code).toBe('INVALID_REQUEST');
    expect(invalidLease.error?.code).toBe('INVALID_REQUEST');
  });

  it('rejects an invalid project task page cursor or limit', async () => {
    const service = { invoke: vi.fn() };
    const harness = createHarness(service);

    const oversized = await harness.invoke({
      ...baseRequest,
      type: 'list_project_tasks',
      limit: 51,
    });
    const invalidCursor = await harness.invoke({
      ...baseRequest,
      type: 'list_project_tasks',
      cursor: '',
    });

    expect(service.invoke).not.toHaveBeenCalled();
    expect(oversized.error?.code).toBe('INVALID_REQUEST');
    expect(invalidCursor.error?.code).toBe('INVALID_REQUEST');
  });

  it('maps a core rejection to a stable IPC error', async () => {
    const coreResponse = {
      ok: false,
      requestId: 'request-1',
      error: {
        category: 'conflict',
        code: 'REVISION_CONFLICT',
        issues: [{ code: 'REVISION_CONFLICT', message: 'Task revision changed' }],
        retryable: false,
        remediation: 'Reload the current task and retry.',
      },
    } as OntologyCrossPackageResponse;
    const service = {
      invoke: vi.fn(async (
        _request: OntologyCrossPackageRequest
      ): Promise<OntologyCrossPackageResponse> => coreResponse),
    };
    const harness = createHarness(service);

    const response = await harness.invoke(baseRequest);

    expect(response.success).toBe(false);
    expect(response.error?.code).toBe('REVISION_CONFLICT');
    expect(response.error?.message).toBe('Reload the current task and retry.');
    expect(response.error?.details).toEqual(coreResponse);
  });

  it('keeps the primary transition code while preserving evidence gaps in details', async () => {
    const coreResponse: OntologyCrossPackageResponse = {
      ok: false,
      requestId: 'request-1',
      error: {
        category: 'validation',
        code: 'EVIDENCE_GATE_FAILED',
        issues: [{
          code: 'PROJECT_TASK_CRITERION_EVIDENCE_GAP',
          message: 'Criterion Evidence is missing',
          field: 'task.criterion_evidence.criterion-1',
        }],
        retryable: false,
        remediation: 'Resolve the reported task gaps.',
        gaps: [{
          kind: 'criterion_evidence',
          id: 'criterion-1',
          message: 'Criterion Evidence is missing',
        }],
      },
    };
    const service = {
      invoke: vi.fn(async (): Promise<OntologyCrossPackageResponse> => coreResponse),
    };
    const harness = createHarness(service);

    const response = await harness.invoke({
      ...baseRequest,
      type: 'transition_project_task',
      targetStatus: 'done',
      expectedRevision: 1,
    });

    expect(response.error?.code).toBe('EVIDENCE_GATE_FAILED');
    expect(response.error?.details).toEqual(coreResponse);
  });

  it('does not leak thrown internal error details', async () => {
    const service = {
      invoke: vi.fn(async (): Promise<OntologyCrossPackageResponse> => {
        throw new Error('/private/project/secret.txt');
      }),
    };
    const harness = createHarness(service);

    const response = await harness.invoke(baseRequest);

    expect(response.success).toBe(false);
    expect(response.error?.code).toBe('INTERNAL_ERROR');
    expect(response.error?.message).not.toContain('/private/project/secret.txt');
  });

  it('fails closed when production capabilities are unavailable', async () => {
    const service = {
      invoke: vi.fn(async (): Promise<OntologyCrossPackageResponse> => {
        throw new Error('PROJECT_TASK_SOURCE_UNAVAILABLE');
      }),
    };
    const harness = createHarness(service);

    const response = await harness.invoke(baseRequest);

    expect(response.success).toBe(false);
    expect(response.error?.code).toBe('CAPABILITY_NOT_READY');
    expect(response.error?.details).toMatchObject({
      ok: false,
      requestId: 'request-1',
      error: { category: 'unavailable', code: 'CAPABILITY_NOT_READY' },
    });
  });
});
