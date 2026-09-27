'use client';

import { useState, useEffect } from 'react';
import { OntologyGraph } from './OntologyGraph';
import type { OntologyModel, OntologyNode } from '@originos/core/types';

interface ArtifactDisplayPanelProps {
  mode: 'empty' | 'collecting' | 'generating' | 'preview';
  answers?: {
    work_domain?: string;
    work_mode?: string;
    main_tasks?: string;
  };
  ontology?: OntologyModel | null;
  generationProgress?: number;
  generationMessage?: string;
  onCreateProject?: () => void;
  isCreatingProject?: boolean;
  onEntityClick?: (entityName: string) => void;
  selectedEntity?: string;
  activeTab?: '图谱' | '实体' | '关系' | '规则';
  onTabChange?: (tab: '图谱' | '实体' | '关系' | '规则') => void;
  legacyMigrationRequired?: boolean;
}

const PHASE_BADGE: Record<string, { label: string; className: string }> = {
  collecting: { label: '发现中', className: 'bg-primary/15 text-teal-600 border border-primary/30' },
  generating: { label: '生成中', className: 'bg-amber-500/15 text-amber-700 border border-amber-500/30' },
  preview:    { label: '已完成', className: 'bg-teal-500/15 text-teal-600 border border-teal-500/30' },
};

