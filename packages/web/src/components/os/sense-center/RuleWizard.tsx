'use client';

import { useEffect, useMemo, useState } from 'react';

import { Button } from '@/components/ui/button';
import { listPerceptionTargetAssets, type PerceptionTargetAsset } from '@/services/perceptionTargetService';
import type { ConnectorSummary } from '@/store/perceptionStore';
import type { ExternalTriggerGrant, JevProviderSummary, PerceptionTargetKind, PerceptionTriggerRule, TriggerFilterPath, TriggerFilterOperator } from '@originos/core/types';

interface RuleWizardProps { connectors: ConnectorSummary[]; grants: ExternalTriggerGrant[]; jevProvider?: JevProviderSummary; initial?: PerceptionTriggerRule; loadAssets?(kind: PerceptionTargetKind): Promise<PerceptionTargetAsset[]>; onSave(rule: PerceptionTriggerRule): Promise<void>; onCancel(): void }

const RULE_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,191}$/;
const TARGET_KINDS: PerceptionTargetKind[] = ['project', 'role-agent', 'skill'];

export function RuleWizard({ connectors, grants, jevProvider, initial, loadAssets = listPerceptionTargetAssets, onSave, onCancel }: RuleWizardProps): JSX.Element {
  const enabledGrants = useMemo(() => grants.filter((grant) => grant.enabled), [grants]);
  const initialConnectorId = initial?.conditions.find((condition) => condition.path === 'connectorId' && condition.operator === 'equals' && typeof condition.value === 'string')?.value;
  const initialCondition = initial?.conditions.find((condition) => condition.path !== 'connectorId');
  const [id, setId] = useState(() => initial?.id ?? `rule-${Date.now().toString(36)}`);
  const [connectorId, setConnectorId] = useState(() => {
    const explicit = connectors.find((item) => item.id === initialConnectorId)?.id;
    if (explicit || !initial) return explicit ?? connectors[0]?.id ?? '';
    const matching = connectors.filter((item) => initial.sources.includes(item.source));
    return matching.length === 1 ? matching[0]!.id : '';
  });
  const connectorGrants = useMemo(() => enabledGrants.filter((grant) =>
    (!grant.allowedConnectorIds || grant.allowedConnectorIds.includes(connectorId))
    && (!grant.allowedRuleIds || grant.allowedRuleIds.includes(id))), [connectorId, enabledGrants, id]);
  const initialDirect = initial?.routingMode === 'jev' ? undefined : initial;
  const [routingMode, setRoutingMode] = useState<'direct' | 'jev'>(() => initial?.routingMode === 'jev' ? 'jev' : 'direct');
  const [targetKey, setTargetKey] = useState(() => initialDirect ? targetKeyOf(initialDirect.target) : '');
  const [candidateKeys, setCandidateKeys] = useState(() => initial?.routingMode === 'jev'
    ? initial.decision.candidates.filter((candidate) => candidate.action === 'dispatch').map((candidate) => candidate.key)
    : []);
  const [cognitiveGuidance, setCognitiveGuidance] = useState(() => initial?.routingMode === 'jev' ? initial.decision.cognitiveGuidance ?? '' : '');
  const [path, setPath] = useState<TriggerFilterPath>(initialCondition?.path ?? 'content.text');
  const [operator, setOperator] = useState<TriggerFilterOperator>(initialCondition?.operator ?? 'contains');
  const [value, setValue] = useState(() => typeof initialCondition?.value === 'string' ? initialCondition.value : '');
  const [ownerKey, setOwnerKey] = useState(() => initialDirect?.target.kind === 'skill' && initialDirect.target.skillOwnership?.mode === 'inherited' ? `${initialDirect.target.skillOwnership.ownerKind}:${initialDirect.target.skillOwnership.ownerId}` : 'ephemeral');
  const [requireHitl, setRequireHitl] = useState(initial?.execution.requireHitl ?? true);
  const [enabled, setEnabled] = useState(initial?.enabled ?? false);
  const [assetsByKey, setAssetsByKey] = useState<Map<string, PerceptionTargetAsset>>(() => new Map());
  const [error, setError] = useState<string>();
  const candidateGrants = useMemo(() => enabledGrants.filter((grant) => !grant.allowedRuleIds || grant.allowedRuleIds.includes(id)), [enabledGrants, id]);

  useEffect(() => {
    let active = true;
    void Promise.allSettled(TARGET_KINDS.map((kind) => loadAssets(kind))).then((groups) => {
      if (!active) return;
      const next = new Map<string, PerceptionTargetAsset>();
      groups.forEach((group, index) => {
        if (group.status === 'fulfilled') for (const asset of group.value) next.set(`${TARGET_KINDS[index]}:${asset.id}`, asset);
      });
      setAssetsByKey(next);
    });
    return () => { active = false; };
  }, [loadAssets]);

  useEffect(() => {
    setTargetKey((current) => connectorGrants.some((grant) => `${grant.target.kind}:${grant.target.id}` === current)
      ? current
      : connectorGrants[0] ? `${connectorGrants[0].target.kind}:${connectorGrants[0].target.id}` : '');
    setCandidateKeys((current) => current.filter((key) => candidateGrants.some((grant) => targetKeyOf(grant.target) === key)));
  }, [candidateGrants, connectorGrants]);

  const submit = async (event: React.FormEvent): Promise<void> => {
    event.preventDefault(); setError(undefined);
    if (!RULE_ID_PATTERN.test(id)) { setError('规则 ID 只能使用英文字母、数字和 . _ : -，且必须以字母或数字开头'); return; }
    const connector = connectors.find((item) => item.id === connectorId);
    const grant = connectorGrants.find((item) => targetKeyOf(item.target) === targetKey);
    const selectedGrants = candidateGrants.filter((item) => candidateKeys.includes(targetKeyOf(item.target)));
    if ((routingMode === 'direct' && (!connector || !grant)) || (routingMode === 'jev' && (connectors.length === 0 || selectedGrants.length === 0))) { setError('必须先配置感知源并选择已授权目标'); return; }
    if (routingMode === 'jev' && enabled && (!jevProvider?.enabled || !jevProvider.credentialConfigured)) { setError('智能决策模型未配置或未启用，请先到模型设置完成配置'); return; }
    const now = new Date().toISOString();
    const target = grant?.target.kind === 'skill'
      ? { ...grant.target, skillOwnership: ownerKey === 'ephemeral' ? { mode: 'ephemeral' as const } : inheritedOwner(ownerKey) }
      : grant?.target;
    const base = routingMode === 'direct'
      ? { id, enabled, sources: [connector!.source], eventTypes: [connector!.source === 'email' ? 'mail.received' as const : 'message.received' as const], conditions: [{ path: 'connectorId' as const, operator: 'equals' as const, value: connector!.id }, ...(value ? [{ path, operator, value }] : [])], execution: { requireHitl, maxAttempts: initial?.execution.maxAttempts ?? 3 }, createdAt: initial?.createdAt ?? now, updatedAt: now }
      : { id, enabled, sources: [...new Set(connectors.map((item) => item.source))], eventTypes: [...new Set(connectors.map((item) => item.source === 'email' ? 'mail.received' as const : 'message.received' as const))], conditions: [], execution: { requireHitl, maxAttempts: initial?.execution.maxAttempts ?? 3 }, createdAt: initial?.createdAt ?? now, updatedAt: now };
    try {
      await onSave(routingMode === 'jev'
        ? { ...base, routingMode: 'jev', decision: { catalogVersion: '1.0', policyVersion: '1.0', candidates: [{ key: 'ignore', action: 'ignore' }, { key: 'notify_user', action: 'notify_user' }, { key: 'ask_user_to_choose_target', action: 'ask_user_to_choose_target' }, ...selectedGrants.map((item) => ({ key: targetKeyOf(item.target), action: 'dispatch' as const, target: item.target }))], ...(cognitiveGuidance.trim() ? { cognitiveGuidance: cognitiveGuidance.trim() } : {}) } }
        : { ...base, routingMode: 'direct', target: target! });
      onCancel();
    } catch (saveError) {
      setError(saveError instanceof Error && saveError.message === 'TARGET_NOT_AUTHORIZED'
        ? '所选目标未授权或授权已停用，请返回“目标权限”检查'
        : '规则格式无效，请检查规则 ID、条件和目标设置');
    }
  };

  const targetLabel = (target: ExternalTriggerGrant['target']): string => targetDisplayLabel(target, assetsByKey);

  return <form onSubmit={(event) => void submit(event)} className="mb-4 space-y-4 rounded border border-blue-600 bg-slate-900 p-4" aria-label={initial ? '编辑触发规则' : '创建触发规则'}>
    <Field label="规则 ID"><input required disabled={Boolean(initial)} aria-label="规则 ID" value={id} onChange={(event) => setId(event.target.value)} aria-describedby="rule-id-hint" className="w-full rounded border border-slate-700 bg-slate-950 px-3 py-2 disabled:text-slate-500" /><span id="rule-id-hint" className="text-xs text-slate-400">{initial ? '规则 ID 创建后不可修改' : '已自动生成；如需修改，只能使用英文、数字和 . _ : -'}</span></Field>
    <fieldset className="space-y-2 rounded border border-slate-700 p-3"><legend className="px-1 text-sm text-slate-300">路由方式</legend><label className="mr-4 inline-flex items-center gap-2 text-sm"><input type="radio" name="routing-mode" checked={routingMode === 'direct'} onChange={() => setRoutingMode('direct')} />固定目标</label><label className="inline-flex items-center gap-2 text-sm"><input type="radio" name="routing-mode" checked={routingMode === 'jev'} onChange={() => setRoutingMode('jev')} />智能决策模式</label></fieldset>
    {routingMode === 'direct' ? <>
      <div className="grid gap-3 md:grid-cols-2">
        <Field label="来源"><select required value={connectorId} onChange={(event) => setConnectorId(event.target.value)} className="w-full rounded border border-slate-700 bg-slate-950 px-3 py-2">{initial && !initialConnectorId && <option value="">请选择原规则使用的感知源</option>}{connectors.map((item) => <option key={item.id} value={item.id}>{item.id} ({item.source})</option>)}</select></Field>
        <Field label="白名单字段"><select value={path} onChange={(event) => setPath(event.target.value as TriggerFilterPath)} className="w-full rounded border border-slate-700 bg-slate-950 px-3 py-2"><option value="content.text">正文</option><option value="content.subject">主题</option><option value="actor.externalId">发送者</option><option value="conversation.externalId">会话</option><option value="type">事件类型</option></select></Field>
        <Field label="条件"><div className="flex gap-2"><select value={operator} onChange={(event) => setOperator(event.target.value as TriggerFilterOperator)} className="rounded border border-slate-700 bg-slate-950 px-2"><option value="contains">包含</option><option value="equals">等于</option><option value="startsWith">开头为</option></select><input value={value} onChange={(event) => setValue(event.target.value)} className="min-w-0 flex-1 rounded border border-slate-700 bg-slate-950 px-3 py-2" /></div></Field>
      </div>
      <Field label="已授权目标"><select required value={targetKey} onChange={(event) => setTargetKey(event.target.value)} className="w-full rounded border border-slate-700 bg-slate-950 px-3 py-2"><option value="">请选择</option>{connectorGrants.map((item) => <option key={targetKeyOf(item.target)} value={targetKeyOf(item.target)}>{targetLabel(item.target)}</option>)}</select></Field>
      {targetKey.startsWith('skill:') && <Field label="Skill 认知归属"><select value={ownerKey} onChange={(event) => setOwnerKey(event.target.value)} className="w-full rounded border border-slate-700 bg-slate-950 px-3 py-2"><option value="ephemeral">Standalone（临时）</option>{enabledGrants.filter((item) => item.target.kind === 'project' || item.target.kind === 'role-agent').map((item) => <option key={targetKeyOf(item.target)} value={targetKeyOf(item.target)}>继承 {targetLabel(item.target)}</option>)}</select></Field>}
    </> : <><fieldset className="space-y-2 rounded border border-slate-700 p-3"><legend className="px-1 text-sm text-slate-300">可承接请求的能力（可多选）</legend>{candidateGrants.map((grant) => { const key = targetKeyOf(grant.target); const label = targetLabel(grant.target); return <label key={key} className="flex items-start gap-2 rounded bg-slate-950 p-2 text-sm"><input type="checkbox" aria-label={label} checked={candidateKeys.includes(key)} onChange={(event) => setCandidateKeys((current) => event.target.checked ? [...current, key] : current.filter((item) => item !== key))} /><span><span className="block text-slate-200">{label}</span><span className="block text-xs text-slate-500">感知源：{grant.allowedConnectorIds?.join('、') || '全部'} · 规则：{grant.allowedRuleIds?.join('、') || '全部'}</span></span></label>; })}<p className="text-xs text-slate-400">保留动作：忽略事件、仅通知用户、请用户选择角色或能力。</p><p className="text-xs text-yellow-400">无需 HITL 时，首二目标候选的概率差值严格大于 0.5 才自动执行；否则由用户选择。</p></fieldset><Field label="决策规则"><textarea aria-label="决策规则" value={cognitiveGuidance} maxLength={4000} rows={5} onChange={(event) => setCognitiveGuidance(event.target.value)} placeholder="例如：涉及候选人简历时优先交给鹰眼；项目排期与协作问题优先交给敏捷训练专家。" className="w-full rounded border border-slate-700 bg-slate-950 px-3 py-2" /><span className="text-xs text-slate-400">以自然语言写下判断偏好，保存后会随此规则一并提供给智能决策模型。</span></Field></>}
    <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={requireHitl} onChange={(event) => setRequireHitl(event.target.checked)} />高风险动作要求人工确认（HITL）</label>
    <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={enabled} onChange={(event) => setEnabled(event.target.checked)} />{initial ? '规则已启用' : '创建后立即启用'}</label>
    {error && <p role="alert" className="text-sm text-red-400">{error}</p>}
    {routingMode === 'direct' && initial && !initialConnectorId && !connectorId && <p role="alert" className="text-sm text-yellow-400">该历史规则未记录具体感知源，请选择后保存以完成绑定。</p>}
    {enabledGrants.length === 0 && <p role="alert" className="text-sm text-yellow-400">尚无允许外部触发的目标，请先在目标设置中授予权限。</p>}
    {routingMode === 'direct' && enabledGrants.length > 0 && connectorGrants.length === 0 && <p role="alert" className="text-sm text-yellow-400">当前感知源尚未获得任何目标授权，请先在目标设置中为它授予权限。</p>}
    {routingMode === 'jev' && candidateGrants.length === 0 && <p role="alert" className="text-sm text-yellow-400">先到目标权限添加可承接请求的能力。</p>}
    {routingMode === 'jev' && enabled && (!jevProvider?.enabled || !jevProvider.credentialConfigured) && <p role="alert" className="text-sm text-yellow-400">智能决策模型未配置或未启用，请先到模型设置完成配置。你仍可保存停用规则。</p>}
    <div className="flex gap-2"><Button type="submit" disabled={routingMode === 'direct' ? !connectorId || !targetKey : connectors.length === 0 || candidateKeys.length === 0 || enabled && (!jevProvider?.enabled || !jevProvider.credentialConfigured)}>{initial ? '保存规则' : enabled ? '创建并启用' : '保存为停用规则'}</Button><Button type="button" variant="outline" onClick={onCancel}>取消</Button></div>
  </form>;
}

function targetKeyOf(target: ExternalTriggerGrant['target']): string { return `${target.kind}:${target.id}`; }

function targetDisplayLabel(target: ExternalTriggerGrant['target'], assetsByKey: Map<string, PerceptionTargetAsset>): string {
  const asset = assetsByKey.get(targetKeyOf(target));
  if (asset) return asset.detail ? `${asset.name} · ${asset.detail}` : asset.name;
  if (target.kind === 'project') return '未命名项目';
  if (target.kind === 'role-agent') return '未命名角色能力';
  return '未命名技能能力';
}

function inheritedOwner(key: string): { mode: 'inherited'; ownerKind: 'project' | 'role-agent'; ownerId: string } {
  const [kind, ...id] = key.split(':');
  if (kind !== 'project' && kind !== 'role-agent') throw new Error('Invalid cognition owner');
  return { mode: 'inherited', ownerKind: kind, ownerId: id.join(':') };
}
function Field({ label, children }: { label: string; children: React.ReactNode }): JSX.Element { return <label className="space-y-1 text-sm"><span className="text-slate-300">{label}</span>{children}</label>; }
