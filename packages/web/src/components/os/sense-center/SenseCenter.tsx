'use client';

import { useEffect, useState } from 'react';
import { Activity, AlertTriangle, Cable, RefreshCw, Router } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { usePerceptionStore } from '@/store/perceptionStore';
import { ConnectorForm } from './ConnectorForm';
import { RuleWizard } from './RuleWizard';

type Tab = 'sources' | 'rules' | 'events' | 'health';
const TABS: Array<{ id: Tab; label: string }> = [
  { id: 'sources', label: '感知源' }, { id: 'rules', label: '触发规则' },
  { id: 'events', label: '事件记录' }, { id: 'health', label: '健康状态' },
];

export function SenseCenter(): JSX.Element {
  const [tab, setTab] = useState<Tab>('sources');
  const [showConnectorForm, setShowConnectorForm] = useState(false);
  const [showRuleWizard, setShowRuleWizard] = useState(false);
  const [eventPage, setEventPage] = useState(0);
  const { connectors, grants, rules, audit, health, deadLetters, loading, error, load, setConnectorEnabled, replay, saveConnector, saveRule } = usePerceptionStore();
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
        {!loading && !error && tab === 'rules' && <RuleList />}
        {!loading && !error && tab === 'events' && <EventList />}
        {!loading && !error && tab === 'health' && <HealthList />}
      </section>
      {deadLetters.length > 0 && <aside className="border-t border-yellow-600 bg-yellow-950 p-3 text-sm"><AlertTriangle className="mr-2 inline h-4 w-4" />{deadLetters.length} 个失败事件待处理 <Button size="sm" className="ml-3" onClick={() => { const item = deadLetters[0]; if (item && window.confirm('重放会重新检查目标授权与 HITL，确认继续？')) void replay(item.connectorId, item.id); }}>重放最早一条</Button></aside>}
    </main>
  );

  function SourceList(): JSX.Element {
    return <><div className="mb-4 flex justify-end"><Button onClick={() => setShowConnectorForm((value) => !value)}>{showConnectorForm ? '收起表单' : '添加 / 重新绑定'}</Button></div>{showConnectorForm && <ConnectorForm onSave={saveConnector} onCancel={() => setShowConnectorForm(false)} />}{connectors.length === 0 ? <Empty icon={<Cable className="h-8 w-8" />} text="尚未配置感知源" /> : <div className="grid gap-3 md:grid-cols-2">{connectors.map((item) => <article key={item.id} className="rounded border border-slate-700 bg-slate-900 p-4"><div className="flex items-start justify-between"><div><h2 className="font-bold">{item.id}</h2><p className="text-sm text-slate-400">{item.source} · {item.mode}</p></div><span className={`rounded px-2 py-1 text-xs ${item.enabled ? 'bg-green-600' : 'bg-slate-700'}`}>{item.enabled ? '已启用' : '已停用'}</span></div><p className="mt-3 text-xs text-slate-400">凭据：{item.secretConfigured ? '已安全绑定' : '未绑定'}</p><div className="mt-3 flex gap-2"><Button variant="outline" size="sm" onClick={() => void setConnectorEnabled(item.id, !item.enabled)}>{item.enabled ? '停用' : '启用'}</Button><Button variant="outline" size="sm" onClick={() => setShowConnectorForm(true)}>重新绑定</Button></div></article>)}</div>}</>;
  }

  function RuleList(): JSX.Element {
    return <><div className="mb-4 flex justify-end"><Button onClick={() => setShowRuleWizard((value) => !value)}>{showRuleWizard ? '收起向导' : '创建规则'}</Button></div>{showRuleWizard && <RuleWizard connectors={connectors} grants={grants} onSave={saveRule} onCancel={() => setShowRuleWizard(false)} />}{rules.length === 0 ? <Empty icon={<Router className="h-8 w-8" />} text="尚未创建触发规则" /> : <div className="space-y-3">{rules.map((item) => <article key={item.id} className="rounded border border-slate-700 bg-slate-900 p-4"><div className="flex justify-between"><h2 className="font-bold">{item.id}</h2><span className="text-xs text-slate-400">{item.enabled ? '生效中' : '已停用'}</span></div><p className="mt-2 text-sm text-slate-300">{item.sources.join('、')} → {item.target.kind}/{item.target.id}</p><p className="mt-1 text-xs text-slate-400">{item.conditions.length} 个白名单条件 · 最大 {item.execution.maxAttempts} 次尝试 · HITL {item.execution.requireHitl ? '开启' : '关闭'}</p></article>)}</div>}</>;
  }

  function EventList(): JSX.Element {
    if (audit.length === 0) return <Empty icon={<Activity className="h-8 w-8" />} text="尚无可追溯事件" />;
    const pageSize = 50;
    const pageCount = Math.ceil(audit.length / pageSize);
    const visible = audit.slice(eventPage * pageSize, (eventPage + 1) * pageSize);
    return <><div className="space-y-2">{visible.map((item) => <details key={item.id} className="rounded border border-slate-700 bg-slate-900 p-3"><summary className="cursor-pointer text-sm"><span className="mr-2 text-blue-400">{item.action}</span>{item.connectorId ?? 'system'} · {item.eventId ?? '—'}</summary><pre className="mt-3 overflow-auto whitespace-pre-wrap text-xs text-slate-400">{JSON.stringify(item.detail ?? {}, null, 2)}</pre></details>)}</div>{pageCount > 1 && <div className="mt-4 flex items-center justify-between"><Button variant="outline" size="sm" disabled={eventPage === 0} onClick={() => setEventPage((page) => Math.max(0, page - 1))}>上一页</Button><span className="text-xs text-slate-400">{eventPage + 1} / {pageCount}</span><Button variant="outline" size="sm" disabled={eventPage + 1 >= pageCount} onClick={() => setEventPage((page) => Math.min(pageCount - 1, page + 1))}>下一页</Button></div>}</>;
  }

  function HealthList(): JSX.Element {
    if (health.length === 0) return <Empty icon={<Activity className="h-8 w-8" />} text="尚无健康状态" />;
    return <div className="grid gap-3 md:grid-cols-2">{health.map((item) => <article key={item.connectorId} className="rounded border border-slate-700 bg-slate-900 p-4"><div className="flex justify-between"><h2 className="font-bold">{item.connectorId}</h2><span className="text-sm text-green-500">{item.status}</span></div><p className="mt-2 text-sm text-slate-400">模式：{item.mode}</p><pre className="mt-2 overflow-auto text-xs text-slate-500">{JSON.stringify(item, null, 2)}</pre></article>)}</div>;
  }
}

function Empty({ icon, text }: { icon: React.ReactNode; text: string }): JSX.Element {
  return <div className="flex min-h-48 flex-col items-center justify-center gap-3 rounded border border-dashed border-slate-700 text-slate-400">{icon}<p className="text-sm">{text}</p></div>;
}

export default SenseCenter;
