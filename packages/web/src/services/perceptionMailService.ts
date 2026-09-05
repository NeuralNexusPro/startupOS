import { getIpcRenderer, isElectron } from '@originos/core/lib/integrations/electron/env';
import { IPC_CHANNELS, type IpcResponse } from '@originos/core/lib/integrations/electron/ipc-protocol';
import type { MailConnectionTestResult, MailConnectorSettings, MailSecretInput } from '@originos/core/types';

export interface MailProvisioningResult { connectorId: string; secretConfigured: boolean; test: MailConnectionTestResult }
export function canProvisionMail(): boolean { return isElectron(); }
export async function provisionAndTestMail(input: { connectorId: string; profile: MailConnectorSettings; secret: MailSecretInput }): Promise<MailProvisioningResult> {
  if (!isElectron()) throw new Error('DESKTOP_REQUIRED');
  const response = await getIpcRenderer().invoke<IpcResponse<MailProvisioningResult>>(IPC_CHANNELS.PERCEPTION_MAIL_PROVISION_TEST, input);
  if (!response.success || !response.data) throw new Error(response.error?.code ?? 'MAIL_PROVISION_FAILED');
  return response.data;
}
