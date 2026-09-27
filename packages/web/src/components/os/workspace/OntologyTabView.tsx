'use client';

import { useEffect, useState } from 'react';

import { AlertCircle } from 'lucide-react';

import {
  canonicalAuthoringRevision,
  describeCanonicalAuthoringIssues,
  loadProjectCanonicalOntology,
  mutateProjectCanonicalOntology,
  type ProjectCanonicalOntologyMutation,
  type ProjectCanonicalOntologyResponse,
} from './project-canonical-ontology';
import { CanonicalOntologyEditor } from '../data-editor/CanonicalOntologyEditor';

interface OntologyTabViewProps {
  projectId: string;
}

const MigrationState = ({
  entry,
}: {
  entry: ProjectCanonicalOntologyResponse['entry'];
}) => {
  if (entry.kind === 'legacy_migration_required') {
    return (
      <p>这是一个旧项目。本体仍保持原样；请先在项目迁移入口完成显式迁移。</p>
    );
  }
  return <p>项目尚未关联可读取的 canonical ontology。</p>;
};

/** Project-bound canonical ontology editor. Legacy projects remain read-only until explicitly migrated. */
export const OntologyTabView = ({ projectId }: OntologyTabViewProps) => {
  const [result, setResult] = useState<ProjectCanonicalOntologyResponse | null>(
    null
  );
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let active = true;
    setResult(null);
    setError(null);
    setNotice(null);
    void loadProjectCanonicalOntology(projectId)
      .then((next) => {
        if (active) {
          setResult(next);
        }
      })
      .catch((reason: unknown) => {
        if (active) {
          setError(
            reason instanceof Error ? reason.message : '无法读取项目本体。'
          );
        }
      });
    return () => {
      active = false;
    };
  }, [projectId]);

  if (error && !result) {
    return (
      <div className="flex h-full items-center justify-center p-6 text-sm text-red-600">
        {error}
      </div>
    );
  }
  if (!result) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-gray-400">
        加载本体中...
      </div>
    );
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
  const handleMutate = async (
    mutation: ProjectCanonicalOntologyMutation
  ): Promise<void> => {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const outcome = await mutateProjectCanonicalOntology({
        projectId,
        ontology,
        mutation,
      });
      if (outcome.status === 'accepted') {
        setResult((current) =>
          current ? { ...current, ontology: outcome.ontology } : current
        );
        setNotice('本体已保存。');
        return;
      }
      if (outcome.status === 'conflict') {
        setResult(outcome.snapshot);
        setNotice(describeCanonicalAuthoringIssues(outcome.issues));
        return;
      }
      setError(describeCanonicalAuthoringIssues(outcome.issues));
      throw new Error(describeCanonicalAuthoringIssues(outcome.issues));
    } catch (reason) {
      const message =
        reason instanceof Error ? reason.message : '无法更新项目本体。';
      setError(message);
      throw reason;
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="h-full overflow-auto p-5">
      <div className="mb-5 flex items-start justify-between gap-4 border-b border-gray-200 pb-4">
        <div>
          <h3 className="text-base font-semibold text-gray-800">
            {ontology.name}
          </h3>
          <p className="mt-1 text-xs text-gray-500">
            版本 {ontology.version} · {ontology.id}
          </p>
        </div>
        <span className="rounded bg-blue-50 px-2 py-1 text-xs text-blue-700">
          编辑 revision {canonicalAuthoringRevision(ontology)}
        </span>
      </div>
      {notice && (
        <div
          role="status"
          className="mb-4 rounded border border-blue-200 bg-blue-50 px-3 py-2 text-sm text-blue-700"
        >
          {notice}
        </div>
      )}
      {error && (
        <div
          role="alert"
          className="mb-4 rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700"
        >
          {error}
        </div>
      )}
      <CanonicalOntologyEditor
        ontology={ontology}
        busy={busy}
        onMutate={handleMutate}
      />
    </div>
  );
};
