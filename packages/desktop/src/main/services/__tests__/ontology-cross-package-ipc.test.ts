import type { IpcMainInvokeEvent } from 'electron';

import type { IpcResponse } from '@originos/core/lib/integrations/electron/ipc-protocol';
import type {
  OntologyCrossPackageRequest,
  OntologyCrossPackageResponse,
  OntologyCrossPackageTransportPort,
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
    const sender = { id: 7 };
    const response = await handler({ sender } as IpcMainInvokeEvent, request);
    return response as IpcResponse<OntologyCrossPackageResponse>;
  };

  return { handlers, invoke };
}

describe('OntologyCrossPackageIpcController', () => {
  it('registers the cross-package channel', () => {
    const service = { invoke: vi.fn() };
    const harness = createHarness(service);

    expect([...harness.handlers.keys()]).toEqual([
      IPC_CHANNELS.ONTOLOGY_CROSS_PACKAGE_INVOKE,
    ]);
    expect(IPC_CHANNELS.ONTOLOGY_CROSS_PACKAGE_INVOKE).toBe('ontology:cross-package:invoke');
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
