import { createHash } from 'node:crypto';
import {
  ChannelDeliveryStore,
  ChannelOutputDispatcher,
  type AgentOutputEvent,
  type ChannelDeliveryPort,
  type DeliveryReceipt,
  type FlowPacket,
} from '../../../../../core/src/modules/channel-runtime';
import type { ChannelReplyFile, PluginReplyEvent, PluginReplyPort, PluginReplyReceipt } from '../../../../../core/src/modules/perception-runtime/plugins';

type ReplyDelivery = (event: PluginReplyEvent) => Promise<PluginReplyReceipt>;

export class PluginReplyDeliveryService implements ChannelDeliveryPort, PluginReplyPort {
  private readonly deliveries = new Map<string, { deliver: ReplyDelivery; supportsFiles: boolean; controller: AbortController }>();
  private readonly fileRequests = new Map<string, Promise<void>>();
  private readonly receipts: ChannelDeliveryStore;
  private readonly dispatcher: ChannelOutputDispatcher;

  constructor(dataRoot: string) {
    this.receipts = new ChannelDeliveryStore(dataRoot);
    this.dispatcher = new ChannelOutputDispatcher(this, this.receipts);
  }

  register(replyHandle: string, deliver: ReplyDelivery, options?: { supportsFiles?: boolean }): () => void {
    this.deliveries.get(replyHandle)?.controller.abort();
    const registration = { deliver, supportsFiles: options?.supportsFiles === true, controller: new AbortController() };
    this.deliveries.set(replyHandle, registration);
    return () => {
      registration.controller.abort();
      if (this.deliveries.get(replyHandle) === registration) this.deliveries.delete(replyHandle);
    };
  }

  canSendFile(replyHandle: string): boolean { return this.deliveries.get(replyHandle)?.supportsFiles === true; }

  captureFileSender(replyHandle: string): ((file: ChannelReplyFile, toolCallId: string, signal?: AbortSignal) => Promise<void>) | undefined {
    const registration = this.deliveries.get(replyHandle);
    if (!registration?.supportsFiles) return undefined;
    return async (file, toolCallId, signal) => {
      if (this.deliveries.get(replyHandle) !== registration) throw new Error('IM_FILE_REPLY_UNAVAILABLE');
      await this.sendFile(replyHandle, file, toolCallId, signal);
    };
  }

  async sendFile(replyHandle: string, file: ChannelReplyFile, toolCallId: string, signal?: AbortSignal): Promise<void> {
    const registration = this.deliveries.get(replyHandle);
    if (!registration?.supportsFiles) throw new Error('IM_FILE_REPLY_UNAVAILABLE');
    const combined = signal ? AbortSignal.any([signal, registration.controller.signal]) : registration.controller.signal;
    combined.throwIfAborted();
    const messageId = `file-${createHash('sha256').update(JSON.stringify([replyHandle, toolCallId])).digest('hex')}`;
    if (this.receipts.get(messageId)?.status === 'delivered') return;
    const pending = this.fileRequests.get(messageId);
    if (pending) return pending;
    const request = (async () => {
      try {
        const receipt = await registration.deliver({ type: 'file', file, signal: combined });
        if (receipt.status !== 'delivered') throw new Error('IM_FILE_SEND_UNCONFIRMED');
        // Persist only known receipt fields: never plugin payloads or bytes.
        this.receipts.save({ messageId, connectorId: receipt.connectorId, status: 'delivered', attempt: 1, deliveredAt: new Date().toISOString() });
      } catch (error: unknown) {
        if (error instanceof Error && ['IM_FILE_FORMAT_UNSUPPORTED', 'IM_FILE_TOO_LARGE', 'IM_FILE_REPLY_UNAVAILABLE'].includes(error.message)) throw error;
        throw new Error('IM_FILE_SEND_UNCONFIRMED');
      }
    })();
    this.fileRequests.set(messageId, request);
    try { await request; } finally { if (this.fileRequests.get(messageId) === request) this.fileRequests.delete(messageId); }
  }

  canDeliver(replyHandle: string): boolean { return this.deliveries.has(replyHandle); }

  async dispatch(input: { connectorId: string; replyHandle: string; packets: AsyncIterable<FlowPacket<AgentOutputEvent>> }): Promise<DeliveryReceipt[]> {
    return this.dispatcher.dispatch(input);
  }

  async deliver(replyHandle: string, event: AgentOutputEvent): Promise<DeliveryReceipt> {
    const delivery = this.deliveries.get(replyHandle);
    if (!delivery) throw new Error('CHANNEL_REPLY_HANDLE_EXPIRED');
    if (event.type === 'artifact_changed') {
      return { messageId: 'internal', connectorId: 'internal', status: 'delivered', attempt: 1 };
    }
    return delivery.deliver(event);
  }
}
