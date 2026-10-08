'use client';

import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { X, FolderOpen, LayoutDashboard } from 'lucide-react';
import { ResizableLayout } from './ResizableLayout';
import { CUIDialogPanel } from './CUIDialogPanel';
import { ArtifactDisplayPanel } from './ArtifactDisplayPanel';
import {
  normalizeRuntimeLLMConfig,
  usePersistentAgent,
} from '@originos/core/lib/integrations/pi-agent/client';
import { useSettingsStore } from '@/store/settingsStore';
import { AppWindowManager } from '@/services/AppWindowManager';
import { ProjectWorkspace, WorkspaceWindow } from '@/components/os/workspace';
import { normalizeOntologyId, normalizeProjectEntryId } from '@/components/os/workspace/project-identity';
import { canonicalToOntologyModel, loadProjectCanonicalOntology } from '@/components/os/workspace/project-canonical-ontology';
import {
  confirmInterviewBehaviorDraft,
  loadInterviewBehaviorDraft,
  type BehaviorDraftReviewDto,
} from '@/services/interview-behavior-drafts';
import type { OntologyModel } from '@originos/core/types';

interface InterviewWindowProps {
  projectId?: string;
  sessionId?: string;
  projectName?: string;
  ontologyId?: string;
  onClose?: () => void;
  onComplete?: (result: any) => void;
}

const PHASE_BADGE: Record<string, { label: string; className: string }> = {
  empty: { label: '准备中', className: 'bg-muted text-text-secondary border border-border' },
  collecting: { label: '发现中', className: 'bg-primary/15 text-primary border border-primary/30' },
  generating: { label: '生成中', className: 'bg-amber-500/15 text-amber-700 border border-amber-500/30' },
  preview: { label: '已完成', className: 'bg-teal-500/15 text-teal-600 border border-teal-500/30' },
};

