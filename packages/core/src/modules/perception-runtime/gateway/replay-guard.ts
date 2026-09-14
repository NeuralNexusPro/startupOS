import { createHash } from 'node:crypto';
import path from 'node:path';
import { AtomicDataFileStore } from '../storage/data-file-store';
import { resolvePerceptionPath } from '../storage/paths';
import { WebhookGatewayError } from './errors';

interface ReplayIndex {
  entries: Record<string, string>;
}

export class ReplayGuard {
  private readonly store: AtomicDataFileStore<ReplayIndex>;

  constructor(dataRoot: string, private readonly windowMs = 5 * 60 * 1000) {
    this.store = new AtomicDataFileStore<ReplayIndex>(path.join(resolvePerceptionPath(dataRoot, 'inbox'), 'replay-index.json'));
  }

  consume(connectorId: string, replayKey: string | undefined, signedAt: string | undefined, receivedAt: string): void {
    if (!replayKey) return;
    const receivedTime = Date.parse(receivedAt);
    const signedTime = signedAt ? Date.parse(signedAt) : receivedTime;
    if (!Number.isFinite(signedTime) || Math.abs(receivedTime - signedTime) > this.windowMs) {
      throw new WebhookGatewayError('REPLAY_WINDOW_EXPIRED', 'Webhook signature timestamp is outside the allowed window');
    }

    const index = this.store.exists() ? this.store.read().data : { entries: {} };
    for (const [key, expiresAt] of Object.entries(index.entries)) {
      if (Date.parse(expiresAt) <= receivedTime) delete index.entries[key];
    }
    const hash = createHash('sha256').update(`${connectorId}\0${replayKey}`).digest('hex');
    if (index.entries[hash]) throw new WebhookGatewayError('REPLAY_DETECTED', 'Webhook replay was detected');
    index.entries[hash] = new Date(receivedTime + this.windowMs).toISOString();
    this.store.write(index);
  }
}

