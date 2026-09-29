'use client';

import { useState, useEffect, useMemo } from 'react';
import { useWorkspace } from '@/hooks/use-workspace';
import { isElectron } from '@originos/core/lib/integrations/electron';
import { resolveWorkspace } from '@originos/core/lib/integrations/electron/services/workspace';
import { useLocalFS } from '@/hooks/useLocalFS';
import { DirectoryTree } from './DirectoryTree';
import { MarkdownEditor } from './MarkdownEditor';
import { MarkdownViewer } from './MarkdownViewer';
import { ImageViewer } from './ImageViewer';
import { CreateFileDialog } from './CreateFileDialog';
import { DataTabView } from './DataTabView';
import { normalizeOntologyId, normalizeProjectEntryId } from './project-identity';
import type { ProjectFile } from '@originos/core/types';

const IMAGE_EXTENSIONS = new Set(['png', 'jpg', 'jpeg', 'gif', 'svg', 'webp', 'bmp', 'ico']);

type WorkspaceTab = '项目' | '数据';

function isImageFileExtension(extension: string): boolean {
  return IMAGE_EXTENSIONS.has(extension.toLowerCase());
}

interface WorkspaceWindowProps {
  projectId: string;
  projectName: string;
  entryType?: string;
  entryId?: string;
  ontologyId?: string;
  basePath?: string;
}

/**
 * Main workspace window component
 * Left: directory tree  |  Right: file viewer/editor
 */
