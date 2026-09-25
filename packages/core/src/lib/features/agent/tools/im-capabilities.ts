import { Type, type Static } from '@sinclair/typebox';
import type { AgentToolResult } from '@originos/pi-agent-adapter';
import { requireChannelOfficeCapabilities, type ChannelOfficeJsonValue } from '../../../integrations/pi-agent/channel-office-capabilities';
import type { ToolRegistration } from '../../../integrations/pi-agent/types';

const discoverParameters = Type.Object({
  query: Type.Optional(Type.String({ maxLength: 256 })),
  name: Type.Optional(Type.String({ maxLength: 192 })),
}, { additionalProperties: false });
const invokeParameters = Type.Object({
  name: Type.String({ minLength: 1, maxLength: 192 }),
  catalogRevision: Type.String({ minLength: 1, maxLength: 192 }),
  arguments: Type.Record(Type.String(), Type.Unknown()),
}, { additionalProperties: false });

function result(value: unknown): AgentToolResult<unknown> {
  return { content: [{ type: 'text', text: JSON.stringify(value) }], details: value };
}

function failure(error: unknown): AgentToolResult<unknown> {
  const code = error instanceof Error && /^IM_CAPABILITY_[A-Z_]+$/.test(error.message)
    ? error.message : 'IM_CAPABILITY_FAILED';
  return result({ ok: false, code });
}

export const imCapabilityTools: ToolRegistration[] = [{
  name: 'discover_im_capabilities', label: '发现当前 IM 连接能力', category: 'system', enabled: true,
  description: '按关键词发现触发当前会话的 IM 连接能力；多个关键词和中英文同义词按相关度匹配。authorizationStatus 才表示当前连接授权状态，capabilities 为空只表示关键词未命中。传入精确 name 时返回该能力的参数 schema。必须使用本工具检查当前连接授权，不要通过 execute_command 运行平台 CLI。',
  parameters: discoverParameters,
  async execute(_toolCallId, params: Static<typeof discoverParameters>) {
    try { return result(await requireChannelOfficeCapabilities().discover(params.query, params.name)); }
    catch (error) { return failure(error); }
  },
}, {
  name: 'invoke_im_capability', label: '调用当前 IM 连接能力', category: 'system', enabled: true,
  description: '调用已发现且当前授权可用的 IM 能力。arguments 只能包含该能力 inputSchema 中的字段，不能自行添加 limit 等未列出的参数。连接、账号和调用ID由宿主绑定。',
  parameters: invokeParameters,
  async execute(toolCallId, params: Static<typeof invokeParameters>) {
    try { return result(await requireChannelOfficeCapabilities().invoke({ ...params, arguments: params.arguments as Record<string, ChannelOfficeJsonValue>, callId: toolCallId })); }
    catch (error) {
      if (error instanceof Error && error.message === 'IM_CAPABILITY_INVALID_INPUT') {
        try {
          const catalog = await requireChannelOfficeCapabilities().discover('', params.name);
          return result({ ok: false, code: error.message,
            hint: '参数与此能力的 inputSchema 不符。请删除未列出的字段、补齐必填字段，并使用下方最新 catalogRevision 重试。',
            catalog });
        } catch { /* Preserve the original validation failure if rediscovery is unavailable. */ }
      }
      return failure(error);
    }
  },
}];
