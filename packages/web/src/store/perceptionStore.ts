import { create } from 'zustand';

import type {
  ConnectorHealth,
  ExternalTriggerGrant,
  PerceptionAuditEntry,
  PerceptionConnectorConfig,
  PerceptionDeadLetter,
  PerceptionTriggerRule,
} from '@originos/core/types';

export interface ConnectorSummary extends Omit<PerceptionConnectorConfig, 'secretRef'> { secretConfigured: boolean }
interface DashboardData {
  connectors: ConnectorSummary[];
  grants: ExternalTriggerGrant[];
  rules: PerceptionTriggerRule[];
  health: ConnectorHealth[];
  audit: PerceptionAuditEntry[];
  deadLetters: PerceptionDeadLetter[];
}
interface PerceptionState extends DashboardData {
  loading: boolean;
  error?: string;
  load(): Promise<void>;
  setConnectorEnabled(id: string, enabled: boolean): Promise<void>;
  replay(connectorId: string, id: string): Promise<void>;
  saveConnector(config: PerceptionConnectorConfig): Promise<void>;
  saveRule(rule: PerceptionTriggerRule): Promise<void>;
}

const EMPTY: DashboardData = { connectors: [], grants: [], rules: [], health: [], audit: [], deadLetters: [] };

async function request(input: RequestInfo, init?: RequestInit): Promise<DashboardData | ConnectorSummary> {
  const response = await fetch(input, init);
  const payload = await response.json() as { success: boolean; data?: DashboardData | ConnectorSummary };
  if (!response.ok || !payload.success || !payload.data) throw new Error('感知中心请求失败');
  return payload.data;
}

export const usePerceptionStore = create<PerceptionState>((set, get) => ({
  ...EMPTY,
  loading: false,
  load: async () => {
    set({ loading: true, error: undefined });
    try {
      set({ ...(await request('/api/perception/management') as DashboardData), loading: false });
    } catch {
      set({ loading: false, error: '无法加载感知中心，请稍后重试' });
    }
  },
  setConnectorEnabled: async (id, enabled) => {
    await request('/api/perception/management', {
      method: 'PATCH', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ action: 'set-connector-enabled', id, enabled }),
    });
    await get().load();
  },
  replay: async (connectorId, id) => {
    await request('/api/perception/management', {
      method: 'PATCH', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ action: 'replay-dead-letter', connectorId, id }),
    });
    await get().load();
  },
  saveConnector: async (connector) => {
    await request('/api/perception/management', {
      method: 'PATCH', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ action: 'save-connector', connector }),
    });
    await get().load();
  },
  saveRule: async (rule) => {
    await request('/api/perception/management', {
      method: 'PATCH', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ action: 'save-rule', rule }),
    });
    await get().load();
  },
}));
