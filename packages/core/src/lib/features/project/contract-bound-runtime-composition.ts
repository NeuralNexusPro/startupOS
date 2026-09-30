// contract-bound 项目执行组合根——装配上述模块为唯一生产组合并 re-export 公共符号。

import {
  CollaborationExecutionStore,
  FileCollaborationMutationLock,
} from '../../../modules/collaboration-runtime/facade';
import { CanonicalOntologyOutcomeAdapter, VersionedContractVerifierRegistry } from '../../../modules/collaboration-runtime/integrations';
import {
  CanonicalOntologyOSDK,
  CanonicalOntologyStore,
} from '../ontology';
import {
  SolutionExecutionContractStore,
  type ContractIntegrityResult,
  type SolutionExecutionContract,
} from '../solution';
import { AgentManagerContractRuntime } from './composition/contract-artifact-runtime';
import {
  ArtifactOutcomeDrafts,
  ArtifactVerifier,
  CanonicalReadiness,
  ParentSessionHitl,
  artifactEvidenceSchema,
} from './composition/contract-execution-adapters';
import {
  ProjectContractTaskPriorityMutation,
  ProjectContractTaskRuntimeRecovery,
  RuntimeApprovedProjectTaskPort,
  createProjectEvidenceSink,
} from './composition/contract-task-session-adapters';
import { OntologyCrossPackageService } from './ontology-cross-package-service';
import { OntologyWorkItemRecovery } from './ontology-work-item-recovery';
import {
  AuthorizedProjectTaskSubscriptions,
  ProjectTaskEventAggregator,
} from './project-task-access-subscription';
import { ApprovedProjectTaskCreationService } from './project-task-creation';
import { RuntimeProjectTaskSource } from './project-task-source';
import { ProjectTaskBoardService } from './task-board';
import { ContractBoundAgentSkillWorker } from '../agent/server';

import type { AgentManager } from '../../integrations/pi-agent/agent-manager';
import type { AgentSessionService } from '../agent';
import type {
  ProjectContractRuntimeCompositionOptions,
  ProjectContractRuntimeComposition,
  ProjectContractRuntimeHostCapabilities,
} from './composition/contract-runtime-types';

export { ORIGINOS_ARTIFACT_VERIFIER_REF, ORIGINOS_ARTIFACT_EVIDENCE_SCHEMA_REF } from './composition/contract-runtime-types';
export type { ProjectContractRuntimeHostCapabilities, ProjectContractRuntimeCompositionOptions, ProjectContractRuntimeComposition } from './composition/contract-runtime-types';
export { ProjectContractTaskRuntimeRecovery, ProjectContractTaskPriorityMutation } from './composition/contract-task-session-adapters';

/**
 * The only production composition for contract-bound project execution.
 * Web and Desktop provide host singletons; all business adapters remain in Core.
 */
export function createProjectContractRuntimeComposition(
  options: ProjectContractRuntimeCompositionOptions,
): ProjectContractRuntimeComposition {
  const contractStore = new SolutionExecutionContractStore(options.dataRoot);
  const contractPort = options.contractPort ?? {
    load: contractStore.load.bind(contractStore),
    verifyIntegrity: async (contract: SolutionExecutionContract): Promise<ContractIntegrityResult> => contractStore.verifyIntegrity(contract),
  };
  const osdk = new CanonicalOntologyOSDK(new CanonicalOntologyStore(options.dataRoot));
  const verifier = new VersionedContractVerifierRegistry(
    [new ArtifactVerifier(options.dataRoot), ...(options.additionalVerifiers ?? [])],
    [artifactEvidenceSchema, ...(options.additionalEvidenceSchemas ?? [])],
  );
  const executionPort = new CollaborationExecutionStore(
    contractPort,
    options.dataRoot,
    {
      readiness: new CanonicalReadiness(options.dataRoot, osdk),
      worker: new ContractBoundAgentSkillWorker(
        new AgentManagerContractRuntime(options.dataRoot, options.host.agents),
      ),
      verifier,
      outcome: new CanonicalOntologyOutcomeAdapter(
        osdk,
        new ArtifactOutcomeDrafts(options.dataRoot),
      ),
      evidenceSink: createProjectEvidenceSink(options.host),
      hitl: new ParentSessionHitl(options.host.sessions),
      mutationLock: new FileCollaborationMutationLock(options.dataRoot),
      ...(options.hostId ? { hostId: options.hostId } : {}),
    },
  );
  const taskRuntimeRecovery = new ProjectContractTaskRuntimeRecovery(options.host);
  const reviewPort = typeof options.host.agents.requestTaskReview === 'function'
    && typeof options.host.agents.approveTaskCompletion === 'function'
    && typeof options.host.agents.rejectTaskReview === 'function'
    ? {
        requestReview: options.host.agents.requestTaskReview.bind(options.host.agents),
        approveCompletion: options.host.agents.approveTaskCompletion.bind(options.host.agents),
        rejectReview: options.host.agents.rejectTaskReview.bind(options.host.agents),
      }
    : undefined;
  const taskBoard = new ProjectTaskBoardService(
    new RuntimeProjectTaskSource(
      options.host.sessions,
      options.host.agents,
      executionPort,
      reviewPort,
      taskRuntimeRecovery,
    ),
    executionPort,
  );
  const taskCreation = new ApprovedProjectTaskCreationService(options.dataRoot, {
    contractPort,
    factPort: osdk,
    taskPort: new RuntimeApprovedProjectTaskPort(options.host, taskBoard),
    executionPort,
  });
  const taskPriority = new ProjectContractTaskPriorityMutation(options.host);
  const taskSubscriptions = new AuthorizedProjectTaskSubscriptions(
    options.projectAccess,
    new ProjectTaskEventAggregator(options.projectTaskChangeSources ?? [], options.hostId),
  );
  const service = new OntologyCrossPackageService({
    projectAccess: options.projectAccess,
    osdk,
    contractPort,
    contractCatalog: contractStore,
    executionPort,
    taskBoard,
    taskCreation,
    workItemRecovery: new OntologyWorkItemRecovery(executionPort),
    taskPriority,
    taskSubscriptions,
  });
  return { service, executionPort, taskBoard, contractPort, taskCreation, taskSubscriptions };
}

export function projectContractRuntimeHost(
  sessions: AgentSessionService,
  agents: AgentManager,
): ProjectContractRuntimeHostCapabilities {
  return { sessions, agents };
}
