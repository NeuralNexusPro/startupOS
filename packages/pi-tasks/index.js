import { registerTaskCommands } from './src/commands.js';
import {
  ORIGINOS_PI_TASKS_VERSION,
  PI_TASK_EVENT_VERSION,
  PI_TASK_EVENT_V2_SCHEMA,
  PI_TASK_CHECKPOINT_MAX_BYTES,
  PI_TASK_CHECKPOINT_RECEIPT_LIMIT,
  PI_TASK_DIAGNOSTIC_LIMIT,
  PI_TASK_LEGACY_FORCED_COMPLETION_CODE,
  PI_TASK_PUBLIC_API_VERSION,
  PI_TASK_SCHEMA_FINGERPRINT,
  PI_TASK_STATE_EVENT_VERSION,
  PI_TASK_STATE_EVENT_V2_SCHEMA,
  PI_TASKS_UPSTREAM_ENTRY_SHA256,
  PI_TASKS_UPSTREAM_REDUCER_SHA256,
  UPSTREAM_PI_TASKS_VERSION,
} from './src/contracts.js';
import { buildTaskResume } from './src/render.js';
import { requireTaskSessionId, TASK_STATE_EVENT, TASK_WIDGET_ID } from './src/state-events.js';
import { createTaskRuntimeStore, snapshotState } from './src/store.js';
import { registerTaskTools } from './src/tools.js';
import { updateTaskUi } from './src/widget.js';

export {
  ORIGINOS_PI_TASKS_VERSION,
  PI_TASK_EVENT_VERSION,
  PI_TASK_EVENT_V2_SCHEMA,
  PI_TASK_CHECKPOINT_MAX_BYTES,
  PI_TASK_CHECKPOINT_RECEIPT_LIMIT,
  PI_TASK_DIAGNOSTIC_LIMIT,
  PI_TASK_LEGACY_FORCED_COMPLETION_CODE,
  PI_TASK_PUBLIC_API_VERSION,
  PI_TASK_SCHEMA_FINGERPRINT,
  PI_TASK_STATE_EVENT_VERSION,
  PI_TASK_STATE_EVENT_V2_SCHEMA,
  PI_TASKS_UPSTREAM_ENTRY_SHA256,
  PI_TASKS_UPSTREAM_REDUCER_SHA256,
  TASK_STATE_EVENT,
  TASK_WIDGET_ID,
  UPSTREAM_PI_TASKS_VERSION,
};
export { createTaskRuntimeStore, replayBranchEntries, snapshotState } from './src/store.js';

export default function originosPiTasks(pi) {
  const store = createTaskRuntimeStore();
  const replay = (ctx, reason) => {
    const result = store.replay(ctx.sessionManager.getBranch());
    updateTaskUi(pi, ctx, result.state, reason, result.metadata);
    if (result.malformedEvents.length > 0) {
      ctx.ui.notify(
        `pi-tasks skipped ${result.malformedEvents.length} malformed event(s)`,
        'warning',
      );
    }
  };

  pi.on('session_start', async (_event, ctx) => replay(ctx, 'session_start'));
  pi.on('session_tree', async (_event, ctx) => replay(ctx, 'session_tree'));
  pi.on('session_before_compact', async (_event, ctx) => {
    const state = store.getState();
    if (Object.keys(state.tasks).length === 0) return;
    requireTaskSessionId(ctx);
    const createdAt = new Date().toISOString();
    const event = {
      version: 1,
      id: `snapshot-${createdAt}`,
      type: 'task.snapshot',
      taskId: state.activeTaskId ?? 'snapshot',
      createdAt,
      source: 'system',
      state: snapshotState(state),
      resume: buildTaskResume(state),
      reason: 'compaction',
    };
    const next = store.checkpoint(event, {
      appendEntry(customType, data) {
        pi.appendEntry(customType, data);
      },
      getBranch() {
        return ctx.sessionManager.getBranch();
      },
    });
    updateTaskUi(pi, ctx, next.state, 'compaction', next.metadata);
  });

  registerTaskTools(pi, store);
  registerTaskCommands(pi, store);
}
