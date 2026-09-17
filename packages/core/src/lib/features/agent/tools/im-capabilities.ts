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
  description: '按关键词发现触发当前会话的 IM 连接能力；传入精确 name 时返回该能力的参数 schema。不要猜测方法或参数。',
  parameters: discoverParameters,
  async execute(_toolCallId, params: Static<typeof discoverParameters>) {
    try { return result(await requireChannelOfficeCapabilities().discover(params.query, params.name)); }
    catch (error) { return failure(error); }
  },
}, {
  name: 'invoke_im_capability', label: '调用当前 IM 连接能力', category: 'system', enabled: true,
  description: '调用已发现且当前授权可用的 IM 能力。只能使用发现结果中的 name、catalogRevision 和 schema 参数。连接、账号和调用ID由宿主绑定。',
  parameters: invokeParameters,
  async execute(toolCallId, params: Static<typeof invokeParameters>) {
    try { return result(await requireChannelOfficeCapabilities().invoke({ ...params, arguments: params.arguments as Record<string, ChannelOfficeJsonValue>, callId: toolCallId })); }
    catch (error) { return failure(error); }
  },
}];
