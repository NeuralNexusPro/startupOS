import {
  CanonicalOntologyOSDK,
  CanonicalOntologyStore,
} from '@originos/core/lib/features/ontology';
import {
  OntologyCrossPackageService,
  ProjectTaskBoardService,
  type ProjectTaskSource,
} from '@originos/core/lib/features/project';
import type {
  OntologyCrossPackageWorkItemRecoveryInput,
  OntologyCrossPackageWorkItemRecoveryPort,
} from '@originos/core/lib/features/project';
import { SolutionExecutionContractStore } from '@originos/core/lib/features/solution';
import { getDataRoot } from '@originos/core/lib/paths';

import { CollaborationExecutionStore } from '@originos/core/modules/collaboration-runtime/facade';

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
    load: (
      input: Parameters<SolutionExecutionContractStore['load']>[0]
    ): ReturnType<SolutionExecutionContractStore['load']> => contractStore.load(input),
    verifyIntegrity: async (
      contract: Parameters<SolutionExecutionContractStore['verifyIntegrity']>[0]
    ): Promise<ReturnType<SolutionExecutionContractStore['verifyIntegrity']>> => contractStore.verifyIntegrity(contract),
  };
  const execution = new CollaborationExecutionStore(contractPort, dataRoot);
  const taskBoard = new ProjectTaskBoardService(
    new UnavailableProjectTaskSource(),
    execution
  );
  return new OntologyCrossPackageService({
    osdk: new CanonicalOntologyOSDK(new CanonicalOntologyStore(dataRoot)),
    contractPort,
    executionPort: execution,
    taskBoard,
    workItemRecovery: new UnavailableWorkItemRecovery(),
  });
}
