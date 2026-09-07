import { getIpcRenderer, isElectron } from '@originos/core/lib/integrations/electron/env';
import { IPC_CHANNELS, type IpcResponse } from '@originos/core/lib/integrations/electron/ipc-protocol';
import type { FeishuConnectorSettings, FeishuCredentialInput } from '@originos/core/types';

export interface FeishuProvisioningResult { connectorId: string; secretConfigured: true }
export function canProvisionFeishu(): boolean { return isElectron(); }
export async function provisionFeishu(input: { connectorId: string; profile: FeishuConnectorSettings; secret: FeishuCredentialInput }): Promise<FeishuProvisioningResult> {
  if (!isElectron()) throw new Error('DESKTOP_REQUIRED');
  const response = await getIpcRenderer().invoke<IpcResponse<FeishuProvisioningResult>>(IPC_CHANNELS.PERCEPTION_FEISHU_PROVISION, input);
  if (!response.success || !response.data) throw new Error(response.error?.code ?? 'FEISHU_PROVISION_FAILED');
  return response.data;
}
