'use client';

import * as React from 'react';
import { X, Eye, EyeOff, Check, RefreshCw, Download, RotateCcw } from 'lucide-react';
import { useSettingsStore, type LLMProviderType, type ProviderConfig, type LLMSettings, type UserLanguagePreference } from '@/store/settingsStore';
import useDockStore from '@/store/dockStore';
import type { DockSide } from '@originos/core/types';
import {
  checkForUpdates,
  downloadUpdate,
  getUpdateStatus,
  installUpdate,
  subscribeToUpdateEvents,
  type UpdateState,
} from '@originos/core/lib/integrations/electron/services/auto-update';
import { JevProviderSection } from './JevProviderSection';

interface SettingsDialogProps {
  open: boolean;
  onClose: () => void;
}

export function SettingsDialog({ open, onClose }: SettingsDialogProps) {
  const { llm, preferences, saveLLMSettings, savePreferences, loadFromServer } = useSettingsStore();
  const currentDockSide = useDockStore((state) => state.dockSide);
  const setDockSide = useDockStore((state) => state.setDockSide);
  const [activeTab, setActiveTab] = React.useState<LLMProviderType>(llm.provider);
  const [showKey, setShowKey] = React.useState(false);

  const [draft, setDraft] = React.useState<LLMSettings>(llm);
  const [mappingText, setMappingText] = React.useState<Record<LLMProviderType, string>>({
    anthropic: '{}',
    openai: '{}',
  });
  const [mappingError, setMappingError] = React.useState<string | null>(null);
  const [language, setLanguage] = React.useState<UserLanguagePreference>(preferences.language);
  const [dockSideDraft, setDockSideDraft] = React.useState<DockSide>(currentDockSide);
  const [updateState, setUpdateState] = React.useState<UpdateState>({
    status: 'idle',
    available: false,
    currentVersion: 'unknown',
  });
  const [updateBusy, setUpdateBusy] = React.useState(false);

  React.useEffect(() => {
    if (open) {
      void loadFromServer();
    }
  }, [open, loadFromServer]);

  React.useEffect(() => {
    if (open) {
      setDraft({
        provider: llm.provider,
        anthropic: { ...llm.anthropic },
        openai: { ...llm.openai },
      });
      setMappingText({
        anthropic: formatMappingText(llm.anthropic.mapping),
        openai: formatMappingText(llm.openai.mapping),
      });
      setMappingError(null);
      setLanguage(preferences.language);
      setDockSideDraft(currentDockSide);
      setActiveTab(llm.provider);
      setShowKey(false);
    }
  }, [open, llm, preferences.language, currentDockSide]);

  React.useEffect(() => {
    if (!open) {
      return undefined;
    }

    let mounted = true;
    void getUpdateStatus().then((response) => {
      if (mounted && response.success && response.data) {
        setUpdateState(response.data);
      }
    });

    const unsubscribe = subscribeToUpdateEvents((state) => {
      if (mounted) {
        setUpdateState(state);
      }
    });

    return () => {
      mounted = false;
      unsubscribe();
    };
  }, [open]);

  if (!open) return null;

  function handleSave() {
    const anthropicMapping = parseMappingText(mappingText.anthropic);
    const openaiMapping = parseMappingText(mappingText.openai);
    if (!anthropicMapping.ok || !openaiMapping.ok) {
      setMappingError('字段映射必须是 JSON 对象，例如 { "max_tokens": "max_completion_tokens" }');
      return;
    }
    setMappingError(null);
    saveLLMSettings({
      ...draft,
      provider: activeTab,
      anthropic: { ...draft.anthropic, mapping: anthropicMapping.value },
      openai: { ...draft.openai, mapping: openaiMapping.value },
    });
    savePreferences({ language });
    setDockSide(dockSideDraft);
    onClose();
  }

  function updateDraft(provider: LLMProviderType, field: keyof ProviderConfig, value: string | number | boolean) {
    setDraft((prev) => ({
      ...prev,
      [provider]: { ...prev[provider], [field]: value } as ProviderConfig,
    }));
  }

  async function runUpdateAction(action: () => Promise<{ success: boolean; data?: UpdateState }>) {
    setUpdateBusy(true);
    try {
      const response = await action();
      if (response.success && response.data) {
        setUpdateState(response.data);
      }
    } finally {
      setUpdateBusy(false);
    }
  }

  const providerDraft = draft[activeTab];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="flex max-h-[86vh] w-[560px] flex-col rounded-2xl border border-white/10 bg-black/70 backdrop-blur-2xl shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-white/10 px-5 py-4">
          <span className="text-sm font-semibold text-white/90">LLM 设置</span>
          <button
            onClick={onClose}
            className="text-white/50 hover:text-white transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 border-b border-white/10 px-5 pt-3">
          {(['anthropic', 'openai'] as LLMProviderType[]).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-3 py-1.5 text-xs font-medium rounded-t transition-colors ${
                activeTab === tab
                  ? 'bg-white/10 text-white border border-b-0 border-white/10'
                  : 'text-white/50 hover:text-white/80'
              }`}
            >
              {tab === 'anthropic' ? 'Anthropic' : 'OpenAI Compatible'}
            </button>
          ))}
        </div>

        {/* Fields */}
        <div className="flex flex-col gap-4 overflow-y-auto px-5 py-5">
          <div className="flex flex-col gap-1.5">
            <label className="text-xs text-white/50">全局语言偏好</label>
            <select
              value={language}
              onChange={(e) => setLanguage(e.target.value as UserLanguagePreference)}
              className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white outline-none focus:border-white/30 focus:bg-white/8 transition-colors"
            >
              <option value="zh-CN" className="bg-gray-900 text-white">简体中文</option>
              <option value="en-US" className="bg-gray-900 text-white">English</option>
              <option value="ja-JP" className="bg-gray-900 text-white">日本語</option>
            </select>
            <p className="text-[10px] text-white/30">会注入到所有 Agent Runtime 的 system prompt，作为全局用户偏好。</p>
          </div>
          <div className="flex flex-col gap-2">
            <label className="text-xs text-white/50">Dock 位置</label>
            <div className="grid grid-cols-3 gap-2">
              {([
                ['left', '左侧'],
                ['bottom', '底部'],
                ['right', '右侧'],
              ] as Array<[DockSide, string]>).map(([side, label]) => (
                <button
                  key={side}
                  type="button"
                  onClick={() => setDockSideDraft(side)}
                  className={`rounded-lg border px-3 py-2 text-xs transition-colors ${
                    dockSideDraft === side
                      ? 'border-sky-300/50 bg-sky-400/15 text-sky-100'
                      : 'border-white/10 bg-white/5 text-white/60 hover:text-white'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
            <p className="text-[10px] text-white/30">桌面端会同步调整独立 Dock 窗口热区；Web 预览使用同一配置。</p>
          </div>
          <div className="flex items-center justify-between rounded-lg border border-white/10 bg-white/5 px-3 py-2">
            <div className="flex flex-col">
              <span className="text-xs font-medium text-white/80">启用 {activeTab === 'anthropic' ? 'Anthropic' : 'OpenAI Compatible'}</span>
              <span className="text-[10px] text-white/30">关闭后不会参与运行时模型选择</span>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={providerDraft.enabled}
              onClick={() => updateDraft(activeTab, 'enabled', !providerDraft.enabled)}
              className={`flex h-6 w-11 items-center rounded-full border transition-colors ${
                providerDraft.enabled ? 'border-emerald-400/40 bg-emerald-500/40' : 'border-white/10 bg-white/10'
              }`}
            >
              <span
                className={`ml-0.5 flex h-5 w-5 items-center justify-center rounded-full bg-white text-[10px] text-black transition-transform ${
                  providerDraft.enabled ? 'translate-x-5' : 'translate-x-0'
                }`}
              >
                {providerDraft.enabled ? <Check className="h-3 w-3" /> : null}
              </span>
            </button>
          </div>
          <Field
            label="Base URL"
            placeholder={activeTab === 'anthropic' ? 'https://api.anthropic.com' : 'https://api.openai.com/v1'}
            value={providerDraft.baseUrl}
            onChange={(v) => updateDraft(activeTab, 'baseUrl', v)}
          />
          {activeTab === 'anthropic' ? (
            <>
              <SecretField
                label="ANTHROPIC_AUTH_TOKEN"
                placeholder="sk-ant-oat-..."
                value={providerDraft.authToken}
                showValue={showKey}
                onToggleShow={() => setShowKey((v) => !v)}
                onChange={(v) => updateDraft(activeTab, 'authToken', v)}
              />
              <SecretField
                label="ANTHROPIC_API_KEY"
                placeholder="sk-ant-api-..."
                value={providerDraft.apiKey}
                showValue={showKey}
                onToggleShow={() => setShowKey((v) => !v)}
                onChange={(v) => updateDraft(activeTab, 'apiKey', v)}
              />
              <p className="text-[10px] text-white/30">两项选择一个填写即可；同时填写时优先使用 ANTHROPIC_AUTH_TOKEN。</p>
            </>
          ) : (
            <SecretField
              label="API Key"
              placeholder="sk-..."
              value={providerDraft.apiKey}
              showValue={showKey}
              onToggleShow={() => setShowKey((v) => !v)}
              onChange={(v) => updateDraft(activeTab, 'apiKey', v)}
            />
          )}
          <Field
            label="Model"
            placeholder={activeTab === 'anthropic' ? 'claude-sonnet-4-6' : 'gpt-4o'}
            value={providerDraft.model}
            onChange={(v) => updateDraft(activeTab, 'model', v)}
          />
          <div className="flex flex-col gap-1.5">
            <label className="text-xs text-white/50">Max Tokens</label>
            <input
              type="number"
              value={providerDraft.maxTokens}
              onChange={(e) => updateDraft(activeTab, 'maxTokens', parseInt(e.target.value, 10) || 0)}
              placeholder="16384"
              min={1}
              max={128000}
              className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white placeholder-white/20 outline-none focus:border-white/30 focus:bg-white/8 transition-colors"
            />
            <p className="text-[10px] text-white/30">单次响应最大 Token 数，不同模型上限不同（如 Azure GPT-4o 最大 16384）</p>
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-xs text-white/50">字段映射</label>
            <textarea
              value={mappingText[activeTab]}
              onChange={(e) => {
                setMappingText((prev) => ({ ...prev, [activeTab]: e.target.value }));
                setMappingError(null);
              }}
              rows={3}
              spellCheck={false}
              placeholder={'{ "max_tokens": "max_completion_tokens" }'}
              className="w-full resize-none rounded-lg border border-white/10 bg-white/5 px-3 py-2 font-mono text-xs text-white placeholder-white/20 outline-none transition-colors focus:border-white/30 focus:bg-white/8"
            />
            <p className="text-[10px] leading-4 text-white/30">
              配置请求字段名映射。例如把默认的 max_tokens 改成 max_completion_tokens。
            </p>
            {mappingError ? (
              <p className="text-[10px] leading-4 text-red-200/80">{mappingError}</p>
            ) : null}
          </div>
          <JevProviderSection />
          <UpdateSettingsSection
            state={updateState}
            busy={updateBusy}
            onCheck={() => runUpdateAction(checkForUpdates)}
            onDownload={() => runUpdateAction(downloadUpdate)}
            onInstall={() => runUpdateAction(installUpdate)}
          />
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 border-t border-white/10 px-5 py-4">
          <button
            onClick={onClose}
            className="rounded-lg border border-white/10 bg-white/5 px-4 py-1.5 text-xs text-white/70 hover:text-white transition-colors"
          >
            取消
          </button>
          <button
            onClick={handleSave}
            className="rounded-lg bg-white/15 px-4 py-1.5 text-xs font-medium text-white hover:bg-white/20 transition-colors"
          >
            保存
          </button>
        </div>
      </div>
    </div>
  );
}

function formatMappingText(mapping: Record<string, string>): string {
  return Object.keys(mapping).length > 0 ? JSON.stringify(mapping, null, 2) : '{}';
}

function parseMappingText(text: string): { ok: true; value: Record<string, string> } | { ok: false } {
  try {
    const parsed = JSON.parse(text || '{}') as unknown;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return { ok: false };
    }
    const entries = Object.entries(parsed)
      .filter((entry): entry is [string, string] => typeof entry[1] === 'string')
      .map(([key, value]) => [key.trim(), value.trim()] as const)
      .filter(([key, value]) => key.length > 0 && value.length > 0);
    return { ok: true, value: Object.fromEntries(entries) };
  } catch {
    return { ok: false };
  }
}

