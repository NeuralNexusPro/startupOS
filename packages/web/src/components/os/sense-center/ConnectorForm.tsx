'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import type { JsonValue, MailAuthMode, PerceptionConnectorConfig, PerceptionSource } from '@originos/core/types';
import { canProvisionMail, provisionAndTestMail } from '@/services/perceptionMailService';
import { canProvisionWeCom, provisionWeCom } from '@/services/perceptionWeComService';
import { canProvisionFeishu, provisionFeishu } from '@/services/perceptionFeishuService';

interface ConnectorDraft { id: string; source: PerceptionSource; settings: Record<string, JsonValue> }
interface ConnectorFormProps { onSave(config: PerceptionConnectorConfig): Promise<void>; onCancel(): void; onProvisioned?(): Promise<void> | void; initial?: ConnectorDraft }

export function ConnectorForm({ onSave, onCancel, onProvisioned, initial }: ConnectorFormProps): JSX.Element {
  const [source, setSource] = useState<PerceptionSource>(initial?.source ?? 'email');
  const [id, setId] = useState(initial?.id ?? '');
  const [host, setHost] = useState(value(initial, 'host'));
  const [port, setPort] = useState(value(initial, 'port') || '993');
  const [secure, setSecure] = useState(typeof initial?.settings['secure'] === 'boolean' ? initial.settings['secure'] : true);
  const [username, setUsername] = useState(value(initial, 'username'));
  const [authMode, setAuthMode] = useState<MailAuthMode>(initial?.settings['authMode'] === 'oauth2-token' ? 'oauth2-token' : 'password');
  const [secret, setSecret] = useState('');
  const [endpoint, setEndpoint] = useState('');
  const [botId, setBotId] = useState(value(initial, 'botId'));
  const [weComSecret, setWeComSecret] = useState('');
  const [feishuAppId, setFeishuAppId] = useState(value(initial, 'appId'));
  const [feishuAppSecret, setFeishuAppSecret] = useState('');
  const [feishuDomain, setFeishuDomain] = useState<'feishu' | 'lark'>(initial?.settings['domain'] === 'lark' ? 'lark' : 'feishu');
  const [mailbox, setMailbox] = useState(value(initial, 'mailbox') || 'INBOX');
  const [pollSeconds, setPollSeconds] = useState(value(initial, 'pollIntervalSeconds') || '60');
  const [error, setError] = useState<string>();
  const [testing, setTesting] = useState(false);
  const [saving, setSaving] = useState(false);


  const submit = async (event: React.FormEvent): Promise<void> => {
    event.preventDefault(); setError(undefined);
    if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(id)) { setError('连接 ID 只能包含字母、数字、点、下划线和连字符'); return; }
    if (source === 'email') {
      if (!canProvisionMail()) { setError('邮箱凭据只能在 OriginOS Desktop 中安全配置'); return; }
      setTesting(true);
      try {
        const result = await provisionAndTestMail({ connectorId: id, profile: { host, port: Number(port), secure, username, authMode, mailbox, pollIntervalSeconds: Number(pollSeconds) }, secret: { kind: authMode, value: secret } });
        if (!result.test.success) { setError(mailError(result.test.code)); return; }
        setSecret(''); await onProvisioned?.(); onCancel();
      } catch (cause) { setError(cause instanceof Error && cause.message === 'DESKTOP_REQUIRED' ? '请在 OriginOS Desktop 中配置邮箱' : '保存或连接测试失败'); }
      finally { setTesting(false); }
      return;
    }
    if (source === 'wecom') {
      if (!botId.trim()) { setError('请填写智能机器人的 Bot ID'); return; }
      if (!canProvisionWeCom()) { setError('企微机器人 Secret 只能在 OriginOS Desktop 中安全配置'); return; }
      if (!weComSecret) { setError('请填写智能机器人 Secret'); return; }
      setSaving(true);
      try { await provisionWeCom({ connectorId: id, profile: { transport: 'aibot-websocket', botId: botId.trim() }, secret: { value: weComSecret } }); setWeComSecret(''); await onProvisioned?.(); onCancel(); }
      catch { setError('企微机器人配置保存失败'); }
      finally { setSaving(false); }
      return;
    }
    if (source === 'feishu') {
      if (!feishuAppId.trim() || !feishuAppSecret) { setError('请填写 App ID 和 App Secret'); return; }
      if (!canProvisionFeishu()) { setError('飞书机器人凭据只能在 OriginOS Desktop 中安全配置'); return; }
      setSaving(true);
      try {
        await provisionFeishu({ connectorId: id, profile: { appId: feishuAppId.trim(), domain: feishuDomain }, secret: { appSecret: feishuAppSecret } });
        setFeishuAppSecret(''); await onProvisioned?.(); onCancel();
      } catch { setError('飞书机器人配置保存失败'); }
      finally { setSaving(false); }
      return;
    }
    const now = new Date().toISOString();
    const mode = source === 'dingtalk' ? 'stream' : 'webhook';
    const settings: Record<string, JsonValue> = source === 'dingtalk'
      ? { streamEndpoint: endpoint }
      : { callbackPath: endpoint };
    setSaving(true);
    try { await onSave({ id, source, mode, enabled: false, settings, createdAt: initial ? new Date().toISOString() : now, updatedAt: now }); onCancel(); }
    catch { setError('保存失败，请检查配置'); }
    finally { setSaving(false); }
  };

  return <form onSubmit={(event) => void submit(event)} className="mb-4 space-y-4 rounded border border-blue-600 bg-slate-900 p-4" aria-label="添加感知源">
    <div className="grid gap-3 md:grid-cols-2">
      <Field label="平台"><select value={source} onChange={(event) => setSource(event.target.value as PerceptionSource)} className={control}><option value="email">Email</option><option value="wecom">企业微信</option><option value="feishu">飞书</option><option value="dingtalk">钉钉</option></select></Field>
      <Field label="连接 ID"><input required value={id} onChange={(event) => setId(event.target.value)} className={control} placeholder="email-main" /></Field>
      {source === 'email' ? <>
        <Field label="IMAP 主机"><input required value={host} onChange={(event) => setHost(event.target.value)} className={control} placeholder="imap.example.com" /></Field>
        <Field label="端口"><input required type="number" min="1" max="65535" value={port} onChange={(event) => setPort(event.target.value)} className={control} /></Field>
        <Field label="用户名"><input required value={username} onChange={(event) => setUsername(event.target.value)} className={control} autoComplete="username" /></Field>
        <Field label="认证方式"><select value={authMode} onChange={(event) => setAuthMode(event.target.value as MailAuthMode)} className={control}><option value="password">密码 / 应用专用密码</option><option value="oauth2-token">OAuth2 Access Token</option></select></Field>
        <Field label={authMode === 'password' ? '密码（不会回显）' : 'Access Token（不会回显）'}><input required type="password" value={secret} onChange={(event) => setSecret(event.target.value)} className={control} autoComplete="new-password" /></Field>
        <Field label="邮箱目录"><input required value={mailbox} onChange={(event) => setMailbox(event.target.value)} className={control} /></Field>
        <Field label="轮询间隔（秒）"><input type="number" min="15" value={pollSeconds} onChange={(event) => setPollSeconds(event.target.value)} className={control} /></Field>
        <label className="flex items-center gap-2 text-sm text-slate-300"><input type="checkbox" checked={secure} onChange={(event) => setSecure(event.target.checked)} />使用 TLS</label>
      </> : source === 'wecom' ? <>
        <Field label="智能机器人 Bot ID"><input required value={botId} onChange={(event) => setBotId(event.target.value)} className={control} placeholder="企业微信机器人凭据页中的 Bot ID" /></Field>
        <Field label="智能机器人 Secret（不会回显）"><input required type="password" value={weComSecret} onChange={(event) => setWeComSecret(event.target.value)} className={control} autoComplete="new-password" /></Field>
        <div className="rounded border border-slate-700 bg-slate-950 p-3 text-xs text-slate-400 md:col-span-2">
          使用企业微信智能机器人 WebSocket 长连接，无需公网回调地址。Secret 将由系统安全存储加密保存。
        </div>
      </> : source === 'feishu' ? <>
        <Field label="App ID"><input required value={feishuAppId} onChange={(event) => setFeishuAppId(event.target.value)} className={control} placeholder="cli_xxxxxxxxxxxxxxxx" /></Field>
        <Field label="App Secret（不会回显）"><input required type="password" value={feishuAppSecret} onChange={(event) => setFeishuAppSecret(event.target.value)} className={control} autoComplete="new-password" /></Field>
        <Field label="服务区域"><select value={feishuDomain} onChange={(event) => setFeishuDomain(event.target.value === 'lark' ? 'lark' : 'feishu')} className={control}><option value="feishu">飞书（中国）</option><option value="lark">Lark（国际）</option></select></Field>
        <div className="rounded border border-slate-700 bg-slate-950 p-3 text-xs text-slate-400 md:col-span-2">
          在飞书开放平台的“事件与回调”中选择“使用长连接接收事件”，订阅“接收消息”事件，并开通机器人发消息及卡片相关权限。无需公网回调地址；卡片权限不足时会降级为纯文本回复。
        </div>
      </> : <Field label={source === 'dingtalk' ? 'Stream Endpoint' : '回调路径'}><input value={endpoint} onChange={(event) => setEndpoint(event.target.value)} className={control} placeholder={source === 'dingtalk' ? 'wss://…' : '/api/perception/webhooks/…'} /></Field>}
    </div>
    {error && <p role="alert" className="text-sm text-red-400">{error}</p>}
    <p className="text-xs text-slate-400">{source === 'wecom' || source === 'feishu' ? '机器人凭据只发送到 Desktop 主进程并加密保存，不进入管理 API、配置文件或页面回显。' : '邮箱密码只发送到 Desktop 主进程并由系统安全存储加密，不进入 Web API、配置文件或页面回显。'}</p>
    <div className="flex gap-2"><Button type="submit" disabled={testing || saving}>{source === 'email' ? (testing ? '正在测试…' : '保存并测试连接') : saving ? '正在保存…' : '保存为停用状态'}</Button><Button type="button" variant="outline" onClick={onCancel}>取消</Button></div>
  </form>;
}

const control = 'w-full rounded border border-slate-700 bg-slate-950 px-3 py-2';
function Field({ label, children }: { label: string; children: React.ReactNode }): JSX.Element { return <label className="space-y-1 text-sm"><span className="text-slate-300">{label}</span>{children}</label>; }
function mailError(code: string): string { return ({ AUTH_FAILED: '认证失败，请检查用户名和密码', DNS_FAILED: '无法解析 IMAP 主机', TLS_FAILED: 'TLS 连接失败', MAILBOX_NOT_FOUND: '邮箱目录不存在', TIMEOUT: '连接测试超时', SECURE_STORAGE_UNAVAILABLE: '系统安全存储不可用' } as Record<string, string>)[code] ?? 'IMAP 连接失败'; }
function value(initial: ConnectorDraft | undefined, key: string): string { const item = initial?.settings[key]; return typeof item === 'string' || typeof item === 'number' ? String(item) : ''; }
