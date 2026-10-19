import { render, screen } from '@testing-library/react';
import { beforeAll, describe, expect, it, vi } from 'vitest';

import type { OntologyModel } from '@originos/core/types';

import { OntologyGraph } from '../OntologyGraph';

beforeAll(() => {
  vi.stubGlobal('ResizeObserver', class {
    observe(): void {}
    disconnect(): void {}
  });
  HTMLCanvasElement.prototype.getContext = vi.fn(() => null) as typeof HTMLCanvasElement.prototype.getContext;
});

describe('OntologyGraph', () => {
  it('renders organizations and roles as regular graph classifications', () => {
    const ontology = {
      id: 'quality',
      name: '供应商质量',
      description: '供应商质量业务模型',
      nodes: [
        { id: 'quality-center', name: '质量中心', type: 'entity', semanticKind: 'organization' },
        { id: 'sqe', name: 'SQE', type: 'entity', semanticKind: 'role' },
        { id: 'audit', name: '供应商审核', type: 'entity', semanticKind: 'activity' },
        { id: 'relation-role-audit', name: 'SQE → 供应商审核', type: 'relationship', sourceConceptId: 'sqe', targetConceptId: 'audit', relationName: '负责' },
      ],
      createdAt: Date.now(),
    } as unknown as OntologyModel;

    const { container } = render(<OntologyGraph ontology={ontology} />);

    expect(container.querySelector('canvas')).not.toBeNull();
    expect(screen.queryByText('暂无符合筛选条件的概念')).toBeNull();
    expect(screen.queryByLabelText('角色泳道')).toBeNull();
    expect(screen.getByRole('button', { name: '组织' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '角色' })).toBeInTheDocument();
  });

  it('renders a graph when the ontology only contains organizations', () => {
    const ontology = {
      id: 'organization-only',
      name: '组织信息',
      description: '只有组织背景信息的业务模型',
      nodes: [{ id: 'quality-center', name: '质量中心', type: 'entity', semanticKind: 'organization' }],
      createdAt: Date.now(),
    } as unknown as OntologyModel;

    const { container } = render(<OntologyGraph ontology={ontology} />);

    expect(container.querySelector('canvas')).not.toBeNull();
    expect(screen.queryByText('暂无符合筛选条件的概念')).toBeNull();
  });
});