function PhaseBadge({ mode }: { mode: string }) {
  const badge = PHASE_BADGE[mode];
  if (!badge) return null;
  return (
    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${badge.className}`}>
      {badge.label}
    </span>
  );
}

function PanelHeader({ mode }: { mode: string }) {
  return (
    <div className="flex items-center justify-between px-5 py-3 border-b border-white/20 shrink-0">
      <span className="text-sm font-semibold text-gray-900">业务模型</span>
      <PhaseBadge mode={mode} />
    </div>
  );
}

function EmptyIllustration() {
  return (
    <svg width="120" height="80" viewBox="0 0 120 80" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <circle cx="20" cy="40" r="8" stroke="currentColor" strokeWidth="1.5" strokeOpacity="0.4" />
      <circle cx="60" cy="16" r="8" stroke="currentColor" strokeWidth="1.5" strokeOpacity="0.4" />
      <circle cx="100" cy="40" r="8" stroke="currentColor" strokeWidth="1.5" strokeOpacity="0.4" />
      <circle cx="60" cy="64" r="8" stroke="currentColor" strokeWidth="1.5" strokeOpacity="0.4" />
      <line x1="28" y1="40" x2="52" y2="20" stroke="currentColor" strokeWidth="1" strokeOpacity="0.25" />
      <line x1="68" y1="20" x2="92" y2="36" stroke="currentColor" strokeWidth="1" strokeOpacity="0.25" />
      <line x1="28" y1="44" x2="52" y2="60" stroke="currentColor" strokeWidth="1" strokeOpacity="0.25" />
      <line x1="68" y1="60" x2="92" y2="44" stroke="currentColor" strokeWidth="1" strokeOpacity="0.25" />
      <line x1="60" y1="24" x2="60" y2="56" stroke="currentColor" strokeWidth="1" strokeOpacity="0.25" />
    </svg>
  );
}

export function ArtifactDisplayPanel({
  mode,
  answers: _answers = {},
  ontology,
  generationMessage = '正在生成业务模型...',
  onCreateProject,
  isCreatingProject = false,
  onEntityClick,
  selectedEntity,
  activeTab = '图谱',
  onTabChange,
  legacyMigrationRequired = false,
}: ArtifactDisplayPanelProps) {
  console.log('[ArtifactDisplayPanel] render', {
    mode,
    hasOntology: Boolean(ontology),
    nodesCount: ontology?.nodes.length ?? 0,
    activeTab,
  });
  return (
    <div className="flex flex-col h-full bg-transparent">
      <PanelHeader mode={mode} />
      <div className="flex-1 overflow-y-auto">
        {mode === 'empty' && <EmptyState legacyMigrationRequired={legacyMigrationRequired} />}
        {mode === 'collecting' && <CollectingState ontology={ontology} onEntityClick={onEntityClick} selectedEntity={selectedEntity} />}
        {mode === 'generating' && <GeneratingState message={generationMessage} />}
        {mode === 'preview' && ontology && (
          <PreviewState
            ontology={ontology}
            onCreateProject={onCreateProject}
            isCreatingProject={isCreatingProject}
            onEntityClick={onEntityClick}
            selectedEntity={selectedEntity}
            activeTab={activeTab}
            onTabChange={onTabChange}
          />
        )}
      </div>
    </div>
  );
}

function EmptyState({ legacyMigrationRequired }: { legacyMigrationRequired: boolean }) {
  return (
    <div className="flex flex-col items-center justify-center h-full gap-4 p-8 text-gray-500">
      <EmptyIllustration />
      <div className="text-center">
        <p className="text-sm font-medium text-gray-900 mb-1">{legacyMigrationRequired ? '此项目需要迁移本体' : '本体将在这里生成'}</p>
        <p className="text-xs text-gray-500 leading-relaxed">
          {legacyMigrationRequired ? '旧项目保持只读，请先通过显式迁移入口完成迁移。' : '通过左侧对话，Oracle 将实时构建项目本体。'}
        </p>
      </div>
    </div>
  );
}

function CollectingState({ ontology, onEntityClick, selectedEntity }: {
  ontology?: OntologyModel | null;
  onEntityClick?: (entityName: string) => void;
  selectedEntity?: string;
}) {
  const entities = ontology?.nodes.filter((n) => n.type === 'entity' || n.type === 'class') ?? [];

  return (
    <div className="p-5 h-full flex flex-col">
      <div className="flex items-center gap-2 mb-4 shrink-0">
        <span className="text-xs text-gray-500">正在从对话中提取业务概念</span>
        <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-primary/10 text-gray-700 border border-primary/20 animate-pulse">
          正在分析...
        </span>
      </div>

      {/* 图谱视图 */}
      <div className="flex-1 min-h-[400px] bg-white/30 rounded-xl border border-white/40 overflow-hidden">
        <OntologyGraph ontology={ontology} onEntityClick={onEntityClick} selectedEntity={selectedEntity} />
      </div>

      {/* 实体列表 */}
      {entities.length > 0 && (
        <div className="mt-4 space-y-2 shrink-0">
          <p className="text-xs text-gray-500 font-medium">已识别的实体 ({entities.length})</p>
          {entities.slice(0, 5).map((node) => (
            <EntityCard key={node.id} node={node} compact />
          ))}
          {entities.length > 5 && (
            <p className="text-xs text-gray-400">... 还有 {entities.length - 5} 个实体</p>
          )}
        </div>
      )}

      {entities.length === 0 && (
        <div className="text-xs text-gray-500 text-center py-8">
          等待 Oracle 识别业务实体...
        </div>
      )}
    </div>
  );
}

function EntityCard({ node, compact = false, selectedEntity }: { node: OntologyNode; compact?: boolean; selectedEntity?: string }) {
  const props = node.children?.filter((c) => c.type === 'property') ?? [];
  console.log(`[EntityCard] Rendering "${node.name}":`, {
    hasChildren: !!node.children,
    childrenLength: node.children?.length || 0,
    propsLength: props.length,
    children: node.children
  });
  return (
    <div className={`bg-white/60 border border-white/40 rounded-lg overflow-hidden border-l-2 border-l-primary transition-all ${
      selectedEntity === node.name ? 'ring-2 ring-primary ring-offset-2' : ''
    } ${compact ? 'px-3 py-2' : 'px-4 py-3'}`}>
      <p className={`text-sm font-medium text-gray-900 ${compact ? 'text-xs' : ''}`}>{node.name}</p>
      {!compact && node.description && (
        <p className="text-xs text-gray-500 mt-0.5 leading-relaxed">{node.description}</p>
      )}
      {props.length > 0 && (
        <div className={`flex flex-wrap gap-1 ${compact ? 'mt-1' : 'mt-2'}`}>
          {props.slice(0, compact ? 2 : undefined).map((p) => (
            <span
              key={p.id}
              className="text-xs px-2 py-0.5 rounded bg-white/40 text-gray-600 border border-white/40"
            >
              {p.name}
            </span>
          ))}
          {compact && props.length > 2 && (
            <span className="text-xs text-gray-400">+{props.length - 2}</span>
          )}
        </div>
      )}
    </div>
  );
}

function GeneratingState({ message }: { message: string }) {
  return (
    <div className="flex flex-col items-center justify-center h-full gap-5 p-8">
      <div className="relative w-16 h-16">
        <div className="absolute inset-0 rounded-full border-2 border-primary/20" />
        <div className="absolute inset-0 rounded-full border-2 border-transparent border-t-primary animate-spin" />
        <div className="absolute inset-2 rounded-full border border-primary/10 animate-pulse" />
      </div>
      <p className="text-sm text-gray-900 text-center">{message}</p>
    </div>
  );
}

type PreviewTab = '图谱' | '实体' | '关系' | '规则';
const TABS: PreviewTab[] = ['图谱', '实体', '关系', '规则'];

function PreviewState({ ontology, onCreateProject, isCreatingProject, onEntityClick, selectedEntity, activeTab, onTabChange }: {
  ontology: OntologyModel;
  onCreateProject?: () => void;
  isCreatingProject?: boolean;
  onEntityClick?: (entityName: string) => void;
  selectedEntity?: string;
  activeTab?: '图谱' | '实体' | '关系' | '规则';
  onTabChange?: (tab: '图谱' | '实体' | '关系' | '规则') => void;
}) {
  const [localActiveTab, setLocalActiveTab] = useState<'图谱' | '实体' | '关系' | '规则'>(activeTab || '图谱');

  // Sync with parent tab when it changes
  useEffect(() => {
    if (activeTab && activeTab !== localActiveTab) {
      setLocalActiveTab(activeTab);
    }
  }, [activeTab, localActiveTab]);

  // Notify parent of tab changes
  const handleTabChange = (tab: '图谱' | '实体' | '关系' | '规则') => {
    setLocalActiveTab(tab);
    onTabChange?.(tab);
  };

  const entities = ontology.nodes.filter((n) => n.type === 'entity' || n.type === 'class');
  const relationships = ontology.nodes.filter((n) => n.type === 'relationship');
  const rules = ontology.nodes.filter((n) => n.type === 'rule');

  return (
    <div className="flex flex-col h-full">
      {/* Tabs */}
      <div className="flex border-b border-white/20 px-5 shrink-0">
        {TABS.map((tab) => (
          <button
            key={tab}
            onClick={() => handleTabChange(tab)}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
              localActiveTab === tab
                ? 'border-primary text-primary'
                : 'border-transparent text-gray-500 hover:text-gray-900'
            }`}
          >
            {tab}
            <span className="ml-1.5 text-xs opacity-60">
              {tab === '图谱' ? ontology.nodes.length :
               tab === '实体' ? entities.length :
               tab === '关系' ? relationships.length :
               tab === '规则' ? rules.length : 0}
            </span>
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div className="flex-1 overflow-y-auto p-5">
        {localActiveTab === '图谱' && (
          <div className="flex items-center justify-center min-h-[400px]">
            <div className="scale-75 origin-top">
              <OntologyGraph ontology={ontology} onEntityClick={onEntityClick} selectedEntity={selectedEntity} />
            </div>
          </div>
        )}

        {localActiveTab === '实体' && (
          <div className="space-y-3">
            {entities.map((node) => (
              <EntityCard key={node.id} node={node} selectedEntity={selectedEntity} />
            ))}
            {entities.length === 0 && (
              <p className="text-xs text-gray-500 text-center py-8">暂无实体</p>
            )}
          </div>
        )}

        {localActiveTab === '关系' && (
          <div className="space-y-3">
            {relationships.map((node) => (
              <RelationshipCard key={node.id} node={node} />
            ))}
            {relationships.length === 0 && (
              <p className="text-xs text-gray-500 text-center py-8">暂无关系</p>
            )}
          </div>
        )}

        {localActiveTab === '规则' && (
          <div className="space-y-3">
            {rules.map((node) => (
              <RuleCard key={node.id} node={node} />
            ))}
            {rules.length === 0 && (
              <p className="text-xs text-gray-500 text-center py-8">暂无规则</p>
            )}
          </div>
        )}
      </div>

      {/* Create Project Button */}
      {onCreateProject && (
        <div className="border-t border-white/20 px-5 py-3 shrink-0">
          <button
            onClick={onCreateProject}
            disabled={isCreatingProject}
            className="w-full px-4 py-2.5 rounded-lg bg-primary text-white hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-sm font-medium flex items-center justify-center gap-2"
          >
            {isCreatingProject ? (
              <>
                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                <span>正在创建项目...</span>
              </>
            ) : (
              <span>💾 创建项目</span>
            )}
          </button>
        </div>
      )}
    </div>
  );
}

