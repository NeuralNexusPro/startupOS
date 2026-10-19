import { afterEach, describe, expect, it } from 'vitest';

import {
  getSupervisorWorkItemRuntimePort,
  registerSupervisorWorkItemRuntimePort,
  type SupervisorWorkItemRuntimePort,
} from '../supervisor-workitem-runtime';

const port = (): SupervisorWorkItemRuntimePort => ({
  bind: async () => ({
    ok: false,
    gaps: [{ code: 'TEST_GAP', message: 'test', remediation: 'fix' }],
  }),
  advance: async () => {
    throw new Error('not used');
  },
});

afterEach(() => {
  globalThis.__originosSupervisorWorkItemRuntimePort = undefined;
});

describe('SupervisorWorkItemRuntimePort registry', () => {
  it('keeps the newest composition registered when an older disposer runs', () => {
    const first = port();
    const second = port();
    const disposeFirst = registerSupervisorWorkItemRuntimePort(first);
    const disposeSecond = registerSupervisorWorkItemRuntimePort(second);

    disposeFirst();
    expect(getSupervisorWorkItemRuntimePort()).toBe(second);

    disposeSecond();
    expect(getSupervisorWorkItemRuntimePort()).toBeNull();
  });
});
