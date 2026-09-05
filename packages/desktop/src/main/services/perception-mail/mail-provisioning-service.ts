import { ipcMain, safeStorage } from 'electron';
import { randomUUID } from 'node:crypto';
import { getDataRoot } from '../../../../../core/src/lib/paths';
import { validateMailConnectorSettings } from '../../../../../core/src/lib/integrations/perception/email';
import { PerceptionManagementFacade } from '../../../../../core/src/lib/features/perception';
import { PerceptionDeadLetterStore, PerceptionRetryService, PerceptionRetryStore } from '../../../../../core/src/modules/perception-runtime';
import type { IpcResponse } from '../../../../../core/src/lib/integrations/electron/ipc-protocol';
import type { MailConnectionTestResult, MailConnectorSettings, MailSecretInput } from '../../../../../core/src/types/perception';
import { IPC_CHANNELS } from '../../ipc-protocol';
import { ImapFlowMailClient } from './imapflow-mail-client';
import { MailCredentialError, SafeStorageMailCredentialAdapter } from './safe-storage-credential-adapter';

interface ProvisionRequest { connectorId: string; profile: MailConnectorSettings; secret: MailSecretInput }
export interface MailProvisioningResult { connectorId: string; secretConfigured: boolean; test: MailConnectionTestResult }

export class MailProvisioningService {
  private readonly credentials;
  private readonly client;
  private readonly management;

  constructor(dataRoot = getDataRoot()) {
    this.credentials = new SafeStorageMailCredentialAdapter(dataRoot, safeStorage);
    this.client = new ImapFlowMailClient();
    this.management = new PerceptionManagementFacade(dataRoot, new PerceptionRetryService(new PerceptionRetryStore(dataRoot), new PerceptionDeadLetterStore(dataRoot)));
    this.registerHandlers();
  }

  async provisionAndTest(request: ProvisionRequest): Promise<MailProvisioningResult> {
    const profile = validateMailConnectorSettings(request.profile);
    const pendingRef = await this.credentials.bind(`${request.connectorId}.pending-${randomUUID()}`, request.secret);
    const test = await this.client.testConnection({ connectorId: request.connectorId, profile, secret: request.secret, timeoutMs: 10_000 });
    if (!test.success) { await this.credentials.remove(pendingRef); return { connectorId: request.connectorId, secretConfigured: false, test }; }
    const secretRef = await this.credentials.bind(request.connectorId, request.secret);
    await this.credentials.remove(pendingRef);
    const now = new Date().toISOString();
    const receipt = test.receipt;
    this.management.saveConnector({ id: request.connectorId, source: 'email', mode: 'email-poll', enabled: false, secretRef, settings: { ...profile, testReceipt: { connectorId: receipt.connectorId, profileFingerprint: receipt.profileFingerprint, verifiedAt: receipt.verifiedAt, capabilities: receipt.capabilities, mailbox: receipt.mailbox } }, createdAt: now, updatedAt: now });
    return { connectorId: request.connectorId, secretConfigured: true, test };
  }

  private registerHandlers(): void {
    ipcMain.handle(IPC_CHANNELS.PERCEPTION_MAIL_PROVISION_TEST, async (_event, request: ProvisionRequest): Promise<IpcResponse<MailProvisioningResult>> => {
      try { return { success: true, data: await this.provisionAndTest(request), timestamp: new Date().toISOString() }; }
      catch (error) { return { success: false, error: { code: error instanceof MailCredentialError ? error.code : 'INVALID_PROFILE', message: 'Mail provisioning failed' }, timestamp: new Date().toISOString() }; }
    });
    ipcMain.handle(IPC_CHANNELS.PERCEPTION_MAIL_CREDENTIAL_REMOVE, async (_event, secretRef: string): Promise<IpcResponse<{ removed: true }>> => {
      try { await this.credentials.remove(secretRef); return { success: true, data: { removed: true }, timestamp: new Date().toISOString() }; }
      catch { return { success: false, error: { code: 'CREDENTIAL_REMOVE_FAILED', message: 'Credential removal failed' }, timestamp: new Date().toISOString() }; }
    });
  }
}
