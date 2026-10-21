import { describe, expect, it } from 'vitest';

import {
  parseOntologyFactRef,
  serializeOntologyFactRef,
} from '../ontology-fact-reference';

describe('ontology fact references', () => {
  it('round-trips business fact keys containing colons and Unicode characters', () => {
    const ref = {
      ontologyId: 'ontology-project',
      ontologyVersion: '1.0.0',
      conceptId: 'concept-philosophy',
      factTypeId: 'fact-type-entry',
      factId: 'philosophy-entry:多端共享同一核心',
      factVersion: '1',
    };

    const encoded = serializeOntologyFactRef(ref);

    expect(encoded).toContain('ontology-fact:v1:');
    expect(encoded).not.toContain('多端共享同一核心');
    expect(parseOntologyFactRef(encoded)).toEqual(ref);
  });

  it('continues to read legacy seven-segment references', () => {
    expect(parseOntologyFactRef('ontology-fact:orders:1:order:ready:fact-1:1')).toEqual({
      ontologyId: 'orders',
      ontologyVersion: '1',
      conceptId: 'order',
      factTypeId: 'ready',
      factId: 'fact-1',
      factVersion: '1',
    });
  });

  it('recovers legacy references whose business fact key contains colons', () => {
    expect(parseOntologyFactRef(
      'ontology-fact:ontology-project:1:concept-philosophy:fact-type-entry:philosophy-entry:多端共享同一核心:1',
    )).toMatchObject({
      factTypeId: 'fact-type-entry',
      factId: 'philosophy-entry:多端共享同一核心',
      factVersion: '1',
    });
  });
});
