/** Browser-safe project contract. Keep runtime services behind the server entry. */
export { ONTOLOGY_CROSS_PACKAGE_CONTRACT_VERSION } from './ontology-cross-package-contract';
export type {
  OntologyCrossPackageHandoffCandidatesData,
  OntologyCrossPackageError,
  OntologyCrossPackageRequest,
  OntologyCrossPackageResponse,
  OntologyApprovedProjectTaskData,
  OntologyApprovedTaskContractSummary,
  OntologyApprovedTaskTemplateCatalogData,
  OntologyApprovedTaskTemplateSummary,
  OntologyCrossPackageTaskPriorityData,
  OntologyCrossPackageWorkItemHandoffData,
} from './ontology-cross-package-contract';
export type { ProjectTaskSemanticInput } from './project-task-creation';
export type { AgentTaskProjectPriorityV1 } from '../../integrations/pi-agent/task-runtime';
export type { WorkItemHandoffCandidate } from '../../../modules/collaboration-runtime/facade';
export type {
  ProjectTaskAction,
  ProjectTaskBoardStatus,
  ProjectTaskDetail,
  ProjectTaskEvidenceGap,
  ProjectTaskPage,
  ProjectTaskSummary,
} from './task-board';
export type {
  ProjectTaskSubscriptionEvent,
  ProjectTaskSubscriptionTermination,
} from './project-task-access-subscription';
