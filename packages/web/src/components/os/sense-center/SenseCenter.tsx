'use client';

import { useEffect, useState } from 'react';
import { Activity, AlertTriangle, Cable, CheckCircle2, ChevronDown, Clock3, RefreshCw, Router, ShieldCheck, Target } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { usePerceptionStore } from '@/store/perceptionStore';
import type { ConnectorSummary } from '@/store/perceptionStore';
import type { PerceptionTriggerRule } from '@originos/core/types';
import { ConnectorForm } from './ConnectorForm';
import { RuleWizard } from './RuleWizard';
import { TargetGrantForm } from './TargetGrantForm';

type Tab = 'sources' | 'targets' | 'rules' | 'events' | 'health';
const TABS: Array<{ id: Tab; label: string }> = [
  { id: 'sources', label: '感知源' }, { id: 'targets', label: '目标权限' }, { id: 'rules', label: '触发规则' },
  { id: 'events', label: '事件记录' }, { id: 'health', label: '健康状态' },
];

export function SenseCenter(): JSX.Element {
  const [tab, setTab] = useState<Tab>('sources');
  const [showConnectorForm, setShowConnectorForm] = useState(false);
  const [editingConnector, setEditingConnector] = useState<ConnectorSummary>();
  const [showRuleWizard, setShowRuleWizard] = useState(false);
  const [editingRule, setEditingRule] = useState<PerceptionTriggerRule>();
  const [ruleActionError, setRuleActionError] = useState<string>();
  const [showGrantForm, setShowGrantForm] = useState(false);
  const [eventPage, setEventPage] = useState(0);
  const { connectors, grants, rules, eventTraces, health, deadLetters, loading, error, load, setConnectorEnabled, replay, saveConnector, saveRule, deleteRule, saveGrant, deleteGrant } = usePerceptionStore();
  useEffect(() => { void load(); }, [load]);

  return (
    <main className="flex h-full min-h-0 flex-col bg-slate-950 text-slate-100" aria-label="感知中心">
      <header className="flex items-center justify-between border-b border-slate-800 px-4 py-3">
        <div><h1 className="font-bold">感知中心</h1><p className="text-xs text-slate-400">邮箱与 IM 外部事件触发器</p></div>
        <Button variant="outline" size="sm" onClick={() => void load()} aria-label="刷新感知中心"><RefreshCw className="mr-2 h-4 w-4" />刷新</Button>
      </header>
      <nav className="flex gap-1 overflow-x-auto border-b border-slate-800 p-2" aria-label="感知中心分区">
        {TABS.map((item) => <button key={item.id} type="button" onClick={() => setTab(item.id)} aria-pressed={tab === item.id} className={`rounded px-3 py-2 text-sm ${tab === item.id ? 'bg-blue-600 text-white' : 'text-slate-300 hover:bg-slate-800'}`}>{item.label}</button>)}
      </nav>
      <section className="min-h-0 flex-1 overflow-auto p-4">
        {loading && <p role="status" className="text-sm text-slate-400">正在加载…</p>}
        {error && <div role="alert" className="rounded border border-red-600 bg-red-950 p-3 text-sm text-red-100">{error}</div>}
        {!loading && !error && tab === 'sources' && <SourceList />}
        {!loading && !error && tab === 'targets' && <TargetList />}
        {!loading && !error && tab === 'rules' && <RuleList />}
        {!loading && !error && tab === 'events' && <EventList />}
        {!loading && !error && tab === 'health' && <HealthList />}
      </section>
      {deadLetters.length > 0 && <aside className="border-t border-yellow-600 bg-yellow-950 p-3 text-sm"><AlertTriangle className="mr-2 inline h-4 w-4" />{deadLetters.length} 个失败事件待处理 <Button size="sm" className="ml-3" onClick={() => { const item = deadLetters[0]; if (item && window.confirm('重放会重新检查目标授权与 HITL，确认继续？')) void replay(item.connectorId, item.id); }}>重放最早一条</Button></aside>}
    </main>
  );

  function SourceList(): JSX.Element {
    return <><div className="mb-4 flex justify-end"><Button onClick={() => { setEditingConnector(undefined); setShowConnectorForm((value) => !value); }}>{showConnectorForm ? '收起表单' : '添加感知源'}</Button></div>{showConnectorForm && <ConnectorForm key={editingConnector?.id ?? 'new'} initial={editingConnector} onSave={saveConnector} onProvisioned={load} onCancel={() => { setShowConnectorForm(false); setEditingConnector(undefined); }} />}{connectors.length === 0 ? <Empty icon={<Cable className="h-8 w-8" />} text="尚未配置感知源" /> : <div className="grid gap-3 md:grid-cols-2">{connectors.map((item) => <article key={item.id} className="rounded border border-slate-700 bg-slate-900 p-4"><div className="flex items-start justify-between"><div><h2 className="font-bold">{item.id}</h2><p className="text-sm text-slate-400">{item.source} · {item.mode}</p></div><span className={`rounded px-2 py-1 text-xs ${item.enabled ? 'bg-green-600' : 'bg-slate-700'}`}>{item.enabled ? '已启用' : '已停用'}</span></div><p className="mt-3 text-xs text-slate-400">凭据：{item.secretConfigured ? '已安全绑定' : '未绑定'}</p><div className="mt-3 flex gap-2"><Button variant="outline" size="sm" onClick={() => void setConnectorEnabled(item.id, !item.enabled)}>{item.enabled ? '停用' : '启用'}</Button><Button variant="outline" size="sm" onClick={() => { setEditingConnector(item); setShowConnectorForm(true); }}>重新绑定</Button></div></article>)}</div>}</>;
  }

  function RuleList(): JSX.Element {
    const closeWizard = (): void => { setShowRuleWizard(false); setEditingRule(undefined); };
    const persistRule = async (rule: PerceptionTriggerRule): Promise<void> => {
      setRuleActionError(undefined);
      try { await saveRule(rule); } catch { setRuleActionError('规则操作失败，请确认目标权限仍处于启用状态'); throw new Error('RULE_ACTION_FAILED'); }
    };
    const removeRule = async (id: string): Promise<void> => {
      setRuleActionError(undefined);
      try { await deleteRule(id); } catch { setRuleActionError('规则删除失败，请刷新后重试'); }
    };
    return <><div className="mb-4 flex justify-end"><Button onClick={() => { if (showRuleWizard) closeWizard(); else { setEditingRule(undefined); setShowRuleWizard(true); } }}>{showRuleWizard ? '收起向导' : '创建规则'}</Button></div>{ruleActionError && <p role="alert" className="mb-3 text-sm text-red-400">{ruleActionError}</p>}{showRuleWizard && <RuleWizard key={editingRule?.id ?? 'new'} connectors={connectors} grants={grants} initial={editingRule} onSave={persistRule} onCancel={closeWizard} />}{rules.length === 0 ? <Empty icon={<Router className="h-8 w-8" />} text="尚未创建触发规则" /> : <div className="space-y-3">{rules.map((item) => <article key={item.id} className="rounded border border-slate-700 bg-slate-900 p-4"><div className="flex justify-between"><h2 className="font-bold">{item.id}</h2><span className={`rounded px-2 py-1 text-xs ${item.enabled ? 'bg-green-600 text-white' : 'bg-slate-700 text-slate-300'}`}>{item.enabled ? '生效中' : '已停用'}</span></div><p className="mt-2 text-sm text-slate-300">{item.sources.join('、')} → {item.target.kind}/{item.target.id}</p><p className="mt-1 text-xs text-slate-400">{item.conditions.length} 个白名单条件 · 最大 {item.execution.maxAttempts} 次尝试 · HITL {item.execution.requireHitl ? '开启' : '关闭'}</p><div className="mt-3 flex flex-wrap gap-2"><Button variant="outline" size="sm" onClick={() => void persistRule({ ...item, enabled: !item.enabled, updatedAt: new Date().toISOString() }).catch(() => undefined)}>{item.enabled ? '停用' : '启用'}</Button><Button variant="outline" size="sm" onClick={() => { setEditingRule(item); setShowRuleWizard(true); }}>编辑</Button><Button variant="outline" size="sm" onClick={() => { if (window.confirm(`删除触发规则 ${item.id}？`)) void removeRule(item.id); }}>删除</Button></div></article>)}</div>}</>;
  }

  function TargetList(): JSX.Element {
    return <>
      <div className="mb-4 flex items-center justify-between gap-3">
        <p className="text-sm text-slate-400">只有这里明确授权的目标才能接收外部事件。</p>
        <Button onClick={() => setShowGrantForm((value) => !value)}>{showGrantForm ? '收起表单' : '添加目标权限'}</Button>
      </div>
      {showGrantForm && <TargetGrantForm connectors={connectors} grants={grants} onSave={saveGrant} onCancel={() => setShowGrantForm(false)} />}
      {grants.length === 0 ? <Empty icon={<ShieldCheck className="h-8 w-8" />} text="尚未授权任何外部触发目标" /> : <div className="grid gap-3 md:grid-cols-2">{grants.map((grant) => {
        const key = `${grant.target.kind}:${grant.target.id}`;
        return <article key={key} className="rounded border border-slate-700 bg-slate-900 p-4">
          <div className="flex items-start justify-between gap-3"><div><p className="text-xs text-blue-400">{targetKindLabel(grant.target.kind)}</p><h2 className="font-bold">{grant.target.id}</h2></div><span className={`rounded px-2 py-1 text-xs ${grant.enabled ? 'bg-green-600' : 'bg-slate-700'}`}>{grant.enabled ? '允许触发' : '已停用'}</span></div>
          <p className="mt-3 text-xs text-slate-400">感知源：{grant.allowedConnectorIds?.join('、') || '全部'}</p>
          <div className="mt-3 flex gap-2"><Button variant="outline" size="sm" onClick={() => void saveGrant({ ...grant, enabled: !grant.enabled, updatedAt: new Date().toISOString() })}>{grant.enabled ? '停用' : '启用'}</Button><Button variant="outline" size="sm" onClick={() => { if (window.confirm(`删除 ${grant.target.id} 的外部触发权限？`)) void deleteGrant(grant); }}>删除</Button></div>
        </article>;
      })}</div>}
    </>;
  }

  function EventList(): JSX.Element {
    if (eventTraces.length === 0) return <Empty icon={<Activity className="h-8 w-8" />} text="尚无感知事件" />;
    const pageSize = 50;
    const pageCount = Math.ceil(eventTraces.length / pageSize);
    const visible = eventTraces.slice(eventPage * pageSize, (eventPage + 1) * pageSize);
    return <><div className="space-y-4">{visible.map(({ event, ruleTriggers }, index) => <details key={event.id} open={index === 0} className="group overflow-hidden rounded border border-slate-700 bg-slate-900">
      <summary className="flex cursor-pointer list-none flex-wrap items-center justify-between gap-3 px-4 py-3 marker:hidden focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-600" aria-label={`切换感知事件 ${event.id}`}>
        <div className="min-w-0"><p className="text-xs font-bold uppercase tracking-wide text-blue-400">{event.source} · {event.type}</p><h2 className="mt-1 truncate text-sm font-bold text-slate-100">{event.content.subject || '无主题'}</h2><p className="mt-1 truncate font-mono text-xs text-slate-500">{event.id}</p></div>
        <div className="flex items-center gap-3"><div className="text-right"><p className="text-xs font-bold text-slate-300">{traceSummaryStatus(ruleTriggers)}</p><time className="text-xs text-slate-500" dateTime={event.receivedAt}>{formatTime(event.receivedAt)}</time></div><ChevronDown className="h-4 w-4 text-slate-400 transition-transform group-open:rotate-180" aria-hidden="true" /></div>
      </summary>
      <article className="border-t border-slate-800" aria-label={`感知事件 ${event.id}`}>
      <div className="divide-y divide-slate-800">
        <TraceStage icon={<Activity className="h-4 w-4" />} title="感知事件" time={event.receivedAt} tone="blue">
          <div className="grid gap-3 text-sm md:grid-cols-2"><Info label="来源" value={`${event.connectorId} / ${event.source}`} /><Info label="发送者" value={event.actor.displayName ? `${event.actor.displayName} (${event.actor.externalId})` : event.actor.externalId} /><Info label="主题" value={event.content.subject || '—'} /><Info label="发生时间" value={formatTime(event.occurredAt)} /></div>
          {event.content.text && <pre className="mt-3 max-h-48 overflow-auto whitespace-pre-wrap rounded bg-slate-950 p-3 text-xs text-slate-300">{event.content.text}</pre>}
        </TraceStage>
        {ruleTriggers.length === 0 ? <TraceStage icon={<Router className="h-4 w-4" />} title="规则触发" tone="muted"><p className="text-sm text-slate-400">未命中规则，未派发目标。</p></TraceStage> : ruleTriggers.map((trace) => <div key={trace.ruleId}>
          <TraceStage icon={<Router className="h-4 w-4" />} title="规则触发" time={trace.matchedAt} tone="yellow">
            <div className="grid gap-3 text-sm md:grid-cols-2"><Info label="规则" value={trace.ruleId} /><Info label="目标" value={trace.rule ? `${targetKindLabel(trace.rule.target.kind)} / ${trace.rule.target.id}` : '规则已删除'} /><Info label="条件" value={trace.rule ? `${trace.rule.conditions.length} 个条件` : '—'} /><Info label="触发时间" value={formatTime(trace.matchedAt)} /></div>
          </TraceStage>
          <TraceStage icon={trace.result?.status === 'completed' ? <CheckCircle2 className="h-4 w-4" /> : <Target className="h-4 w-4" />} title="目标处理" time={trace.finishedAt ?? trace.dispatchedAt ?? trace.lease?.acquiredAt} tone={trace.result?.status === 'completed' ? 'green' : trace.result?.status === 'failed' ? 'red' : 'muted'}>
            <div className="grid gap-3 text-sm md:grid-cols-2"><Info label="状态" value={executionStatus(trace.result?.status)} /><Info label="派发时间" value={formatTime(trace.dispatchedAt)} /><Info label="完成时间" value={formatTime(trace.finishedAt)} /><Info label="会话 ID" value={trace.result?.sessionId || '—'} /></div>
            {trace.result?.summary && <div className="mt-3 rounded border border-slate-700 bg-slate-950 p-3"><p className="mb-2 text-xs font-bold text-green-400">处理结果</p><p className="whitespace-pre-wrap text-sm text-slate-200">{trace.result.summary}</p></div>}
            {trace.result?.resultRef && <p className="mt-2 break-all font-mono text-xs text-slate-500">结果引用：{trace.result.resultRef}</p>}
          </TraceStage>
        </div>)}
      </div>
      </article>
    </details>)}</div>{pageCount > 1 && <div className="mt-4 flex items-center justify-between"><Button variant="outline" size="sm" disabled={eventPage === 0} onClick={() => setEventPage((page) => Math.max(0, page - 1))}>上一页</Button><span className="text-xs text-slate-400">{eventPage + 1} / {pageCount}</span><Button variant="outline" size="sm" disabled={eventPage + 1 >= pageCount} onClick={() => setEventPage((page) => Math.min(pageCount - 1, page + 1))}>下一页</Button></div>}</>;
  }

  function HealthList(): JSX.Element {
    if (health.length === 0) return <Empty icon={<Activity className="h-8 w-8" />} text="尚无健康状态" />;
    return <div className="grid gap-3 md:grid-cols-2">{health.map((item) => <article key={item.connectorId} className="rounded border border-slate-700 bg-slate-900 p-4"><div className="flex justify-between"><h2 className="font-bold">{item.connectorId}</h2><span className="text-sm text-green-500">{item.status}</span></div><p className="mt-2 text-sm text-slate-400">模式：{item.mode}</p><pre className="mt-2 overflow-auto text-xs text-slate-500">{JSON.stringify(item, null, 2)}</pre></article>)}</div>;
  }
}

