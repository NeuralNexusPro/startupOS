import fs from 'node:fs';
import path from 'node:path';
import type { CognitionDataFile, CognitionRecord, MentalModelSnapshotData } from './types';
import { CognitionBank } from './cognition-bank';

const SNAPSHOT_VERSION = '1.0';
const DEFAULT_CHARACTER_BUDGET = 8_000;

/** Read-only helper for ephemeral consumers such as standalone Skills. */
export function readGlobalUserProfileSnapshot(dataRoot: string, userId = 'default'): string | null {
  const bank = new CognitionBank({ scope: 'user', ownerId: userId, dataRoot });
  return new MentalModelStore().read(bank, 'user-profile')?.data.content || null;
}

export class MentalModelStore {
  constructor(private readonly characterBudget = DEFAULT_CHARACTER_BUDGET) {}

  refreshUserProfile(bank: CognitionBank): CognitionDataFile<MentalModelSnapshotData> {
    return this.refresh(bank, 'user-profile');
  }

  refreshWorldModel(bank: CognitionBank): CognitionDataFile<MentalModelSnapshotData> {
    return this.refresh(bank, 'world-model');
  }

  read(bank: CognitionBank, model: MentalModelSnapshotData['model']): CognitionDataFile<MentalModelSnapshotData> | null {
    const filePath = this.snapshotPath(bank, model);
    if (!fs.existsSync(filePath)) return null;
    try {
      const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8')) as CognitionDataFile<MentalModelSnapshotData>;
      if (parsed.data.scope !== bank.scope || parsed.data.ownerId !== bank.ownerId || parsed.data.model !== model) return null;
      return parsed;
    } catch {
      return null;
    }
  }

  private refresh(bank: CognitionBank, model: MentalModelSnapshotData['model']): CognitionDataFile<MentalModelSnapshotData> {
    const records = bank.list().filter((record) =>
      record.status === 'active' &&
      (model === 'user-profile'
        ? record.kind === 'observation' || record.kind === 'mental_model'
        : record.kind === 'world_fact' || record.kind === 'observation' || record.kind === 'mental_model')
    );
    const selected = this.withinBudget(records);
    const now = new Date().toISOString();
    const snapshot: CognitionDataFile<MentalModelSnapshotData> = {
      version: SNAPSHOT_VERSION,
      createdAt: now,
      updatedAt: now,
      data: {
        model,
        scope: bank.scope,
        ownerId: bank.ownerId,
        content: selected.map((record) => `- ${record.content}`).join('\n'),
        recordIds: selected.map((record) => record.id),
      },
    };
    const filePath = this.snapshotPath(bank, model);
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    const temporaryPath = `${filePath}.${process.pid}.tmp`;
    fs.writeFileSync(temporaryPath, `${JSON.stringify(snapshot, null, 2)}\n`, 'utf8');
    fs.renameSync(temporaryPath, filePath);
    return snapshot;
  }

  private withinBudget(records: CognitionRecord[]): CognitionRecord[] {
    const ranked = [...records].sort((left, right) =>
      right.confidence - left.confidence || right.updatedAt.localeCompare(left.updatedAt)
    );
    const selected: CognitionRecord[] = [];
    let used = 0;
    for (const record of ranked) {
      const size = record.content.length + 3;
      if (used + size > this.characterBudget) continue;
      selected.push(record);
      used += size;
    }
    return selected;
  }

  private snapshotPath(bank: CognitionBank, model: MentalModelSnapshotData['model']): string {
    return path.join(bank.directory, 'snapshots', `${model}.json`);
  }
}
