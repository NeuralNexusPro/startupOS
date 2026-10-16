import { agentSessionService } from '@originos/core/lib/features/agent';
import { agentManager } from '@originos/core/lib/features/agent/server';
import {
  createProjectContractRuntimeComposition,
  projectContractRuntimeHost,
  type OntologyCrossPackageService,
  type ProjectContractRuntimeComposition,
} from '@originos/core/lib/features/project';
import { getDataRoot } from '@originos/core/lib/paths';

let composition: ProjectContractRuntimeComposition | undefined;

/** Web is a thin host adapter. Core owns the complete production composition. */
export function getProjectContractRuntimeComposition(): ProjectContractRuntimeComposition {
  composition ??= createProjectContractRuntimeComposition({
    dataRoot: getDataRoot(),
    host: projectContractRuntimeHost(agentSessionService, agentManager),
  });
  return composition;
}

export function createOntologyCrossPackageService(): OntologyCrossPackageService {
  return getProjectContractRuntimeComposition().service;
}
