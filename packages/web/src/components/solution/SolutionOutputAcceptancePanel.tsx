'use client';

import { useEffect, useMemo, useState } from 'react';
import type { ReactElement } from 'react';

import {
  getSolutionOutputAcceptance,
  saveSolutionOutputAcceptance,
} from '@/services/solution-output-acceptance-client';
import type {
  SolutionNodeOutputAcceptance,
  SolutionOutputAcceptanceMode,
  SolutionOutputAcceptanceSnapshot,
} from '@originos/core/lib/features/solution';

import type { TopologyAgent, TopologySkill } from './solution-topology';

interface SolutionOutputAcceptancePanelProps {
  readonly projectId: string;
  readonly solutionId: string;
  readonly solutionVersion: string;
  readonly agents: readonly TopologyAgent[];
  readonly skills: readonly TopologySkill[];
  readonly onCreateVersion: () => void;
}

const MODE_LABELS: Record<SolutionOutputAcceptanceMode, string> = {
  automatic: '自动验收',
  user: '由我确认',
  role: '指定角色确认',
};

function errorMessage(response: {
  readonly error?: { readonly message: string };
}): string {
  return response.error?.message ?? '产出验收策略操作失败。';
}

export function SolutionOutputAcceptancePanel({
  projectId,
  solutionId,
  solutionVersion,
  agents,
  skills,
  onCreateVersion,
}: SolutionOutputAcceptancePanelProps): ReactElement {
  const [snapshot, setSnapshot] =
    useState<SolutionOutputAcceptanceSnapshot | null>(null);
  const [draft, setDraft] = useState<readonly SolutionNodeOutputAcceptance[]>(
    []
  );
  const [pending, setPending] = useState(true);
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [failure, setFailure] = useState<string | null>(null);

  const displayNames = useMemo(() => {
    const names = new Map<string, string>();
    for (const agent of agents) names.set(agent.id, agent.name);
    for (const skill of skills) {
      const name = skill.name?.trim();
      if (!name) continue;
      for (const key of [skill.id, skill.code, skill.name]) {
        if (key) names.set(key, name);
      }
    }
    return names;
  }, [agents, skills]);

  useEffect(() => {
    let active = true;
    setPending(true);
    setFailure(null);
    setFeedback(null);
    void getSolutionOutputAcceptance({
      projectId,
      solutionId,
      solutionVersion,
    })
      .then((response) => {
        if (!active) return;
        if (!response.success || !response.data) {
          throw new Error(errorMessage(response));
        }
        setSnapshot(response.data);
        setDraft(
          response.data.nodes.map(({ nodeId, mode, approverRole }) => ({
            nodeId,
            mode,
            ...(approverRole ? { approverRole } : {}),
          }))
        );
      })
      .catch((error: unknown) => {
        if (active) {
          setFailure(
            error instanceof Error ? error.message : '读取产出验收策略失败。'
          );
        }
      })
      .finally(() => {
        if (active) setPending(false);
      });
    return () => {
      active = false;
    };
  }, [projectId, solutionId, solutionVersion]);

  const updateNode = (
    nodeId: string,
    mode: SolutionOutputAcceptanceMode,
    approverRole?: string
  ): void => {
    setFeedback(null);
    setFailure(null);
    setDraft((current) =>
      current.map((item) =>
        item.nodeId === nodeId
          ? {
              nodeId,
              mode,
              ...(mode === 'role' && approverRole ? { approverRole } : {}),
            }
          : item
      )
    );
  };

  const save = async (): Promise<void> => {
    setSaving(true);
    setFeedback(null);
    setFailure(null);
    try {
      const response = await saveSolutionOutputAcceptance({
        projectId,
        solutionId,
        solutionVersion,
        nodes: draft,
      });
      if (!response.success || !response.data) {
        throw new Error(errorMessage(response));
      }
      setSnapshot(response.data);
      setDraft(
        response.data.nodes.map(({ nodeId, mode, approverRole }) => ({
          nodeId,
          mode,
          ...(approverRole ? { approverRole } : {}),
        }))
      );
      setFeedback('产出验收策略已保存。');
    } catch (error) {
      setFailure(
        error instanceof Error ? error.message : '保存产出验收策略失败。'
      );
    } finally {
      setSaving(false);
    }
  };

  if (pending) {
    return (
      <section className="rounded-xl border border-border bg-card p-5">
        <p role="status" className="text-sm text-muted-foreground">
          正在读取产出验收策略…
        </p>
      </section>
    );
  }

  if (!snapshot) {
    return (
      <section className="rounded-xl border border-red-200 bg-red-50 p-5">
        <p role="alert" className="text-sm text-red-800">
          {failure ?? '无法读取产出验收策略。'}
        </p>
      </section>
    );
  }

  const draftByNode = new Map(draft.map((item) => [item.nodeId, item]));

  return (
    <section className="rounded-xl border border-border bg-card p-5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h4 className="text-sm font-semibold text-foreground">产出验收</h4>
          <p className="mt-1 text-xs text-muted-foreground">
            Agent 或 Skill 的结果会先通过校验，再按这里的方式接纳。
          </p>
        </div>
        {snapshot.locked && (
          <button
            type="button"
            onClick={onCreateVersion}
            className="rounded-md border border-border px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-muted"
          >
            创建新版本
          </button>
        )}
      </div>

      {snapshot.locked && (
        <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
          该方案已确认或发布，验收策略只读。如需调整，请创建新版本。
        </p>
      )}

      <div className="mt-4 space-y-3">
        {snapshot.nodes.map((node) => {
          const value = draftByNode.get(node.nodeId) ?? node;
          const nodeName =
            displayNames.get(node.contractRef) ??
            displayNames.get(node.nodeId) ??
            node.name;
          return (
            <div
              key={node.nodeId}
              className="grid gap-3 rounded-lg border border-border bg-background p-3 md:grid-cols-[minmax(0,1fr)_12rem_12rem] md:items-center"
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-foreground">
                  {nodeName}
                </p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {node.kind === 'agent' ? 'Agent' : 'Skill'}
                </p>
              </div>
              <label className="text-xs text-muted-foreground">
                <span className="sr-only">{nodeName}的验收方式</span>
                <select
                  aria-label={`${nodeName}的验收方式`}
                  value={value.mode}
                  disabled={snapshot.locked || saving}
                  onChange={(event) => {
                    const mode = event.target.value as SolutionOutputAcceptanceMode;
                    const defaultRole = snapshot.roles[0]?.id;
                    updateNode(
                      node.nodeId,
                      mode,
                      mode === 'role' ? value.approverRole ?? defaultRole : undefined
                    );
                  }}
                  className="w-full rounded-md border border-input bg-background px-2.5 py-2 text-sm text-foreground disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {Object.entries(MODE_LABELS).map(([mode, label]) => (
                    <option key={mode} value={mode}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>
              {value.mode === 'role' ? (
                <label className="text-xs text-muted-foreground">
                  <span className="sr-only">{nodeName}的验收角色</span>
                  <select
                    aria-label={`${nodeName}的验收角色`}
                    value={value.approverRole ?? ''}
                    disabled={snapshot.locked || saving}
                    onChange={(event) =>
                      updateNode(node.nodeId, 'role', event.target.value)
                    }
                    className="w-full rounded-md border border-input bg-background px-2.5 py-2 text-sm text-foreground disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    <option value="" disabled>
                      选择角色
                    </option>
                    {snapshot.roles.map((role) => (
                      <option key={role.id} value={role.id}>
                        {role.name}
                      </option>
                    ))}
                  </select>
                </label>
              ) : (
                <span className="hidden md:block" />
              )}
            </div>
          );
        })}
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        {!snapshot.locked && (
          <button
            type="button"
            disabled={saving}
            onClick={() => void save()}
            className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-opacity disabled:cursor-not-allowed disabled:opacity-60"
          >
            {saving ? '保存中…' : '保存验收策略'}
          </button>
        )}
        {feedback && (
          <p role="status" className="text-sm text-emerald-700">
            {feedback}
          </p>
        )}
        {failure && (
          <p role="alert" className="text-sm text-red-700">
            {failure}
          </p>
        )}
      </div>
    </section>
  );
}
