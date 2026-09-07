import {
  ChannelDeliveryStore,
  ChannelOutputDispatcher,
  type AgentOutputEvent,
  type ChannelDeliveryPort,
  type DeliveryReceipt,
  type FlowPacket,
} from '../../../../../core/src/modules/channel-runtime';
import type { PluginReplyEvent, PluginReplyPort, PluginReplyReceipt } from '../../../../../core/src/modules/perception-runtime/plugins';

type ReplyDelivery = (event: PluginReplyEvent) => Promise<PluginReplyReceipt>;

export class PluginReplyDeliveryService implements ChannelDeliveryPort, PluginReplyPort {
  private readonly deliveries = new Map<string, ReplyDelivery>();
  private readonly dispatcher: ChannelOutputDispatcher;

  constructor(dataRoot: string) {
    this.dispatcher = new ChannelOutputDispatcher(this, new ChannelDeliveryStore(dataRoot));
  }

  register(replyHandle: string, delivery: ReplyDelivery): () => void {
    this.deliveries.set(replyHandle, delivery);
    return () => { if (this.deliveries.get(replyHandle) === delivery) this.deliveries.delete(replyHandle); };
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
    return delivery(event);
  }
}
