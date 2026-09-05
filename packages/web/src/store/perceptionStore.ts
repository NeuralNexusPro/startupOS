import { create } from 'zustand';

import type {
  ConnectorHealth,
  ExternalTriggerGrant,
  PerceptionAuditEntry,
  PerceptionConnectorConfig,
  PerceptionDeadLetter,
  PerceptionTriggerRule,
  PerceptionEventTrace,
} from '@originos/core/types';

export interface ConnectorSummary extends Omit<PerceptionConnectorConfig, 'secretRef'> { secretConfigured: boolean }
interface DashboardData {
  connectors: ConnectorSummary[];
  grants: ExternalTriggerGrant[];
  rules: PerceptionTriggerRule[];
  health: ConnectorHealth[];
  audit: PerceptionAuditEntry[];
  eventTraces: PerceptionEventTrace[];
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
  deleteRule(id: string): Promise<void>;
  saveGrant(grant: ExternalTriggerGrant): Promise<void>;
  deleteGrant(grant: ExternalTriggerGrant): Promise<void>;
}

const EMPTY: DashboardData = { connectors: [], grants: [], rules: [], health: [], audit: [], eventTraces: [], deadLetters: [] };

async function request(input: RequestInfo, init?: RequestInit): Promise<DashboardData | ConnectorSummary> {
  const response = await fetch(input, init);
  const payload = await response.json() as { success: boolean; data?: DashboardData | ConnectorSummary; error?: { code?: string } };
  if (!response.ok || !payload.success || !payload.data) throw new Error(payload.error?.code || 'PERCEPTION_REQUEST_FAILED');
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
    try {
      await request('/api/perception/management', {
        method: 'PATCH', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action: 'set-connector-enabled', id, enabled }),
      });
      await get().load();
    } catch { set({ error: enabled ? '启用失败：请先重新绑定并通过邮箱连接测试' : '停用连接器失败' }); }
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
  deleteRule: async (id) => {
    await request('/api/perception/management', {
      method: 'PATCH', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ action: 'delete-rule', id }),
    });
    await get().load();
  },
  saveGrant: async (grant) => {
    await request('/api/perception/management', {
      method: 'PATCH', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ action: 'save-grant', grant }),
    });
    await get().load();
  },
  deleteGrant: async (grant) => {
    await request('/api/perception/management', {
      method: 'PATCH', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ action: 'delete-grant', kind: grant.target.kind, id: grant.target.id }),
    });
    await get().load();
  },
}));
