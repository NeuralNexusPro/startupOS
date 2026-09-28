'use client';

import { useState, useEffect } from 'react';
import { OntologyGraph } from './OntologyGraph';
import type { OntologyModel, OntologyNode } from '@originos/core/types';
import type { CanonicalSemanticKind } from '@originos/core/lib/features/ontology/types';
import type { BehaviorDraftReviewDto } from '@/services/interview-behavior-drafts';

import { SEMANTIC_KIND_OPTIONS, semanticKindLabel } from './semantic-kind';

type SemanticNode = OntologyNode & {
  semanticKind?: CanonicalSemanticKind;
  sourceConceptId?: string;
  targetConceptId?: string;
  relationName?: string;
  ruleIds?: string[];
};

interface BehaviorRule {
  id: string;
  name: string;
  kind: 'invariant' | 'precondition' | 'postcondition' | 'derivation' | 'permission';
  severity: 'error' | 'warning' | 'info';
  description?: string;
  expression: unknown;
}

interface BehaviorContracts {
  rules: BehaviorRule[];
  actions: Array<{
    id: string;
    name: string;
    objectName: string;
    inputFactTypes: string[];
    outputFactTypes: string[];
    beforeStates: string[];
    afterState?: string;
    ruleIds: string[];
    permissions: string[];
  }>;
  transitions: Array<{
    id: string;
    name: string;
    objectName: string;
    fromState: string;
    toState: string;
    actionName?: string;
    ruleIds: string[];
  }>;
  relationRuleIds: Record<string, string[]>;
}

type BusinessModel = OntologyModel & { behaviorContracts?: BehaviorContracts };

const asSemanticNode = (node: OntologyNode): SemanticNode => node as SemanticNode;
const isConcept = (node: OntologyNode): boolean => node.type === 'entity' || node.type === 'class';
const semanticKindOf = (node: OntologyNode): CanonicalSemanticKind => asSemanticNode(node).semanticKind ?? 'unclassified';

const SEMANTIC_BADGE: Record<CanonicalSemanticKind, string> = {
  role: 'bg-sky-500/10 text-sky-700 dark:text-sky-300 border-sky-500/20',
  organization: 'bg-violet-500/10 text-violet-700 dark:text-violet-300 border-violet-500/20',
  object: 'bg-primary/10 text-primary border-primary/20',
  activity: 'bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/20',
  document: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/20',
  standard: 'bg-rose-500/10 text-rose-700 dark:text-rose-300 border-rose-500/20',
  unclassified: 'bg-muted text-muted-foreground border-border',
};

interface ArtifactDisplayPanelProps {
  mode: 'empty' | 'collecting' | 'generating' | 'preview';
  answers?: {
    work_domain?: string;
    work_mode?: string;
    main_tasks?: string;
  };
  ontology?: BusinessModel | null;
  generationProgress?: number;
  generationMessage?: string;
  onCreateProject?: () => void;
  isCreatingProject?: boolean;
  onEntityClick?: (entityName: string) => void;
  selectedEntity?: string;
  activeTab?: '图谱' | '实体' | '关系' | '行动' | '规则';
  onTabChange?: (tab: '图谱' | '实体' | '关系' | '行动' | '规则') => void;
  legacyMigrationRequired?: boolean;
  behaviorDraftReview?: BehaviorDraftReviewDto;
  onConfirmBehaviorDraft?: () => void;
  isConfirmingBehaviorDraft?: boolean;
  behaviorDraftError?: string;
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

function PanelHeader({ mode, ontology }: { mode: string; ontology?: BusinessModel | null }) {
  const concepts = ontology?.nodes.filter(isConcept).length ?? 0;
  const relations = ontology?.nodes.filter((node) => node.type === 'relationship').length ?? 0;
  return (
    <div className="flex items-center justify-between gap-3 px-5 py-3 border-b border-border shrink-0">
      <div className="min-w-0">
        <span className="text-sm font-semibold text-foreground">业务模型</span>
        {concepts > 0 && <p className="mt-0.5 text-xs text-muted-foreground">{concepts} 个业务概念 · {relations} 条联系</p>}
      </div>
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
  behaviorDraftReview,
  onConfirmBehaviorDraft,
  isConfirmingBehaviorDraft = false,
  behaviorDraftError,
}: ArtifactDisplayPanelProps) {
  console.log('[ArtifactDisplayPanel] render', {
    mode,
    hasOntology: Boolean(ontology),
    nodesCount: ontology?.nodes.length ?? 0,
    activeTab,
  });
  return (
    <div className="flex flex-col h-full bg-background text-foreground">
      <PanelHeader mode={mode} ontology={ontology} />
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
            behaviorDraftReview={behaviorDraftReview}
            onConfirmBehaviorDraft={onConfirmBehaviorDraft}
            isConfirmingBehaviorDraft={isConfirmingBehaviorDraft}
            behaviorDraftError={behaviorDraftError}
          />
        )}
      </div>
    </div>
  );
}

