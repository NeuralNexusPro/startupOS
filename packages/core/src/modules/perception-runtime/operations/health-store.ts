import fs from 'node:fs';
import path from 'node:path';
import type { ConnectorHealth } from '../../../types/perception';
import { assertSafePerceptionId } from '../protocol/validation';
import { AtomicDataFileStore } from '../storage/data-file-store';
import { resolvePerceptionPath } from '../storage/paths';

export class ConnectorHealthStore {
  constructor(private readonly dataRoot: string) {}
  save(health: ConnectorHealth): ConnectorHealth {
    validateHealth(health);
    this.store(health.connectorId).write(health);
    return health;
  }
  get(connectorId: string): ConnectorHealth | null {
    const store = this.store(connectorId);
    return store.exists() ? store.read().data : null;
  }
  list(): ConnectorHealth[] {
    const directory = resolvePerceptionPath(this.dataRoot, 'health');
    if (!fs.existsSync(directory)) return [];
    return fs.readdirSync(directory).filter((file) => file.endsWith('.json')).map((file) => this.get(file.slice(0, -5))).filter((value): value is ConnectorHealth => value !== null);
  }
  private store(connectorId: string): AtomicDataFileStore<ConnectorHealth> {
    assertSafePerceptionId(connectorId, 'health connector id');
    return new AtomicDataFileStore<ConnectorHealth>(path.join(resolvePerceptionPath(this.dataRoot, 'health'), `${connectorId}.json`));
  }
}

function validateHealth(health: ConnectorHealth): void {
  assertSafePerceptionId(health.connectorId, 'health connector id');
  if (!Number.isFinite(Date.parse(health.updatedAt))) throw new Error('Invalid connector health timestamp');
  if (health.mode === 'stream' && (health.reconnectCount < 0 || health.pendingHandlers < 0)) throw new Error('Invalid Stream health counters');
  if (health.mode === 'email-poll' && health.lastUid !== undefined && health.lastUid < 0) throw new Error('Invalid Email health cursor');
}