export function WorkspaceWindow({ projectId, projectName, entryType, entryId, ontologyId: propOntologyId, basePath }: WorkspaceWindowProps) {
  const { files, openedFile, isLoading, loadFiles, openFile, createFile, saveFile, setActiveProject } = useWorkspace();
  const { watchPath, unwatchPath, onChanged } = useLocalFS();
  const [activeTab, setActiveTab] = useState<WorkspaceTab>('项目');
  const [viewMode, setViewMode] = useState<'tree' | 'editor'>('tree');
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [currentProjectId] = useState(projectId);
  const [currentProjectName] = useState(projectName);
  const [resolvedBasePath, setResolvedBasePath] = useState<string | null>(null);
  const [resolvedOntologyId, setResolvedOntologyId] = useState<string | null>(
    normalizeOntologyId(propOntologyId, projectId),
  );

  // Resolve base path via API
  useEffect(() => {
    if (basePath) {
      setResolvedBasePath(basePath);
      if (!resolvedOntologyId && (entryType === 'project' || projectId.startsWith('project-') || projectId.startsWith('proj-'))) {
        const projectDirId = normalizeProjectEntryId(entryId ?? projectId);
        setResolvedOntologyId(`ontology-${projectDirId}`);
      }
      return;
    }

    if (!entryType || !entryId) {
      const projectDirId = normalizeProjectEntryId(projectId);
      const fallback = projectId.startsWith('agent-')
        ? `data/agents/${projectId.slice('agent-'.length)}`
        : `data/projects/${projectDirId}`;
      setResolvedBasePath(fallback);
      // Derive ontologyId from projectId pattern
      if (!resolvedOntologyId && !projectId.startsWith('agent-')) {
        setResolvedOntologyId(`ontology-${projectDirId}`);
      }
      return;
    }

    resolveWorkspace(entryType, entryId)
      .then(result => {
        if (result.success) {
          setResolvedBasePath((result.data as any).baseDir);
          if ((result.data as any).ontologyId) {
            setResolvedOntologyId(normalizeOntologyId((result.data as any).ontologyId, (result.data as any).entryId ?? entryId));
          } else if (!resolvedOntologyId && entryType === 'project') {
            setResolvedOntologyId(`ontology-${normalizeProjectEntryId((result.data as any).entryId ?? entryId)}`);
          }
        }
      })
      .catch(console.error);
  }, [basePath, entryType, entryId, projectId, resolvedOntologyId]);

  // Set active project and load files once basePath is resolved
  useEffect(() => {
    if (!resolvedBasePath) return;
    setActiveProject(currentProjectId, resolvedBasePath);
    loadFiles(currentProjectId);
  }, [currentProjectId, resolvedBasePath, setActiveProject, loadFiles]);

  useEffect(() => {
    if (!resolvedBasePath || !isElectron()) {
      return;
    }

    void watchPath(resolvedBasePath).catch((error: unknown) => {
      console.error('[WorkspaceWindow] Failed to watch workspace path:', error);
    });

    const dispose = onChanged(({ path }) => {
      if (!path.startsWith(resolvedBasePath)) {
        return;
      }

      void loadFiles(currentProjectId).catch((error: unknown) => {
        console.error('[WorkspaceWindow] Failed to refresh workspace files:', error);
      });

      if (openedFile && path === `${resolvedBasePath}/${openedFile.file.path}`) {
        void openFile(currentProjectId, openedFile.file.path).catch((error: unknown) => {
          console.error('[WorkspaceWindow] Failed to refresh opened file:', error);
        });
      }
    });

    return () => {
      dispose();
      void unwatchPath(resolvedBasePath).catch((error: unknown) => {
        console.error('[WorkspaceWindow] Failed to unwatch workspace path:', error);
      });
    };
  }, [currentProjectId, loadFiles, onChanged, openFile, openedFile, resolvedBasePath, unwatchPath, watchPath]);

  const projectFiles = (files as any)[currentProjectId] || [];

  // Detect if this workspace can be opened in sandbox
  const sandboxAppId = useMemo(() => {
    if (!resolvedBasePath) return null;

    // Handle both relative ('data/projects/abc') and absolute ('/abs/path/data/skills/x')
    const dataIdx = resolvedBasePath.lastIndexOf('/data/');
    const basePath = dataIdx !== -1
      ? resolvedBasePath.slice(dataIdx + '/data/'.length)
      : resolvedBasePath.replace(/^data\//, '');

    // 优先检测 index.html
    const hasIndexHtml = projectFiles.some(
      (f: any) => f.type === 'file' && f.name === 'index.html' && !f.parentPath
    );
    if (hasIndexHtml) return basePath;

    // 其次检测独立 .html 文件（技能产出物场景）
    const htmlFile = projectFiles.find(
      (f: any) => f.type === 'file' && f.name.endsWith('.html') && f.name !== 'index.html' && !f.parentPath
    );
    if (htmlFile) return `${basePath}/${htmlFile.name}`;

    return null;
  }, [projectFiles, resolvedBasePath]);

  const handleOpenInSandbox = () => {
    if (!sandboxAppId) return;
    window.dispatchEvent(
      new CustomEvent('dock:action', {
        detail: { action: 'launch-sandbox', appId: sandboxAppId },
      })
    );
  };

  const handleOpenInSandboxFromTree = (folderRelPath: string) => {
    if (!resolvedBasePath) return;
    const dataIdx = resolvedBasePath.lastIndexOf('/data/');
    const basePart = dataIdx !== -1
      ? resolvedBasePath.slice(dataIdx + '/data/'.length)
      : resolvedBasePath.replace(/^data\//, '');
    const appId = folderRelPath ? `${basePart}/${folderRelPath}` : basePart;
    window.dispatchEvent(
      new CustomEvent('dock:action', {
        detail: { action: 'launch-sandbox', appId },
      })
    );
  };

  const handleFileSelect = async (file: ProjectFile) => {
    if (file.type === 'file') {
      await openFile(currentProjectId, file.path);
      setViewMode('editor');
    }
  };

  const handleBackToTree = () => {
    setViewMode('tree');
  };

  const handleCreateFile = async (fileName: string) => {
    try {
      await createFile(currentProjectId, fileName);
      setShowCreateDialog(false);
      await loadFiles(currentProjectId);
    } catch (error) {
      console.error('Failed to create file:', error);
    }
  };

  const handleSaveFile = async (content: string) => {
    if (openedFile) {
      await saveFile(currentProjectId, openedFile.file.path, content);
    }
  };

  return (
    <div className="flex h-full bg-transparent">
      {activeTab === '项目' && (
        <>
          {/* Directory tree sidebar */}
          <DirectoryTree
            files={projectFiles}
            selectedFileId={openedFile?.file.id ?? null}
            onFileSelect={handleFileSelect}
            onOpenInSandbox={handleOpenInSandboxFromTree}
          />
        </>
      )}

      {/* Main content */}
      <div className="flex flex-col h-full">
        {/* Window header */}
        <div className="native-drag-region flex items-center justify-between px-4 py-3 border-b border-gray-200 bg-transparent">
          <div className="flex items-center gap-4">
            <h2 className="text-lg font-semibold text-gray-900">{currentProjectName}</h2>
            {/* Tab bar */}
            <div className="native-no-drag flex items-center gap-1">
              <TabButton label="项目" active={activeTab === '项目'} onClick={() => setActiveTab('项目')} />
              <TabButton label="数据" active={activeTab === '数据'} onClick={() => setActiveTab('数据')} />
            </div>
            {activeTab === '项目' && viewMode === 'editor' && (
              <>
                {openedFile && (
                  <span className="text-sm text-gray-500">— {openedFile.file.name}</span>
                )}
                <button
                  onClick={handleBackToTree}
                  className="native-no-drag p-1 hover:bg-gray-100 rounded transition-colors"
                  aria-label="返回文件列表"
                >
                  <svg className="w-4 h-4 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                  </svg>
                </button>
              </>
            )}
          </div>
          <div className="native-no-drag flex items-center gap-2">
            {activeTab === '项目' && (
              <>
                {sandboxAppId && (
                  <button
                    onClick={handleOpenInSandbox}
                    className="px-3 py-1.5 text-sm bg-emerald-500 text-white rounded hover:bg-emerald-600 transition-colors flex items-center gap-1.5"
                    title="在代码沙箱中运行"
                  >
                    <span>🔬</span>
                    <span>在沙箱中打开</span>
                  </button>
                )}
                <button
                  onClick={() => setShowCreateDialog(true)}
                  className="px-3 py-1.5 text-sm bg-blue-500 text-white rounded hover:bg-blue-600 transition-colors"
                  aria-label="新建文件"
                >
                  新建文件
                </button>
              </>
            )}
          </div>
        </div>

        {/* Tab content */}
        <div className="flex-1 min-h-0">
          {activeTab === '项目' ? (
            <>
              {viewMode === 'tree' ? (
                <div className="flex flex-col items-center justify-center h-full text-gray-400">
                  <svg className="w-16 h-16 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                      d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                  </svg>
                  <p>从左侧选择文件查看或编辑</p>
                </div>
              ) : openedFile && isImageFileExtension(openedFile.file.extension || '') ? (
                <ImageViewer
                  fileContent={openedFile}
                />
              ) : openedFile?.file.extension === 'md' ? (
                <MarkdownEditor
                  fileContent={openedFile}
                  onSave={handleSaveFile}
                  isLoading={isLoading}
                />
              ) : (
                <MarkdownViewer
                  fileContent={openedFile}
                  isLoading={isLoading}
                />
              )}
            </>
          ) : (
            resolvedOntologyId ? (
              <DataTabView projectId={normalizeProjectEntryId(projectId)} />
            ) : (
              <div className="flex items-center justify-center h-full text-gray-400 text-sm">
                未关联本体
              </div>
            )
          )}
        </div>

        {activeTab === '项目' && (
          <CreateFileDialog
            isOpen={showCreateDialog}
            onClose={() => setShowCreateDialog(false)}
            onConfirm={handleCreateFile}
          />
        )}
      </div>
    </div>
  );
}

function TabButton({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`px-3 py-1 text-sm rounded transition-colors ${
        active ? 'bg-blue-100 text-blue-700' : 'text-gray-600 hover:bg-gray-100'
      }`}
    >
      {label}
    </button>
  );
}
