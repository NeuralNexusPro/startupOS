import type { CanonicalSemanticKind } from '@originos/core/lib/features/ontology/types';

export const SEMANTIC_KIND_OPTIONS: readonly CanonicalSemanticKind[] = [
  'role',
  'organization',
  'object',
  'activity',
  'document',
  'standard',
  'unclassified',
];

const SEMANTIC_KIND_LABELS: Record<CanonicalSemanticKind, string> = {
  role: '角色',
  organization: '组织',
  object: '业务对象',
  activity: '业务活动',
  document: '单据',
  standard: '规范',
  unclassified: '待分类',
};

export function semanticKindLabel(kind?: CanonicalSemanticKind): string {
  return SEMANTIC_KIND_LABELS[kind ?? 'unclassified']!;
}

/** Suggestions are deliberately local previews; they never write a concept. */
export function suggestSemanticKind(name: string): CanonicalSemanticKind {
  if (/(人员|员工|用户|客户|供应商|经理|专员|负责人)$/.test(name)) return 'role';
  if (/(公司|企业|部门|团队|机构|门店)$/.test(name)) return 'organization';
  if (/(流程|申请|审批|交付|生产|盘点|发货|入库|出库)$/.test(name)) return 'activity';
  if (/(订单|工单|合同|发票|报告|表单|单据|凭证)$/.test(name)) return 'document';
  if (/(规则|规范|标准|制度|政策)$/.test(name)) return 'standard';
  return 'object';
}
