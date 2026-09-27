'use client';

import { useEffect, useState } from 'react';
import { AlertCircle, Layers } from 'lucide-react';

import {
  canonicalConceptFields,
  loadProjectCanonicalOntology,
  type ProjectCanonicalOntologyResponse,
} from './project-canonical-ontology';

interface OntologyTabViewProps {
  projectId: string;
}

function MigrationState({ entry }: { entry: ProjectCanonicalOntologyResponse['entry'] }) {
  if (entry.kind === 'legacy_migration_required') {
    return <p>这是一个旧项目。本体仍保持原样；请先在项目迁移入口完成显式迁移。</p>;
  }
  return <p>项目尚未关联可读取的 canonical ontology。</p>;
}

/**
 * Canonical ontology reader for the workspace. Editing is deliberately not
 * exposed until each command has a canonical Action Gate binding.
 */
export function OntologyTabView({ projectId }: OntologyTabViewProps) {
  const [result, setResult] = useState<ProjectCanonicalOntologyResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setResult(null);
    setError(null);
    void loadProjectCanonicalOntology(projectId)
      .then((next) => {
        if (active) setResult(next);
      })
      .catch((reason: unknown) => {
        if (active) setError(reason instanceof Error ? reason.message : '无法读取项目本体。');
      });
    return () => { active = false; };
  }, [projectId]);

  if (error) {
    return <div className="flex h-full items-center justify-center p-6 text-sm text-red-600">{error}</div>;
  }
  if (!result) {
    return <div className="flex h-full items-center justify-center text-sm text-gray-400">加载本体中...</div>;
  }
  if (result.entry.kind !== 'canonical' || !result.ontology) {
    return (
      <div className="flex h-full items-center justify-center p-6 text-center text-sm text-gray-500">
        <AlertCircle className="mr-2 h-4 w-4 shrink-0" />
        <MigrationState entry={result.entry} />
      </div>
    );
  }

  const { ontology } = result;
  const domainById = new Map(ontology.domains.map((domain) => [domain.id, domain.name]));
  return (
    <div className="h-full overflow-auto p-5">
      <div className="mb-5 flex items-start justify-between gap-4 border-b border-gray-200 pb-4">
        <div>
          <h3 className="text-base font-semibold text-gray-800">{ontology.name}</h3>
          <p className="mt-1 text-xs text-gray-500">版本 {ontology.version} · {ontology.id}</p>
        </div>
        <span className="rounded bg-gray-100 px-2 py-1 text-xs text-gray-600">只读本体</span>
      </div>
      <p className="mb-4 text-sm text-gray-500">编辑命令将在具备 canonical Action Gate 绑定后开放。</p>
      <div className="grid gap-3 md:grid-cols-2">
        {ontology.concepts.map((concept) => {
          const fields = canonicalConceptFields(ontology, concept.id);
          return (
            <section key={concept.id} className="rounded border border-gray-200 bg-white p-4">
              <div className="flex items-center gap-2">
                <Layers className="h-4 w-4 text-blue-600" />
                <h4 className="font-medium text-gray-800">{concept.name}</h4>
              </div>
              <p className="mt-1 text-xs text-gray-500">{domainById.get(concept.domainId) ?? '未分类'} · {concept.type}</p>
              {concept.description && <p className="mt-2 text-sm text-gray-600">{concept.description}</p>}
              <ul className="mt-3 space-y-1 text-xs text-gray-600">
                {fields.map((field) => <li key={field.id}>{field.name}（{field.valueType}{field.required ? '，必填' : ''}）</li>)}
                {fields.length === 0 && <li>未定义属性</li>}
              </ul>
            </section>
          );
        })}
      </div>
    </div>
  );
}
