export const TASK_EVENT_CUSTOM_TYPE = "pi-tasks:event";
export const TASK_SNAPSHOT_CUSTOM_TYPE = "pi-tasks:snapshot";
export function createEmptyState() {
    return { tasks: {}, events: [], warnings: [] };
}
