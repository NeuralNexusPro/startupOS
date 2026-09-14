import { sanitizePluginLog, type PluginLogSink } from '../../../../core/src/modules/perception-runtime/plugins';
import { BufferedDailyLogWriter, type PluginLogChannel } from './daily-log-writer';

export function createPluginLogSink(writer: BufferedDailyLogWriter, sources: Readonly<Record<string, string>>): PluginLogSink {
  return { write(pluginId, connectorId, record) {
    const source = sources[pluginId];
    if (!source || !['email', 'wecom', 'feishu', 'dingtalk'].includes(source)) return;
    if (!/^[A-Za-z0-9_.:-]{1,160}$/.test(connectorId)) return;
    try {
      writer.append(`plugin:${source}` as PluginLogChannel, JSON.stringify({ timestamp: new Date().toISOString(),
        pluginId, connectorId, ...sanitizePluginLog(record) }) + '\n');
    } catch { /* Logging is never part of message delivery success. */ }
  } };
}
