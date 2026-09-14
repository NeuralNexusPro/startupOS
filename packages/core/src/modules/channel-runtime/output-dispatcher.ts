import { Readable } from 'node:stream';
import { ChannelDeliveryStore } from './delivery-store';
import type { AgentOutputEvent, ChannelDeliveryPort, DeliveryReceipt, FlowPacket } from './types';
import { isExternallyVisibleOutput } from './validation';

export interface ChannelOutputDispatcherOptions {
  maxAttempts?: number;
  sleep?: (attempt: number) => Promise<void>;
}

interface ChannelOutputDispatchBase {
  connectorId: string;
  packets: AsyncIterable<FlowPacket<AgentOutputEvent>>;
}
export type ChannelOutputDispatchInput = ChannelOutputDispatchBase & (
  | { replyHandle: string; conversationId?: never }
  | { conversationId: string; replyHandle?: never }
);

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
    let sourceFailure: { error: unknown } | undefined;
    const buffered = Readable.from((async function* () {
      try { yield* input.packets; }
      catch (error) { sourceFailure = { error }; }
    })(), { objectMode: true, highWaterMark: 32 });
    const packets: AsyncIterable<FlowPacket<AgentOutputEvent>> = buffered;
    for await (const packet of packets) {
      if (!isExternallyVisibleOutput(packet.payload)) continue;
      const existing = this.receipts.get(packet.packetId);
      if (existing?.status === 'delivered') {
        results.push(existing);
        continue;
      }
      const group = [packet];
      let payload = packet.payload;
      if (payload.type === 'text_delta') {
        let delta = payload.delta;
        // Drain only what is ready now: no timer or wait for another token.
        const available = Math.min(31, buffered.readableLength);
        for (let index = 0; index < available; index += 1) {
          const next: FlowPacket<AgentOutputEvent> | null = buffered.read();
          if (!next) break;
          if (next.payload.type !== 'text_delta' || next.flowId !== packet.flowId ||
            next.port !== packet.port || next.kind !== packet.kind ||
            group.some(member => member.packetId === next.packetId) ||
            this.receipts.get(next.packetId)?.status === 'delivered') {
            buffered.unshift(next);
            break;
          }
          group.push(next);
          delta += next.payload.delta;
        }
        payload = { type: 'text_delta', delta };
      }
      results.push(...await this.deliverGroup(input, group, payload));
    }
    if (sourceFailure) throw sourceFailure.error;
    return results;
  }

  private async deliverGroup(
    input: ChannelOutputDispatchInput,
    packets: FlowPacket<AgentOutputEvent>[],
    payload: AgentOutputEvent,
  ): Promise<DeliveryReceipt[]> {
    for (let attempt = 1; attempt <= this.maxAttempts; attempt += 1) {
      let receipt: DeliveryReceipt;
      try {
        receipt = 'replyHandle' in input && input.replyHandle
          ? await this.delivery.deliver(input.replyHandle, payload)
          : this.delivery.push && input.conversationId
            ? await this.delivery.push(input.conversationId, payload)
            : { messageId: packets[0]!.packetId, connectorId: input.connectorId, status: 'expired', attempt };
      } catch {
        receipt = {
          messageId: packets[0]!.packetId,
          connectorId: input.connectorId,
          status: 'retrying',
          attempt,
          safeCode: 'CHANNEL_DELIVERY_RETRY',
        };
      }
      // Storage failures must propagate, never resend an acknowledged group.
      const saved = packets.map(packet => this.receipts.save({
        ...receipt,
        messageId: packet.packetId,
        connectorId: input.connectorId,
        attempt,
        status: receipt.status === 'delivered' ? 'delivered' : attempt === this.maxAttempts ? 'failed' : 'retrying',
        ...(receipt.status !== 'delivered' && attempt === this.maxAttempts ? { safeCode: 'CHANNEL_DELIVERY_EXHAUSTED' } : {}),
      }));
      if (receipt.status === 'delivered' || attempt === this.maxAttempts) return saved;
      await this.sleep(attempt);
    }
    return [];
  }
}
