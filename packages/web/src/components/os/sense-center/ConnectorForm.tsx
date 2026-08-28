'use client';

import { useState } from 'react';

import { Button } from '@/components/ui/button';
import type { JsonValue, PerceptionConnectorConfig, PerceptionSource } from '@originos/core/types';

interface ConnectorFormProps { onSave(config: PerceptionConnectorConfig): Promise<void>; onCancel(): void }

export function ConnectorForm({ onSave, onCancel }: ConnectorFormProps): JSX.Element {
  const [source, setSource] = useState<PerceptionSource>('email');
  const [id, setId] = useState('');
  const [secretRef, setSecretRef] = useState('');
  const [endpoint, setEndpoint] = useState('');
  const [mailbox, setMailbox] = useState('INBOX');
  const [pollSeconds, setPollSeconds] = useState('60');
  const [error, setError] = useState<string>();

  const submit = async (event: React.FormEvent): Promise<void> => {
    event.preventDefault();
    setError(undefined);
    if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(id)) { setError('连接 ID 只能包含字母、数字、点、下划线和连字符'); return; }
    if (secretRef && !secretRef.startsWith('secret://')) { setError('密钥引用必须以 secret:// 开头'); return; }
    const now = new Date().toISOString();
    const mode = source === 'email' ? 'email-poll' : source === 'dingtalk' ? 'stream' : 'webhook';
    let settings: Record<string, JsonValue>;
    if (source === 'email') settings = { mailbox, pollSeconds: Number(pollSeconds) };
    else if (source === 'dingtalk') settings = { streamEndpoint: endpoint };
    else settings = { callbackPath: endpoint };
    try {
      await onSave({ id, source, mode, enabled: false, secretRef: secretRef || undefined, settings, createdAt: now, updatedAt: now });
      setSecretRef('');
      onCancel();
    } catch { setError('保存失败，请检查配置和密钥引用'); }
  };

  return <form onSubmit={(event) => void submit(event)} className="mb-4 space-y-4 rounded border border-blue-600 bg-slate-900 p-4" aria-label="添加感知源">
    <div className="grid gap-3 md:grid-cols-2">
      <Field label="平台"><select value={source} onChange={(event) => setSource(event.target.value as PerceptionSource)} className="w-full rounded border border-slate-700 bg-slate-950 px-3 py-2"><option value="email">Email</option><option value="wecom">企业微信</option><option value="feishu">飞书</option><option value="dingtalk">钉钉</option></select></Field>
      <Field label="连接 ID"><input required value={id} onChange={(event) => setId(event.target.value)} className="w-full rounded border border-slate-700 bg-slate-950 px-3 py-2" placeholder="email-main" /></Field>
      <Field label="Secret 引用（提交后不回显）"><input type="password" autoComplete="new-password" value={secretRef} onChange={(event) => setSecretRef(event.target.value)} className="w-full rounded border border-slate-700 bg-slate-950 px-3 py-2" placeholder="secret://perception/email-main" /></Field>
      {source === 'email' ? <><Field label="邮箱目录"><input value={mailbox} onChange={(event) => setMailbox(event.target.value)} className="w-full rounded border border-slate-700 bg-slate-950 px-3 py-2" /></Field><Field label="轮询间隔（秒）"><input type="number" min="15" value={pollSeconds} onChange={(event) => setPollSeconds(event.target.value)} className="w-full rounded border border-slate-700 bg-slate-950 px-3 py-2" /></Field></> : <Field label={source === 'dingtalk' ? 'Stream Endpoint' : '回调路径'}><input value={endpoint} onChange={(event) => setEndpoint(event.target.value)} className="w-full rounded border border-slate-700 bg-slate-950 px-3 py-2" placeholder={source === 'dingtalk' ? 'wss://…' : '/api/perception/webhooks/…'} /></Field>}
    </div>
    {error && <p role="alert" className="text-sm text-red-400">{error}</p>}
    <p className="text-xs text-slate-400">真实密钥由 Desktop 安全存储或部署环境提供；此处仅绑定不可回显的引用。</p>
    <div className="flex gap-2"><Button type="submit">保存为停用状态</Button><Button type="button" variant="outline" onClick={onCancel}>取消</Button></div>
  </form>;
}

function Field({ label, children }: { label: string; children: React.ReactNode }): JSX.Element {
  return <label className="space-y-1 text-sm"><span className="text-slate-300">{label}</span>{children}</label>;
}
