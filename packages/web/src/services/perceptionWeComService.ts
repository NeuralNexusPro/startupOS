import { getIpcRenderer, isElectron } from '@originos/core/lib/integrations/electron/env';
import { IPC_CHANNELS, type IpcResponse } from '@originos/core/lib/integrations/electron/ipc-protocol';
import type { WeComConnectorSettings } from '@originos/core/types';

export interface WeComProvisioningResult { connectorId: string; secretConfigured: true }
export function canProvisionWeCom(): boolean { return isElectron(); }
export async function provisionWeCom(input: { connectorId: string; profile: WeComConnectorSettings; secret: { value: string } }): Promise<WeComProvisioningResult> {
  if (!isElectron()) throw new Error('DESKTOP_REQUIRED');
  const response = await getIpcRenderer().invoke<IpcResponse<WeComProvisioningResult>>(IPC_CHANNELS.PERCEPTION_WECOM_PROVISION, input);
  if (!response.success || !response.data) throw new Error(response.error?.code ?? 'WECOM_PROVISION_FAILED');
  return response.data;
}
