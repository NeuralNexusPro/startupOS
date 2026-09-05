import path from 'node:path';
import fs from 'node:fs';
import type { PerceptionEventV1 } from '../protocol/types';
import { validatePerceptionEvent } from '../protocol/validation';
import { AtomicDataFileStore } from './data-file-store';
import { resolvePerceptionPath } from './paths';

interface DedupeIndex {
  entries: Record<string, string>;
}

export interface SaveEventResult {
  event: PerceptionEventV1;
  duplicate: boolean;
}

export class PerceptionEventStore {
  private readonly eventsDirectory: string;
  private readonly dedupeStore: AtomicDataFileStore<DedupeIndex>;

  constructor(private readonly dataRoot: string) {
    this.eventsDirectory = resolvePerceptionPath(dataRoot, 'events');
    this.dedupeStore = new AtomicDataFileStore<DedupeIndex>(path.join(this.eventsDirectory, 'dedupe-index.json'));
  }

  save(event: PerceptionEventV1): SaveEventResult {
    validatePerceptionEvent(event);
    const key = `${event.connectorId}\0${event.sourceEventId}`;
    const index = this.dedupeStore.exists() ? this.dedupeStore.read().data : { entries: {} };
    const existingId = index.entries[key];
    if (existingId) return { event: this.get(existingId), duplicate: true };

    new AtomicDataFileStore<PerceptionEventV1>(path.join(this.eventsDirectory, `${event.id}.json`)).write(event);
    index.entries[key] = event.id;
    this.dedupeStore.write(index);
    return { event, duplicate: false };
  }

  get(eventId: string): PerceptionEventV1 {
    const filePath = resolvePerceptionPath(this.dataRoot, 'events', `${eventId}.json`);
    return new AtomicDataFileStore<PerceptionEventV1>(filePath).read().data;
  }

  list(limit = 50): PerceptionEventV1[] {
    if (!fs.existsSync(this.eventsDirectory)) return [];
    return fs.readdirSync(this.eventsDirectory)
      .filter((name) => name.endsWith('.json') && name !== 'dedupe-index.json')
      .flatMap((name) => {
        try { return [new AtomicDataFileStore<PerceptionEventV1>(path.join(this.eventsDirectory, name)).read().data]; }
        catch { return []; }
      })
      .sort((left, right) => right.receivedAt.localeCompare(left.receivedAt))
      .slice(0, Math.max(1, Math.min(200, limit)));
  }
}
