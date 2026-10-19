'use client';

import { useEffect, useMemo, useState, type ReactNode } from 'react';

import { AlertCircle, Database, List, Network } from 'lucide-react';

import {
  canonicalConceptFields,
  canonicalToOntologyModel,
  loadProjectCanonicalOntology,
  type ProjectCanonicalOntologyResponse,
} from './project-canonical-ontology';
import { LegacyOntologyMigrationCard } from './LegacyOntologyMigrationCard';
import { OntologyGraph } from '../../interview/OntologyGraph';

interface DataTabViewProps {
  projectId: string;
}

/**
 * Canonical instances are displayed directly from the project-bound ontology.
 * Mutating legacy ontology-data stores here would create a second fact source,
 * so editing remains unavailable until OSDK action bindings are supplied.
 */
export const DataTabView = ({ projectId }: DataTabViewProps) => {
  const [result, setResult] = useState<ProjectCanonicalOntologyResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<'graph' | 'list'>('graph');
  const [selectedConcept, setSelectedConcept] = useState<string | undefined>();
  const canonicalOntology = result?.entry.kind === 'canonical' ? result.ontology : undefined;
  const displayOntology = useMemo(
    () => canonicalOntology ? canonicalToOntologyModel(canonicalOntology) : null,
    [canonicalOntology]
  );

  useEffect(() => {
    let active = true;
    setResult(null);
    setError(null);
    void loadProjectCanonicalOntology(projectId)
      .then((next) => {
        if (active) setResult(next);
      })
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
      <div className="flex h-full flex-col items-center justify-center p-6 text-center text-sm text-muted-foreground">
        <div className="flex items-center"><AlertCircle className="mr-2 h-4 w-4 shrink-0" />{message}</div>
        {result.entry.kind === 'legacy_migration_required' ? (
          <LegacyOntologyMigrationCard projectId={projectId} onMigrated={setResult} />
        ) : null}
      </div>
    );
  }

  const { ontology } = result;
  const conceptById = new Map(ontology.concepts.map((concept) => [concept.id, concept]));
  const selected = ontology.concepts.find((concept) => concept.name === selectedConcept);
  const selectedInstances = selected
    ? ontology.instances.filter((instance) => instance.conceptId === selected.id)
    : [];
  return (
    <div className="flex h-full min-h-0 flex-col p-5">
      <div className="mb-5 flex items-start justify-between gap-4 border-b border-border pb-4">
        <div>
          <h3 className="flex items-center gap-2 text-base font-semibold text-foreground"><Database className="h-4 w-4 text-primary" />项目数据</h3>
          <p className="mt-1 text-sm text-muted-foreground">{ontology.instances.length} 条 canonical 实例 · 只读</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex rounded-md border border-border bg-card p-0.5" role="group" aria-label="数据展示方式">
            <ViewButton label="图谱" active={view === 'graph'} onClick={() => setView('graph')} icon={<Network className="h-3.5 w-3.5" />} />
            <ViewButton label="列表" active={view === 'list'} onClick={() => setView('list')} icon={<List className="h-3.5 w-3.5" />} />
          </div>
          <span className="rounded bg-muted px-2 py-1 text-xs text-muted-foreground">只读</span>
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-auto">
        {view === 'graph' ? (
          <div className="grid min-h-full gap-4 xl:grid-cols-[minmax(0,2fr)_minmax(260px,1fr)]">
            <section className="min-w-0 rounded-lg border border-border bg-card p-4">
              <div className="mb-3 flex items-center justify-between">
                <div>
                  <h4 className="text-sm font-semibold text-card-foreground">本体关系图谱</h4>
                  <p className="mt-0.5 text-xs text-muted-foreground">{ontology.concepts.length} 个概念 · {ontology.relations.length} 条关系</p>
                </div>
              </div>
              <OntologyGraph ontology={displayOntology} selectedEntity={selectedConcept} onEntityClick={setSelectedConcept} />
            </section>
            <section className="rounded-lg border border-border bg-card p-4">
              <h4 className="text-sm font-semibold text-card-foreground">{selected ? selected.name : '选择图谱节点'}</h4>
              {!selected ? (
                <p className="mt-2 text-sm text-muted-foreground">点击图谱中的概念，查看其属性和实例数据。</p>
              ) : (
                <div className="mt-3 space-y-4">
                  <div>
                    <p className="text-xs font-medium text-muted-foreground">属性</p>
                    <div className="mt-1 flex flex-wrap gap-1.5">
                      {canonicalConceptFields(ontology, selected.id).map((field) => (
                        <span key={field.id} className="rounded bg-muted px-2 py-1 text-xs text-foreground">{field.name}{field.required ? ' *' : ''}</span>
                      ))}
                    </div>
                  </div>
                  <div>
                    <p className="text-xs font-medium text-muted-foreground">实例 {selectedInstances.length}</p>
                    <div className="mt-1 space-y-2">
                      {selectedInstances.length === 0 ? <p className="text-xs text-muted-foreground">暂无实例</p> : selectedInstances.map((instance) => (
                        <div key={instance.id} className="rounded border border-border bg-background p-2 text-xs text-foreground">
                          {Object.entries(instance.data).slice(0, 4).map(([name, value]) => (
                            <div key={name} className="flex gap-2"><span className="shrink-0 text-muted-foreground">{name}</span><span className="min-w-0 break-words">{typeof value === 'string' ? value : JSON.stringify(value)}</span></div>
                          ))}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </section>
          </div>
        ) : ontology.instances.length === 0 ? (
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
    </div>
  );
}

const ViewButton = ({ label, active, onClick, icon }: { label: string; active: boolean; onClick: () => void; icon: ReactNode }) => {
  return (
    <button type="button" onClick={onClick} aria-pressed={active} className={`flex items-center gap-1 rounded px-2 py-1 text-xs ${active ? 'bg-primary/15 text-primary' : 'text-muted-foreground hover:bg-muted'}`}>
      {icon}{label}
    </button>
  );
}