function InterviewHeader({ mode, onClose, projectName, projectId, ontologyId }: { mode: string; onClose?: () => void; projectName?: string; projectId?: string; ontologyId?: string }) {
  const badge = PHASE_BADGE[mode] || PHASE_BADGE['empty'] || { label: '准备中', className: 'bg-muted text-text-secondary border border-border' };

  const resolvedProjectId = projectId ? normalizeProjectEntryId(projectId) : null;
  const resolvedOntologyId = normalizeOntologyId(ontologyId, projectId);

  const handleOpenProjectWorkspace = () => {
    if (!resolvedProjectId || !resolvedOntologyId) return;
    const windowManager = AppWindowManager.getInstance();
    windowManager.openComponentWindow(
      `project-workspace-${resolvedProjectId}`,
      `${projectName || '项目'} 管理`,
      ProjectWorkspace,
      {
        projectId: resolvedProjectId,
        projectName: projectName || '项目',
        ontologyId: resolvedOntologyId,
      },
      {
        position: {
          width: 1200,
          height: 800,
        },
        metadata: { entryType: 'project-workspace', entryId: resolvedProjectId, sessionId: `project-workspace-${resolvedProjectId}`, projectId: resolvedProjectId },
      }
    );
  };

  const handleOpenFileWorkspace = () => {
    if (!resolvedProjectId) return;
    const windowManager = AppWindowManager.getInstance();
    windowManager.openComponentWindow(
      `workspace-project-${resolvedProjectId}`,
      `${projectName || '项目'} 的工作区`,
      WorkspaceWindow,
      {
        projectId: resolvedProjectId,
        projectName: projectName || '项目',
        basePath: `data/projects/${resolvedProjectId}`,
        entryType: 'project' as const,
        entryId: resolvedProjectId,
        ontologyId: resolvedOntologyId ?? undefined,
      },
      {
        position: {
          width: 1200,
          height: 800,
        },
      }
    );
  };

  return (
    <div className="native-drag-region flex items-center justify-between px-5 py-3 border-b border-border bg-muted/40 shrink-0">
      <div className="flex items-center gap-3">
        <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center">
          <span className="text-sm font-bold text-primary">O</span>
        </div>
        <div>
          <h1 className="text-sm font-semibold text-foreground">{projectName ? `${projectName} · 访谈` : '项目访谈'}</h1>
          <p className="text-xs text-muted-foreground">Oracle · 业务建模助手</p>
        </div>
      </div>
      <div className="native-no-drag flex items-center gap-2">
        <span className={`text-xs px-2 py-1 rounded-full font-medium ${badge.className}`}>
          {badge.label}
        </span>
        {projectId && (
          <>
            <button
              onClick={handleOpenProjectWorkspace}
              className="p-1.5 rounded-lg hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
              aria-label="打开项目管理"
              title="打开项目管理"
            >
              <LayoutDashboard className="w-4 h-4" />
            </button>
            <button
              onClick={handleOpenFileWorkspace}
              className="p-1.5 rounded-lg hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
              aria-label="打开文件工作区"
              title="打开文件工作区"
            >
              <FolderOpen className="w-4 h-4" />
            </button>
          </>
        )}
        {onClose && (
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
            aria-label="关闭"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>
    </div>
  );
}

/** 通过项目绑定的 canonical ontology 读取访谈结果。 */
async function loadLatestModel(projectId: string): Promise<OntologyModel | null> {
  const result = await loadProjectCanonicalOntology(projectId);
  return result.entry.kind === 'canonical' && result.ontology
    ? canonicalToOntologyModel(result.ontology)
    : null;
}

/**
 * 从 Agent 消息历史中检查是否已有会话记录
 * 持久化 Agent 架构下，历史由 usePersistentAgent 管理，无需调用旧的 session API
 */
function hasSessionHistory(messages: any[]): boolean {
  return messages.length > 0;
}

/**
 * 将业务模型 JSON 转换为 OntologyModel 用于右侧预览
 */

/** Legacy display-only projection; it is never used as a project data source. */
export function legacyModelToPreview(model: any): OntologyModel {
  const now = Date.now();
  const nodes = [];
  console.log('[legacyModelToPreview] start', {
    hasModel: Boolean(model),
    keys: model && typeof model === 'object' ? Object.keys(model) : [],
    entitiesCount: Array.isArray(model?.entities) ? model.entities.length : 0,
    relationshipsCount: Array.isArray(model?.relationships) ? model.relationships.length : 0,
    rulesCount: Array.isArray(model?.businessRules) ? model.businessRules.length : 0,
  });

  if (model.entities && Array.isArray(model.entities)) {
    const entityMap = new Map<string, string>();

    for (const entity of model.entities) {
      // 兼容两种格式：字符串数组 ["订单", "客户"] 或对象数组 [{name, definition, properties}]
      if (typeof entity === 'string') {
        const nodeId = `entity-${entity}-${now}`;
        entityMap.set(entity, nodeId);
        nodes.push({
          id: nodeId,
          name: entity,
          type: 'entity' as const,
          description: '',
          children: [],
        });
        continue;
      }

      const entityName = entity.name || entity.label || String(entity);
      const nodeId = `entity-${entityName}-${now}`;
      entityMap.set(entityName, nodeId);

      const children = Object.entries(entity.properties || {}).map(([key, value], i) => ({
        id: `prop-${key}-${i}`,
        name: key,
        type: 'property' as const,
        description: String(value),
      }));

      console.log(`[legacyModelToPreview] Entity "${entityName}" has ${children.length} properties:`, children.map(c => c.name));

      nodes.push({
        id: nodeId,
        name: entityName,
        type: 'entity' as const,
        description: entity.definition || entity.description || '',
        children,
      });
    }

    if (model.relationships && Array.isArray(model.relationships)) {
      for (const rel of model.relationships) {
        // 兼容字符串格式 "订单→客户" 或对象格式 {from, to, type, cardinality}
        if (typeof rel === 'string') {
          // 验证字符串格式是否有效（必须包含 → 且两边都有内容）
          const parts = rel.split('→').map(s => s.trim());
          if (parts.length >= 2 && parts[0] && parts[1]) {
            nodes.push({
              id: `rel-${rel}-${now}`,
              name: rel,
              type: 'relationship' as const,
              description: '',
              children: [],
            });
          }
          continue;
        }

        const fromName = rel.from || '';
        const toName = rel.to || '';

        // 跳过无效关系（from 或 to 为空）
        if (!fromName || !toName) {
          console.warn('[legacyModelToPreview] Skipping invalid relationship:', rel);
          continue;
        }

        nodes.push({
          id: `rel-${fromName}-${toName}-${now}`,
          name: `${fromName} → ${toName}`,
          type: 'relationship' as const,
          description: `${rel.type || ''} (${rel.cardinality || ''})`.trim().replace(/^\(|\)$/g, ''),
          children: [],
        });
      }
    }
  }

  // 转换业务规则
  if (model.businessRules && Array.isArray(model.businessRules)) {
    for (const rule of model.businessRules) {
      if (typeof rule === 'string') {
        nodes.push({
          id: `rule-${rule}-${now}`,
          name: rule,
          type: 'rule' as const,
          description: '',
          children: [],
        });
        continue;
      }
      const ruleDesc = [
        rule.condition && `条件: ${rule.condition}`,
        rule.action && `动作: ${rule.action}`,
        rule.exception && `例外: ${rule.exception}`,
      ].filter(Boolean).join(' | ');

      nodes.push({
        id: `rule-${rule.name || nodes.length}-${now}`,
        name: rule.name || '业务规则',
        type: 'rule' as const,
        description: rule.description || ruleDesc,
        children: [],
      });
    }
  }

  return {
    id: `ontology-${now}`,
    name: model.projectName || model.title || '业务模型',
    description: model.background || model.description || `行业：${model.industry || '未知'}`,
    nodes,
    createdAt: now,
  };
}

/**
 * InterviewWindow - 项目访谈主窗口
 *
 * 左侧：CUI 对话面板（usePiAgent + project-initialization SKILL.md）
 * 右侧：产物展示面板（监听 Agent 输出的 JSON 实时更新）
 */
export function InterviewWindow({ projectId, sessionId, projectName, ontologyId, onClose, onComplete }: InterviewWindowProps) {
  // Stable project ID — use useMemo so it doesn't regenerate on every render
  const resolvedProjectId = useMemo(
    () => projectId ? normalizeProjectEntryId(projectId) : `interview-${Date.now()}`,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );
  const resolvedOntologyId = useMemo(
    () => normalizeOntologyId(ontologyId, resolvedProjectId),
    [ontologyId, resolvedProjectId]
  );
  const resolvedSessionId = useMemo(
    () => sessionId ?? `project-initialization-${Date.now()}`,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );
  const resolvedProjectName = useMemo(
    () => projectName ?? '项目访谈',
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );
  // Upload path for project files
  const projectUploadBase = `data/projects/${resolvedProjectId}`;
  const [displayMode, setDisplayMode] = useState<'empty' | 'collecting' | 'generating' | 'preview'>('empty');
  const [ontology, setOntology] = useState<OntologyModel | null>(null);
  const [selectedEntity, setSelectedEntity] = useState<string | undefined>();
  const [activeTab, setActiveTab] = useState<'图谱' | '实体' | '关系' | '行动' | '规则'>('图谱');
  const [legacyMigrationRequired, setLegacyMigrationRequired] = useState(false);
  const [behaviorDraftReview, setBehaviorDraftReview] = useState<BehaviorDraftReviewDto | null>(null);
  const [behaviorModelingRequired, setBehaviorModelingRequired] = useState(false);
  const [isConfirmingBehaviorDraft, setIsConfirmingBehaviorDraft] = useState(false);
  const [behaviorDraftError, setBehaviorDraftError] = useState<string | undefined>();
  const hasCheckedHistory = useRef(false); // 防止重复触发
  const displayModeRef = useRef<'empty' | 'collecting' | 'generating' | 'preview'>('empty');

  const setDisplayModeSync = useCallback((mode: 'empty' | 'collecting' | 'generating' | 'preview') => {
    displayModeRef.current = mode;
    setDisplayMode(mode);
  }, []);

  const refreshBehaviorDraft = useCallback(async () => {
    if (!projectId) return;
    const draft = await loadInterviewBehaviorDraft(resolvedProjectId, resolvedSessionId);
    setBehaviorDraftReview(draft);
  }, [projectId, resolvedProjectId, resolvedSessionId]);

  const getEffectiveConfig = useSettingsStore((s) => s.getEffectiveConfig);
  const llmConfig = useMemo(() => {
    return normalizeRuntimeLLMConfig(getEffectiveConfig());
  }, [getEffectiveConfig]);

  const {
    isReady: isInitialized,
    isThinking,
    messages: piMessages,
    toolExecutions,
    artifactVersion,
    sendMessage: sendMessageStream,
    triggerGreeting,
    abort,
  } = usePersistentAgent(resolvedProjectId, llmConfig);

  // Sync displayMode ref for reliable access in closures
  useEffect(() => {
    displayModeRef.current = displayMode;
  }, [displayMode]);

  // 初始化时加载项目产出物
  useEffect(() => {
    if (!projectId) return;

    const loadArtifacts = async () => {
      console.log('[InterviewWindow] loadArtifacts start', {
        rawProjectId: projectId,
        resolvedProjectId,
        resolvedOntologyId,
      });
      const canonical = await loadProjectCanonicalOntology(resolvedProjectId);
      setLegacyMigrationRequired(canonical.entry.kind === 'legacy_migration_required');
      const canonicalOntology = canonical.entry.kind === 'canonical' ? canonical.ontology : undefined;
      const model = canonicalOntology
        ? canonicalToOntologyModel(canonicalOntology)
        : null;
      if (model && canonicalOntology) {
        const converted = model;
        console.log('[InterviewWindow] Converted ontology:', {
          totalNodes: converted.nodes.length,
          entities: converted.nodes.filter(n => n.type === 'entity').map(n => ({
            name: n.name,
            childrenCount: n.children?.length || 0,
            children: n.children
          }))
        });
        setOntology(converted);
        setDisplayMode('preview');
        const needsBehaviorModeling = (
          canonicalOntology.factTypes.length === 0
          && canonicalOntology.actions.length === 0
          && canonicalOntology.rules.length === 0
          && canonicalOntology.concepts.length > 0
          && canonicalOntology.relations.length > 0
        );
        setBehaviorModelingRequired(needsBehaviorModeling);
        if (needsBehaviorModeling) {
          setActiveTab('行动');
        }
        console.log('[InterviewWindow] Loaded canonical ontology');
      }
      await refreshBehaviorDraft();
    };

    loadArtifacts().catch(console.error);
  }, [projectId, resolvedProjectId, resolvedOntologyId, sessionId, refreshBehaviorDraft]);

  // 发送初始触发消息，启动访谈流程
  // 注意：只在无历史消息时才发送触发消息
  useEffect(() => {
    if (!isInitialized || hasCheckedHistory.current || isThinking) {
      return;
    }

    const shouldAutoStart = async () => {
      hasCheckedHistory.current = true;

      const canonical = await loadProjectCanonicalOntology(resolvedProjectId);
      setLegacyMigrationRequired(canonical.entry.kind === 'legacy_migration_required');
      const existingModel = canonical.entry.kind === 'canonical' && canonical.ontology
        ? canonicalToOntologyModel(canonical.ontology)
        : null;
      const needsBehaviorModeling = canonical.entry.kind === 'canonical' && canonical.ontology
        ? canonical.ontology.factTypes.length === 0
          && canonical.ontology.actions.length === 0
          && canonical.ontology.rules.length === 0
          && canonical.ontology.concepts.length > 0
          && canonical.ontology.relations.length > 0
        : false;
      setBehaviorModelingRequired(needsBehaviorModeling);
      if (hasSessionHistory(piMessages)) {
        if (needsBehaviorModeling) {
          console.log('[InterviewWindow] Resuming behavior confirmation for existing interview', { resolvedProjectId });
          triggerGreeting().catch(console.error);
        } else {
          console.log('[InterviewWindow] Found existing session history, skipping auto-start');
        }
        return;
      }
      if (existingModel) {
        console.log('[InterviewWindow] Existing canonical ontology found, triggering review mode', { resolvedProjectId });
        // 已有模型：显示已有数据，触发 Agent 生成审阅问候语
        if (existingModel.nodes.length > 0) {
          setOntology(existingModel);
          setDisplayModeSync('preview');
        }
        // 触发 Agent 自动生成问候语（不显示用户消息）
        triggerGreeting().catch(console.error);
      } else if (canonical.entry.kind !== 'legacy_migration_required') {
      console.log('[InterviewWindow] No history found, starting interview', { resolvedProjectId });
      sendMessageStream('开始项目访谈').catch(console.error);
      }
    };

    shouldAutoStart().catch(console.error);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isInitialized]);

  const handleProjectComplete = useCallback(() => {
    window.dispatchEvent(new CustomEvent('project:updated', {
      detail: { projectId: resolvedProjectId },
    }));
    onComplete?.({ projectId: resolvedProjectId, canonicalOntology: true });
  }, [resolvedProjectId, onComplete]);

  // 监听工具执行完成后，主动刷新右侧面板模型数据
  // 只在工具执行完成时加载一次，避免轮询
  useEffect(() => {
    if (!projectId || toolExecutions.length === 0) return;

    const lastTool = toolExecutions[toolExecutions.length - 1];
    if (!lastTool || lastTool.status !== 'completed') return;

    refreshBehaviorDraft().catch((error) => console.warn('[InterviewWindow] behavior draft refresh failed', error));

    loadLatestModel(resolvedProjectId).then(model => {
      if (!model) return;
      if (model.nodes.length === 0) return;
      setOntology(model);

      // 首次识别到业务概念时切换到 collecting
      if (displayModeRef.current === 'empty') {
        setDisplayModeSync('collecting');
      }

      // 业务概念足够时切换到 preview
      if (model.nodes.length >= 2) {
        setDisplayModeSync('preview');
        handleProjectComplete();
      }
    }).catch(console.error);
  }, [toolExecutions, projectId, resolvedProjectId, handleProjectComplete, refreshBehaviorDraft]);

  // 监听主进程 artifact_changed 事件，刷新右侧图谱
  // 解决 toolExecutions useEffect 只检查最后一个工具的缺陷
  useEffect(() => {
    if (!projectId || artifactVersion === 0) return;

    console.log('[InterviewWindow] artifact_changed detected, refreshing model', { artifactVersion, resolvedProjectId });
    loadLatestModel(resolvedProjectId).then(model => {
      if (!model) return;
      if (model.nodes.length === 0) return;
      setOntology(model);

      if (displayModeRef.current === 'empty') {
        setDisplayModeSync('collecting');
      }
      if (model.nodes.length >= 2) {
        setDisplayModeSync('preview');
        handleProjectComplete();
      }
    }).catch(console.error);
    refreshBehaviorDraft().catch((error) => console.warn('[InterviewWindow] behavior draft refresh failed', error));
  }, [artifactVersion, projectId, resolvedProjectId, handleProjectComplete, refreshBehaviorDraft]);

  const handleConfirmBehaviorDraft = useCallback(async () => {
    if (!behaviorDraftReview || isConfirmingBehaviorDraft) return;
    setIsConfirmingBehaviorDraft(true);
    setBehaviorDraftError(undefined);
    try {
      const published = await confirmInterviewBehaviorDraft(resolvedProjectId, behaviorDraftReview);
      setBehaviorDraftReview(published);
      const model = await loadLatestModel(resolvedProjectId);
      if (model) {
        setOntology(model);
        setDisplayModeSync('preview');
      }
    } catch (error) {
      setBehaviorDraftError(error instanceof Error ? error.message : '草稿未能发布，请刷新后重试。');
      await refreshBehaviorDraft().catch(() => undefined);
    } finally {
      setIsConfirmingBehaviorDraft(false);
    }
  }, [behaviorDraftReview, isConfirmingBehaviorDraft, refreshBehaviorDraft, resolvedProjectId, setDisplayModeSync]);

  // 转换消息格式给 CUIDialogPanel
  const messages = useMemo(() => {
    return piMessages
      .filter(m => m.role === 'user' || m.role === 'assistant')
      .map(m => ({
        role: m.role as 'user' | 'assistant',
        content: m.content,
        timestamp: m.timestamp || Date.now(),
        isStreaming: m.isStreaming,
        usage: m.usage,
        contextTokenEstimate: m.contextTokenEstimate,
      }));
  }, [piMessages]);

  const handleSendMessage = (content: string) => {
    if (displayMode === 'empty' || displayMode === 'collecting') {
      setDisplayMode('collecting');
    }
    sendMessageStream(content).catch(console.error);
  };

  const handleEntityClick = (entityName: string) => {
    setSelectedEntity(entityName);
    setActiveTab('实体'); // Switch to entity tab
    console.log('[InterviewWindow] Entity clicked:', entityName);
  };

  return (
    <div className="light h-full flex flex-col bg-background text-foreground">
      <InterviewHeader
        mode={displayMode}
        onClose={onClose}
        projectName={resolvedProjectName}
        projectId={resolvedProjectId}
        ontologyId={resolvedOntologyId ?? undefined}
      />
      <div className="flex-1 overflow-hidden">
        <ResizableLayout
          leftPanel={
            <CUIDialogPanel
              sessionId={resolvedSessionId}
              messages={messages}
              isLoading={!isInitialized}
              toolExecutions={toolExecutions}
              onSendMessage={handleSendMessage}
              uploadBasePath={projectUploadBase}
              onStop={abort}
              isGenerating={isThinking}
            />
          }
          rightPanel={
            <ArtifactDisplayPanel
              mode={displayMode}
              ontology={ontology}
              onEntityClick={handleEntityClick}
              selectedEntity={selectedEntity}
              activeTab={activeTab}
              onTabChange={setActiveTab}
              legacyMigrationRequired={legacyMigrationRequired}
              behaviorDraftReview={behaviorDraftReview ?? undefined}
              onConfirmBehaviorDraft={handleConfirmBehaviorDraft}
              isConfirmingBehaviorDraft={isConfirmingBehaviorDraft}
              behaviorDraftError={behaviorDraftError}
              behaviorModelingRequired={behaviorModelingRequired}
            />
          }
          defaultLeftWidth={400}
          minLeftWidth={300}
          maxLeftWidth={600}
        />
      </div>
    </div>
  );
}
