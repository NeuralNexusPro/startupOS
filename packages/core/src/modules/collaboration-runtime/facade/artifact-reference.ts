import path from 'node:path';

const ARTIFACT_PROTOCOL = 'artifact:';
const ARTIFACT_HOST = 'collaboration';
const IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9._@:-]*$/;

export function assertCollaborationArtifactIdentifier(value: string, field: string): void {
  if (!IDENTIFIER.test(value) || value.includes('..')) {
    throw new TypeError(`Invalid ${field}: ${value}`);
  }
}

export function collaborationArtifactPath(
  dataRoot: string,
  projectId: string,
  runId: string,
  workItemId: string,
  attemptId: string,
): string {
  for (const [field, value] of Object.entries({ projectId, runId, workItemId, attemptId })) {
    assertCollaborationArtifactIdentifier(value, field);
  }
  const segment = (value: string): string => process.platform === 'win32'
    ? value.replace(/:/g, '%3A')
    : value;
  const pathApi = process.platform === 'win32' ? path.win32 : path;
  const filePath = pathApi.join(
    dataRoot,
    'projects',
    segment(projectId),
    'collaboration-artifacts',
    segment(runId),
    segment(workItemId),
    `${segment(attemptId)}.json`,
  );
  return process.platform === 'win32' ? pathApi.toNamespacedPath(filePath) : filePath;
}

export function createCollaborationArtifactRef(
  projectId: string,
  runId: string,
  workItemId: string,
  attemptId: string,
): string {
  return `${ARTIFACT_PROTOCOL}//${ARTIFACT_HOST}/${[
    projectId,
    runId,
    workItemId,
    attemptId,
  ].map(encodeURIComponent).join('/')}`;
}

export function parseCollaborationArtifactRef(dataRoot: string, ref: string): string {
  const parsed = new URL(ref);
  if (parsed.protocol !== ARTIFACT_PROTOCOL || parsed.hostname !== ARTIFACT_HOST) {
    throw new TypeError('Unsupported collaboration artifact reference');
  }
  const segments = parsed.pathname.split('/').filter(Boolean).map(decodeURIComponent);
  if (segments.length !== 4) {
    throw new TypeError('Invalid collaboration artifact reference');
  }
  const [projectId, runId, workItemId, attemptId] = segments;
  return collaborationArtifactPath(dataRoot, projectId!, runId!, workItemId!, attemptId!);
}
