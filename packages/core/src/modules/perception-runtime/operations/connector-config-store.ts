import fs from 'node:fs';
import path from 'node:path';
import type { PerceptionConnectorConfig } from '../../../types/perception';
import { assertSafePerceptionId } from '../protocol/validation';
import { redactSensitiveContent } from '../security/content-defense';
import { AtomicDataFileStore } from '../storage/data-file-store';
import { resolvePerceptionPath } from '../storage/paths';
import { assertNoCredentialFields, validateMailActivation, validateMailConnectorSettings } from '../../../lib/integrations/perception/email';
import { validateWeComActivation, validateWeComConnectorSettings } from '../../../lib/integrations/perception/wecom';

export class PerceptionConnectorConfigStore {
  constructor(private readonly dataRoot: string) {}
  save(config: PerceptionConnectorConfig): PerceptionConnectorConfig {
    validateConfig(config);
    const safe = { ...config, settings: redactSensitiveContent(config.settings) as { [key: string]: typeof config.settings[string] } };
    this.store(config.id).write(safe);
    return safe;
  }
  get(id: string): PerceptionConnectorConfig | null {
    const store = this.store(id);
    return store.exists() ? store.read().data : null;
  }
  list(): PerceptionConnectorConfig[] {
    const directory = resolvePerceptionPath(this.dataRoot, 'connectors');
    if (!fs.existsSync(directory)) return [];
    return fs.readdirSync(directory).filter((name) => name.endsWith('.json')).map((file) => this.get(file.slice(0, -5))).filter((value): value is PerceptionConnectorConfig => value !== null);
  }
  setEnabled(id: string, enabled: boolean): PerceptionConnectorConfig {
    const config = this.get(id);
    if (!config) throw new Error('Perception connector config not found');
    if (enabled && config.source === 'email') validateMailActivation(config.settings);
    if (enabled && config.source === 'wecom') validateWeComActivation(config.settings, config.secretRef);
    return this.save({ ...config, enabled, updatedAt: new Date().toISOString() });
  }
  private store(id: string): AtomicDataFileStore<PerceptionConnectorConfig> {
    assertSafePerceptionId(id, 'connector config id');
    return new AtomicDataFileStore<PerceptionConnectorConfig>(path.join(resolvePerceptionPath(this.dataRoot, 'connectors'), `${id}.json`));
  }
}

function validateConfig(config: PerceptionConnectorConfig): void {
  assertSafePerceptionId(config.id, 'connector config id');
  if (config.secretRef !== undefined && !/^secret:\/\/[A-Za-z0-9][A-Za-z0-9._:/-]{0,511}$/.test(config.secretRef)) throw new Error('Invalid connector secret reference');
  if (!Number.isFinite(Date.parse(config.createdAt)) || !Number.isFinite(Date.parse(config.updatedAt))) throw new Error('Invalid connector config timestamp');
  const expected = config.source === 'email' ? 'email-poll' : config.source === 'dingtalk' || config.source === 'wecom' ? 'stream' : 'webhook';
  if (config.mode !== expected) throw new Error('Connector mode does not match source');
  assertNoCredentialFields(config.settings);
  if (config.source === 'email') validateMailConnectorSettings(config.settings);
  if (config.source === 'wecom') validateWeComConnectorSettings(config.settings);
}
