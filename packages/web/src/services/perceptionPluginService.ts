import {
  IPC_CHANNELS,
  type IpcResponse,
} from '@originos/core/lib/integrations/electron/ipc-protocol';
import { getIpcRenderer, isElectron } from '@originos/core/lib/integrations/electron/env';
import type {
  JsonValue,
  PerceptionPluginManifest,
} from '@originos/core/modules/perception-runtime';

export interface PluginProvisionInput {
  pluginId: string;
  connectorId: string;
  settings: Record<string, JsonValue>;
  secrets: Record<string, string>;
}
export function canProvisionPlugin(): boolean {
  return isElectron();
}
export async function listPerceptionPlugins(): Promise<
  PerceptionPluginManifest[]
> {
  const response = await getIpcRenderer().invoke<
    IpcResponse<PerceptionPluginManifest[]>
  >(IPC_CHANNELS.PERCEPTION_PLUGIN_CATALOG);
  if (!response.success || !response.data)
    throw new Error(response.error?.code ?? 'PLUGIN_CATALOG_FAILED');
  return response.data;
}
export async function provisionPerceptionPlugin(
  input: PluginProvisionInput
): Promise<void> {
  const response = await getIpcRenderer().invoke<
    IpcResponse<{ connectorId: string }>
  >(IPC_CHANNELS.PERCEPTION_PLUGIN_PROVISION, input);
  if (!response.success)
    throw new Error(response.error?.code ?? 'PLUGIN_PROVISION_FAILED');
}
