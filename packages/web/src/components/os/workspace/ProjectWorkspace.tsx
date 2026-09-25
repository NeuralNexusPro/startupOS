'use client';

import { useEffect, useState } from 'react';
import { DataTabView } from './DataTabView';
import { OntologyTabView } from './OntologyTabView';
import { ProjectTaskBoard } from './project-task-board';

interface ProjectWorkspaceProps {
  projectId: string;
  projectName: string;
  ontologyId: string;
}

type PwTab = '数据' | '本体' | '任务' | '方案';

export function ProjectWorkspace({ projectId, projectName, ontologyId }: ProjectWorkspaceProps) {
  const [activeTab, setActiveTab] = useState<PwTab>('数据');

  useEffect(() => {
    console.log('[ProjectWorkspace] mounted', { projectId, projectName, ontologyId });
  }, [projectId, projectName, ontologyId]);

  const handleTabChange = (tab: PwTab) => {
    console.log('[ProjectWorkspace] tab change', { projectId, ontologyId, tab });
    setActiveTab(tab);
  };

  return (
    <div className="flex flex-col h-full">
      {/* Tab bar */}
      <div className="native-drag-region flex items-center gap-1 px-4 py-2 border-b border-gray-200 bg-gray-50">
        <span className="text-sm font-semibold text-gray-700 mr-4">{projectName}</span>
        <TabButton label="数据" active={activeTab === '数据'} onClick={() => handleTabChange('数据')} />
        <TabButton label="本体" active={activeTab === '本体'} onClick={() => handleTabChange('本体')} />
        <TabButton label="任务" active={activeTab === '任务'} onClick={() => handleTabChange('任务')} />
        <TabButton label="方案" active={activeTab === '方案'} onClick={() => handleTabChange('方案')} />
      </div>

      {/* Tab content */}
      <div className="flex-1 min-h-0">
        {activeTab === '数据' && <DataTabView ontologyId={ontologyId} />}
        {activeTab === '本体' && <OntologyTabView ontologyId={ontologyId} />}
        {activeTab === '任务' && <ProjectTaskBoard projectId={projectId} />}
        {activeTab === '方案' && (
          <div className="flex items-center justify-center h-full text-gray-400 text-sm">
            解决方案设计 — 即将推出
          </div>
        )}
      </div>
    </div>
  );
}

function TabButton({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`native-no-drag px-3 py-1 text-sm rounded transition-colors ${
        active ? 'bg-blue-100 text-blue-700' : 'text-gray-600 hover:bg-gray-100'
      }`}
    >
      {label}
    </button>
  );
}
