import AiBot from '@wecom/aibot-node-sdk';
import type {
  PerceptionPlugin,
  PerceptionPluginProvisionContext,
  PerceptionPluginProvisionResult,
  PerceptionPluginRuntimeContext,
  PluginReplyEvent,
  PluginReplyReceipt,
} from '@originos/core/modules/perception-runtime/plugins';
import { weComManifest } from './manifest';
import { normalizeWeComFrame } from './normalizer';
import type {
  WeComBotClient,
  WeComBotClientFactory,
  WeComFrame,
  WeComSettings,
} from './types';

function defaultClientFactory(options: {
  botId: string;
  secret: string;
  wsUrl?: string;
}): WeComBotClient {
  return new AiBot.WSClient(options) as WeComBotClient;
}

function parseSettings(
  settings: Readonly<Record<string, unknown>>
): WeComSettings {
  const botId = typeof settings.botId === 'string' ? settings.botId.trim() : '';
  if (!botId) throw new Error('WECOM_BOT_ID_REQUIRED');
  const websocketUrl =
    typeof settings.websocketUrl === 'string' && settings.websocketUrl.trim()
      ? settings.websocketUrl.trim()
      : undefined;
  return { botId, websocketUrl };
}

export class WeComPerceptionPlugin implements PerceptionPlugin {
  readonly manifest = weComManifest;
  private readonly clients = new Map<string, WeComBotClient>();
  private readonly reconnectCounts = new Map<string, number>();

  async provision(
    context: PerceptionPluginProvisionContext
  ): Promise<PerceptionPluginProvisionResult> {
    if (!context.ports.credentials)
      throw new Error('WECOM_CREDENTIAL_PORT_MISSING');
    const settings = parseSettings(context.settings);
    const secret = context.secrets.secret;
    if (!secret) throw new Error('WECOM_SECRET_MISSING');
    const secretRef = await context.ports.credentials.bind(
      context.connectorId,
      'wecom',
      secret
    );
    return {
      settings: { transport: 'aibot-websocket', ...settings },
      secretRefs: { credentials: secretRef },
    };
  }

  constructor(
    private readonly createClient: WeComBotClientFactory = defaultClientFactory
  ) {}

  async start(context: PerceptionPluginRuntimeContext): Promise<void> {
    if (this.clients.has(context.connectorId)) return;

    try {
      const settings = parseSettings(context.settings);
      const secretRef =
        typeof context.settings.secretRef === 'string'
          ? context.settings.secretRef
          : '';
      if (!secretRef || !context.ports.credentials)
        throw new Error('WECOM_SECRET_MISSING');
      const secret = await context.ports.credentials.resolve(
        context.connectorId,
        secretRef
      );

      const client = this.createClient({
        botId: settings.botId,
        secret,
        ...(settings.websocketUrl ? { wsUrl: settings.websocketUrl } : {}),
      });
      this.bind(context, client);
      this.clients.set(context.connectorId, client);
      client.connect();
    } catch (error) {
      await context.ports.health?.report({
        status: 'degraded',
        safeCode: configurationSafeCode(error),
      });
      throw error;
    }
  }

  async stop(context: PerceptionPluginRuntimeContext): Promise<void> {
    const client = this.clients.get(context.connectorId);
    this.clients.delete(context.connectorId);
    this.reconnectCounts.delete(context.connectorId);
    client?.disconnect();
  }

  private bind(
    context: PerceptionPluginRuntimeContext,
    client: WeComBotClient
  ): void {
    client.on('authenticated', () => {
      void context.ports.health?.report({
        status: 'healthy',
        detail: {
          connectionState: 'connected',
          reconnectCount: this.reconnectCounts.get(context.connectorId) ?? 0,
          lastSuccessAt: new Date().toISOString(),
        },
      });
    });
    client.on('reconnecting', () => {
      const reconnectCount =
        (this.reconnectCounts.get(context.connectorId) ?? 0) + 1;
      this.reconnectCounts.set(context.connectorId, reconnectCount);
      void context.ports.health?.report({
        status: 'degraded',
        detail: { connectionState: 'reconnecting', reconnectCount },
      });
    });
    client.on('disconnected', () => {
      void context.ports.health?.report({
        status: 'degraded',
        safeCode: 'WECOM_DISCONNECTED',
        detail: {
          connectionState: 'disconnected',
          reconnectCount: this.reconnectCounts.get(context.connectorId) ?? 0,
        },
      });
    });
    client.on('error', (error) => {
      void context.ports.health?.report({
        status: 'degraded',
        safeCode: connectionSafeCode(error),
        detail: {
          connectionState: 'disconnected',
          reconnectCount: this.reconnectCounts.get(context.connectorId) ?? 0,
        },
      });
    });
    for (const eventName of ['message.text', 'message.voice']) {
      client.on(eventName, (frame) => {
        if (isWeComFrame(frame)) void this.submit(context, client, frame);
      });
    }
  }

