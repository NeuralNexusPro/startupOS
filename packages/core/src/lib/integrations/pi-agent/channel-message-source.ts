import { AsyncLocalStorage } from 'node:async_hooks';
import type { CommunicationSource } from '../../shared/cognitive';

const storage = new AsyncLocalStorage<CommunicationSource>();

export function withChannelMessageSource<T>(source: CommunicationSource, operation: () => Promise<T>): Promise<T> {
  return storage.run(source, operation);
}

export function getChannelMessageSource(): CommunicationSource | undefined {
  return storage.getStore();
}
