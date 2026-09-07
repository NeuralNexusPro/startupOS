import fs from 'node:fs';
import path from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  A02_CONTRACT_CASE_MATRIX,
  ControlledPiTaskHarness,
  TASK_EVIDENCE_INPUT,
  TASK_PLAN_INPUT,
  completeInput,
  stepDoneInput,
} from './public-extension-harness';

describe('A-02 public pi task command contract', () => {
  const harnesses: ControlledPiTaskHarness[] = [];

  async function createHarness(
    options?: Parameters<typeof ControlledPiTaskHarness.create>[0],
  ): Promise<ControlledPiTaskHarness> {
    const harness = await ControlledPiTaskHarness.create(options);
    harnesses.push(harness);
    return harness;
  }

  afterEach(() => {
    harnesses.splice(0).forEach((harness) => harness.dispose());
    vi.useRealTimers();
  });

  it('publishes an explicit case matrix for TC-C1, TC-C2, and A-02 boundaries', () => {
    expect(A02_CONTRACT_CASE_MATRIX.map(({ id }) => id)).toEqual([
      'TC-C1',
      'TC-C2',
      'A02-SCOPE',
      'A02-EVENT',
      'A02-IDEMPOTENCY',
      'A02-EVIDENCE-GATE',
      'A02-EPOCH',
      'A02-HISTORY',
      'A02-COMPATIBILITY',
      'A02-STATIC-BOUNDARY',
    ]);
  });

  it('TC-C1 executes controlled commands through the public pipeline and correlates receipt/state', async () => {
    const harness = await createHarness();
    const planned = await harness.invoke('task_plan', TASK_PLAN_INPUT, 'tc-c1-plan');

    expect(planned).toMatchObject({
      requestId: 'tc-c1-plan',
      taskId: 'T1',
      revisionBefore: 0,
      revisionAfter: 1,
      cursorBefore: null,
      replayed: false,
      isError: false,
      snapshot: {
        version: 1,
        scope: {
          sessionId: harness.sessionId,
          revision: 1,
        },
        mutation: {
          requestId: 'tc-c1-plan',
          command: 'task_plan',
        },
      },
    });
    expect(planned.cursorAfter).toBe(harness.currentCursor);
    expect(planned.snapshot.scope.cursor).toBe(planned.cursorAfter);
    expect(planned.snapshot.stateHash).toBe(planned.stateHash);

    expect(harness.tools.has('task_resume')).toBe(true);
    expect(harness.currentRevision).toBe(1);
    expect(harness.branchEntries).toHaveLength(1);
    expect(harness.hookCalls).toEqual([
      'before:task_plan',
      'after:task_plan',
    ]);
    expect(harness.runtimeEventTypes).toEqual([
      'tool_execution_start',
      'tool_execution_end',
    ]);
  });

  it('TC-C1 rejects invalid schema, permission, and non-allowlisted tools before mutation', async () => {
    const invalid = await createHarness();
    await expect(
      invalid.invoke('task_plan', { objective: 'missing required fields' }, 'invalid-schema'),
    ).rejects.toMatchObject({ code: 'VALIDATION_FAILED' });
    expect(invalid.toolExecutions).toBe(0);
    expect(invalid.branchEntries).toHaveLength(0);
    expect(invalid.runtimeEventTypes).toEqual([
      'tool_execution_start',
      'tool_execution_end',
    ]);

    const denied = await createHarness({ denyToolName: 'task_plan' });
    await expect(
      denied.invoke('task_plan', TASK_PLAN_INPUT, 'permission-denied'),
    ).rejects.toMatchObject({ code: 'PERMISSION_DENIED' });
    expect(denied.toolExecutions).toBe(0);
    expect(denied.branchEntries).toHaveLength(0);

    await expect(
      denied.invokeCommand({
        ...denied.command('task_plan', TASK_PLAN_INPUT, 'not-allowlisted'),
        toolName: 'task_resume',
      }),
    ).rejects.toMatchObject({ code: 'TOOL_NOT_ALLOWED' });
    expect(denied.branchEntries).toHaveLength(0);
  });

  it('TC-C2 restarts from current branch and preserves compaction state and revision', async () => {
    const source = await createHarness();
    const planned = await source.invoke('task_plan', TASK_PLAN_INPUT, 'tc-c2-plan');
    await source.invoke(
      'task_evidence',
      TASK_EVIDENCE_INPUT,
      'tc-c2-evidence',
    );
    const beforeCompaction = source.latestState;

    await source.emitLifecycle('session_before_compact');
    const compactedBranch = source.branchEntries;
    expect(compactedBranch.at(-1)?.data).toMatchObject({
      version: 2,
      kind: 'snapshot',
      revision: 2,
    });

    const restarted = await createHarness({
      initialBranch: compactedBranch,
      sessionId: source.sessionId,
    });
    expect(restarted.currentRevision).toBe(2);
    expect(restarted.latestState?.state.tasks).toEqual(beforeCompaction?.state.tasks);
    expect(restarted.latestState?.state.activeTaskId).toBe(
      beforeCompaction?.state.activeTaskId,
    );
    expect(restarted.latestState?.state.warnings).toEqual(
      beforeCompaction?.state.warnings,
    );
    expect(restarted.latestState?.scope.revision).toBe(2);
    expect(restarted.latestState?.scope.cursor).not.toBe(planned.cursorAfter);
  });

  it('TC-C2 isolates sibling branches and rejects stale branch mutation', async () => {
    const root = await createHarness();
    await root.invoke('task_plan', TASK_PLAN_INPUT, 'branch-root');
    const commonAncestor = root.branchEntries;

    await root.invoke(
      'task_update',
      { task_id: 'T1', next_action: 'left branch only' },
      'branch-left',
    );
    const sibling = await createHarness({
      initialBranch: commonAncestor,
      sessionId: root.sessionId,
    });

    expect(sibling.task('T1')?.nextAction).not.toBe('left branch only');
    await expect(
      sibling.invokeCommand({
        ...sibling.command('task_update', { task_id: 'T1', next_action: 'stale' }, 'stale'),
        scope: {
          ...sibling.currentScope,
          expectedCursor: root.currentCursor,
        },
      }),
    ).rejects.toMatchObject({ code: 'BRANCH_CONFLICT' });
    expect(sibling.branchEntries).toEqual(commonAncestor);
  });

  it('A02-SCOPE fails closed for stale Session, busy Session, and branch changes during execution', async () => {
    const staleSession = await createHarness();
    await expect(
      staleSession.invokeCommand({
        ...staleSession.command('task_plan', TASK_PLAN_INPUT, 'stale-session'),
        scope: { ...staleSession.currentScope, sessionId: 'another-session' },
      }),
    ).rejects.toMatchObject({ code: 'SESSION_MISMATCH' });

    const busy = await createHarness();
    busy.setBusy(true);
    await expect(
      busy.invoke('task_plan', TASK_PLAN_INPUT, 'busy-session'),
    ).rejects.toMatchObject({ code: 'SESSION_BUSY' });
    expect(busy.branchEntries).toHaveLength(0);

    const diverged = await createHarness({ appendMessageAfterTool: true });
    await expect(
      diverged.invoke('task_plan', TASK_PLAN_INPUT, 'branch-diverged'),
    ).rejects.toMatchObject({ code: 'CONTRACT_VIOLATION' });
    expect(diverged.branchEntries.filter(({ customType }) => customType === 'pi-tasks:event')).toHaveLength(1);
  });

  it('A02-EVENT times out boundedly, cleans pending state, and recovers from the canonical receipt', async () => {
    vi.useFakeTimers();
    const harness = await createHarness({ muteTaskStateEvents: true, stateEventTimeoutMs: 25 });
    const pending = harness.invoke('task_plan', TASK_PLAN_INPUT, 'event-timeout');
    const rejection = expect(pending).rejects.toMatchObject({ code: 'STATE_EVENT_TIMEOUT' });

    await vi.advanceTimersByTimeAsync(25);
    await rejection;
    expect(harness.branchEntries).toHaveLength(1);
    expect(harness.publicStateListenerCount).toBe(1);

    harness.muteTaskStateEvents(false);
    const replay = await harness.invoke('task_plan', TASK_PLAN_INPUT, 'event-timeout');
    expect(replay.replayed).toBe(true);
    expect(harness.branchEntries).toHaveLength(1);
  });

  it('A02-IDEMPOTENCY replays identical requests and rejects conflicting payloads', async () => {
    const harness = await createHarness();
    const first = await harness.invoke('task_plan', TASK_PLAN_INPUT, 'idempotent-request');
    const replay = await harness.invoke('task_plan', TASK_PLAN_INPUT, 'idempotent-request');

    expect(replay).toMatchObject({
      replayed: true,
      eventId: first.eventId,
      cursorAfter: first.cursorAfter,
      revisionAfter: first.revisionAfter,
    });
    expect(harness.branchEntries).toHaveLength(1);

    await expect(
      harness.invoke(
        'task_plan',
        { ...TASK_PLAN_INPUT, title: 'Conflicting payload' },
        'idempotent-request',
      ),
    ).rejects.toMatchObject({ code: 'DUPLICATE_REQUEST_CONFLICT' });
    expect(harness.branchEntries).toHaveLength(1);
  });

  it('A02-EVIDENCE-GATE rejects missing/forced evidence and completes exactly once with valid evidence', async () => {
    const harness = await createHarness();
    await harness.invoke('task_plan', TASK_PLAN_INPUT, 'evidence-plan');

    await expect(
      harness.invoke('task_complete', completeInput([]), 'missing-evidence'),
    ).rejects.toMatchObject({
      details: expect.objectContaining({ rejected: true }),
    });
    expect(harness.task('T1')?.status).not.toBe('done');

    await expect(
      harness.invoke(
        'task_complete',
        { ...completeInput([]), force_with_reason: 'bypass' },
        'forced-completion',
      ),
    ).rejects.toMatchObject({ code: 'VALIDATION_FAILED' });
    expect(harness.task('T1')?.status).not.toBe('done');

    const evidence = await harness.invoke(
      'task_evidence',
      TASK_EVIDENCE_INPUT,
      'evidence-add',
    );
    expect(evidence.revisionAfter).toBe(2);
    await harness.invoke('task_update', stepDoneInput('E1'), 'evidence-step-done');
    const completed = await harness.invoke(
      'task_complete',
      completeInput(['E1']),
      'evidence-complete',
    );
    const replay = await harness.invoke(
      'task_complete',
      completeInput(['E1']),
      'evidence-complete',
    );

    expect(completed.revisionAfter).toBe(4);
    expect(harness.task('T1')?.status).toBe('done');
    expect(replay.replayed).toBe(true);
    expect(harness.branchEntries).toHaveLength(4);
  });

  it('A02-EPOCH invalidates stale gateways and aborts an in-flight host invocation', async () => {
    const stale = await createHarness();
    stale.invalidate();
    await expect(
      stale.invoke('task_plan', TASK_PLAN_INPUT, 'stale-epoch'),
    ).rejects.toMatchObject({ code: 'BRIDGE_EPOCH_STALE' });

    const hanging = await createHarness({ hostNeverSettles: true });
    const invocation = hanging.invoke('task_plan', TASK_PLAN_INPUT, 'epoch-in-flight');
    await new Promise((resolve) => setImmediate(resolve));
    hanging.invalidate();
    await expect(invocation).rejects.toMatchObject({ code: 'BRIDGE_EPOCH_STALE' });
    await new Promise((resolve) => setImmediate(resolve));
    expect(hanging.abortCalls).toBe(1);
  });

  it('A02-HISTORY keeps host commands out of conversation history', async () => {
    const harness = await createHarness();
    const messagesBefore = harness.messages.length;
    await harness.invoke('task_plan', TASK_PLAN_INPUT, 'history-plan');

    expect(harness.messages).toHaveLength(messagesBefore);
    expect(harness.runtimeEventTypes).not.toEqual(
      expect.arrayContaining([
        'message_start',
        'message_end',
        'turn_start',
        'turn_end',
        'agent_start',
        'agent_end',
      ]),
    );
    expect(harness.branchEntries[0]).toMatchObject({
      type: 'custom',
      customType: 'pi-tasks:event',
    });
  });

  it('A02-COMPATIBILITY fails closed before invoking an incompatible runtime', async () => {
    const harness = await createHarness({ incompatibleRuntimeVersion: '0.80.11' });
    await expect(
      harness.invoke('task_plan', TASK_PLAN_INPUT, 'incompatible-runtime'),
    ).rejects.toMatchObject({ code: 'INCOMPATIBLE_RUNTIME' });
    expect(harness.runtimeEventTypes).toHaveLength(0);
    expect(harness.branchEntries).toHaveLength(0);
  });

  it('A02-STATIC-BOUNDARY imports only public package entries and no private task state', () => {
    const directory = path.resolve(
      process.cwd(),
      'src/lib/integrations/pi-agent/__tests__/pi-task-runtime-boundary',
    );
    const source = fs.readdirSync(directory)
      .filter((file) => file.endsWith('.ts') && !file.endsWith('.test.ts'))
      .map((file) => fs.readFileSync(path.join(directory, file), 'utf8'))
      .join('\n');

    expect(source).not.toMatch(/@originos\/pi-tasks\/(?:store|reducer|src)\b/);
    expect(source).not.toMatch(/packages\/pi-tasks\/(?:src|upstream)\//);
    expect(source).not.toMatch(/(?:session|branch).*(?:readFile|JSON\.parse)/i);
    expect(source).toContain("'@originos/pi-agent-adapter/task-runtime'");
    expect(source).toContain("'@originos/pi-tasks'");
  });
});
