import fs from 'node:fs';
import path from 'node:path';
import type { DeliveryReceipt } from './types';
import { ChannelDataFileStore } from './file-store';

export class ChannelDeliveryStore {
  constructor(private readonly dataRoot: string) {}

  save(receipt: DeliveryReceipt): DeliveryReceipt {
    if (!receipt.messageId || !receipt.connectorId || receipt.attempt < 1) throw new Error('CHANNEL_DELIVERY_INVALID');
    this.store(receipt.messageId).write(receipt);
    return receipt;
  }

  get(messageId: string): DeliveryReceipt | null {
    const store = this.store(messageId);
    return store.exists() ? store.read() : null;
  }

  list(): DeliveryReceipt[] {
    const directory = path.join(this.dataRoot, 'channels', 'deliveries');
    if (!fs.existsSync(directory)) return [];
    return fs.readdirSync(directory)
      .filter((file) => file.endsWith('.json'))
      .map((file) => new ChannelDataFileStore<DeliveryReceipt>(path.join(directory, file)).read());
  }

  private store(messageId: string): ChannelDataFileStore<DeliveryReceipt> {
    const safeName = Buffer.from(messageId).toString('base64url');
    return new ChannelDataFileStore(path.join(this.dataRoot, 'channels', 'deliveries', `${safeName}.json`));
  }
}
