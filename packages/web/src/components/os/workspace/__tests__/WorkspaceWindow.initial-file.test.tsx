import { render, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { WorkspaceWindow } from '../WorkspaceWindow';

const mocks = vi.hoisted(() => ({
  loadFiles: vi.fn(async () => undefined),
  openFile: vi.fn(async () => undefined),
  resolveWorkspace: vi.fn(async () => ({
    success: true,
    data: {
      baseDir: '/workspace/data/projects/proj-example',
      entryId: 'proj-example',
      ontologyId: 'ontology-proj-example',
    },
  })),
  setActiveProject: vi.fn(),
}));

vi.mock('@/hooks/use-workspace', () => ({
  useWorkspace: () => ({
    files: {},
    openedFile: null,
    isLoading: false,
    loadFiles: mocks.loadFiles,
    openFile: mocks.openFile,
    createFile: vi.fn(),
    saveFile: vi.fn(),
    setActiveProject: mocks.setActiveProject,
  }),
}));

vi.mock('@/hooks/useLocalFS', () => ({
  useLocalFS: () => ({
    watchPath: vi.fn(async () => undefined),
    unwatchPath: vi.fn(async () => undefined),
    onChanged: vi.fn(() => vi.fn()),
  }),
}));

vi.mock('@originos/core/lib/integrations/electron', () => ({
  isElectron: () => false,
}));

vi.mock('@originos/core/lib/integrations/electron/services/workspace', () => ({
  resolveWorkspace: mocks.resolveWorkspace,
}));

vi.mock('../DirectoryTree', () => ({ DirectoryTree: () => null }));
vi.mock('../MarkdownEditor', () => ({ MarkdownEditor: () => null }));
vi.mock('../MarkdownViewer', () => ({ MarkdownViewer: () => null }));
vi.mock('../ImageViewer', () => ({ ImageViewer: () => null }));
vi.mock('../CreateFileDialog', () => ({ CreateFileDialog: () => null }));
vi.mock('../DataTabView', () => ({ DataTabView: () => null }));

describe('WorkspaceWindow initial project file', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('resolves project-file metadata as its project workspace and opens the requested file', async () => {
    render(
      <WorkspaceWindow
        projectId="proj-example"
        projectName="示例项目"
        entryType="project-file"
        entryId="agents/worker/output/result.md"
        initialFilePath="agents/worker/output/result.md"
      />,
    );

    await waitFor(() => {
      expect(mocks.resolveWorkspace).toHaveBeenCalledWith('project', 'proj-example');
      expect(mocks.setActiveProject).toHaveBeenCalledWith(
        'proj-example',
        '/workspace/data/projects/proj-example',
      );
      expect(mocks.loadFiles).toHaveBeenCalledWith('proj-example');
      expect(mocks.openFile).toHaveBeenCalledWith(
        'proj-example',
        'agents/worker/output/result.md',
      );
    });
  });
});