  private async submit(
    context: PerceptionPluginRuntimeContext,
    client: WeComBotClient,
    frame: WeComFrame
  ): Promise<void> {
    let unregisterReply: (() => void) | undefined;
    try {
      if (!context.ports.events) throw new Error('WECOM_EVENT_PORT_MISSING');
      const event = normalizeWeComFrame({
        connectorId: context.connectorId,
        frame,
      });
      const replyHandle = event.provenance.rawPayloadRef;
      if (context.ports.replies) {
        const streamId = `perception-${event.id}`;
        const replyState = { content: '' };
        unregisterReply = context.ports.replies.register(
          replyHandle,
          (output) =>
            this.deliverOutput(
              context.connectorId,
              client,
              frame,
              streamId,
              replyState,
              output
            )
        );
      }
      const results = await context.ports.events.submit(event);
      if (context.ports.replies) return;
      const dispatched = results.find(
        (result) =>
          result.status === 'dispatched' &&
          (result.responseTexts?.length || result.responseText)
      );
      const responses = dispatched?.responseTexts?.length
        ? dispatched.responseTexts
        : dispatched?.responseText
          ? [dispatched.responseText]
          : [];
      const streamId = `perception-${event.id}`;
      for (let index = 0; index < responses.length; index += 1) {
        await client.replyStream(
          frame,
          streamId,
          limitReply(responses[index] ?? ''),
          index === responses.length - 1
        );
      }
    } catch {
      await context.ports.health?.report({
        status: 'degraded',
        safeCode: 'WECOM_EVENT_SUBMIT_FAILED',
      });
    } finally {
      unregisterReply?.();
    }
  }

  private async deliverOutput(
    connectorId: string,
    client: WeComBotClient,
    frame: WeComFrame,
    streamId: string,
    state: { content: string },
    output: PluginReplyEvent
  ): Promise<PluginReplyReceipt> {
    if (output.type === 'text_delta') {
      state.content = limitReply(`${state.content}${output.delta}`);
      await client.replyStream(frame, streamId, state.content, false);
    } else if (output.type === 'assistant_message') {
      state.content = limitReply(output.content);
      await client.replyStream(frame, streamId, state.content, false);
    } else if (output.type === 'hitl_request') {
      state.content = limitReply(`需要人工确认：${output.summary}`);
      await client.replyStream(frame, streamId, state.content, false);
    } else if (output.type === 'completed') {
      await client.replyStream(frame, streamId, state.content, true);
    } else if (output.type === 'failed' || output.type === 'cancelled') {
      state.content = output.type === 'failed' ? output.safeCode : '任务已取消';
      await client.replyStream(frame, streamId, state.content, true);
    }
    return {
      messageId: 'pending',
      connectorId,
      status: 'delivered',
      attempt: 1,
      deliveredAt: new Date().toISOString(),
    };
  }
}

function limitReply(value: string): string {
  return value.length <= 6_000 ? value : `${value.slice(0, 5_997)}...`;
}

function isWeComFrame(value: unknown): value is WeComFrame {
  return typeof value === 'object' && value !== null;
}

function connectionSafeCode(error: unknown): string {
  const message = error instanceof Error ? error.message.toLowerCase() : '';
  if (
    message.includes('authentication failed') ||
    message.includes('auth failure')
  )
    return 'WECOM_AUTH_FAILED';
  if (message.includes('enotfound') || message.includes('getaddrinfo'))
    return 'WECOM_DNS_FAILED';
  if (message.includes('etimedout') || message.includes('timeout'))
    return 'WECOM_NETWORK_TIMEOUT';
  if (
    message.includes('certificate') ||
    message.includes('tls') ||
    message.includes('ssl')
  )
    return 'WECOM_TLS_FAILED';
  if (message.includes('econn') || message.includes('network'))
    return 'WECOM_NETWORK_UNAVAILABLE';
  return 'WECOM_CONNECTION_FAILED';
}

function configurationSafeCode(error: unknown): string {
  return error instanceof Error && error.message === 'WECOM_BOT_ID_REQUIRED'
    ? error.message
    : 'WECOM_CONFIGURATION_FAILED';
}

export const weComPlugin = new WeComPerceptionPlugin();