function RelationshipCard({ node }: { node: OntologyNode }) {
  const parts = node.name.split('→').map((s) => s.trim());
  const from = parts[0] ?? node.name;
  const to = parts[1] ?? '';
  const cardinality = node.description?.match(/\(([^)]+)\)/)?.[1];

  return (
    <div className="bg-white/60 border border-white/40 rounded-lg px-4 py-3 hover:border-white/60 transition-colors">
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-sm text-gray-900 font-medium">{from}</span>
        <span className="text-gray-500 text-xs">→</span>
        <span className="text-sm text-gray-900 font-medium">{to}</span>
        {cardinality && (
          <span className="ml-auto text-xs px-2 py-0.5 rounded bg-white/40 text-gray-600 border border-white/40">
            {cardinality}
          </span>
        )}
      </div>
      {node.description && (
        <p className="text-xs text-gray-500 mt-1">{node.description}</p>
      )}
    </div>
  );
}

function RuleCard({ node }: { node: OntologyNode }) {
  return (
    <div className="bg-white/60 border border-white/40 rounded-lg px-4 py-3 hover:border-white/60 transition-colors">
      <p className="text-sm font-medium text-gray-900">{node.name}</p>
      {node.description && (
        <p className="text-xs text-gray-500 mt-0.5">{node.description}</p>
      )}
    </div>
  );
}
