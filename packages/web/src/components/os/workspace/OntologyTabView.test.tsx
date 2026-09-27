import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { OntologyTabView } from './OntologyTabView';

import type { CanonicalOntology } from '@originos/core/lib/features/ontology';

function ontology(name: string, revision: number): CanonicalOntology {
  const now = new Date('2026-09-27T00:00:00.000Z');
  return {
    id: 'ontology-project-1',
    projectId: 'project-1',
    name: '项目本体',
    schemaVersion: '1.0.0',
    version: '1.0.0',
    domains: [
      { id: 'domain-1', name, description: '', createdAt: now, updatedAt: now },
    ],
    concepts: [
      {
        id: 'concept-1',
        domainId: 'domain-1',
        name: '订单',
        type: 'entity',
        attributes: {},
        createdAt: now,
        updatedAt: now,
      },
    ],
    instances: [],
    properties: [],
    relations: [],
    businessStates: [],
    transitions: [],
    factTypes: [],
    rules: [],
    actions: [],
    events: [],
    projections: [],
    metadata: { 'originos.authoringRevision': revision },
    createdAt: now,
    updatedAt: now,
  };
}

function readEnvelope(value: CanonicalOntology) {
  return {
    success: true,
    data: {
      entry: {
        kind: 'canonical',
        ontology: { ontologyId: value.id, ontologyVersion: value.version },
      },
      ontology: value,
    },
  };
}

function response(body: unknown, ok = true): Response {
  return { ok, json: async () => body } as Response;
}

describe('OntologyTabView canonical authoring', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('submits the authoritative reference and replaces the local snapshot after an accepted update', async () => {
    const current = ontology('销售', 2);
    const updated = ontology('订单交付', 3);
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(response(readEnvelope(current)))
      .mockResolvedValueOnce(
        response({
          success: true,
          data: {
            ok: true,
            receipt: {
              operationId: 'operation',
              commandHash: 'hash',
              commandType: 'domain.update',
              status: 'accepted',
              beforeRevision: 2,
              afterRevision: 3,
              recordedAt: new Date(),
              summary: {
                ontologyId: updated.id,
                ontologyVersion: updated.version,
                projectId: updated.projectId,
                revision: 3,
                updatedAt: new Date(),
              },
            },
            ontology: updated,
          },
        })
      );

    render(<OntologyTabView projectId="project-1" />);
    await screen.findByText('销售');
    const editButton = screen.getAllByRole('button', { name: '编辑' })[0];
    expect(editButton).toBeDefined();
    await userEvent.click(editButton as HTMLElement);
    fireEvent.change(screen.getByLabelText('名称'), {
      target: { value: '订单交付' },
    });
    await userEvent.click(screen.getByRole('button', { name: /保存领域/ }));

    expect(await screen.findByText('订单交付')).toBeInTheDocument();
    expect(screen.getByText('编辑 revision 3')).toBeInTheDocument();
    const command = JSON.parse(
      String(fetchMock.mock.calls[1]?.[1]?.body)
    ) as Record<string, unknown>;
    expect(command).toMatchObject({
      projectId: 'project-1',
      ontologyId: 'ontology-project-1',
      ontologyVersion: '1.0.0',
      expectedRevision: 2,
      permissions: ['ontology:author'],
      type: 'domain.update',
      domainId: 'domain-1',
    });
    expect(command['operationId']).toEqual(
      expect.stringMatching(/^ontology-authoring-/)
    );
  });

  it('refreshes the authoritative snapshot and explains a revision conflict', async () => {
    const current = ontology('销售', 2);
    const authoritative = ontology('远端已更新领域', 4);
    vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(response(readEnvelope(current)))
      .mockResolvedValueOnce(
        response({
          success: true,
          data: {
            ok: false,
            issues: [
              {
                code: 'REVISION_CONFLICT',
                message: 'stale',
                severity: 'error',
              },
            ],
          },
        })
      )
      .mockResolvedValueOnce(response(readEnvelope(authoritative)));

    render(<OntologyTabView projectId="project-1" />);
    await screen.findByText('销售');
    const editButton = screen.getAllByRole('button', { name: '编辑' })[0];
    expect(editButton).toBeDefined();
    await userEvent.click(editButton as HTMLElement);
    fireEvent.change(screen.getByLabelText('名称'), {
      target: { value: '本地名称' },
    });
    await userEvent.click(screen.getByRole('button', { name: /保存领域/ }));

    expect(await screen.findByText('远端已更新领域')).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent(
      '本体已被其他操作更新，已刷新为最新内容，请重新提交。'
    );
    await waitFor(() => expect(globalThis.fetch).toHaveBeenCalledTimes(3));
  });
});
