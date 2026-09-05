import { ChannelDeliveryStore } from './delivery-store';
import type { AgentOutputEvent, ChannelDeliveryPort, DeliveryReceipt, FlowPacket } from './types';
import { isExternallyVisibleOutput } from './validation';

export interface ChannelOutputDispatcherOptions {
  maxAttempts?: number;
  sleep?: (attempt: number) => Promise<void>;
}

export interface ChannelOutputDispatchInput {
  connectorId: string;
  replyHandle: string;
  packets: AsyncIterable<FlowPacket<AgentOutputEvent>>;
}

export class ChannelOutputDispatcher {
  private readonly maxAttempts: number;
  private readonly sleep: (attempt: number) => Promise<void>;

  constructor(
    private readonly delivery: ChannelDeliveryPort,
    private readonly receipts: ChannelDeliveryStore,
    options: ChannelOutputDispatcherOptions = {},
  ) {
    this.maxAttempts = options.maxAttempts ?? 3;
    if (!Number.isInteger(this.maxAttempts) || this.maxAttempts < 1) throw new RangeError('CHANNEL_DELIVERY_ATTEMPTS_INVALID');
    this.sleep = options.sleep ?? (async (attempt) => {
      await new Promise<void>((resolve) => setTimeout(resolve, Math.min(250 * 2 ** (attempt - 1), 2_000)));
    });
  }

  async dispatch(input: ChannelOutputDispatchInput): Promise<DeliveryReceipt[]> {
    const results: DeliveryReceipt[] = [];
    for await (const packet of input.packets) {
      if (!isExternallyVisibleOutput(packet.payload)) continue;
      const existing = this.receipts.get(packet.packetId);
      if (existing?.status === 'delivered') {
        results.push(existing);
        continue;
      }
      results.push(await this.deliverPacket(input, packet));
    }
    return results;
  }

  private async deliverPacket(
    input: ChannelOutputDispatchInput,
    packet: FlowPacket<AgentOutputEvent>,
  ): Promise<DeliveryReceipt> {
    for (let attempt = 1; attempt <= this.maxAttempts; attempt += 1) {
      try {
        const delivered = await this.delivery.deliver(input.replyHandle, packet.payload);
        const receipt: DeliveryReceipt = {
          ...delivered,
          messageId: packet.packetId,
          connectorId: input.connectorId,
          attempt,
        };
        if (receipt.status === 'delivered') return this.receipts.save(receipt);
        this.receipts.save({ ...receipt, status: attempt === this.maxAttempts ? 'failed' : 'retrying' });
      } catch {
        this.receipts.save({
          messageId: packet.packetId,
          connectorId: input.connectorId,
          status: attempt === this.maxAttempts ? 'failed' : 'retrying',
          attempt,
          safeCode: attempt === this.maxAttempts ? 'CHANNEL_DELIVERY_EXHAUSTED' : 'CHANNEL_DELIVERY_RETRY',
        });
      }
      if (attempt < this.maxAttempts) await this.sleep(attempt);
    }
    return this.receipts.save({
      messageId: packet.packetId,
      connectorId: input.connectorId,
      status: 'failed',
      attempt: this.maxAttempts,
      safeCode: 'CHANNEL_DELIVERY_EXHAUSTED',
    });
  }
}
