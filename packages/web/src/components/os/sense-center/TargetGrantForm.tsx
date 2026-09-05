'use client';

import { useEffect, useState } from 'react';

import { listPerceptionTargetAssets, type PerceptionTargetAsset } from '@/services/perceptionTargetService';

import { Button } from '@/components/ui/button';

import type { ExternalTriggerGrant, PerceptionTargetKind } from '@originos/core/types';

interface TargetGrantFormProps {
  connectors: Array<{ id: string }>;
  loadAssets?(kind: PerceptionTargetKind): Promise<PerceptionTargetAsset[]>;
  onSave(grant: ExternalTriggerGrant): Promise<void>;
  onCancel(): void;
}

export const TargetGrantForm = ({ connectors, loadAssets = listPerceptionTargetAssets, onSave, onCancel }: TargetGrantFormProps): JSX.Element => {
  const [kind, setKind] = useState<PerceptionTargetKind>('project');
  const [id, setId] = useState('');
  const [assets, setAssets] = useState<PerceptionTargetAsset[]>([]);
  const [loadingAssets, setLoadingAssets] = useState(true);
  const [assetError, setAssetError] = useState(false);
  const [connectorId, setConnectorId] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string>();

  useEffect(() => {
    let active = true;
    setId('');
    setAssets([]);
    setAssetError(false);
    setLoadingAssets(true);
    void loadAssets(kind).then((items) => {
      if (active) {
        setAssets(items);
      }
    }).catch(() => {
      if (active) {
        setAssetError(true);
      }
    }).finally((): void => {
      if (active) {
        setLoadingAssets(false);
      }
    });
    return (): void => { active = false; };
  }, [kind, loadAssets]);

  const submit = async (event: React.FormEvent): Promise<void> => {
    event.preventDefault();
    setError(undefined);
    setSaving(true);
    const now = new Date().toISOString();
    try {
      await onSave({
        target: { kind, id: id.trim() },
        enabled: true,
        ...(connectorId ? { allowedConnectorIds: [connectorId] } : {}),
        createdAt: now,
        updatedAt: now,
      });
      onCancel();
    } catch {
      setError('授权保存失败，请确认目标 ID 有效后重试');
    } finally {
      setSaving(false);
    }
  };

  return <form onSubmit={(event) => void submit(event)} className="mb-4 space-y-4 rounded border border-blue-600 bg-slate-900 p-4" aria-label="添加目标权限">
    <div className="grid gap-3 md:grid-cols-2">
      <label className="space-y-1 text-sm"><span className="text-slate-300">目标类型</span><select value={kind} onChange={(event) => setKind(event.target.value as PerceptionTargetKind)} className="w-full rounded border border-slate-700 bg-slate-950 px-3 py-2"><option value="project">项目</option><option value="role-agent">角色 Agent</option><option value="skill">Skill</option></select></label>
      <label className="space-y-1 text-sm"><span className="text-slate-300">目标资产</span><select required autoFocus value={id} onChange={(event) => setId(event.target.value)} disabled={loadingAssets || assetError} className="w-full rounded border border-slate-700 bg-slate-950 px-3 py-2"><option value="">{assetPlaceholder(loadingAssets, assetError, assets.length)}</option>{assets.map((asset) => <option key={asset.id} value={asset.id}>{asset.name}{asset.detail ? ` · ${asset.detail}` : ''} ({asset.id})</option>)}</select></label>
      <label className="space-y-1 text-sm md:col-span-2"><span className="text-slate-300">限制感知源（可选）</span><select value={connectorId} onChange={(event) => setConnectorId(event.target.value)} className="w-full rounded border border-slate-700 bg-slate-950 px-3 py-2"><option value="">允许所有感知源</option>{connectors.map((connector) => <option key={connector.id} value={connector.id}>{connector.id}</option>)}</select></label>
    </div>
    {id && <p className="text-xs text-slate-400">{assets.find((asset) => asset.id === id)?.description || '已选择现有资产。'} 授权只开放外部事件入口，不会扩大目标原有的工具权限。</p>}
    {!id && !loadingAssets && !assetError && assets.length === 0 && <p role="status" className="text-sm text-yellow-400">该类型暂无资产，请先创建后再授权。</p>}
    {assetError && <p role="alert" className="text-sm text-red-400">无法加载目标资产，请刷新后重试。</p>}
    {error && <p role="alert" className="text-sm text-red-400">{error}</p>}
    <div className="flex gap-2"><Button type="submit" disabled={saving || !id.trim()}>{saving ? '正在授权…' : '允许外部触发'}</Button><Button type="button" variant="outline" onClick={onCancel}>取消</Button></div>
  </form>;
};

function assetPlaceholder(loading: boolean, failed: boolean, count: number): string {
  if (loading) {
    return '正在加载资产…';
  }
  if (failed) {
    return '资产加载失败';
  }
  if (count === 0) {
    return '暂无可用资产';
  }
  return '请选择资产';
}
