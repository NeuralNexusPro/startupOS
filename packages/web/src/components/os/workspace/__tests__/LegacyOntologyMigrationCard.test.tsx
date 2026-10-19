import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { LegacyOntologyMigrationCard } from '../LegacyOntologyMigrationCard';

describe('LegacyOntologyMigrationCard', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('previews first and migrates only after the user confirms', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          success: true,
          data: {
            mode: 'dry-run',
            sourceKind: 'ontology',
            ontology: { concepts: [{ id: 'concept-1' }], properties: [{ id: 'property-1' }], relations: [] },
            diagnostics: [],
          },
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true, data: { mode: 'migrated', ontology: {} } }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          success: true,
          data: { entry: { kind: 'canonical', ontology: { ontologyId: 'ontology-project-1' } }, ontology: { id: 'ontology-project-1' } },
        }),
      });
    vi.stubGlobal('fetch', fetchMock);
    const onMigrated = vi.fn();
    render(<LegacyOntologyMigrationCard projectId="project-1" onMigrated={onMigrated} />);

    fireEvent.click(screen.getByRole('button', { name: '检查迁移内容' }));
    expect(await screen.findByText('将迁移 1 个概念、1 个属性、0 条关系')).toBeInTheDocument();
    expect(onMigrated).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: '确认迁移' }));
    await waitFor(() => expect(onMigrated).toHaveBeenCalledTimes(1));
    expect(JSON.parse(fetchMock.mock.calls[0]![1].body)).toEqual({ confirmed: false });
    expect(JSON.parse(fetchMock.mock.calls[1]![1].body)).toEqual({ confirmed: true, sourceKind: 'ontology' });
  });
});
