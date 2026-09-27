import type { PerceptionPluginManifest } from '@originos/core/modules/perception-runtime/plugins';

export const weComManifest: PerceptionPluginManifest = {
  id: 'originos.wecom',
  name: '企业微信',
  version: '0.1.0',
  hostApi: '1.0',
  entry: '@originos/perception-plugin-wecom',
  source: 'wecom',
  transport: 'stream',
  capabilities: ['inbound-events', 'outbound-reply', 'outbound-files', 'attachments', 'office-capabilities'],
  permissions: ['credentials', 'events', 'network', 'health', 'replies', 'attachments', 'office-capabilities'],
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
      {
        key: 'officeCapabilitiesEnabled',
        label: '启用企微办公能力',
        type: 'boolean',
        defaultValue: false,
        help: '保存时将打开扫码授权；每个企微感知源独立保存授权，后续 Token 过期会静默刷新',
      },
      {
        key: 'officeWriteEnabled',
        label: '允许办公写操作',
        type: 'boolean',
        defaultValue: false,
        help: '启用后，当前连接收到的消息可创建或修改办公事项；删除等破坏性操作仍禁止',
      },
    ],
  },
};
