import type {
  SaveSolutionOutputAcceptanceInput,
  SolutionOutputAcceptanceSnapshot,
  SolutionVersionRef,
} from '@originos/core/lib/features/solution';
import {
  getIpcRenderer,
  IPC_CHANNELS,
  isElectron,
  type IpcResponse,
} from '@originos/core/lib/integrations/electron';

async function readResponse(
  response: Response
): Promise<IpcResponse<SolutionOutputAcceptanceSnapshot>> {
  return (await response.json()) as IpcResponse<SolutionOutputAcceptanceSnapshot>;
}

export async function getSolutionOutputAcceptance(
  input: SolutionVersionRef
): Promise<IpcResponse<SolutionOutputAcceptanceSnapshot>> {
  if (isElectron()) {
    return getIpcRenderer().invoke<IpcResponse<SolutionOutputAcceptanceSnapshot>>(
      IPC_CHANNELS.PROJECT_SOLUTION_ACCEPTANCE_GET,
      input
    );
  }
  const query = new URLSearchParams({ solutionId: input.solutionId });
  return readResponse(
    await fetch(
      `/api/projects/${encodeURIComponent(input.projectId)}/solutions/${encodeURIComponent(input.solutionVersion)}/acceptance?${query.toString()}`
    )
  );
}

export async function saveSolutionOutputAcceptance(
  input: SaveSolutionOutputAcceptanceInput
): Promise<IpcResponse<SolutionOutputAcceptanceSnapshot>> {
  if (isElectron()) {
    return getIpcRenderer().invoke<IpcResponse<SolutionOutputAcceptanceSnapshot>>(
      IPC_CHANNELS.PROJECT_SOLUTION_ACCEPTANCE_SAVE,
      input
    );
  }
  return readResponse(
    await fetch(
      `/api/projects/${encodeURIComponent(input.projectId)}/solutions/${encodeURIComponent(input.solutionVersion)}/acceptance`,
      {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ solutionId: input.solutionId, nodes: input.nodes }),
      }
    )
  );
}
