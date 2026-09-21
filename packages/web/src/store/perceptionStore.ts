import { create } from 'zustand';

import type {
  ConnectorHealth,
  ExternalTriggerGrant,
  JevDecisionReceipt,
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
  decisions: JevDecisionReceipt[];
}
interface PerceptionState extends DashboardData {
  loading: boolean;
  error?: string;
  load(options?: { silent?: boolean }): Promise<void>;
  startRefreshing(): () => void;
  setConnectorEnabled(id: string, enabled: boolean): Promise<void>;
  replay(connectorId: string, id: string): Promise<void>;
  saveConnector(config: PerceptionConnectorConfig): Promise<void>;
  saveRule(rule: PerceptionTriggerRule): Promise<void>;
  deleteRule(id: string): Promise<void>;
  saveGrant(grant: ExternalTriggerGrant): Promise<void>;
  deleteGrant(grant: ExternalTriggerGrant): Promise<void>;
  resolveDecision(id: string, candidateKey: string): Promise<void>;
  retryDecision(id: string): Promise<void>;
}

const EMPTY: DashboardData = { connectors: [], grants: [], rules: [], health: [], audit: [], eventTraces: [], deadLetters: [], decisions: [] };

async function request<T>(input: RequestInfo, init?: RequestInit): Promise<T> {
  const response = await fetch(input, init);
  const payload = await response.json() as { success: boolean; data?: T; error?: { code?: string } };
  if (!response.ok || !payload.success || !payload.data) throw new Error(payload.error?.code || 'PERCEPTION_REQUEST_FAILED');
  return payload.data;
}

function updateDecision(decisions: JevDecisionReceipt[], receipt: JevDecisionReceipt): JevDecisionReceipt[] {
  const index = decisions.findIndex((item) => item.id === receipt.id);
  return index < 0 ? [receipt, ...decisions] : decisions.map((item, itemIndex) => itemIndex === index ? receipt : item);
}

let pendingLoad: Promise<void> | undefined;
let refreshUsers = 0;
let refreshTimer: ReturnType<typeof setInterval> | undefined;

export const usePerceptionStore = create<PerceptionState>((set, get) => ({
  ...EMPTY,
  loading: false,
  load: ({ silent = false } = {}) => {
    if (silent && pendingLoad) return pendingLoad;
    const load = (pendingLoad ?? Promise.resolve()).then(async () => {
      if (!silent) set({ loading: true, error: undefined });
      try {
        const snapshot = await request<Omit<DashboardData, 'decisions'> & { decisions?: JevDecisionReceipt[] }>('/api/perception/management');
        set((state) => ({ ...snapshot, decisions: snapshot.decisions ?? state.decisions }));
      } catch {
        if (!silent) set({ error: '无法加载感知中心，请稍后重试' });
      } finally {
        if (!silent) set({ loading: false });
      }
    });
    pendingLoad = load;
    void load.finally(() => { if (pendingLoad === load) pendingLoad = undefined; });
    return load;
  },
  startRefreshing: () => {
    if (refreshUsers++ === 0) {
      void get().load();
      refreshTimer = setInterval(() => { void get().load({ silent: true }); }, 5000);
    }
    let stopped = false;
    return () => {
      if (stopped) return;
      stopped = true;
      if (--refreshUsers === 0) {
        clearInterval(refreshTimer);
        refreshTimer = undefined;
      }
    };
  },
  setConnectorEnabled: async (id, enabled) => {
    try {
      await request<ConnectorSummary>('/api/perception/management', {
        method: 'PATCH', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action: 'set-connector-enabled', id, enabled }),
      });
      await get().load();
    } catch { set({ error: enabled ? '启用失败：请先重新绑定并通过邮箱连接测试' : '停用连接器失败' }); }
  },
  replay: async (connectorId, id) => {
    await request<unknown>('/api/perception/management', {
      method: 'PATCH', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ action: 'replay-dead-letter', connectorId, id }),
    });
    await get().load();
  },
  saveConnector: async (connector) => {
    await request<ConnectorSummary>('/api/perception/management', {
      method: 'PATCH', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ action: 'save-connector', connector }),
    });
    await get().load();
  },
  saveRule: async (rule) => {
    await request<unknown>('/api/perception/management', {
      method: 'PATCH', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ action: 'save-rule', rule }),
    });
    await get().load();
  },
  deleteRule: async (id) => {
    await request<unknown>('/api/perception/management', {
      method: 'PATCH', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ action: 'delete-rule', id }),
    });
    await get().load();
  },
  saveGrant: async (grant) => {
    await request<unknown>('/api/perception/management', {
      method: 'PATCH', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ action: 'save-grant', grant }),
    });
    await get().load();
  },
  deleteGrant: async (grant) => {
    await request<unknown>('/api/perception/management', {
      method: 'PATCH', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ action: 'delete-grant', kind: grant.target.kind, id: grant.target.id }),
    });
    await get().load();
  },
  resolveDecision: async (id, candidateKey) => {
    const receipt = await request<JevDecisionReceipt>('/api/perception/management', {
      method: 'PATCH', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ action: 'resolve-decision', decisionId: id, candidateKey }),
    });
    set((state) => ({ decisions: updateDecision(state.decisions, receipt) }));
    await get().load({ silent: true });
  },
  retryDecision: async (id) => {
    const receipt = await request<JevDecisionReceipt>('/api/perception/management', {
      method: 'PATCH', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ action: 'retry-decision', decisionId: id }),
    });
    set((state) => ({ decisions: updateDecision(state.decisions, receipt) }));
    await get().load({ silent: true });
  },
}));
