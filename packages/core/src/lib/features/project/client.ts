/** Browser-safe project contract. Keep runtime services behind the server entry. */
export { ONTOLOGY_CROSS_PACKAGE_CONTRACT_VERSION } from './ontology-cross-package-contract';
export type {
  OntologyCrossPackageError,
  OntologyCrossPackageRequest,
  OntologyCrossPackageResponse,
} from './ontology-cross-package-contract';
export type {
  ProjectTaskAction,
  ProjectTaskDetail,
  ProjectTaskPage,
} from './task-board';
