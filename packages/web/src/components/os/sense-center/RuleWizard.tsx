'use client';

import { useMemo, useState } from 'react';

import { Button } from '@/components/ui/button';
import type { ConnectorSummary } from '@/store/perceptionStore';
import type { ExternalTriggerGrant, PerceptionTriggerRule, TriggerFilterPath, TriggerFilterOperator } from '@originos/core/types';

interface RuleWizardProps { connectors: ConnectorSummary[]; grants: ExternalTriggerGrant[]; onSave(rule: PerceptionTriggerRule): Promise<void>; onCancel(): void }

export function RuleWizard({ connectors, grants, onSave, onCancel }: RuleWizardProps): JSX.Element {
  const enabledGrants = useMemo(() => grants.filter((grant) => grant.enabled), [grants]);
  const [id, setId] = useState('');
  const [connectorId, setConnectorId] = useState(connectors[0]?.id ?? '');
  const [targetKey, setTargetKey] = useState(enabledGrants[0] ? `${enabledGrants[0].target.kind}:${enabledGrants[0].target.id}` : '');
  const [path, setPath] = useState<TriggerFilterPath>('content.text');
  const [operator, setOperator] = useState<TriggerFilterOperator>('contains');
  const [value, setValue] = useState('');
  const [ownerKey, setOwnerKey] = useState('ephemeral');
  const [requireHitl, setRequireHitl] = useState(true);
  const [error, setError] = useState<string>();

  const submit = async (event: React.FormEvent): Promise<void> => {
    event.preventDefault(); setError(undefined);
    const connector = connectors.find((item) => item.id === connectorId);
    const grant = enabledGrants.find((item) => `${item.target.kind}:${item.target.id}` === targetKey);
    if (!connector || !grant) { setError('必须选择已配置来源和已授权目标'); return; }
    const now = new Date().toISOString();
    const target = grant.target.kind === 'skill'
      ? { ...grant.target, skillOwnership: ownerKey === 'ephemeral' ? { mode: 'ephemeral' as const } : inheritedOwner(ownerKey) }
      : grant.target;
    try {
      await onSave({ id, enabled: false, sources: [connector.source], eventTypes: [connector.source === 'email' ? 'mail.received' : 'message.received'], conditions: value ? [{ path, operator, value }] : [], target, execution: { requireHitl, maxAttempts: 3 }, createdAt: now, updatedAt: now });
      onCancel();
    } catch { setError('规则未通过白名单或目标授权校验'); }
  };

  return <form onSubmit={(event) => void submit(event)} className="mb-4 space-y-4 rounded border border-blue-600 bg-slate-900 p-4" aria-label="创建触发规则">
    <div className="grid gap-3 md:grid-cols-2">
      <Field label="规则 ID"><input required value={id} onChange={(event) => setId(event.target.value)} className="w-full rounded border border-slate-700 bg-slate-950 px-3 py-2" /></Field>
      <Field label="来源"><select required value={connectorId} onChange={(event) => setConnectorId(event.target.value)} className="w-full rounded border border-slate-700 bg-slate-950 px-3 py-2">{connectors.map((item) => <option key={item.id} value={item.id}>{item.id} ({item.source})</option>)}</select></Field>
      <Field label="白名单字段"><select value={path} onChange={(event) => setPath(event.target.value as TriggerFilterPath)} className="w-full rounded border border-slate-700 bg-slate-950 px-3 py-2"><option value="content.text">正文</option><option value="content.subject">主题</option><option value="actor.externalId">发送者</option><option value="conversation.externalId">会话</option><option value="type">事件类型</option></select></Field>
      <Field label="条件"><div className="flex gap-2"><select value={operator} onChange={(event) => setOperator(event.target.value as TriggerFilterOperator)} className="rounded border border-slate-700 bg-slate-950 px-2"><option value="contains">包含</option><option value="equals">等于</option><option value="startsWith">开头为</option></select><input value={value} onChange={(event) => setValue(event.target.value)} className="min-w-0 flex-1 rounded border border-slate-700 bg-slate-950 px-3 py-2" /></div></Field>
      <Field label="已授权目标"><select required value={targetKey} onChange={(event) => setTargetKey(event.target.value)} className="w-full rounded border border-slate-700 bg-slate-950 px-3 py-2"><option value="">请选择</option>{enabledGrants.map((item) => <option key={`${item.target.kind}:${item.target.id}`} value={`${item.target.kind}:${item.target.id}`}>{item.target.kind}/{item.target.id}</option>)}</select></Field>
      {targetKey.startsWith('skill:') && <Field label="Skill 认知归属"><select value={ownerKey} onChange={(event) => setOwnerKey(event.target.value)} className="w-full rounded border border-slate-700 bg-slate-950 px-3 py-2"><option value="ephemeral">Standalone（临时）</option>{enabledGrants.filter((item) => item.target.kind === 'project' || item.target.kind === 'role-agent').map((item) => <option key={`${item.target.kind}:${item.target.id}`} value={`${item.target.kind}:${item.target.id}`}>继承 {item.target.kind}/{item.target.id}</option>)}</select></Field>}
    </div>
    <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={requireHitl} onChange={(event) => setRequireHitl(event.target.checked)} />高风险动作要求人工确认（HITL）</label>
    {error && <p role="alert" className="text-sm text-red-400">{error}</p>}
    {enabledGrants.length === 0 && <p role="alert" className="text-sm text-yellow-400">尚无允许外部触发的目标，请先在目标设置中授予权限。</p>}
    <div className="flex gap-2"><Button type="submit" disabled={!connectorId || !targetKey}>保存为停用规则</Button><Button type="button" variant="outline" onClick={onCancel}>取消</Button></div>
  </form>;
}

function inheritedOwner(key: string): { mode: 'inherited'; ownerKind: 'project' | 'role-agent'; ownerId: string } {
  const [kind, ...id] = key.split(':');
  if (kind !== 'project' && kind !== 'role-agent') throw new Error('Invalid cognition owner');
  return { mode: 'inherited', ownerKind: kind, ownerId: id.join(':') };
}
function Field({ label, children }: { label: string; children: React.ReactNode }): JSX.Element { return <label className="space-y-1 text-sm"><span className="text-slate-300">{label}</span>{children}</label>; }
