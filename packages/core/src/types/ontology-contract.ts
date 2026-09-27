/** Shared declaration types only; semantic validation belongs to the ontology feature. */
export interface CanonicalOntologyReference {
  ontologyId: string;
  ontologyVersion: string;
}

export interface CanonicalConceptReference extends CanonicalOntologyReference {
  conceptId: string;
}

export interface CanonicalInputFact {
  factType: CanonicalConceptReference & { factTypeId: string };
  required: boolean;
}

export interface CanonicalOutputFact {
  factType: CanonicalConceptReference & { factTypeId: string };
  required: boolean;
}

export interface CanonicalActionBinding {
  actionId: string;
  concept: CanonicalConceptReference;
}

export interface CanonicalAgentContract {
  agentId: string;
  ontology: CanonicalOntologyReference;
  inputs: CanonicalInputFact[];
  outputs: CanonicalOutputFact[];
  actions: CanonicalActionBinding[];
  permissions: string[];
}

export interface CanonicalSkillContract {
  skillId: string;
  ontology: CanonicalOntologyReference;
  inputs: CanonicalInputFact[];
  outputs: CanonicalOutputFact[];
  actions: CanonicalActionBinding[];
  permissions: string[];
}

export type CanonicalContract = CanonicalAgentContract | CanonicalSkillContract;

