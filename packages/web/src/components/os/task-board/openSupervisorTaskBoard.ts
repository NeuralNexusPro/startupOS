import { AppWindowManager } from '@/services/AppWindowManager';

import { SupervisorTaskBoardWindow } from './SupervisorTaskBoardWindow';

export function openSupervisorTaskBoard(projectId?: string, projectName?: string): void {
  const scoped = Boolean(projectId);
  const windowId = scoped ? `supervisor-task-board-${projectId}` : 'supervisor-task-board';
  const title = scoped && projectName ? `${projectName} · 任务看板` : '任务看板';
  AppWindowManager.getInstance().openComponentWindow(
    windowId,
    title,
    SupervisorTaskBoardWindow,
    { initialProjectId: projectId, initialProjectName: projectName },
    {
      position: { width: 1440, height: 860 },
      constraints: { minWidth: 1000, minHeight: 620 },
      metadata: {
        entryType: 'supervisor-task-board',
        entryId: projectId ?? 'supervisor-task-board',
        sessionId: windowId,
        ...(projectId ? { projectId } : {}),
      },
    },
  );
}
