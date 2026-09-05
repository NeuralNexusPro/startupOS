import type { PerceptionPluginManifest } from '@originos/core/modules/perception-runtime/plugins';

export const weComManifest: PerceptionPluginManifest = {
  id: 'originos.wecom',
  name: '企业微信',
  version: '0.1.0',
  hostApi: '1.0',
  entry: '@originos/perception-plugin-wecom',
  source: 'wecom',
  transport: 'stream',
  capabilities: ['inbound-events', 'outbound-reply'],
  permissions: ['credentials', 'events', 'network', 'health'],
  configurationSchema: {
    version: '1.0',
    fields: [
      {
        key: 'botId',
        label: 'Bot ID',
        type: 'text',
        required: true,
        help: '企业微信智能机器人的 Bot ID',
      },
      {
        key: 'secret',
        label: 'Secret',
        type: 'password',
        required: true,
        sensitive: true,
        help: '仅写入系统安全存储，不会回显',
      },
    ],
  },
};
