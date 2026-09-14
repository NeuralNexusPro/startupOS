'use client';
import { useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import type {
  JsonValue,
  PerceptionConnectorConfig,
  PerceptionSource,
} from '@originos/core/types';
import type {
  PerceptionPluginManifest,
  PluginConfigurationField,
} from '@originos/core/modules/perception-runtime';
import {
  canProvisionPlugin,
  listPerceptionPlugins,
  provisionPerceptionPlugin,
} from '@/services/perceptionPluginService';
interface ConnectorDraft {
  id: string;
  source: PerceptionSource;
  settings: Record<string, JsonValue>;
}
interface Props {
  onSave(config: PerceptionConnectorConfig): Promise<void>;
  onCancel(): void;
  onProvisioned?(): Promise<void> | void;
  initial?: ConnectorDraft;
  manifests?: PerceptionPluginManifest[];
}
export function ConnectorForm({
  onCancel,
  onProvisioned,
  initial,
  manifests: supplied,
}: Props): JSX.Element {
  const [manifests, setManifests] = useState(supplied ?? []);
  const [pluginId, setPluginId] = useState('');
  const [id, setId] = useState(initial?.id ?? '');
  const [values, setValues] = useState<Record<string, JsonValue>>({});
  const [error, setError] = useState<string>();
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    if (supplied) return;
    if (!canProvisionPlugin()) {
      setError('感知插件只能在 OriginOS Desktop 中安全配置');
      return;
    }
    void listPerceptionPlugins()
      .then(setManifests)
      .catch(() => setError('无法加载感知插件目录'));
  }, [supplied]);
  const manifest = useMemo(
    () =>
      manifests.find((item) => item.id === pluginId) ??
      manifests.find((item) => item.source === initial?.source) ??
      manifests[0],
    [initial?.source, manifests, pluginId]
  );
  useEffect(() => {
    if (!manifest) return;
    setPluginId(manifest.id);
    setValues(
      Object.fromEntries(
        manifest.configurationSchema.fields.map((field) => [
          field.key,
          initial?.settings[field.key] ??
            field.defaultValue ??
            defaultValue(field),
        ])
      )
    );
  }, [initial, manifest]);
  const submit = async (event: React.FormEvent): Promise<void> => {
    event.preventDefault();
    setError(undefined);
    if (!manifest || !/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(id)) {
      setError('请选择插件，并使用有效的连接 ID');
      return;
    }
    const settings: Record<string, JsonValue> = {};
    const secrets: Record<string, string> = {};
    for (const field of manifest.configurationSchema.fields) {
      const current = values[field.key];
      if (field.required && (current === '' || current === undefined)) {
        setError(`请填写${field.label}`);
        return;
      }
      if (field.sensitive) {
        if (typeof current === 'string' && current)
          secrets[field.key] = current;
      } else settings[field.key] = current ?? null;
    }
    setSaving(true);
    try {
      await provisionPerceptionPlugin({
        pluginId: manifest.id,
        connectorId: id,
        settings,
        secrets,
      });
      await onProvisioned?.();
      onCancel();
    } catch {
      setError('插件配置保存失败，请检查字段和凭据');
    } finally {
      setSaving(false);
    }
  };
  return (
    <form
      onSubmit={(event) => void submit(event)}
      className="mb-4 space-y-4 rounded border border-blue-600 bg-slate-900 p-4"
      aria-label="添加感知源"
    >
      <div className="grid gap-3 md:grid-cols-2">
        <Field label="感知插件">
          <select
            value={manifest?.id ?? ''}
            onChange={(event) => setPluginId(event.target.value)}
            className={control}
          >
            {manifests.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="连接 ID">
          <input
            required
            value={id}
            onChange={(event) => setId(event.target.value)}
            className={control}
            placeholder="connector-main"
          />
        </Field>
        {manifest?.configurationSchema.fields.map((field) => (
          <SchemaField
            key={field.key}
            field={field}
            value={values[field.key]}
            onChange={(next) =>
              setValues((current) => ({ ...current, [field.key]: next }))
            }
          />
        ))}
      </div>
      {manifest && (
        <p className="text-xs text-slate-400">
          {manifest.name} · {manifest.transport}。敏感字段只发送到 Desktop
          主进程并写入系统安全存储，不会进入管理 API 或页面回显。
        </p>
      )}
      {error && (
        <p role="alert" className="text-sm text-red-400">
          {error}
        </p>
      )}
      <div className="flex gap-2">
        <Button type="submit" disabled={saving || !manifest}>
          {saving ? '正在保存…' : '保存配置'}
        </Button>
        <Button type="button" variant="outline" onClick={onCancel}>
          取消
        </Button>
      </div>
    </form>
  );
}
function SchemaField({
  field,
  value,
  onChange,
}: {
  field: PluginConfigurationField;
  value: JsonValue | undefined;
  onChange(value: JsonValue): void;
}): JSX.Element {
  if (field.type === 'boolean')
    return (
      <label className="flex items-center gap-2 text-sm text-slate-300">
        <input
          type="checkbox"
          checked={value === true}
          onChange={(event) => onChange(event.target.checked)}
        />
        {field.label}
      </label>
    );
  if (field.type === 'select')
    return (
      <Field label={field.label}>
        <select
          required={field.required}
          value={typeof value === 'string' ? value : ''}
          onChange={(event) => onChange(event.target.value)}
          className={control}
        >
          {field.options?.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        {field.help && <Hint text={field.help} />}
      </Field>
    );
  return (
    <Field label={field.label}>
      <input
        required={field.required}
        type={
          field.type === 'password'
            ? 'password'
            : field.type === 'number'
              ? 'number'
              : 'text'
        }
        min={field.min}
        max={field.max}
        value={
          typeof value === 'string' || typeof value === 'number'
            ? String(value)
            : ''
        }
        onChange={(event) =>
          onChange(
            field.type === 'number'
              ? Number(event.target.value)
              : event.target.value
          )
        }
        className={control}
        autoComplete={field.sensitive ? 'new-password' : undefined}
      />
      {field.help && <Hint text={field.help} />}
    </Field>
  );
}
const control = 'w-full rounded border border-slate-700 bg-slate-950 px-3 py-2';
function defaultValue(field: PluginConfigurationField): JsonValue {
  return field.type === 'boolean' ? false : field.type === 'number' ? 0 : '';
}
function Hint({ text }: { text: string }): JSX.Element {
  return <span className="text-xs text-slate-400">{text}</span>;
}
function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}): JSX.Element {
  return (
    <label className="space-y-1 text-sm">
      <span className="text-slate-300">{label}</span>
      {children}
    </label>
  );
}
