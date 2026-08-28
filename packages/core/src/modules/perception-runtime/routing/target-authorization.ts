import fs from 'node:fs';
import path from 'node:path';
import type {
  ExternalTriggerGrant,
  PerceptionTargetAuthorization,
  PerceptionTargetKind,
  PerceptionTargetExistencePort,
  TargetAuthorizationPort,
} from '../../../types/perception';
import { assertSafePerceptionId } from '../protocol/validation';
import { AtomicDataFileStore } from '../storage/data-file-store';
import { resolvePerceptionPath } from '../storage/paths';

export class ExternalTriggerGrantStore {
  constructor(private readonly dataRoot: string) {}

  save(grant: ExternalTriggerGrant): ExternalTriggerGrant {
    validateGrant(grant);
    this.store(grant.target.kind, grant.target.id).write(grant);
    return grant;
  }
  get(kind: PerceptionTargetKind, id: string): ExternalTriggerGrant | null {
    const store = this.store(kind, id);
    if (!store.exists()) return null;
    const grant = store.read().data;
    validateGrant(grant);
    return grant;
  }
  list(): ExternalTriggerGrant[] {
    const root = resolvePerceptionPath(this.dataRoot, 'targets');
    if (!fs.existsSync(root)) return [];
    return (['project', 'role-agent', 'skill'] as const).flatMap((kind) => {
      const directory = path.join(root, kind);
      if (!fs.existsSync(directory)) return [];
      return fs.readdirSync(directory).filter((file) => file.endsWith('.json')).map((file) => this.get(kind, file.slice(0, -5))).filter((grant): grant is ExternalTriggerGrant => grant !== null);
    });
  }
  delete(kind: PerceptionTargetKind, id: string): boolean {
    const filePath = this.store(kind, id).filePath;
    if (!fs.existsSync(filePath)) return false;
    fs.unlinkSync(filePath);
    return true;
  }
  private store(kind: PerceptionTargetKind, id: string): AtomicDataFileStore<ExternalTriggerGrant> {
    assertSafePerceptionId(id, 'external trigger target id');
    return new AtomicDataFileStore<ExternalTriggerGrant>(path.join(resolvePerceptionPath(this.dataRoot, 'targets', kind), `${id}.json`));
  }
}

export class FileTargetAuthorizationPort implements TargetAuthorizationPort {
  constructor(private readonly grants: ExternalTriggerGrantStore, private readonly targets: PerceptionTargetExistencePort) {}

  async authorize(input: Parameters<TargetAuthorizationPort['authorize']>[0]): Promise<PerceptionTargetAuthorization> {
    if (!await this.targets.exists(input.target)) return { authorized: false, reason: 'Target does not exist' };
    const grant = this.grants.get(input.target.kind, input.target.id);
    if (!grant?.enabled) return { authorized: false, reason: 'Target is not enabled for external triggers' };
    if (grant.allowedConnectorIds && !grant.allowedConnectorIds.includes(input.event.connectorId)) {
      return { authorized: false, reason: 'Connector is not authorized for target' };
    }
    if (grant.allowedRuleIds && !grant.allowedRuleIds.includes(input.rule.id)) {
      return { authorized: false, reason: 'Rule is not authorized for target' };
    }
    if (input.target.kind === 'skill' && input.target.skillOwnership?.mode === 'inherited') {
      const owner = input.target.skillOwnership;
      if (!await this.targets.exists({ kind: owner.ownerKind, id: owner.ownerId })) {
        return { authorized: false, reason: 'Skill cognition owner does not exist' };
      }
      const ownerGrant = this.grants.get(owner.ownerKind, owner.ownerId);
      if (!ownerGrant?.enabled) return { authorized: false, reason: 'Skill cognition owner is not externally triggerable' };
    }
    return { authorized: true, effectiveToolScope: grant.effectiveToolScope };
  }
}

function validateGrant(grant: ExternalTriggerGrant): void {
  assertSafePerceptionId(grant.target.id, 'external trigger target id');
  grant.allowedConnectorIds?.forEach((id) => assertSafePerceptionId(id, 'allowed connector id'));
  grant.allowedRuleIds?.forEach((id) => assertSafePerceptionId(id, 'allowed rule id'));
  if (!Number.isFinite(Date.parse(grant.createdAt)) || !Number.isFinite(Date.parse(grant.updatedAt))) throw new Error('Invalid external trigger grant timestamp');
}
