import { ipcMain, safeStorage } from 'electron';
import { getDataRoot } from '../../../../../core/src/lib/paths';
import { PerceptionManagementFacade } from '../../../../../core/src/lib/features/perception';
import { PerceptionDeadLetterStore, PerceptionRetryService, PerceptionRetryStore } from '../../../../../core/src/modules/perception-runtime';
import type { IpcResponse } from '../../../../../core/src/lib/integrations/electron/ipc-protocol';
import type { FeishuConnectorSettings, FeishuCredentialInput } from '../../../../../core/src/types/perception';
import { IPC_CHANNELS } from '../../ipc-protocol';
import { SafeStoragePerceptionCredentialAdapter } from './safe-storage-perception-credential-adapter';

interface Request { connectorId: string; profile: FeishuConnectorSettings; secret: FeishuCredentialInput }
export interface FeishuProvisioningResult { connectorId: string; secretConfigured: true }

export class FeishuProvisioningService {
  private readonly credentials;
  private readonly management;

  constructor(dataRoot = getDataRoot()) {
    this.credentials = new SafeStoragePerceptionCredentialAdapter(dataRoot, safeStorage);
    this.management = new PerceptionManagementFacade(dataRoot, new PerceptionRetryService(new PerceptionRetryStore(dataRoot), new PerceptionDeadLetterStore(dataRoot)));
    ipcMain.handle(IPC_CHANNELS.PERCEPTION_FEISHU_PROVISION, async (_event, request: Request): Promise<IpcResponse<FeishuProvisioningResult>> => {
      try { return { success: true, data: await this.provision(request), timestamp: new Date().toISOString() }; }
      catch (error) { return { success: false, error: { code: error instanceof Error ? error.message : 'FEISHU_PROVISION_FAILED', message: 'Feishu provisioning failed' }, timestamp: new Date().toISOString() }; }
    });
  }

  async provision(request: Request): Promise<FeishuProvisioningResult> {
    const connectorId = request.connectorId.trim();
    const appId = request.profile.appId.trim();
    const { appSecret } = request.secret;
    if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(connectorId)) throw new Error('INVALID_CONNECTOR_ID');
    if (!/^cli_[0-9a-fA-F]{16}$/.test(appId) || !appSecret) throw new Error('FEISHU_REQUIRED_CONFIGURATION_MISSING');
    const domain = request.profile.domain === 'lark' ? 'lark' : 'feishu';
    const secretRef = await this.credentials.bind(connectorId, 'feishu', JSON.stringify({ appSecret }));
    const now = new Date().toISOString();
    this.management.saveConnector({ id: connectorId, source: 'feishu', mode: 'stream', enabled: false, secretRef, settings: { appId, domain }, createdAt: now, updatedAt: now });
    return { connectorId, secretConfigured: true };
  }
}
