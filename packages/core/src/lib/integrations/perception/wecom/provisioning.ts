import type { JsonValue, WeComConnectorSettings } from '../../../../types/perception';
export function validateWeComConnectorSettings(value: unknown): WeComConnectorSettings {
  if (!isRecord(value)) throw new Error('Invalid WeCom profile');
  const { transport, botId, websocketUrl } = value;
  if (transport !== 'aibot-websocket') throw new Error('Invalid WeCom transport');
  if (typeof botId !== 'string' || botId.trim().length < 1 || botId.length > 128) throw new Error('Invalid WeCom bot ID');
  if (websocketUrl !== undefined && (typeof websocketUrl !== 'string' || !/^wss:\/\//.test(websocketUrl))) throw new Error('Invalid WeCom WebSocket URL');
  return { transport, botId: botId.trim(), ...(typeof websocketUrl === 'string' ? { websocketUrl } : {}) };
}

export function validateWeComActivation(settings: Record<string, JsonValue>, secretRef?: string): void {
  validateWeComConnectorSettings(settings);
  if (!/^secret:\/\/perception\/wecom\/[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(secretRef ?? '')) throw new Error('WeCom connector secret reference is invalid');
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}
