import type { FlowPacket } from './types';

export interface FlowFanOutOptions {
  branches: number;
  capacity?: number;
  onBranchClosed?: (branchIndex: number, safeCode: 'FLOW_BRANCH_CLOSED') => void;
}

export interface FlowFanOut<T> {
  branches: readonly AsyncIterable<FlowPacket<T>>[];
  completed: Promise<void>;
}

interface PendingWrite<T> { packet: FlowPacket<T>; resolve(): void; reject(error: Error): void }

class PacketBranch<T> implements AsyncIterable<FlowPacket<T>> {
  private readonly buffer: FlowPacket<T>[] = [];
  private readonly readers: Array<(result: IteratorResult<FlowPacket<T>>) => void> = [];
  private readonly writers: Array<PendingWrite<T>> = [];
  private closed = false;
  private iteratorCreated = false;

  constructor(private readonly capacity: number) {}

  push(packet: FlowPacket<T>): Promise<void> {
    if (this.closed) return Promise.reject(new Error('FLOW_BRANCH_CLOSED'));
    const reader = this.readers.shift();
    if (reader) { reader({ done: false, value: packet }); return Promise.resolve(); }
    if (this.buffer.length < this.capacity) { this.buffer.push(packet); return Promise.resolve(); }
    return new Promise<void>((resolve, reject) => this.writers.push({ packet, resolve, reject }));
  }

  finish(): void {
    this.closed = true;
    if (this.buffer.length === 0 && this.writers.length === 0) {
      for (const reader of this.readers.splice(0)) reader({ done: true, value: undefined });
    }
  }

  [Symbol.asyncIterator](): AsyncIterator<FlowPacket<T>> {
    if (this.iteratorCreated) throw new Error('FLOW_BRANCH_SINGLE_CONSUMER');
    this.iteratorCreated = true;
    return {
      next: () => this.next(),
      return: async () => { this.abandon(); return { done: true, value: undefined }; },
    };
  }

  private next(): Promise<IteratorResult<FlowPacket<T>>> {
    const packet = this.buffer.shift();
    if (packet) { this.admitWriter(); return Promise.resolve({ done: false, value: packet }); }
    if (this.closed) return Promise.resolve({ done: true, value: undefined });
    return new Promise((resolve) => this.readers.push(resolve));
  }

  private admitWriter(): void {
    const writer = this.writers.shift();
    if (!writer) return;
    const reader = this.readers.shift();
    if (reader) reader({ done: false, value: writer.packet });
    else this.buffer.push(writer.packet);
    writer.resolve();
  }

  private abandon(): void {
    if (this.closed) return;
    this.closed = true;
    const error = new Error('FLOW_BRANCH_CLOSED');
    for (const writer of this.writers.splice(0)) writer.reject(error);
    for (const reader of this.readers.splice(0)) reader({ done: true, value: undefined });
    this.buffer.splice(0);
  }
}

/** Copies immutable packet references into independent bounded branches. */
export function fanOutFlowPackets<T>(source: AsyncIterable<FlowPacket<T>>, options: FlowFanOutOptions): FlowFanOut<T> {
  if (!Number.isInteger(options.branches) || options.branches < 1) throw new RangeError('FLOW_BRANCH_COUNT_INVALID');
  const capacity = options.capacity ?? 32;
  if (!Number.isInteger(capacity) || capacity < 1) throw new RangeError('FLOW_BRANCH_CAPACITY_INVALID');
  const branches = Array.from({ length: options.branches }, () => new PacketBranch<T>(capacity));
  const active = new Set(branches.map((_branch, index) => index));
  const completed = (async () => {
    try {
      for await (const packet of source) {
        await Promise.all([...active].map(async (index) => {
          try { await branches[index]!.push(packet); }
          catch {
            active.delete(index);
            options.onBranchClosed?.(index, 'FLOW_BRANCH_CLOSED');
          }
        }));
      }
    } finally {
      for (const index of active) branches[index]!.finish();
    }
  })();
  return { branches, completed };
}
