'use client';

import * as React from 'react';
import type { JevProviderSummary } from '@originos/core/types';
import { clearJevProviderCredential, getJevProvider, updateJevProvider } from '@/services/jevProviderService';

const initial: JevProviderSummary = {
  enabled: false,
  baseUrl: 'https://api.typesafe.ai',
  model: 'jev-latest',
  credentialConfigured: false,
};

export function JevProviderSection() {
  const [draft, setDraft] = React.useState(initial);
  const [apiKey, setApiKey] = React.useState('');
  const [busy, setBusy] = React.useState(false);
  const [message, setMessage] = React.useState<{ kind: 'status' | 'alert'; text: string } | null>(null);

  React.useEffect(() => {
    let mounted = true;
    void getJevProvider().then((value) => { if (mounted) setDraft(value); }).catch((error: unknown) => {
      if (mounted) setMessage({ kind: 'alert', text: errorCode(error) });
    });
    return () => { mounted = false; };
  }, []);

  async function save() {
    setBusy(true); setMessage(null);
    try {
      const saved = await updateJevProvider({ enabled: draft.enabled, baseUrl: draft.baseUrl, model: draft.model, ...(apiKey.trim() ? { apiKey } : {}) });
      setDraft(saved); setApiKey(''); setMessage({ kind: 'status', text: 'Jev 配置已保存' });
    } catch (error) { setMessage({ kind: 'alert', text: errorCode(error) }); }
    finally { setBusy(false); }
  }

  async function clearCredential() {
    if (!window.confirm('确定清除 Jev API Key？')) return;
    setBusy(true); setMessage(null);
    try {
      setDraft(await clearJevProviderCredential()); setApiKey(''); setMessage({ kind: 'status', text: 'Jev 凭据已清除' });
    } catch (error) { setMessage({ kind: 'alert', text: errorCode(error) }); }
    finally { setBusy(false); }
  }

  const canEnable = draft.credentialConfigured || apiKey.trim().length > 0;
  return (
    <section aria-labelledby="jev-provider-title" className="flex flex-col gap-3 rounded-xl border border-white/10 bg-white/5 p-3">
      <div className="flex items-center justify-between gap-3">
        <div><h2 id="jev-provider-title" className="text-xs font-semibold text-white/80">Jev 决策模型</h2><p className="text-[10px] text-white/35">仅用于感知路由，不影响 Agent 对话模型。</p></div>
        <button type="button" role="switch" aria-label="启用 Jev 决策模型" aria-checked={draft.enabled} disabled={!draft.enabled && !canEnable || busy}
          onClick={() => setDraft((value) => ({ ...value, enabled: !value.enabled }))}
          className={`rounded-full border px-3 py-1 text-xs disabled:opacity-40 ${draft.enabled ? 'border-emerald-400/40 bg-emerald-500/30 text-emerald-50' : 'border-white/10 text-white/50'}`}>
          {draft.enabled ? '已启用' : '已停用'}
        </button>
      </div>
      <label className="flex flex-col gap-1 text-xs text-white/50">Base URL<input aria-label="Jev Base URL" value={draft.baseUrl} onChange={(event) => setDraft((value) => ({ ...value, baseUrl: event.target.value }))} className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white" /></label>
      <label className="flex flex-col gap-1 text-xs text-white/50">Model<input aria-label="Jev Model" value={draft.model} onChange={(event) => setDraft((value) => ({ ...value, model: event.target.value }))} className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white" /></label>
      <label className="flex flex-col gap-1 text-xs text-white/50">API Key<input aria-label="Jev API Key" type="password" autoComplete="off" value={apiKey} onChange={(event) => setApiKey(event.target.value)} placeholder="留空以保留现有凭据" className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white" /></label>
      <p className="text-[10px] text-white/35">{credentialLabel(draft)}</p>
      {message ? <p role={message.kind} className={message.kind === 'alert' ? 'text-xs text-red-200' : 'text-xs text-emerald-200'}>{message.text}</p> : null}
      <div className="flex gap-2">
        <button type="button" disabled={busy} onClick={() => void save()} className="rounded-lg bg-white/15 px-3 py-1.5 text-xs text-white disabled:opacity-40">保存 Jev 配置</button>
        {draft.credentialConfigured && draft.credentialSource !== 'environment' ? <button type="button" disabled={busy} onClick={() => void clearCredential()} className="rounded-lg border border-red-400/20 px-3 py-1.5 text-xs text-red-200 disabled:opacity-40">清除 Jev 凭据</button> : null}
      </div>
    </section>
  );
}

function credentialLabel(summary: JevProviderSummary): string {
  if (summary.credentialSource === 'environment') return '已由 TYPESAFE_API_KEY 配置';
  if (summary.credentialConfigured) return '已由安全存储配置';
  return '未配置凭据';
}
function errorCode(error: unknown): string {
  const code = error instanceof Error ? error.message : 'INTERNAL_ERROR';
  return code === 'SECURE_STORAGE_UNAVAILABLE' ? '当前运行环境不能安全保存 API Key，请由服务端配置 TYPESAFE_API_KEY' : code;
}
