import type { AgentTaskRuntimeSnapshotV1 } from '@originos/core/lib/integrations/pi-agent';

export function shouldShowAgentTaskPanel(
  snapshot: AgentTaskRuntimeSnapshotV1 | null,
  hasActiveTask: boolean,
): boolean {
  return Boolean(snapshot && hasActiveTask);
}
