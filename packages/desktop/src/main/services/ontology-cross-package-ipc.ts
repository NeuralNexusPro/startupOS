import type { IpcMainInvokeEvent } from 'electron';

import type { IpcResponse } from '@originos/core/lib/integrations/electron/ipc-protocol';
import {
  CanonicalOntologyOSDK,
  CanonicalOntologyStore,
} from '@originos/core/lib/features/ontology';
import {
  OntologyCrossPackageService,
  ProjectTaskBoardService,
  type OntologyCrossPackageRequest,
  type OntologyCrossPackageResponse,
  type OntologyCrossPackageTransportPort,
  type OntologyCrossPackageWorkItemRecoveryInput,
  type OntologyCrossPackageWorkItemRecoveryPort,
  type ProjectTaskSource,
} from '@originos/core/lib/features/project';
import { SolutionExecutionContractStore } from '@originos/core/lib/features/solution';
import { getDataRoot } from '@originos/core/lib/paths';

import { CollaborationExecutionStore } from '@originos/core/modules/collaboration-runtime/facade';

import { IPC_CHANNELS } from '../ipc-protocol';

interface IpcRegistrar {
  handle(
    channel: string,
    listener: (event: IpcMainInvokeEvent, request: unknown) => Promise<unknown>
  ): void;
}

const REQUEST_TYPES = new Set([
  'read_semantic_context',
  'query_facts',
  'query_projection',
  'submit_action',
  'start_bound_task',
  'inspect_bound_task',
  'control_bound_task',
]);

class UnavailableProjectTaskSource implements ProjectTaskSource {
  async list(): Promise<never> {
    throw new Error('PROJECT_TASK_SOURCE_UNAVAILABLE');
  }

  async get(): Promise<never> {
    throw new Error('PROJECT_TASK_SOURCE_UNAVAILABLE');
  }

  async control(): Promise<never> {
    throw new Error('PROJECT_TASK_SOURCE_UNAVAILABLE');
  }
}

class UnavailableWorkItemRecovery implements OntologyCrossPackageWorkItemRecoveryPort {
  async reconcile(
    _input: OntologyCrossPackageWorkItemRecoveryInput
  ): Promise<never> {
    throw new Error('WORK_ITEM_RECOVERY_UNAVAILABLE');
  }
}

export function createOntologyCrossPackageService(): OntologyCrossPackageService {
  const dataRoot = getDataRoot();
  const contractStore = new SolutionExecutionContractStore(dataRoot);
  const contractPort = {
    load: contractStore.load.bind(contractStore),
    verifyIntegrity: async (
      contract: Parameters<SolutionExecutionContractStore['verifyIntegrity']>[0]
    ): Promise<ReturnType<SolutionExecutionContractStore['verifyIntegrity']>> =>
      contractStore.verifyIntegrity(contract),
  };
  const executionPort = new CollaborationExecutionStore(contractPort, dataRoot);
  return new OntologyCrossPackageService({
    osdk: new CanonicalOntologyOSDK(new CanonicalOntologyStore(dataRoot)),
    contractPort,
    executionPort,
    taskBoard: new ProjectTaskBoardService(
      new UnavailableProjectTaskSource(),
      executionPort
    ),
    workItemRecovery: new UnavailableWorkItemRecovery(),
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object';
}

function isCrossPackageRequest(value: unknown): value is OntologyCrossPackageRequest {
  if (!isRecord(value)) {
    return false;
  }
  const requestId = value['requestId'];
  const projectId = value['projectId'];
  const type = value['type'];
  const expectedRevision = value['expectedRevision'];
  return value['contractVersion'] === '1'
    && typeof requestId === 'string'
    && requestId.trim().length > 0
    && typeof projectId === 'string'
    && projectId.trim().length > 0
    && typeof type === 'string'
    && REQUEST_TYPES.has(type)
    && ((type !== 'submit_action' && type !== 'control_bound_task')
      || (Number.isSafeInteger(expectedRevision) && (expectedRevision as number) >= 0));
}

function success(data: OntologyCrossPackageResponse): IpcResponse<OntologyCrossPackageResponse> {
  return {
    success: true,
    data,
    timestamp: new Date().toISOString(),
  };
}

function transportFailure(code: string): IpcResponse<OntologyCrossPackageResponse> {
  return {
    success: false,
    error: {
      code,
      message: 'The request was rejected at the transport boundary',
    },
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
      code: response.error.issues[0]?.code ?? 'ONTOLOGY_CROSS_PACKAGE_ERROR',
      message: response.error.remediation,
      details: response,
    },
    timestamp: new Date().toISOString(),
  };
}

export interface OntologyCrossPackageIpcControllerOptions {
  readonly ipc: IpcRegistrar;
  readonly service: OntologyCrossPackageTransportPort;
  readonly isTrustedSender: (sender: IpcMainInvokeEvent['sender']) => boolean;
}

export class OntologyCrossPackageIpcController {
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
  }
}
