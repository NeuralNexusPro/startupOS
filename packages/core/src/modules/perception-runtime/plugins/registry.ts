import type { PerceptionPlugin, PerceptionPluginCatalogEntry } from './types';
import { validatePerceptionPluginManifest } from './validation';

export class PerceptionPluginRegistry {
  private readonly plugins = new Map<string, PerceptionPluginCatalogEntry>();

  register(entry: PerceptionPluginCatalogEntry): void {
    validatePerceptionPluginManifest(entry.plugin.manifest);
    const requested = new Set(entry.plugin.manifest.permissions);
    if (entry.approvedPermissions.some((permission) => !requested.has(permission))) throw new Error('Cannot approve undeclared plugin permission');
    if (this.plugins.has(entry.plugin.manifest.id)) throw new Error(`Plugin already registered: ${entry.plugin.manifest.id}`);
    this.plugins.set(entry.plugin.manifest.id, entry);
  }

  registerCatalog(entries: readonly PerceptionPluginCatalogEntry[]): ReadonlyArray<{ pluginId: string; safeCode: string }> {
    const rejected: Array<{ pluginId: string; safeCode: string }> = [];
    for (const entry of entries) {
      try {
        this.register(entry);
      } catch {
        rejected.push({ pluginId: entry.plugin.manifest.id, safeCode: 'PLUGIN_REGISTRATION_REJECTED' });
      }
    }
    return rejected;
  }

  get(pluginId: string): PerceptionPluginCatalogEntry | undefined { return this.plugins.get(pluginId); }
  list(): readonly PerceptionPlugin[] { return [...this.plugins.values()].map((entry) => entry.plugin); }
}
