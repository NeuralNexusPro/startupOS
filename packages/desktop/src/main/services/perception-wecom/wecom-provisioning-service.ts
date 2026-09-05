import { ipcMain, safeStorage } from 'electron';
import { getDataRoot } from '../../../../../core/src/lib/paths';
import { validateWeComConnectorSettings } from '../../../../../core/src/lib/integrations/perception/wecom';
import { PerceptionManagementFacade } from '../../../../../core/src/lib/features/perception';
import { PerceptionDeadLetterStore, PerceptionRetryService, PerceptionRetryStore } from '../../../../../core/src/modules/perception-runtime';
import type { IpcResponse } from '../../../../../core/src/lib/integrations/electron/ipc-protocol';
import type { WeComBotSecretInput, WeComConnectorSettings } from '../../../../../core/src/types/perception';
import { IPC_CHANNELS } from '../../ipc-protocol';
import { SafeStorageWeComCredentialAdapter } from './safe-storage-wecom-credential-adapter';

interface Request { connectorId: string; profile: WeComConnectorSettings; secret: WeComBotSecretInput }
export interface WeComProvisioningResult { connectorId: string; secretConfigured: true }
export class WeComProvisioningService {
  private readonly credentials;
  private readonly management;
  constructor(dataRoot = getDataRoot()) {
    this.credentials = new SafeStorageWeComCredentialAdapter(dataRoot, safeStorage);
    this.management = new PerceptionManagementFacade(dataRoot, new PerceptionRetryService(new PerceptionRetryStore(dataRoot), new PerceptionDeadLetterStore(dataRoot)));
    ipcMain.handle(IPC_CHANNELS.PERCEPTION_WECOM_PROVISION, async (_event, request: Request): Promise<IpcResponse<WeComProvisioningResult>> => {
      try { return { success: true, data: await this.provision(request), timestamp: new Date().toISOString() }; }
      catch (error) { return { success: false, error: { code: error instanceof Error ? error.message : 'WECOM_PROVISION_FAILED', message: 'WeCom provisioning failed' }, timestamp: new Date().toISOString() }; }
    });
  }
  async provision(request: Request): Promise<WeComProvisioningResult> {
    const profile = validateWeComConnectorSettings(request.profile);
    const secretRef = await this.credentials.bind(request.connectorId, request.secret);
    const now = new Date().toISOString();
    this.management.saveConnector({ id: request.connectorId, source: 'wecom', mode: 'stream', enabled: false, secretRef, settings: { ...profile }, createdAt: now, updatedAt: now });
    return { connectorId: request.connectorId, secretConfigured: true };
  }
}
