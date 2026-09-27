/**
 * 供项目生命周期与 Agent prompt 边界共享的只读本体入口 DTO。
 * 完整 canonical schema 仍由 ontology feature 持有。
 */
export interface ProjectOntologyRef {
  ontologyId: string;
  ontologyVersion: string;
}

export interface ProjectCanonicalOntologySummary extends ProjectOntologyRef {
  name: string;
  domainCount: number;
  conceptCount: number;
}

export type ProjectOntologyEntryResult =
  | {
      kind: 'canonical';
      ontology: ProjectCanonicalOntologySummary;
    }
  | {
      kind: 'legacy_migration_required';
      migrationAvailable: true;
    }
  | {
      kind: 'not_found';
    };