function UpdateSettingsSection({
  state,
  busy,
  onCheck,
  onDownload,
  onInstall,
}: {
  state: UpdateState;
  busy: boolean;
  onCheck: () => void;
  onDownload: () => void;
  onInstall: () => void;
}) {
  const progress = typeof state.progress?.percent === 'number'
    ? Math.max(0, Math.min(100, state.progress.percent))
    : null;

  return (
    <section className="flex flex-col gap-3 rounded-xl border border-white/10 bg-white/5 p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="flex flex-col gap-1">
          <span className="text-xs font-semibold text-white/80">应用更新</span>
          <span className="text-[10px] text-white/35">当前版本：{state.currentVersion}</span>
        </div>
        <span className={`rounded-full px-2 py-0.5 text-[10px] ${getUpdateBadgeClass(state.status)}`}>
          {getUpdateStatusLabel(state)}
        </span>
      </div>

      {state.error ? (
        <p className="rounded-lg border border-red-400/20 bg-red-500/10 px-3 py-2 text-[11px] leading-5 text-red-100/80">
          {state.error}
        </p>
      ) : null}

      {state.available && state.updateInfo?.version ? (
        <p className="text-[11px] leading-5 text-white/45">
          可用版本：{state.updateInfo.version}
          {state.updateInfo.releaseDate ? ` · ${new Date(state.updateInfo.releaseDate).toLocaleDateString()}` : ''}
        </p>
      ) : null}

      {progress !== null ? (
        <div className="flex flex-col gap-1">
          <div className="flex h-1.5 gap-0.5 overflow-hidden rounded-full">
            {Array.from({ length: 20 }).map((_, index) => (
              <span
                key={index}
                className={`h-full flex-1 rounded-full transition-colors ${
                  index < Math.round(progress / 5) ? 'bg-emerald-400/80' : 'bg-white/10'
                }`}
              />
            ))}
          </div>
          <span className="text-[10px] text-white/35">下载进度 {progress.toFixed(0)}%</span>
        </div>
      ) : null}

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={onCheck}
          disabled={busy || state.status === 'checking' || state.status === 'downloading'}
          className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-white/70 transition-colors hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${state.status === 'checking' ? 'animate-spin' : ''}`} />
          检查更新
        </button>
        {state.status === 'available' ? (
          <button
            type="button"
            onClick={onDownload}
            disabled={busy}
            className="inline-flex items-center gap-1.5 rounded-lg bg-white/15 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-white/20 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <Download className="h-3.5 w-3.5" />
            下载更新
          </button>
        ) : null}
        {state.status === 'downloaded' ? (
          <button
            type="button"
            onClick={onInstall}
            disabled={busy}
            className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-500/25 px-3 py-1.5 text-xs font-medium text-emerald-50 transition-colors hover:bg-emerald-500/35 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            立即重启安装
          </button>
        ) : null}
      </div>
    </section>
  );
}

function getUpdateStatusLabel(state: UpdateState): string {
  switch (state.status) {
    case 'unsupported':
      return '不可用';
    case 'checking':
      return '检查中';
    case 'available':
      return '可下载';
    case 'downloading':
      return '下载中';
    case 'downloaded':
      return '待安装';
    case 'not-available':
      return '已是最新';
    case 'error':
      return '失败';
    case 'idle':
    default:
      return '未检查';
  }
}

function getUpdateBadgeClass(status: UpdateState['status']): string {
  if (status === 'available' || status === 'downloaded') {
    return 'border border-emerald-400/30 bg-emerald-500/15 text-emerald-100';
  }
  if (status === 'error') {
    return 'border border-red-400/30 bg-red-500/15 text-red-100';
  }
  if (status === 'checking' || status === 'downloading') {
    return 'border border-sky-400/30 bg-sky-500/15 text-sky-100';
  }
  return 'border border-white/10 bg-white/5 text-white/45';
}

function SecretField({
  label,
  placeholder,
  value,
  showValue,
  onToggleShow,
  onChange,
}: {
  label: string;
  placeholder: string;
  value: string;
  showValue: boolean;
  onToggleShow: () => void;
  onChange: (v: string) => void;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-xs text-white/50">{label}</label>
      <div className="relative">
        <input
          type={showValue ? 'text' : 'password'}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 pr-9 text-sm text-white placeholder-white/20 outline-none focus:border-white/30 focus:bg-white/8 transition-colors"
        />
        <button
          type="button"
          onClick={onToggleShow}
          className="absolute right-2.5 top-1/2 -translate-y-1/2 text-white/30 hover:text-white/60 transition-colors"
        >
          {showValue ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
        </button>
      </div>
    </div>
  );
}

function Field({
  label,
  placeholder,
  value,
  onChange,
}: {
  label: string;
  placeholder: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-xs text-white/50">{label}</label>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white placeholder-white/20 outline-none focus:border-white/30 focus:bg-white/8 transition-colors"
      />
    </div>
  );
}
