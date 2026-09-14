import {
  abortSession,
  createSession,
  executeSession,
  getSession,
  sendMessageToSupervisor,
  subscribeToRuntimeEvents,
} from '../facade';
import type { RuntimeEvent } from '../session/types';
import type { CollaborationChannelBackendPort, CollaborationChannelEvent } from './channel-runtime-adapter';

export interface CollaborationFacadePort {
  getSession(id: string): Promise<{ id: string; projectId: string; status: string } | null>;
  createSession(input: { projectId: string }): Promise<{ id: string; projectId: string; status: string }>;
  executeSession(id: string): Promise<{ status: string; result: unknown }>;
  subscribe(sessionId: string, listener: (event: CollaborationChannelEvent) => void): () => void;
  send(sessionId: string, message: string): Promise<{ success: boolean; error?: string }>;
  abort(sessionId: string): Promise<void>;
}

export function createFacadeCollaborationChannelBackend(facade: CollaborationFacadePort): CollaborationChannelBackendPort {
  return {
    resolveSession: async (input) => {
      if (input.target.kind !== 'project-multi-agent') throw new Error('CHANNEL_COLLABORATION_TARGET_INVALID');
      if (input.sessionId) {
        const existing = await facade.getSession(input.sessionId);
        if (!existing || normalizeProjectId(existing.projectId) !== normalizeProjectId(input.target.projectId)) {
          throw new Error('CHANNEL_COLLABORATION_SESSION_MISMATCH');
        }
        if (existing.status === 'created') await facade.executeSession(existing.id);
        return existing.id;
      }
      const created = await facade.createSession({ projectId: input.target.projectId });
      await facade.executeSession(created.id);
      return created.id;
    },
    subscribe: (sessionId, listener) => facade.subscribe(sessionId, (event) => { void listener(event); }),
    send: async (sessionId, message, attachmentRefs) => facade.send(sessionId, appendAttachmentRefs(message, attachmentRefs)),
    abort: (sessionId) => facade.abort(sessionId),
  };
}

export const facadeCollaborationChannelBackend = createFacadeCollaborationChannelBackend({
  getSession,
  createSession,
  executeSession,
  subscribe: (sessionId, listener) => subscribeToRuntimeEvents(sessionId, (event: RuntimeEvent) => listener(event)),
  send: sendMessageToSupervisor,
  abort: abortSession,
});

function appendAttachmentRefs(message: string, attachmentRefs: readonly string[]): string {
  if (attachmentRefs.length === 0) return message;
  return `${message}\n\nAttachments:\n${attachmentRefs.map((ref) => `- ${ref}`).join('\n')}`;
}

function normalizeProjectId(projectId: string): string {
  return projectId.startsWith('proj-') ? projectId : `proj-${projectId}`;
}
