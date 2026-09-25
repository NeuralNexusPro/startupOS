import { agentSessionService } from '@originos/core/lib/features/agent';
import { agentManager } from '@originos/core/lib/features/agent/server';
import {
  createProjectContractRuntimeComposition,
  projectContractRuntimeHost,
  type OntologyCrossPackageService,
} from '@originos/core/lib/features/project';
import { getDataRoot } from '@originos/core/lib/paths';

/** Web is a thin host adapter. Core owns the complete production composition. */
export function createOntologyCrossPackageService(): OntologyCrossPackageService {
  return createProjectContractRuntimeComposition({
    dataRoot: getDataRoot(),
    host: projectContractRuntimeHost(agentSessionService, agentManager),
  }).service;
}
