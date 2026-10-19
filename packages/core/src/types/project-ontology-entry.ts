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
  /** Optional while callers compiled against the earlier summary DTO upgrade. */
  relationCount?: number;
  factTypeCount?: number;
  /** 尚未由任何 FactType 描述数据形态的概念数量。 */
  factTypeGapCount?: number;
  /** 供访谈恢复时逐项补全数据形态的业务名称。 */
  factTypeGapNames?: readonly string[];
  actionCount?: number;
  ruleCount?: number;
  businessStateCount?: number;
  transitionCount?: number;
  /** 单据类概念中尚未完成原子字段拆解的数量。 */
  documentFieldGapCount?: number;
  /** 供项目访谈恢复和收尾提醒使用的业务名称，不包含字段正文。 */
  documentFieldGapNames?: readonly string[];
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
