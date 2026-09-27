'use client';

import { useEffect, useState } from 'react';
import { AlertCircle, Database } from 'lucide-react';

import {
  canonicalConceptFields,
  loadProjectCanonicalOntology,
  type ProjectCanonicalOntologyResponse,
} from './project-canonical-ontology';

interface DataTabViewProps {
  projectId: string;
}

/**
 * Canonical instances are displayed directly from the project-bound ontology.
 * Mutating legacy ontology-data stores here would create a second fact source,
 * so editing remains unavailable until OSDK action bindings are supplied.
 */
export function DataTabView({ projectId }: DataTabViewProps) {
  const [result, setResult] = useState<ProjectCanonicalOntologyResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setResult(null);
    setError(null);
    void loadProjectCanonicalOntology(projectId)
      .then((next) => { if (active) setResult(next); })
      .catch((reason: unknown) => {
        if (active) setError(reason instanceof Error ? reason.message : '无法读取项目数据。');
      });
    return () => { active = false; };
  }, [projectId]);

  if (error) {
    return <div className="flex h-full items-center justify-center p-6 text-sm text-destructive">{error}</div>;
  }
  if (!result) {
    return <div className="flex h-full items-center justify-center text-sm text-muted-foreground">加载数据中...</div>;
  }
  if (result.entry.kind !== 'canonical' || !result.ontology) {
    const message = result.entry.kind === 'legacy_migration_required'
      ? '旧项目的数据保持只读，请先完成显式本体迁移。'
      : '项目尚未关联可读取的 canonical ontology。';
    return (
      <div className="flex h-full items-center justify-center p-6 text-center text-sm text-muted-foreground">
        <AlertCircle className="mr-2 h-4 w-4 shrink-0" />{message}
      </div>
    );
  }

  const { ontology } = result;
  const conceptById = new Map(ontology.concepts.map((concept) => [concept.id, concept]));
  return (
    <div className="h-full overflow-auto p-5">
      <div className="mb-5 flex items-start justify-between gap-4 border-b border-border pb-4">
        <div>
          <h3 className="flex items-center gap-2 text-base font-semibold text-foreground"><Database className="h-4 w-4 text-primary" />项目数据</h3>
          <p className="mt-1 text-sm text-muted-foreground">{ontology.instances.length} 条 canonical 实例 · 只读</p>
        </div>
        <span className="rounded bg-muted px-2 py-1 text-xs text-muted-foreground">编辑暂不可用</span>
      </div>
      {ontology.instances.length === 0 ? (
        <p className="text-sm text-muted-foreground">当前本体还没有实例数据。</p>
      ) : (
        <div className="space-y-3">
          {ontology.instances.map((instance) => {
            const concept = conceptById.get(instance.conceptId);
            const fields = concept ? canonicalConceptFields(ontology, concept.id) : [];
            return (
              <section key={instance.id} className="rounded border border-border bg-card p-4">
                <h4 className="font-medium text-card-foreground">{concept?.name ?? instance.conceptId}</h4>
                <dl className="mt-3 grid gap-2 text-sm md:grid-cols-2">
                  {Object.entries(instance.data).map(([name, value]) => {
                    const field = fields.find((candidate) => candidate.name === name);
                    return <div key={name}><dt className="text-xs text-muted-foreground">{field?.name ?? name}</dt><dd className="break-words text-foreground">{typeof value === 'string' ? value : JSON.stringify(value)}</dd></div>;
                  })}
                </dl>
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}