function TraceStage({ icon, title, time, tone, children }: { icon: React.ReactNode; title: string; time?: string; tone: 'blue' | 'yellow' | 'green' | 'red' | 'muted'; children: React.ReactNode }): JSX.Element {
  const color = { blue: 'border-blue-600 text-blue-400', yellow: 'border-yellow-600 text-yellow-400', green: 'border-green-600 text-green-400', red: 'border-red-600 text-red-400', muted: 'border-slate-600 text-slate-400' }[tone];
  return <section className="relative grid grid-cols-[2rem_1fr] gap-3 px-4 py-4"><div className={`flex h-8 w-8 items-center justify-center rounded-full border bg-slate-950 ${color}`}>{icon}</div><div className="min-w-0"><div className="mb-3 flex flex-wrap items-center justify-between gap-2"><h3 className="font-bold">{title}</h3>{time && <time className="flex items-center gap-1 text-xs text-slate-500" dateTime={time}><Clock3 className="h-3 w-3" />{formatTime(time)}</time>}</div>{children}</div></section>;
}

function Info({ label, value }: { label: string; value: string }): JSX.Element {
  return <div><p className="text-xs text-slate-500">{label}</p><p className="mt-1 break-words text-slate-200">{value}</p></div>;
}

function formatTime(value?: string): string {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString('zh-CN', { hour12: false });
}

function executionStatus(status?: 'acquired' | 'completed' | 'failed'): string {
  if (status === 'completed') return '已完成';
  if (status === 'failed') return '失败';
  if (status === 'acquired') return '处理中';
  return '尚未派发';
}

function traceSummaryStatus(ruleTriggers: Array<{ result?: { status: 'acquired' | 'completed' | 'failed' } }>): string {
  if (ruleTriggers.length === 0) return '未命中规则';
  if (ruleTriggers.some((trace) => trace.result?.status === 'failed')) return '处理失败';
  if (ruleTriggers.some((trace) => trace.result?.status === 'acquired' || !trace.result)) return '处理中';
  return '处理完成';
}

function targetKindLabel(kind: 'project' | 'role-agent' | 'skill'): string {
  if (kind === 'project') return '项目';
  if (kind === 'role-agent') return '角色 Agent';
  return 'Skill';
}

function Empty({ icon, text }: { icon: React.ReactNode; text: string }): JSX.Element {
  return <div className="flex min-h-48 flex-col items-center justify-center gap-3 rounded border border-dashed border-slate-700 text-slate-400">{icon}<p className="text-sm">{text}</p></div>;
}

export default SenseCenter;
