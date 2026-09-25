'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ChevronUp, Loader2, Plus } from 'lucide-react';

import type {
  OntologyApprovedProjectTaskData,
  OntologyApprovedTaskContractSummary,
} from '@originos/core/lib/features/project/client';
import type { DesignGap } from '@originos/core/lib/features/solution/types';
import {
  createProjectTaskBoardRequestId,
  createProjectTaskFromTemplate,
  listApprovedTaskTemplates,
  type ProjectTaskBoardServiceError,
} from '@/services/project-task-board';
import { Button } from '@/components/ui/button';

interface ProjectTaskCreationPanelProps {
  readonly projectId: string;
  readonly onCreated: (created: OntologyApprovedProjectTaskData) => void;
  readonly onOpenSolutionDesign?: () => void;
}

interface SemanticBindingDraft {
  readonly factTypeId: string;
  readonly factId: string;
  readonly factVersion: string;
}

const EMPTY_BINDING: SemanticBindingDraft = { factTypeId: '', factId: '', factVersion: '' };

function serviceErrorMessage(error: ProjectTaskBoardServiceError): string {
  return `${error.message}${error.retryable ? '，可以重试。' : ''}`;
}

function localGap(
  code: string,
  message: string,
  remediation: string,
  path?: string,
  refId?: string,
): DesignGap {
  return {
    code,
    severity: 'error',
    scope: 'contract',
    message,
    remediation,
    ...(path ? { path } : {}),
    ...(refId ? { refId } : {}),
  };
}

function contractKey(contract: OntologyApprovedTaskContractSummary): string {
  return `${contract.solutionId}\u0000${contract.solutionVersion}\u0000${contract.contractId}`;
}

