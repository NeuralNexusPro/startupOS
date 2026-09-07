import type { ExtensionAPI } from './src/pi-types.js';

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
  UPSTREAM_PI_TASKS_VERSION,
} from './src/contracts.js';
export { TASK_STATE_EVENT, TASK_WIDGET_ID } from './src/state-events.js';
export {
  createTaskRuntimeStore,
  replayBranchEntries,
  snapshotState,
} from './src/store.js';

export default function originosPiTasks(pi: ExtensionAPI): void;