function EmptyState({ legacyMigrationRequired }: { legacyMigrationRequired: boolean }) {
  return (
    <div className="flex flex-col items-center justify-center h-full gap-4 p-8 text-muted-foreground">
      <EmptyIllustration />
      <div className="text-center">
        <p className="text-sm font-medium text-foreground mb-1">{legacyMigrationRequired ? '此项目需要迁移本体' : '本体将在这里生成'}</p>
        <p className="text-xs text-muted-foreground leading-relaxed">
          {legacyMigrationRequired ? '旧项目保持只读，请先通过显式迁移入口完成迁移。' : '通过左侧对话，Oracle 将实时构建项目本体。'}
        </p>
      </div>
    </div>
  );
}

function CollectingState({ ontology, onEntityClick, selectedEntity }: {
  ontology?: BusinessModel | null;
  onEntityClick?: (entityName: string) => void;
  selectedEntity?: string;
}) {
  const entities = ontology?.nodes.filter(isConcept) ?? [];

  return (
    <div className="p-5 h-full flex flex-col">
      <div className="flex items-center gap-2 mb-4 shrink-0">
        <span className="text-xs text-muted-foreground">正在从对话中提取业务概念</span>
        <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-primary/10 text-primary border border-primary/20 animate-pulse">
          正在分析...
        </span>
      </div>

      {/* 图谱视图 */}
      <div className="flex-1 min-h-[400px] bg-card/60 rounded-xl border border-border overflow-hidden">
        <OntologyGraph ontology={ontology} onEntityClick={onEntityClick} selectedEntity={selectedEntity} />
      </div>

      {/* 业务概念摘要 */}
      {entities.length > 0 && (
        <div className="mt-4 space-y-2 shrink-0">
          <p className="text-xs text-muted-foreground font-medium">已识别的业务概念 ({entities.length})</p>
          {entities.slice(0, 5).map((node) => (
            <EntityCard key={node.id} node={node} compact />
          ))}
          {entities.length > 5 && (
            <p className="text-xs text-muted-foreground/80">... 还有 {entities.length - 5} 个实体</p>
          )}
        </div>
      )}

      {entities.length === 0 && (
        <div className="text-xs text-muted-foreground text-center py-8">
          等待 Oracle 识别业务概念...
        </div>
      )}
    </div>
  );
}