export function ProjectTaskCreationPanel({
  projectId,
  onCreated,
  onOpenSolutionDesign,
}: ProjectTaskCreationPanelProps) {
  const [expanded, setExpanded] = useState(false);
  const [catalog, setCatalog] = useState<readonly OntologyApprovedTaskContractSummary[]>();
  const [catalogLoading, setCatalogLoading] = useState(false);
  const [catalogError, setCatalogError] = useState<ProjectTaskBoardServiceError>();
  const [selectedContractKey, setSelectedContractKey] = useState('');
  const [selectedTemplateId, setSelectedTemplateId] = useState('');
  const [objective, setObjective] = useState('');
  const [bindings, setBindings] = useState<Record<string, SemanticBindingDraft>>({});
  const [requestId, setRequestId] = useState(() => createProjectTaskBoardRequestId());
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<ProjectTaskBoardServiceError>();
  const [designGaps, setDesignGaps] = useState<readonly DesignGap[]>([]);
  const [feedback, setFeedback] = useState('');
  const submitRef = useRef<HTMLButtonElement>(null);

  const selectedContract = useMemo(() => catalog?.find(
    (contract) => contractKey(contract) === selectedContractKey,
  ), [catalog, selectedContractKey]);
  const selectedTemplate = selectedContract?.taskTemplates.find(
    (template) => template.id === selectedTemplateId,
  );

  useEffect(() => {
    setExpanded(false);
    setCatalog(undefined);
    setCatalogError(undefined);
    setSelectedContractKey('');
    setSelectedTemplateId('');
    setObjective('');
    setBindings({});
    setRequestId(createProjectTaskBoardRequestId());
    setCreateError(undefined);
    setDesignGaps([]);
    setFeedback('');
  }, [projectId]);

  useEffect(() => {
    if (!creating && (createError || designGaps.length > 0)) {
      submitRef.current?.focus();
    }
  }, [createError, creating, designGaps]);

  const rotateRequest = useCallback(() => {
    setRequestId(createProjectTaskBoardRequestId());
    setCreateError(undefined);
    setDesignGaps([]);
    setFeedback('');
  }, []);

  const loadCatalog = useCallback(async () => {
    setCatalogLoading(true);
    setCatalogError(undefined);
    const result = await listApprovedTaskTemplates({
      projectId,
      requestId: createProjectTaskBoardRequestId(),
    });
    setCatalogLoading(false);
    if (!result.ok) {
      setCatalogError(result.error);
      return;
    }
    setCatalog(result.data.contracts);
    if (result.data.contracts.length === 0) {
      setDesignGaps([localGap(
        'TASK_TEMPLATE_NOT_AVAILABLE',
        '当前项目没有可用的已发布任务模板。',
        '返回方案设计，完成语义契约与任务模板发布后再创建任务。',
        'taskTemplateId',
      )]);
    }
  }, [projectId]);

  const toggleExpanded = () => {
    const next = !expanded;
    setExpanded(next);
    if (next && catalog === undefined && !catalogLoading) void loadCatalog();
  };

  const selectContract = (value: string) => {
    setSelectedContractKey(value);
    setSelectedTemplateId('');
    setObjective('');
    setBindings({});
    rotateRequest();
  };

  const selectTemplate = (value: string) => {
    setSelectedTemplateId(value);
    const template = selectedContract?.taskTemplates.find(({ id }) => id === value);
    setObjective(template?.objective ?? objective);
    const initialBindings = Object.fromEntries((selectedContract?.objectSlots ?? []).map((slot) => {
      const matchingPolicies = selectedContract?.factPolicies.filter(({ factType }) =>
        factType.ontologyId === slot.concept.ontologyId
        && factType.ontologyVersion === slot.concept.ontologyVersion
        && factType.conceptId === slot.concept.conceptId) ?? [];
      return [slot.id, {
        ...EMPTY_BINDING,
        factTypeId: matchingPolicies.length === 1 ? matchingPolicies[0]!.factType.factTypeId : '',
      }];
    }));
    setBindings(initialBindings);
    rotateRequest();
  };

  const updateBinding = (
    slotId: string,
    field: keyof SemanticBindingDraft,
    value: string,
  ) => {
    setBindings((current) => ({
      ...current,
      [slotId]: { ...(current[slotId] ?? EMPTY_BINDING), [field]: value },
    }));
    rotateRequest();
  };

  const validate = (): readonly DesignGap[] => {
    const gaps: DesignGap[] = [];
    if (!selectedContract || !selectedTemplate) {
      gaps.push(localGap(
        'TASK_TEMPLATE_REQUIRED',
        '手动目标必须绑定一个已发布任务模板。',
        '选择已发布契约与任务模板；没有模板时返回方案设计。',
        'taskTemplateId',
      ));
      return gaps;
    }
    if (!objective.trim()) {
      gaps.push(localGap(
        'TASK_OBJECTIVE_REQUIRED',
        '任务目标不能为空。',
        '填写该模板本次执行的明确目标。',
        'objective',
      ));
    }
    for (const slot of selectedContract.objectSlots) {
      const binding = bindings[slot.id] ?? EMPTY_BINDING;
      const hasAnyValue = Boolean(binding.factTypeId || binding.factId || binding.factVersion);
      if ((slot.required || hasAnyValue)
        && (!binding.factTypeId.trim() || !binding.factId.trim() || !binding.factVersion.trim())) {
        gaps.push(localGap(
          'REQUIRED_SEMANTIC_OBJECT_MISSING',
          `语义对象 ${slot.id} 缺少完整的 FactType、factId 或 factVersion。`,
          '绑定精确的 canonical fact 后再创建任务。',
          `semanticInputs.${slot.id}`,
          slot.id,
        ));
      }
    }
    return gaps;
  };

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (creating) return;
    const localGaps = validate();
    if (localGaps.length > 0) {
      setDesignGaps(localGaps);
      setCreateError(undefined);
      submitRef.current?.focus();
      return;
    }
    if (!selectedContract || !selectedTemplate) return;

    setCreating(true);
    setCreateError(undefined);
    setDesignGaps([]);
    setFeedback('');
    const semanticInputs = selectedContract.objectSlots.flatMap((slot) => {
      const binding = bindings[slot.id] ?? EMPTY_BINDING;
      if (!binding.factTypeId.trim() || !binding.factId.trim() || !binding.factVersion.trim()) return [];
      return [{
        slotId: slot.id,
        factRef: {
          ontologyId: slot.concept.ontologyId,
          ontologyVersion: slot.concept.ontologyVersion,
          conceptId: slot.concept.conceptId,
          factTypeId: binding.factTypeId.trim(),
          factId: binding.factId.trim(),
          factVersion: binding.factVersion.trim(),
        },
      }];
    });
    const result = await createProjectTaskFromTemplate({
      projectId,
      requestId,
      solutionId: selectedContract.solutionId,
      solutionVersion: selectedContract.solutionVersion,
      contractId: selectedContract.contractId,
      contractHash: selectedContract.contractHash,
      taskTemplateId: selectedTemplate.id,
      objective: objective.trim(),
      semanticInputs,
    });
    setCreating(false);
    if (!result.ok) {
      setCreateError(result.error);
      setDesignGaps(result.error.designGaps);
      submitRef.current?.focus();
      return;
    }
    onCreated(result.data);
    setFeedback(`任务 ${result.data.task.taskId} 已创建并绑定 Run ${result.data.run.runId}。`);
    setRequestId(createProjectTaskBoardRequestId());
  };

  return (
    <section className="border-b border-slate-200 bg-white" aria-label="新建项目任务">
      <div className="flex items-center justify-between px-4 py-2">
        <div>
          <h2 className="text-sm font-medium text-slate-800">从已发布方案创建任务</h2>
          <p className="text-xs text-slate-500">任务只会从已批准的语义契约与模板创建。</p>
        </div>
        <Button type="button" size="sm" variant="outline" aria-expanded={expanded} onClick={toggleExpanded}>
          {expanded ? <ChevronUp className="mr-1 h-3.5 w-3.5" aria-hidden="true" /> : <Plus className="mr-1 h-3.5 w-3.5" aria-hidden="true" />}
          {expanded ? '收起' : '新建任务'}
        </Button>
      </div>

      {expanded && (
        <form className="grid gap-4 border-t border-slate-100 px-4 py-4 md:grid-cols-2" onSubmit={submit}>
          {catalogLoading && <p className="col-span-full flex items-center text-sm text-slate-600"><Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />正在读取已发布任务模板</p>}
          {catalogError && <div role="alert" className="col-span-full rounded bg-rose-50 p-3 text-sm text-rose-800">模板目录读取失败：{serviceErrorMessage(catalogError)}</div>}

          <label className="text-sm text-slate-700">已发布契约
            <select aria-label="已发布契约" value={selectedContractKey} onChange={(event) => selectContract(event.target.value)} disabled={creating || catalogLoading}
              className="mt-1 h-9 w-full rounded border border-slate-200 bg-white px-2 outline-none focus:border-blue-500">
              <option value="">请选择已发布契约</option>
              {(catalog ?? []).map((contract) => <option key={contractKey(contract)} value={contractKey(contract)}>{contract.solutionId} · {contract.solutionVersion} · {contract.contractId}</option>)}
            </select>
          </label>

          <label className="text-sm text-slate-700">任务模板
            <select aria-label="任务模板" value={selectedTemplateId} onChange={(event) => selectTemplate(event.target.value)} disabled={creating || !selectedContract}
              className="mt-1 h-9 w-full rounded border border-slate-200 bg-white px-2 outline-none focus:border-blue-500">
              <option value="">请选择已发布任务模板</option>
              {(selectedContract?.taskTemplates ?? []).map((template) => <option key={template.id} value={template.id}>{template.objective} · {template.id}</option>)}
            </select>
          </label>

          <label className="col-span-full text-sm text-slate-700">本次任务目标
            <textarea aria-label="本次任务目标" value={objective} onChange={(event) => { setObjective(event.target.value); rotateRequest(); }} disabled={creating}
              className="mt-1 min-h-16 w-full rounded border border-slate-200 p-2 outline-none focus:border-blue-500" placeholder="选择模板后可补充本次执行目标" />
          </label>

          {selectedContract?.objectSlots.map((slot) => {
            const binding = bindings[slot.id] ?? EMPTY_BINDING;
            const policies = selectedContract.factPolicies.filter(({ factType }) =>
              factType.ontologyId === slot.concept.ontologyId
              && factType.ontologyVersion === slot.concept.ontologyVersion
              && factType.conceptId === slot.concept.conceptId);
            return <fieldset key={slot.id} className="col-span-full grid gap-3 rounded border border-slate-200 p-3 md:grid-cols-3">
              <legend className="px-1 text-sm font-medium text-slate-800">语义对象 {slot.id}{slot.required ? '（必填）' : '（可选）'}</legend>
              <p className="col-span-full text-xs text-slate-500">{slot.concept.ontologyId}@{slot.concept.ontologyVersion} / {slot.concept.conceptId}</p>
              <label className="text-sm text-slate-700">FactType
                <select aria-label={`${slot.id} FactType`} value={binding.factTypeId} onChange={(event) => updateBinding(slot.id, 'factTypeId', event.target.value)} disabled={creating}
                  className="mt-1 h-9 w-full rounded border border-slate-200 bg-white px-2 outline-none focus:border-blue-500">
                  <option value="">请选择 FactType</option>
                  {policies.map(({ factType }) => <option key={factType.factTypeId} value={factType.factTypeId}>{factType.factTypeId}</option>)}
                </select>
              </label>
              <label className="text-sm text-slate-700">factId
                <input aria-label={`${slot.id} factId`} value={binding.factId} onChange={(event) => updateBinding(slot.id, 'factId', event.target.value)} disabled={creating}
                  className="mt-1 h-9 w-full rounded border border-slate-200 px-2 outline-none focus:border-blue-500" />
              </label>
              <label className="text-sm text-slate-700">factVersion
                <input aria-label={`${slot.id} factVersion`} value={binding.factVersion} onChange={(event) => updateBinding(slot.id, 'factVersion', event.target.value)} disabled={creating}
                  className="mt-1 h-9 w-full rounded border border-slate-200 px-2 outline-none focus:border-blue-500" />
              </label>
            </fieldset>;
          })}

          {createError && <div role="alert" className="col-span-full rounded bg-rose-50 p-3 text-sm text-rose-800">创建未执行：{serviceErrorMessage(createError)}</div>}
          {designGaps.length > 0 && <div role="alert" className="col-span-full rounded border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
            <p className="font-medium">方案仍有 DesignGap，任务尚未创建</p>
            <ul className="mt-2 space-y-2">{designGaps.map((gap, index) => <li key={`${gap.code}:${gap.path ?? index}`}><p>{gap.message}</p><p className="text-xs text-amber-800">{gap.remediation}</p></li>)}</ul>
            {onOpenSolutionDesign && <Button type="button" size="sm" variant="outline" className="mt-3" onClick={onOpenSolutionDesign}>返回方案设计</Button>}
          </div>}
          {feedback && <p className="col-span-full rounded bg-emerald-50 p-3 text-sm text-emerald-800" role="status">{feedback}</p>}

          <div className="col-span-full flex justify-end">
            <Button ref={submitRef} type="submit" size="sm" disabled={creating || catalogLoading}>
              {creating && <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" aria-hidden="true" />}
              {creating ? '正在创建，任务尚未加入看板' : '创建并启动任务'}
            </Button>
          </div>
        </form>
      )}
    </section>
  );
}
