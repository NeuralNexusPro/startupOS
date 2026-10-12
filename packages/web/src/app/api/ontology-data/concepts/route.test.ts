import { NextRequest } from 'next/server';

import { describe, expect, it } from 'vitest';

import { DELETE as deleteConceptById } from './[id]/route';
import { GET as getConceptSchema, PUT as updateConceptSchema } from './[id]/schema/route';
import { POST as createConcept } from './route';
import { DELETE as deleteDomain } from '../domains/[id]/route';
import { POST as createDomain } from '../domains/route';
import { PUT as updateInstance, DELETE as deleteInstance } from '../instances/[id]/route';
import { POST as revertVersion } from '../instances/[id]/versions/[ver]/revert/route';
import { POST as saveVersion } from '../instances/[id]/versions/route';
import { POST as createInstance } from '../instances/route';
import { POST as createConceptRelation, DELETE as deleteConceptRelation } from '../relations/concepts/route';
import { POST as createInstanceRelation, DELETE as deleteInstanceRelation } from '../relations/instances/route';
import { POST as syncOntology } from '../sync/route';

const WRITE_HANDLERS: Array<[string, () => Promise<Response>]> = [
  ['POST /api/ontology-data/concepts', createConcept],
  ['DELETE /api/ontology-data/concepts/[id]', deleteConceptById],
  ['PUT /api/ontology-data/concepts/[id]/schema', updateConceptSchema],
  ['POST /api/ontology-data/domains', createDomain],
  ['DELETE /api/ontology-data/domains/[id]', deleteDomain],
  ['POST /api/ontology-data/instances', createInstance],
  ['PUT /api/ontology-data/instances/[id]', updateInstance],
  ['DELETE /api/ontology-data/instances/[id]', deleteInstance],
  ['POST /api/ontology-data/instances/[id]/versions', saveVersion],
  ['POST /api/ontology-data/instances/[id]/versions/[ver]/revert', revertVersion],
  ['POST /api/ontology-data/relations/concepts', createConceptRelation],
  ['DELETE /api/ontology-data/relations/concepts', deleteConceptRelation],
  ['POST /api/ontology-data/relations/instances', createInstanceRelation],
  ['DELETE /api/ontology-data/relations/instances', deleteInstanceRelation],
  ['POST /api/ontology-data/sync', syncOntology],
];

describe('legacy ontology-data write handlers are rejected', () => {
  for (const [label, handler] of WRITE_HANDLERS) {
    it(`${label} returns 405 CANONICAL_EDIT_UNAVAILABLE`, async () => {
      const response = await handler();
      const body = await response.json();

      expect(response.status).toBe(405);
      expect(body).toMatchObject({
        success: false,
        error: { code: 'CANONICAL_EDIT_UNAVAILABLE' },
      });
      expect(JSON.stringify(body)).not.toContain('fs.writeFile');
    });
  }
});

describe('legacy ontology-data read handlers stay available', () => {
  it('schema GET rejects unsafe concept ids before any file read', async () => {
    const response = await getConceptSchema(
      new NextRequest('http://localhost/api/ontology-data/concepts/x/schema?ontologyId=ontology-project-1'),
      { params: Promise.resolve({ id: '../escape' }) }
    );
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ error: { code: 'INVALID_REQUEST' } });
  });
});
