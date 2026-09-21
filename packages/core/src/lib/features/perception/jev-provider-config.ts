import path from 'node:path';
import { normalizeJevBaseUrl } from '../../integrations/jev';
import { AtomicDataFileStore } from '../../../modules/perception-runtime';
import type { JevProviderSummary } from '../../../types/perception';

export const DEFAULT_JEV_BASE_URL = 'https://api.typesafe.ai';
export const DEFAULT_JEV_MODEL = 'jev-latest';

export interface JevCredentialPort {
  save(apiKey: string): Promise<string>;
  resolve(secretRef: string): Promise<string>;
  remove(secretRef: string): Promise<void>;
}

export interface JevProviderUpdate {
  enabled: boolean;
  baseUrl: string;
  model: string;
  apiKey?: string;
}

interface StoredJevProviderConfig {
  enabled: boolean;
  baseUrl: string;
  model: string;
  secretRef?: string;
}

export interface JevProviderSnapshot {
  baseUrl: string;
  model: string;
  apiKey: string;
}

export class JevProviderConfigError extends Error {
  constructor(readonly code: 'INVALID_PROVIDER_CONFIG' | 'SECURE_STORAGE_UNAVAILABLE' | 'JEV_NOT_CONFIGURED') {
    super(code);
    this.name = 'JevProviderConfigError';
  }
}

export class JevProviderConfigService {
  private readonly store: AtomicDataFileStore<StoredJevProviderConfig>;

  constructor(
    dataRoot: string,
    private readonly options: {
      credentials?: JevCredentialPort;
      environmentApiKey?: string;
      environment?: 'development' | 'production';
      allowDevelopmentLoopback?: boolean;
    } = {},
  ) {
    this.store = new AtomicDataFileStore(path.join(dataRoot, 'model-providers', 'jev.json'));
  }

  getSummary(): JevProviderSummary {
    return this.summary(this.read());
  }

  async update(input: JevProviderUpdate): Promise<JevProviderSummary> {
    if (!input || typeof input.enabled !== 'boolean' || typeof input.baseUrl !== 'string' || typeof input.model !== 'string'
      || (input.apiKey !== undefined && typeof input.apiKey !== 'string')) {
      throw new JevProviderConfigError('INVALID_PROVIDER_CONFIG');
    }
    const baseUrl = normalizeJevBaseUrl(input.baseUrl, this.options);
    const model = input.model.trim();
    if (!model || model.length > 200) throw new JevProviderConfigError('INVALID_PROVIDER_CONFIG');
    const previous = this.read();
    const apiKey = input.apiKey?.trim();
    let secretRef = previous.secretRef;
    if (apiKey) {
      if (!this.options.credentials) throw new JevProviderConfigError('SECURE_STORAGE_UNAVAILABLE');
      secretRef = await this.options.credentials.save(apiKey);
    }
    if (input.enabled && !this.environmentApiKey && !secretRef) throw new JevProviderConfigError('JEV_NOT_CONFIGURED');
    return this.summary(this.store.write({ enabled: input.enabled, baseUrl, model, ...(secretRef ? { secretRef } : {}) }).data);
  }

  async clearCredential(): Promise<JevProviderSummary> {
    const current = this.read();
    if (current.secretRef && !this.options.credentials) throw new JevProviderConfigError('SECURE_STORAGE_UNAVAILABLE');
    if (current.secretRef) await this.options.credentials?.remove(current.secretRef);
    return this.summary(this.store.write({ ...current, enabled: false, secretRef: undefined }).data);
  }

  async resolveApiKey(): Promise<string> {
    return this.resolveApiKeyFor(this.read());
  }

  async getSnapshot(): Promise<JevProviderSnapshot> {
    const config = this.read();
    if (!config.enabled) throw new JevProviderConfigError('JEV_NOT_CONFIGURED');
    return { baseUrl: config.baseUrl, model: config.model, apiKey: await this.resolveApiKeyFor(config) };
  }

  private async resolveApiKeyFor(config: StoredJevProviderConfig): Promise<string> {
    if (this.environmentApiKey) return this.environmentApiKey;
    const ref = config.secretRef;
    if (!ref || !this.options.credentials) throw new JevProviderConfigError('JEV_NOT_CONFIGURED');
    return this.options.credentials.resolve(ref);
  }

  private get environmentApiKey(): string | undefined {
    return this.options.environmentApiKey?.trim() || undefined;
  }

  private read(): StoredJevProviderConfig {
    return this.store.exists()
      ? this.store.read().data
      : { enabled: false, baseUrl: DEFAULT_JEV_BASE_URL, model: DEFAULT_JEV_MODEL };
  }

  private summary(config: StoredJevProviderConfig): JevProviderSummary {
    const credentialSource = this.environmentApiKey ? 'environment' : config.secretRef ? 'secure-store' : undefined;
    return {
      enabled: config.enabled,
      baseUrl: config.baseUrl,
      model: config.model,
      credentialConfigured: Boolean(credentialSource),
      ...(credentialSource ? { credentialSource } : {}),
      ...(this.store.exists() ? { updatedAt: this.store.read().updatedAt } : {}),
    };
  }
}
