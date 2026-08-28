import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  PerceptionDeadLetterStore,
  PerceptionRetryService,
  PerceptionRetryStore,
} from '../../../../modules/perception-runtime';
import { PerceptionManagementFacade } from '..';

const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true });
});

function root(): string {
  const value = fs.mkdtempSync(path.join(os.tmpdir(), 'originos-perception-facade-'));
  roots.push(value);
  return value;
}

describe('PerceptionManagementFacade', () => {
  it('manages connector, rule, grant, and health data without exposing secret references', () => {
    const dataRoot = root();
    const retry = new PerceptionRetryService(new PerceptionRetryStore(dataRoot), new PerceptionDeadLetterStore(dataRoot));
    const facade = new PerceptionManagementFacade(dataRoot, retry);
    const now = '2026-08-28T08:00:00.000Z';

    const connector = facade.saveConnector({
      id: 'email-main', source: 'email', mode: 'email-poll', enabled: true,
      secretRef: 'secret://perception/email-main', settings: { mailbox: 'INBOX' }, createdAt: now, updatedAt: now,
    });
    expect(connector).toMatchObject({ id: 'email-main', secretConfigured: true });
    expect(connector).not.toHaveProperty('secretRef');
    expect(facade.setConnectorEnabled('email-main', false).enabled).toBe(false);

    facade.saveGrant({ target: { kind: 'project', id: 'project-1' }, enabled: true, createdAt: now, updatedAt: now });
    facade.saveRule({
      id: 'rule-1', enabled: true, sources: ['email'], eventTypes: ['mail.received'], conditions: [],
      target: { kind: 'project', id: 'project-1' }, execution: { requireHitl: true, maxAttempts: 3 }, createdAt: now, updatedAt: now,
    });
    facade.saveHealth({ connectorId: 'email-main', mode: 'email-poll', status: 'healthy', updatedAt: now, lastUid: 8 });
    expect(facade.listRules()).toHaveLength(1);
    expect(facade.listGrants()).toHaveLength(1);
    expect(facade.listHealth()).toHaveLength(1);
    expect(facade.deleteRule('rule-1')).toBe(true);
    expect(facade.deleteGrant('project', 'project-1')).toBe(true);

    const persisted = fs.readFileSync(path.join(dataRoot, 'perception', 'connectors', 'email-main.json'), 'utf8');
    expect(JSON.parse(persisted)).toMatchObject({ version: expect.any(String), createdAt: expect.any(String), updatedAt: expect.any(String) });
  });

  it('rejects a rule whose target has no external-trigger grant', () => {
    const dataRoot = root();
    const facade = new PerceptionManagementFacade(
      dataRoot,
      new PerceptionRetryService(new PerceptionRetryStore(dataRoot), new PerceptionDeadLetterStore(dataRoot)),
    );
    const now = '2026-08-28T08:00:00.000Z';
    expect(() => facade.saveRule({
      id: 'rule-denied', enabled: true, sources: ['email'], eventTypes: ['mail.received'], conditions: [],
      target: { kind: 'project', id: 'project-denied' }, execution: { requireHitl: true, maxAttempts: 3 }, createdAt: now, updatedAt: now,
    })).toThrow('not authorized');
  });
});
