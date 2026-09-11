import type {
  ObservationContext,
  ObservationPolicy,
  ObservationResolutionInput,
} from './types';

const ROLE_POLICY: ObservationPolicy = {
  allowedKnowledgeKinds: ['world_fact', 'observation', 'mental_model'],
  allowPatternPromotion: true,
  minimumIndependentEvidence: 2,
  trustedSources: ['document', 'user_confirmation'],
  temporalMode: 'stable',
  conflictMode: 'conflict',
  patternApplicability: 'role-wide',
  promptTemplateId: 'observation.role-agent.v1',
};

const PROJECT_POLICY: ObservationPolicy = {
  allowedKnowledgeKinds: ['world_fact', 'observation', 'mental_model'],
  allowPatternPromotion: true,
  minimumIndependentEvidence: 1,
  trustedSources: ['document', 'user_confirmation', 'tool'],
  temporalMode: 'project-state',
  conflictMode: 'supersede',
  patternApplicability: 'project-local',
  promptTemplateId: 'observation.project.v1',
};

const SKILL_POLICY: ObservationPolicy = {
  allowedKnowledgeKinds: [],
  allowPatternPromotion: false,
  minimumIndependentEvidence: Number.POSITIVE_INFINITY,
  trustedSources: [],
  temporalMode: 'ephemeral',
  conflictMode: 'discard',
  patternApplicability: 'none',
  promptTemplateId: 'observation.standalone-skill.v1',
};

export class ObservationPolicyResolver {
  resolve(input: ObservationResolutionInput): ObservationContext {
    if (input.entryType === 'skill') {
      if (!input.callerOwner || !input.callerMode) {
        return {
          mode: 'standalone-skill',
          owner: { scope: 'session', ownerId: input.sessionId },
          provenance: this.provenance(input),
          policy: { ...SKILL_POLICY },
          persistent: false,
        };
      }
      return {
        mode: 'inherited-skill',
        owner: { ...input.callerOwner },
        provenance: this.provenance(input),
        policy: { ...(input.callerMode === 'project' ? PROJECT_POLICY : ROLE_POLICY) },
        persistent: true,
      };
    }
    if (input.entryType === 'project') {
      if (!input.projectId) throw new Error('Project observation requires projectId');
      return {
        mode: 'project',
        owner: { scope: 'project', ownerId: input.projectId },
        provenance: this.provenance(input),
        policy: { ...PROJECT_POLICY },
        persistent: true,
      };
    }
    if (!input.agentId) throw new Error('RoleAgent observation requires agentId');
    return {
      mode: 'role-agent',
      owner: { scope: 'agent', ownerId: input.agentId },
      provenance: this.provenance(input),
      policy: { ...ROLE_POLICY },
      persistent: true,
    };
  }

  private provenance(input: ObservationResolutionInput): ObservationContext['provenance'] {
    return {
      sessionId: input.sessionId,
      agentId: input.agentId,
      projectId: input.projectId,
      skillId: input.skillId,
    };
  }
}
