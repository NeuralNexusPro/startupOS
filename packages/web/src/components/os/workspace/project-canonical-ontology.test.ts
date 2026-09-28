import { describe, expect, it } from 'vitest';

import { canonicalToOntologyModel } from './project-canonical-ontology';

describe('canonical project ontology display adapter', () => {
  it('projects canonical concepts and properties without a legacy model fallback', () => {
    const model = canonicalToOntologyModel({
      id: 'ontology-project-1', projectId: 'project-1', name: '项目本体', schemaVersion: '1.0.0', version: '1.0.0',
      domains: [{ id: 'domain-1', name: '领域', description: '', createdAt: new Date(0), updatedAt: new Date(0) }],
      concepts: [
        { id: 'concept-1', domainId: 'domain-1', name: '订单', type: 'entity', semanticKind: 'document', attributes: {}, createdAt: new Date(0), updatedAt: new Date(0) },
        { id: 'concept-2', domainId: 'domain-1', name: '客户', type: 'entity', attributes: {}, createdAt: new Date(0), updatedAt: new Date(0) },
      ],
      instances: [],
      properties: [{ id: 'property-1', conceptId: 'concept-1', name: '编号', valueType: 'string', required: true }],
      relations: [{ id: 'relation-1', name: '创建', sourceConceptId: 'concept-1', targetConceptId: 'concept-2', cardinality: 'one-to-many' }], businessStates: [], transitions: [], factTypes: [], rules: [], actions: [], events: [], projections: [],
      createdAt: new Date(0), updatedAt: new Date(0),
    });

    expect(model).toMatchObject({
      id: 'ontology-project-1',
      nodes: [
        { id: 'concept-1', name: '订单', semanticKind: 'document', children: [{ id: 'property-1', name: '编号' }] },
        { id: 'concept-2', name: '客户' },
        { id: 'relation-1', name: '订单 → 客户', type: 'relationship', description: '创建', sourceConceptId: 'concept-1', targetConceptId: 'concept-2', relationName: '创建' },
      ],
    });
  });

  it('keeps rules first-class while projecting them beneath relationships and actions', () => {
    const model = canonicalToOntologyModel({
      id: 'ontology-project-1', projectId: 'project-1', name: '项目本体', schemaVersion: '1.0.0', version: '1.0.0',
      domains: [{ id: 'domain-1', name: '领域', description: '', createdAt: new Date(0), updatedAt: new Date(0) }],
      concepts: [{ id: 'concept-batch', domainId: 'domain-1', name: '来料批次', type: 'entity', attributes: {}, createdAt: new Date(0), updatedAt: new Date(0) }],
      instances: [], properties: [],
      relations: [{ id: 'relation-1', name: '约束', sourceConceptId: 'concept-batch', targetConceptId: 'concept-batch', cardinality: 'one-to-one', ruleIds: ['rule-accept'] }],
      businessStates: [{ id: 'state-pending', conceptId: 'concept-batch', name: '待验收' }, { id: 'state-passed', conceptId: 'concept-batch', name: '已验收' }],
      transitions: [{ id: 'transition-accept', conceptId: 'concept-batch', name: '验收通过', fromStateId: 'state-pending', toStateId: 'state-passed', actionId: 'action-accept', ruleIds: ['rule-accept'] }],
      factTypes: [{ id: 'fact-input', conceptId: 'concept-batch', name: '待验收批次', propertyIds: [] }, { id: 'fact-output', conceptId: 'concept-batch', name: '验收结果', propertyIds: [] }],
      rules: [{ id: 'rule-accept', name: '检验合格后入库', kind: 'precondition', expression: { operator: 'passed' }, severity: 'error', description: '必须通过检验' }],
      actions: [{ id: 'action-accept', name: '验收来料', conceptId: 'concept-batch', inputFactTypeIds: ['fact-input'], outputFactTypeIds: ['fact-output'], fromStateIds: ['state-pending'], toStateId: 'state-passed', ruleIds: ['rule-accept'], permissions: ['quality.accept'] }],
      events: [], projections: [], createdAt: new Date(0), updatedAt: new Date(0),
    });

    expect(model.nodes.find((node) => node.id === 'relation-1')).toMatchObject({ ruleIds: ['rule-accept'] });
    expect(model.behaviorContracts).toMatchObject({
      rules: [{ id: 'rule-accept', name: '检验合格后入库' }],
      actions: [{ id: 'action-accept', objectName: '来料批次', inputFactTypes: ['待验收批次'], outputFactTypes: ['验收结果'], beforeStates: ['待验收'], afterState: '已验收', ruleIds: ['rule-accept'] }],
      transitions: [{ id: 'transition-accept', actionName: '验收来料', ruleIds: ['rule-accept'] }],
    });
  });
});
