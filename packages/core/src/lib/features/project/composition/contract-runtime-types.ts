// contract-bound runtime composition 的协议常量与 host/组合类型定义。

import type { CollaborationExecutionPort } from '../../../../modules/collaboration-runtime/facade';
import type {
  VersionedContractVerifier,
  VersionedEvidenceSchema,
} from '../../../../modules/collaboration-runtime/integrations';
import type { AgentSession, AgentMessage, CreateSessionRequest } from '../../../../types/agent';
import type { AgentManager } from '../../../integrations/pi-agent/agent-manager';
import type { AgentTaskRuntimePersistenceV1 } from '../../../integrations/pi-agent/task-runtime';
import type { SolutionExecutionContractPort } from '../../solution';
import type { OntologyCrossPackageService } from '../ontology-cross-package-service';
import type {
  ProjectAccessPort,
  ProjectTaskChangeSourcePort,
  ProjectTaskSubscriptionPort,
} from '../project-task-access-subscription';
import type { ApprovedProjectTaskCreationService } from '../project-task-creation';
import type { ProjectTaskBoardService } from '../task-board';

export const ORIGINOS_ARTIFACT_VERIFIER_REF = 'originos.artifact-output@1.0.0';
export const ORIGINOS_ARTIFACT_EVIDENCE_SCHEMA_REF = 'originos.artifact-evidence@1.0.0';

export interface ContractArtifactEnvelope {
  readonly schemaVersion: '1.0.0';
  readonly requestId: string;
  readonly runId: string;
  readonly workItemId: string;
  readonly attemptId: string;
  readonly targetId: string;
  readonly content: string;
  readonly createdAt: string;
}

export interface ProjectContractSessionPort {
  createSession(request: CreateSessionRequest): Promise<AgentSession>;
  listTaskRuntimeSessions(projectId: string): Promise<readonly {
    readonly sessionId: string;
    readonly projectId: string;
    readonly updatedAt: number;
    readonly taskRuntime: AgentTaskRuntimePersistenceV1;
  }[]>;
  getSession(sessionId: string, projectId?: string): Promise<AgentSession | null>;
  updateSession(
    sessionId: string,
    updates: { readonly taskRuntime?: AgentTaskRuntimePersistenceV1 },
    projectId?: string,
  ): Promise<AgentSession | null>;
  addMessage(
    sessionId: string,
    message: Omit<AgentMessage, 'id' | 'timestamp'>,
    projectId?: string,
  ): Promise<AgentSession | null>;
}

export interface ProjectContractRuntimeHostCapabilities {
  readonly sessions: ProjectContractSessionPort;
  readonly agents: Pick<
    AgentManager,
    'getOrCreateAgent' | 'getOrCreateTaskRuntime' | 'removeAgent' | 'getTaskRuntimeSnapshot' | 'controlTaskRuntime'
    | 'requestTaskReview' | 'approveTaskCompletion' | 'rejectTaskReview'
  >;
}

export interface ProjectContractRuntimeCompositionOptions {
  readonly dataRoot: string;
  readonly host: ProjectContractRuntimeHostCapabilities;
  readonly hostId?: string;
  readonly additionalVerifiers?: readonly VersionedContractVerifier[];
  readonly additionalEvidenceSchemas?: readonly VersionedEvidenceSchema[];
  readonly contractPort?: SolutionExecutionContractPort;
  readonly projectAccess?: ProjectAccessPort;
  readonly projectTaskChangeSources?: readonly ProjectTaskChangeSourcePort[];
}

export interface ProjectContractRuntimeComposition {
  readonly service: OntologyCrossPackageService;
  readonly executionPort: CollaborationExecutionPort;
  readonly taskBoard: ProjectTaskBoardService;
  readonly contractPort: SolutionExecutionContractPort;
  readonly taskCreation: ApprovedProjectTaskCreationService;
  readonly taskSubscriptions: ProjectTaskSubscriptionPort;
}
