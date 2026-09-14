import { CHANNEL_PROTOCOL_VERSION, type FlowPacket, type FlowPacketKind } from './types';

export interface BoundedFlowPortOptions {
  flowId: string;
  port: string;
  capacity?: number;
  clock?: () => string;
  idFactory?: (sequence: number) => string;
}

interface PendingWriter<T> {
  packet: FlowPacket<T>;
  resolve: () => void;
  reject: (error: Error) => void;
}

export class FlowPortClosedError extends Error {
  constructor() {
    super('Flow port is closed');
    this.name = 'FlowPortClosedError';
  }
}

/**
 * A single-consumer FBP port. Producers must await send/terminal methods so a
 * full buffer can propagate backpressure instead of growing memory unbounded.
 */
export class BoundedFlowPort<T> implements AsyncIterable<FlowPacket<T>> {
  readonly signal: AbortSignal;

  private readonly capacity: number;
  private readonly clock: () => string;
  private readonly idFactory: (sequence: number) => string;
  private readonly abortController = new AbortController();
  private readonly buffer: FlowPacket<T>[] = [];
  private readonly readers: Array<(result: IteratorResult<FlowPacket<T>>) => void> = [];
  private readonly writers: Array<PendingWriter<T>> = [];
  private sequence = 0;
  private terminalScheduled = false;
  private iteratorCreated = false;

  constructor(private readonly options: BoundedFlowPortOptions) {
    const capacity = options.capacity ?? 32;
    if (!Number.isInteger(capacity) || capacity < 1) throw new RangeError('Flow port capacity must be a positive integer');
    this.capacity = capacity;
    this.clock = options.clock ?? (() => new Date().toISOString());
    this.idFactory = options.idFactory ?? ((sequence) => `${options.flowId}:${options.port}:${sequence}`);
    this.signal = this.abortController.signal;
  }

  send(payload: T): Promise<void> {
    return this.write('data', payload, false);
  }

  complete(payload: T): Promise<void> {
    return this.write('complete', payload, true);
  }

  fail(payload: T): Promise<void> {
    return this.write('error', payload, true);
  }

  cancel(payload: T): Promise<void> {
    if (this.terminalScheduled) return Promise.reject(new FlowPortClosedError());
    this.abortController.abort();
    return this.write('control', payload, true);
  }

  [Symbol.asyncIterator](): AsyncIterator<FlowPacket<T>> {
    if (this.iteratorCreated) throw new Error('Flow port supports a single consumer');
    this.iteratorCreated = true;
    return {
      next: () => this.nextPacket(),
      return: async () => {
        this.dispose();
        return { done: true, value: undefined };
      },
    };
  }

  private write(kind: FlowPacketKind, payload: T, terminal: boolean): Promise<void> {
    if (this.terminalScheduled) return Promise.reject(new FlowPortClosedError());
    if (terminal) this.terminalScheduled = true;
    const sequence = this.sequence++;
    const packet: FlowPacket<T> = {
      protocolVersion: CHANNEL_PROTOCOL_VERSION,
      flowId: this.options.flowId,
      packetId: this.idFactory(sequence),
      sequence,
      port: this.options.port,
      kind,
      emittedAt: this.clock(),
      payload,
    };
    const reader = this.readers.shift();
    if (reader) {
      reader({ done: false, value: packet });
      return Promise.resolve();
    }
    if (this.buffer.length < this.capacity) {
      this.buffer.push(packet);
      return Promise.resolve();
    }
    return new Promise<void>((resolve, reject) => this.writers.push({ packet, resolve, reject }));
  }

  private nextPacket(): Promise<IteratorResult<FlowPacket<T>>> {
    const packet = this.buffer.shift();
    if (packet) {
      this.admitWriter();
      return Promise.resolve({ done: false, value: packet });
    }
    if (this.terminalScheduled && this.writers.length === 0) return Promise.resolve({ done: true, value: undefined });
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

  private dispose(): void {
    if (!this.abortController.signal.aborted) this.abortController.abort();
    const error = new FlowPortClosedError();
    for (const writer of this.writers.splice(0)) writer.reject(error);
    for (const reader of this.readers.splice(0)) reader({ done: true, value: undefined });
    this.buffer.splice(0);
    this.terminalScheduled = true;
  }
}
