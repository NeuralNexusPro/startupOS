'use client';

import { useState } from 'react';

import { ArrowRight, Loader2 } from 'lucide-react';

import {
  migrateProjectLegacyOntology,
  previewProjectLegacyOntology,
  type ProjectCanonicalOntologyResponse,
  type ProjectLegacyOntologyMigrationPreview,
} from './project-canonical-ontology';

interface LegacyOntologyMigrationCardProps {
  projectId: string;
  onMigrated: (result: ProjectCanonicalOntologyResponse) => void;
}

export function LegacyOntologyMigrationCard({
  projectId,
  onMigrated,
}: LegacyOntologyMigrationCardProps) {
  const [preview, setPreview] = useState<ProjectLegacyOntologyMigrationPreview | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const inspect = async (): Promise<void> => {
    setBusy(true);
    setError(null);
    try {
      setPreview(await previewProjectLegacyOntology(projectId));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '无法检查旧版业务模型。');
    } finally {
      setBusy(false);
    }
  };

  const migrate = async (): Promise<void> => {
    if (!preview?.sourceKind || !preview.ontology) return;
    setBusy(true);
    setError(null);
    try {
      onMigrated(await migrateProjectLegacyOntology(projectId, preview.sourceKind));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '本体迁移失败，请重试。');
    } finally {
      setBusy(false);
    }
  };

  const diagnostics = preview?.diagnostics ?? [];
  return (
    <div className="mt-4 w-full max-w-md rounded-lg border border-border bg-card p-4 text-left text-card-foreground">
      <p className="text-sm font-medium">迁移旧版业务模型</p>
      <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
        先检查迁移内容；只有你确认后才会写入新本体，旧文件会保留备份。
      </p>

      {preview?.ontology && (
        <div className="mt-3 rounded-md bg-muted px-3 py-2 text-xs text-foreground">
          将迁移 {preview.ontology.concepts.length} 个概念、{preview.ontology.properties.length} 个属性、{preview.ontology.relations.length} 条关系
        </div>
      )}
      {diagnostics.length > 0 && (
        <div className="mt-3 space-y-1 text-xs text-amber-700">
          {diagnostics.slice(0, 3).map((diagnostic, index) => (
            <p key={`${diagnostic.code}-${diagnostic.path}-${index}`}>{diagnostic.message}</p>
          ))}
        </div>
      )}
      {error && <p className="mt-3 text-xs text-destructive">{error}</p>}

      <div className="mt-4 flex justify-end">
        {!preview?.ontology ? (
          <button
            type="button"
            className="inline-flex items-center gap-2 rounded-md bg-primary px-3 py-2 text-xs font-medium text-primary-foreground disabled:opacity-50"
            disabled={busy}
            onClick={() => void inspect()}
          >
            {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
            检查迁移内容
          </button>
        ) : (
          <button
            type="button"
            className="inline-flex items-center gap-2 rounded-md bg-primary px-3 py-2 text-xs font-medium text-primary-foreground disabled:opacity-50"
            disabled={busy || !preview.sourceKind}
            onClick={() => void migrate()}
          >
            {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ArrowRight className="h-3.5 w-3.5" />}
            确认迁移
          </button>
        )}
      </div>
    </div>
  );
}
