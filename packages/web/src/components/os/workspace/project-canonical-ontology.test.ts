import { describe, expect, it } from 'vitest';

import { canonicalToOntologyModel } from './project-canonical-ontology';

describe('canonical project ontology display adapter', () => {
  it('projects canonical concepts and properties without a legacy model fallback', () => {
    const model = canonicalToOntologyModel({
      id: 'ontology-project-1', projectId: 'project-1', name: '项目本体', schemaVersion: '1.0.0', version: '1.0.0',
      domains: [{ id: 'domain-1', name: '领域', description: '', createdAt: new Date(0), updatedAt: new Date(0) }],
      concepts: [{ id: 'concept-1', domainId: 'domain-1', name: '订单', type: 'entity', attributes: {}, createdAt: new Date(0), updatedAt: new Date(0) }],
      instances: [],
      properties: [{ id: 'property-1', conceptId: 'concept-1', name: '编号', valueType: 'string', required: true }],
      relations: [], businessStates: [], transitions: [], factTypes: [], rules: [], actions: [], events: [], projections: [],
      createdAt: new Date(0), updatedAt: new Date(0),
    });

    expect(model).toMatchObject({
      id: 'ontology-project-1',
      nodes: [{ id: 'concept-1', name: '订单', children: [{ id: 'property-1', name: '编号' }] }],
    });
  });
});
