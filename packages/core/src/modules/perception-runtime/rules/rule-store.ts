import fs from 'node:fs';
import path from 'node:path';
import type { PerceptionTriggerRule } from '../../../types/perception';
import { assertSafePerceptionId } from '../protocol/validation';
import { AtomicDataFileStore } from '../storage/data-file-store';
import { resolvePerceptionPath } from '../storage/paths';
import { validateTriggerRule } from './rule-validator';

export class TriggerRuleStore {
  private readonly directory: string;
  constructor(dataRoot: string) { this.directory = resolvePerceptionPath(dataRoot, 'rules') }

  save(rule: PerceptionTriggerRule): PerceptionTriggerRule {
    validateTriggerRule(rule);
    new AtomicDataFileStore<PerceptionTriggerRule>(path.join(this.directory, `${rule.id}.json`)).write(rule);
    return rule;
  }
  get(ruleId: string): PerceptionTriggerRule | null {
    assertSafePerceptionId(ruleId, 'trigger rule id');
    const store = new AtomicDataFileStore<PerceptionTriggerRule>(path.join(this.directory, `${ruleId}.json`));
    if (!store.exists()) return null;
    const rule = store.read().data;
    validateTriggerRule(rule);
    return rule;
  }
  list(): PerceptionTriggerRule[] {
    if (!fs.existsSync(this.directory)) return [];
    return fs.readdirSync(this.directory)
      .filter((file) => file.endsWith('.json') && !file.endsWith('.versions.json'))
      .map((file) => this.get(file.slice(0, -5)))
      .filter((rule): rule is PerceptionTriggerRule => rule !== null)
      .sort((left, right) => left.id.localeCompare(right.id));
  }
  delete(ruleId: string): boolean {
    assertSafePerceptionId(ruleId, 'trigger rule id');
    const filePath = path.join(this.directory, `${ruleId}.json`);
    if (!fs.existsSync(filePath)) return false;
    fs.unlinkSync(filePath);
    return true;
  }
}
