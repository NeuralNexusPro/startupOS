import { ipcMain } from 'electron';
import { getDataRoot } from '../../../../../core/src/lib/paths';
import {
  JevProviderConfigError,
  JevProviderConfigService,
  type JevProviderUpdate,
} from '../../../../../core/src/lib/features/perception';
import type { JevProviderSummary } from '../../../../../core/src/types/perception';
import type { IpcResponse } from '../../../../../core/src/lib/integrations/electron/ipc-protocol';
import { IPC_CHANNELS } from '../../ipc-protocol';
import { SafeStorageJevCredentialAdapter } from './safe-storage-credential-adapter';

export class JevProviderService {
  private readonly provider: JevProviderConfigService;

  constructor(dataRoot = getDataRoot(), provider?: JevProviderConfigService) {
    this.provider = provider ?? new JevProviderConfigService(dataRoot, {
      credentials: new SafeStorageJevCredentialAdapter(dataRoot),
      environmentApiKey: process.env['TYPESAFE_API_KEY'],
      environment: process.env['NODE_ENV'] === 'development' ? 'development' : 'production',
      allowDevelopmentLoopback: process.env['ORIGINOS_ALLOW_JEV_LOOPBACK'] === '1',
    });
    ipcMain.handle(IPC_CHANNELS.JEV_PROVIDER_GET, async () => this.run(() => this.provider.getSummary()));
    ipcMain.handle(IPC_CHANNELS.JEV_PROVIDER_UPDATE, async (_event, input: JevProviderUpdate) => this.run(() => this.provider.update(input)));
    ipcMain.handle(IPC_CHANNELS.JEV_PROVIDER_CLEAR_CREDENTIAL, async () => this.run(() => this.provider.clearCredential()));
  }

  private async run(action: () => JevProviderSummary | Promise<JevProviderSummary>): Promise<IpcResponse<JevProviderSummary>> {
    try {
      return { success: true, data: await action(), timestamp: new Date().toISOString() };
    } catch (error) {
      const code = error instanceof JevProviderConfigError ? error.code : error instanceof Error && error.message === 'JEV_INVALID_BASE_URL' ? 'JEV_INVALID_BASE_URL' : 'INTERNAL_ERROR';
      return { success: false, error: { code, message: code }, timestamp: new Date().toISOString() };
    }
  }
}
