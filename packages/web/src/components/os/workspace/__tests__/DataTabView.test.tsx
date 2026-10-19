import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { CanonicalOntology } from '@originos/core/lib/features/ontology/types';

const { loadProjectCanonicalOntology } = vi.hoisted(() => ({
  loadProjectCanonicalOntology: vi.fn(),
}));

vi.mock('../project-canonical-ontology', async () => {
  const actual = await vi.importActual<typeof import('../project-canonical-ontology')>('../project-canonical-ontology');
  return { ...actual, loadProjectCanonicalOntology };
});

vi.mock('../../../interview/OntologyGraph', () => ({
  OntologyGraph: ({ onEntityClick }: { onEntityClick?: (name: string) => void }) => (
    <button type="button" onClick={() => onEntityClick?.('员工')}>测试本体图谱</button>
  ),
}));

import { DataTabView } from '../DataTabView';

const instant = new Date('2026-10-13T00:00:00.000Z');
const ontology: CanonicalOntology = {
  id: 'ontology-project-1', projectId: 'project-1', name: '行政办公', schemaVersion: '1.0.0', version: '1.0.0',
  domains: [{ id: 'domain-1', name: '行政办公', description: '', createdAt: instant, updatedAt: instant }],
  concepts: [{ id: 'concept-employee', domainId: 'domain-1', name: '员工', type: 'class', attributes: {}, createdAt: instant, updatedAt: instant }],
  instances: [{ id: 'employee-1', conceptId: 'concept-employee', data: { 姓名: '李明' }, createdAt: instant, updatedAt: instant }],
  properties: [{ id: 'property-name', conceptId: 'concept-employee', name: '姓名', valueType: 'string', required: true }],
  relations: [], businessStates: [], transitions: [], factTypes: [], rules: [], actions: [], events: [], projections: [],
  createdAt: instant, updatedAt: instant,
};

describe('DataTabView', () => {
  beforeEach(() => {
    loadProjectCanonicalOntology.mockReset().mockResolvedValue({
      entry: { kind: 'canonical' },
      ontology,
    });
  });

  it('opens with the ontology graph and links a selected concept to its instances', async () => {
    render(<DataTabView projectId="project-1" />);

    expect(await screen.findByText('本体关系图谱')).not.toBeNull();
    fireEvent.click(screen.getByRole('button', { name: '测试本体图谱' }));
    expect(screen.getByText('员工')).not.toBeNull();
    expect(screen.getByText('实例 1')).not.toBeNull();
    expect(screen.getByText('李明')).not.toBeNull();
  });

  it('keeps the canonical instance list available as a second view', async () => {
    render(<DataTabView projectId="project-1" />);
    await screen.findByText('本体关系图谱');
    fireEvent.click(screen.getByRole('button', { name: /列表/ }));
    expect(screen.getByText('李明')).not.toBeNull();
  });
});