function EntityCard({ node, compact = false, selectedEntity }: { node: OntologyNode; compact?: boolean; selectedEntity?: string }) {
  const props = node.children?.filter((c) => c.type === 'property') ?? [];
  const kind = semanticKindOf(node);
  return (
    <div className={`bg-card border border-border rounded-xl overflow-hidden transition-all ${
      selectedEntity === node.name ? 'ring-2 ring-primary ring-offset-2 ring-offset-background' : 'hover:border-primary/40 hover:shadow-sm'
    } ${compact ? 'px-3 py-2' : 'px-4 py-3'}`}>
      <div className="flex items-start justify-between gap-2">
        <p className={`text-sm font-medium text-foreground ${compact ? 'text-xs' : ''}`}>{node.name}</p>
        <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[11px] ${SEMANTIC_BADGE[kind]}`}>{semanticKindLabel(kind)}</span>
      </div>
      {!compact && node.description && (
        <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">{node.description}</p>
      )}
      {props.length > 0 && (
        <div className={`flex flex-wrap gap-1 ${compact ? 'mt-1' : 'mt-2'}`}>
          {props.slice(0, compact ? 2 : undefined).map((p) => (
            <span
              key={p.id}
              className="text-xs px-2 py-0.5 rounded bg-muted text-muted-foreground border border-border"
            >
              {p.name}
            </span>
          ))}
          {compact && props.length > 2 && (
            <span className="text-xs text-muted-foreground/80">+{props.length - 2}</span>
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
      <p className="text-sm text-foreground text-center">{message}</p>
    </div>
  );
}

type PreviewTab = '图谱' | '实体' | '关系' | '行动' | '规则';
const TABS: PreviewTab[] = ['图谱', '实体', '关系', '行动', '规则'];

function PreviewState({ ontology, onCreateProject, isCreatingProject, onEntityClick, selectedEntity, activeTab, onTabChange, behaviorDraftReview, onConfirmBehaviorDraft, isConfirmingBehaviorDraft, behaviorDraftError }: {
  ontology: BusinessModel;
  onCreateProject?: () => void;
  isCreatingProject?: boolean;
  onEntityClick?: (entityName: string) => void;
  selectedEntity?: string;
  activeTab?: PreviewTab;
  onTabChange?: (tab: PreviewTab) => void;
  behaviorDraftReview?: BehaviorDraftReviewDto;
  onConfirmBehaviorDraft?: () => void;
  isConfirmingBehaviorDraft: boolean;
  behaviorDraftError?: string;
}) {
  const [localActiveTab, setLocalActiveTab] = useState<PreviewTab>(activeTab || '图谱');

  // Sync with parent tab when it changes
  useEffect(() => {
    if (activeTab && activeTab !== localActiveTab) {
      setLocalActiveTab(activeTab);
    }
  }, [activeTab, localActiveTab]);

  // Notify parent of tab changes
  const handleTabChange = (tab: PreviewTab) => {
    setLocalActiveTab(tab);
    onTabChange?.(tab);
  };

  const entities = ontology.nodes.filter(isConcept);
  const relationships = ontology.nodes.filter((n) => n.type === 'relationship');
  const contracts = ontology.behaviorContracts;
  const rules = contracts?.rules ?? ontology.nodes.filter((n) => n.type === 'rule').map((node) => ({
    id: node.id, name: node.name, kind: 'invariant' as const, severity: 'info' as const, description: node.description, expression: null,
  }));
  const categorized = SEMANTIC_KIND_OPTIONS.map((kind) => ({
    kind,
    count: entities.filter((node) => semanticKindOf(node) === kind).length,
  })).filter(({ count }) => count > 0);

  return (
    <div className="flex flex-col h-full">
      {/* Tabs */}
      <div className="flex border-b border-border px-5 shrink-0">
        {TABS.map((tab) => (
          <button
            key={tab}
            onClick={() => handleTabChange(tab)}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
              localActiveTab === tab
                ? 'border-primary text-primary'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            {tab === '实体' ? '概念' : tab}
            <span className="ml-1.5 text-xs opacity-60">
              {tab === '图谱' ? ontology.nodes.length :
               tab === '实体' ? entities.length :
               tab === '关系' ? relationships.length :
               tab === '行动' ? contracts?.actions.length ?? 0 :
               tab === '规则' ? rules.length : 0}
            </span>
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div className="flex-1 overflow-y-auto p-5">
        {localActiveTab === '图谱' && (
          <div className="space-y-4">
            <section className="grid grid-cols-3 gap-2" aria-label="业务模型摘要">
              <SummaryMetric label="业务概念" value={entities.length} />
              <SummaryMetric label="业务联系" value={relationships.length} />
              <SummaryMetric label="待确认" value={categorized.find(({ kind }) => kind === 'unclassified')?.count ?? 0} emphasized />
            </section>
            {categorized.length > 0 && (
              <section className="rounded-xl border border-border bg-muted/30 p-3">
                <p className="text-xs font-medium text-foreground">业务概念构成</p>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {categorized.map(({ kind, count }) => (
                    <span key={kind} className={`rounded-full border px-2 py-1 text-xs ${SEMANTIC_BADGE[kind]}`}>
                      {semanticKindLabel(kind)} · {count}
                    </span>
                  ))}
                </div>
              </section>
            )}
            <div className="min-h-[360px] rounded-xl border border-border bg-card p-2">
              <OntologyGraph ontology={ontology} onEntityClick={onEntityClick} selectedEntity={selectedEntity} />
            </div>
          </div>
        )}

        {localActiveTab === '实体' && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-xs text-muted-foreground">每个概念都保留所属分类和描述，可在本体编辑器中修正。</p>
              <span className="text-xs text-muted-foreground">{entities.length} 项</span>
            </div>
            {entities.map((node) => (
              <EntityCard key={node.id} node={node} selectedEntity={selectedEntity} />
            ))}
            {entities.length === 0 && (
              <p className="text-xs text-muted-foreground text-center py-8">暂无业务概念</p>
            )}
          </div>
        )}

        {localActiveTab === '关系' && (
          <div className="space-y-3">
            {relationships.map((node) => (
              <RelationshipCard key={node.id} node={node} concepts={entities} rules={rules} />
            ))}
            {relationships.length === 0 && (
              <p className="text-xs text-muted-foreground text-center py-8">暂无关系</p>
            )}
          </div>
        )}

        {localActiveTab === '行动' && (
          <div className="space-y-3">
            <BehaviorDraftReview draft={behaviorDraftReview} onConfirm={onConfirmBehaviorDraft} isConfirming={isConfirmingBehaviorDraft} error={behaviorDraftError} />
            {(contracts?.actions ?? []).map((action) => (
              <ActionCard key={action.id} action={action} rules={rules} />
            ))}
            {(contracts?.transitions ?? []).map((transition) => (
              <TransitionCard key={transition.id} transition={transition} rules={rules} />
            ))}
            {!contracts?.actions.length && !contracts?.transitions.length && (
              <p className="text-xs text-muted-foreground text-center py-8">暂未识别行动或状态流转</p>
            )}
          </div>
        )}

        {localActiveTab === '规则' && (
          <div className="space-y-3">
            {rules.map((node) => (
              <RuleCard key={node.id} rule={node} />
            ))}
            {rules.length === 0 && (
              <p className="text-xs text-muted-foreground text-center py-8">暂无规则</p>
            )}
          </div>
        )}
      </div>

      {/* Create Project Button */}
      {onCreateProject && (
        <div className="border-t border-border px-5 py-3 shrink-0">
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

function SummaryMetric({ label, value, emphasized = false }: { label: string; value: number; emphasized?: boolean }) {
  return (
    <div className={`rounded-xl border p-3 ${emphasized && value > 0 ? 'border-amber-500/30 bg-amber-500/10' : 'border-border bg-card'}`}>
      <p className="text-[11px] text-muted-foreground">{label}</p>
      <p className="mt-1 text-xl font-semibold text-foreground tabular-nums">{value}</p>
    </div>
  );
}

function RelationshipCard({ node, concepts, rules }: { node: OntologyNode; concepts: readonly OntologyNode[]; rules: readonly BehaviorRule[] }) {
  const semantic = asSemanticNode(node);
  const parts = node.name.split('→').map((item) => item.trim());
  const from = concepts.find((item) => item.id === semantic.sourceConceptId)?.name ?? parts[0] ?? node.name;
  const to = concepts.find((item) => item.id === semantic.targetConceptId)?.name ?? parts[1] ?? '';
  const cardinality = node.description?.match(/\(([^)]+)\)/)?.[1];

  return (
    <div className="bg-card/70 border border-border rounded-lg px-4 py-3 hover:border-primary/40 transition-colors">
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-sm text-foreground font-medium">{from}</span>
        <span className="text-muted-foreground text-xs">→</span>
        <span className="text-sm text-foreground font-medium">{to}</span>
        {cardinality && (
          <span className="ml-auto text-xs px-2 py-0.5 rounded bg-muted text-muted-foreground border border-border">
            {cardinality}
          </span>
        )}
      </div>
      <p className="mt-1 text-xs font-medium text-primary">{semantic.relationName ?? node.description ?? '业务联系'}</p>
      {node.description && semantic.relationName && (
        <p className="text-xs text-muted-foreground mt-1">{node.description}</p>
      )}
      <ConstraintList ruleIds={semantic.ruleIds ?? []} rules={rules} />
    </div>
  );
}

function ConstraintList({ ruleIds, rules }: { ruleIds: readonly string[]; rules: readonly BehaviorRule[] }) {
  const attached = ruleIds.map((id) => rules.find((rule) => rule.id === id)).filter((rule): rule is BehaviorRule => Boolean(rule));
  if (attached.length === 0) return null;
  return <div className="mt-3 border-l-2 border-amber-500/50 pl-3" aria-label="业务约束">
    <p className="text-[11px] font-medium text-amber-700 dark:text-amber-300">业务约束</p>
    <ul className="mt-1 space-y-1">{attached.map((rule) => <li key={rule.id} className="text-xs text-muted-foreground">{rule.name}{rule.description ? `：${rule.description}` : ''}</li>)}</ul>
  </div>;
}

function RuleCard({ rule }: { rule: BehaviorRule }) {
  return (
    <div className="bg-card/70 border border-border rounded-lg px-4 py-3 hover:border-primary/40 transition-colors">
      <div className="flex items-center justify-between gap-2"><p className="text-sm font-medium text-foreground">{rule.name}</p><span className="rounded-full border border-border bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">{rule.kind}</span></div>
      {rule.description && (
        <p className="text-xs text-muted-foreground mt-0.5">{rule.description}</p>
      )}
      <p className="mt-2 text-[11px] text-amber-700 dark:text-amber-300">定义已保存；当前没有规则求值器，不能据此执行行动。</p>
    </div>
  );
}

function DetailChips({ label, values }: { label: string; values: readonly string[] }) {
  if (values.length === 0) return null;
  return <div className="mt-2"><p className="text-[11px] text-muted-foreground">{label}</p><div className="mt-1 flex flex-wrap gap-1">{values.map((value) => <span key={value} className="rounded border border-border bg-muted px-2 py-0.5 text-xs text-foreground">{value}</span>)}</div></div>;
}

function ActionCard({ action, rules }: { action: NonNullable<BehaviorContracts['actions']>[number]; rules: readonly BehaviorRule[] }) {
  return <article className="rounded-xl border border-border bg-card/70 p-4" aria-label={`行动：${action.name}`}>
    <div className="flex flex-wrap items-start justify-between gap-2"><div><p className="text-sm font-semibold text-foreground">{action.name}</p><p className="mt-0.5 text-xs text-muted-foreground">处理对象：{action.objectName}</p></div><span className="rounded-full border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-[11px] text-amber-700 dark:text-amber-300">执行受限</span></div>
    <DetailChips label="输入事实" values={action.inputFactTypes} />
    <DetailChips label="输出事实" values={action.outputFactTypes} />
    <DetailChips label="执行前状态" values={action.beforeStates} />
    {action.afterState && <DetailChips label="执行后状态" values={[action.afterState]} />}
    <DetailChips label="所需权限" values={action.permissions} />
    <ConstraintList ruleIds={action.ruleIds} rules={rules} />
    <p className="mt-3 text-[11px] text-amber-700 dark:text-amber-300">定义已保存。规则尚无可用求值器，因此此行动不会在此处执行。</p>
  </article>;
}

function TransitionCard({ transition, rules }: { transition: NonNullable<BehaviorContracts['transitions']>[number]; rules: readonly BehaviorRule[] }) {
  return <article className="rounded-xl border border-border bg-card/50 p-4" aria-label={`状态流转：${transition.name}`}>
    <p className="text-sm font-medium text-foreground">{transition.name}</p>
    <p className="mt-1 text-xs text-muted-foreground">{transition.objectName}：{transition.fromState} → {transition.toState}{transition.actionName ? ` · 由「${transition.actionName}」触发` : ''}</p>
    <ConstraintList ruleIds={transition.ruleIds} rules={rules} />
  </article>;
}

function BehaviorDraftReview({ draft, onConfirm, isConfirming, error }: { draft?: BehaviorDraftReviewDto; onConfirm?: () => void; isConfirming: boolean; error?: string }) {
  if (!draft) return null;
  const confirmation = draft.confirmation?.status === 'confirmed' ? '已确认' : draft.confirmation?.status === 'required' ? '等待确认' : '无需确认';
  const canConfirm = draft.status === 'ready' && draft.unresolvedClarificationCount === 0 && Boolean(onConfirm);
  return <section className="rounded-xl border border-border bg-muted/30 p-3" aria-live="polite" aria-label="行动草稿审阅状态">
    <div className="flex flex-wrap items-center justify-between gap-2"><p className="text-xs font-medium text-foreground">行动草稿审阅</p><span className="rounded-full border border-border bg-background px-2 py-0.5 text-[11px] text-muted-foreground">{confirmation}</span></div>
    <p className="mt-1 text-xs text-muted-foreground">{draft.summary}</p>
    <p className="mt-2 text-[11px] text-muted-foreground">{draft.candidateCount} 项待写入定义 · 当前状态：{draft.status}</p>
    {draft.unresolvedClarificationCount > 0 && <p className="mt-2 text-[11px] text-amber-700 dark:text-amber-300">请先在访谈中澄清 {draft.unresolvedClarificationCount} 项问题。</p>}
    {draft.status === 'ready' && <button type="button" onClick={onConfirm} disabled={!canConfirm || isConfirming} className="mt-3 rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground disabled:cursor-not-allowed disabled:opacity-50">{isConfirming ? '正在写入项目本体…' : '确认并写入项目本体'}</button>}
    {error && <p role="alert" className="mt-2 text-xs text-destructive">{error}</p>}
  </section>;
}
