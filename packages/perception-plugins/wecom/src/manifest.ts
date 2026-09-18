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
        help: '使用独立的企微 CLI 用户授权，不使用机器人 Secret',
      },
      {
        key: 'officeAllowedActorIds',
        label: '办公能力授权发送者 ID',
        type: 'text',
        defaultValue: '',
        help: '仅这些企微发送者可使用已授权账号，多个 ID 用逗号分隔；留空时全部拒绝',
      },
      {
        key: 'officeWriteEnabled',
        label: '允许办公写操作',
        type: 'boolean',
        defaultValue: false,
        help: '仅对白名单发送者生效；删除等破坏性操作仍禁止',
      },
    ],
  },
};
