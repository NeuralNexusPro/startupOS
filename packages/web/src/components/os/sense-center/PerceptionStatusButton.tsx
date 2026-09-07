'use client';

import * as React from 'react';
import { RadioTower, X } from 'lucide-react';

import type { ConnectorHealth, PerceptionEventTrace } from '@originos/core/types';
import { Button } from '@/components/ui/button';
import type { ConnectorSummary } from '@/store/perceptionStore';

export type PerceptionHealthState = 'unconfigured' | 'healthy' | 'warning' | 'disconnected' | 'unknown';

export interface PerceptionHealthSummary {
  state: PerceptionHealthState;
  enabled: number;
  healthy: number;
  unhealthy: number;
}

interface PerceptionStatusButtonProps {
  connectors: ConnectorSummary[];
  health: ConnectorHealth[];
  eventTraces: PerceptionEventTrace[];
  loading: boolean;
  error?: string;
  onManage(): void;
}

const STATE_COPY: Record<PerceptionHealthState, { label: string; dot: string }> = {
  unconfigured: { label: '尚未连接', dot: 'bg-gray-600' },
  healthy: { label: '连接正常', dot: 'bg-green-600' },
  warning: { label: '部分连接需要处理', dot: 'bg-yellow-600' },
  disconnected: { label: '连接中断', dot: 'bg-red-600' },
  unknown: { label: '状态未知', dot: 'bg-gray-600' },
};

export function summarizePerceptionHealth(
  connectors: ConnectorSummary[],
  health: ConnectorHealth[],
): PerceptionHealthSummary {
  const enabled = connectors.filter((connector) => connector.enabled);
  if (enabled.length === 0) return { state: 'unconfigured', enabled: 0, healthy: 0, unhealthy: 0 };
  const healthByConnector = new Map(health.map((item) => [item.connectorId, item.status]));
  const healthy = enabled.filter((connector) => healthByConnector.get(connector.id) === 'healthy').length;
  const unhealthy = enabled.length - healthy;
  if (unhealthy === 0) return { state: 'healthy', enabled: enabled.length, healthy, unhealthy };
  if (healthy === 0) return { state: 'disconnected', enabled: enabled.length, healthy, unhealthy };
  return { state: 'warning', enabled: enabled.length, healthy, unhealthy };
}

export function PerceptionStatusButton({ connectors, health, eventTraces, loading, error, onManage }: PerceptionStatusButtonProps): JSX.Element {
  const [open, setOpen] = React.useState(false);
  const triggerRef = React.useRef<HTMLButtonElement>(null);
  const panelRef = React.useRef<HTMLDivElement>(null);
  const summary = error ? { state: 'unknown' as const, enabled: 0, healthy: 0, unhealthy: 0 } : summarizePerceptionHealth(connectors, health);
  const copy = STATE_COPY[summary.state];
  const latestEvent = eventTraces[0]?.event.receivedAt;
  const healthByConnector = new Map(health.map((item) => [item.connectorId, item.status]));

  React.useEffect(() => {
    if (!open) return;
    const closeOnOutside = (event: MouseEvent): void => {
      if (!panelRef.current?.contains(event.target as Node) && !triggerRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') { setOpen(false); triggerRef.current?.focus(); }
    };
    document.addEventListener('mousedown', closeOnOutside);
    document.addEventListener('keydown', closeOnEscape);
    return () => { document.removeEventListener('mousedown', closeOnOutside); document.removeEventListener('keydown', closeOnEscape); };
  }, [open]);

  return (
    <div className="relative">
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="relative flex h-11 w-11 items-center justify-center rounded-xl text-white/75 transition-colors hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
        aria-label={`感知连接：${loading ? '正在加载' : copy.label}`}
        aria-expanded={open}
        aria-haspopup="dialog"
      >
        <RadioTower className="h-4 w-4" />
        <span className={`absolute right-2 top-2 h-2 w-2 rounded-full ring-2 ring-slate-950 ${loading ? 'animate-pulse bg-blue-600 motion-reduce:animate-none' : copy.dot}`} aria-hidden="true" />
      </button>

      {open && (
        <div ref={panelRef} role="dialog" aria-label="感知连接状态" className="absolute right-0 top-full z-50 mt-2 w-80 max-w-[calc(100vw-2rem)] overflow-hidden rounded-2xl border border-white/10 bg-slate-950/95 text-slate-100 shadow-2xl backdrop-blur-2xl">
          <div className="flex items-start justify-between border-b border-white/10 p-4">
            <div><p className="text-xs uppercase tracking-widest text-slate-500">感知与连接</p><p className="mt-1 font-semibold">{loading ? '正在加载' : copy.label}</p></div>
            <button type="button" onClick={() => { setOpen(false); triggerRef.current?.focus(); }} className="rounded-lg p-2 text-slate-400 hover:bg-white/10 hover:text-white" aria-label="关闭感知连接状态"><X className="h-4 w-4" /></button>
          </div>
          <div className="space-y-3 p-4 text-sm">
            {error ? <p role="alert" className="text-slate-300">暂时无法读取连接状态</p> : summary.enabled === 0 ? <p className="text-slate-300">连接邮箱或企业消息后，外部事件可自动交给 Agent。</p> : <p className="text-slate-300">{summary.healthy} 个连接正常{summary.unhealthy > 0 ? `，${summary.unhealthy} 个需要处理` : ''}</p>}
            {summary.enabled > 0 && (
              <ul className="max-h-40 space-y-2 overflow-y-auto" aria-label="连接列表">
                {connectors.filter((connector) => connector.enabled).slice(0, 10).map((connector) => {
                  const healthy = healthByConnector.get(connector.id) === 'healthy';
                  return <li key={connector.id} className="flex items-center justify-between rounded-xl bg-white/5 px-3 py-2"><span className="truncate text-slate-200">{connector.id}</span><span className={healthy ? 'text-green-600' : 'text-yellow-600'}>{healthy ? '正常' : '需要处理'}</span></li>;
                })}
                {summary.enabled > 10 && <li className="px-3 text-xs text-slate-500">其余 {summary.enabled - 10} 个请在感知中心查看</li>}
              </ul>
            )}
            <div className="flex justify-between text-xs text-slate-500"><span>最近收到事件</span><span>{latestEvent ? new Date(latestEvent).toLocaleString() : '暂无'}</span></div>
            <Button size="sm" className="w-full" onClick={() => { setOpen(false); onManage(); }}>管理感知中心</Button>
          </div>
        </div>
      )}
    </div>
  );
}
