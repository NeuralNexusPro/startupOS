import { NextRequest, NextResponse } from 'next/server';

import { createOntologyCrossPackageService } from '@/services/ontologyCrossPackageService';

import type {
  OntologyCrossPackageErrorCategory,
  OntologyCrossPackageRequest,
  OntologyCrossPackageResponse,
} from '@originos/core/lib/features/project';

const REQUEST_TYPES = new Set([
  'read_semantic_context',
  'query_facts',
  'query_projection',
  'submit_action',
  'start_bound_task',
  'list_project_tasks',
  'inspect_bound_task',
  'control_bound_task',
  'transition_project_task',
  'list_approved_task_templates',
  'create_approved_project_task',
]);

const TASK_STATUSES = new Set([
  'pending',
  'active',
  'blocked',
  'review',
  'done',
  'cancelled',
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object';
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function isSemanticInputs(value: unknown): boolean {
  return Array.isArray(value) && value.every((entry) => {
    if (!isRecord(entry) || !isNonEmptyString(entry['slotId']) || !isRecord(entry['factRef'])) {
      return false;
    }
    const factRef = entry['factRef'];
    return ['ontologyId', 'ontologyVersion', 'conceptId', 'factTypeId', 'factId', 'factVersion']
      .every((field) => isNonEmptyString(factRef[field]));
  });
}

function isCrossPackageRequest(value: unknown): value is OntologyCrossPackageRequest {
  if (!isRecord(value)) {
    return false;
  }
  const requestId = value['requestId'];
  const projectId = value['projectId'];
  const type = value['type'];
  const expectedRevision = value['expectedRevision'];
  const cursor = value['cursor'];
  const limit = value['limit'];
  const taskId = value['taskId'];
  const targetStatus = value['targetStatus'];
  const expectedLeaseEpoch = value['expectedLeaseEpoch'];
  const reason = value['reason'];
  return value['contractVersion'] === '1'
    && typeof requestId === 'string'
    && requestId.trim().length > 0
    && typeof projectId === 'string'
    && projectId.trim().length > 0
    && typeof type === 'string'
    && REQUEST_TYPES.has(type)
    && (type !== 'list_project_tasks'
      || ((cursor === undefined || (typeof cursor === 'string' && cursor.trim().length > 0))
        && (limit === undefined || (typeof limit === 'number'
          && Number.isSafeInteger(limit) && limit >= 1 && limit <= 50))))
    && ((type !== 'submit_action' && type !== 'control_bound_task'
      && type !== 'transition_project_task')
      || (Number.isSafeInteger(expectedRevision) && (expectedRevision as number) >= 0))
    && (type !== 'transition_project_task'
      || (typeof taskId === 'string'
        && taskId.trim().length > 0
        && typeof targetStatus === 'string'
        && TASK_STATUSES.has(targetStatus)
        && (expectedLeaseEpoch === undefined
          || (Number.isSafeInteger(expectedLeaseEpoch) && (expectedLeaseEpoch as number) >= 0))
        && (reason === undefined || (typeof reason === 'string' && reason.trim().length > 0))))
    && (type !== 'create_approved_project_task'
      || (isNonEmptyString(value['solutionId'])
        && isNonEmptyString(value['solutionVersion'])
        && isNonEmptyString(value['contractId'])
        && typeof value['contractHash'] === 'string'
        && /^sha256:[a-f0-9]{64}$/i.test(value['contractHash'])
        && isNonEmptyString(value['taskTemplateId'])
        && isNonEmptyString(value['objective'])
        && isSemanticInputs(value['semanticInputs'])));
}

function statusForError(category: OntologyCrossPackageErrorCategory): number {
  switch (category) {
    case 'authorization':
      return 403;
    case 'conflict':
      return 409;
    case 'unavailable':
      return 503;
    case 'internal':
      return 500;
    default:
      return 400;
  }
}

function errorResponse(
  requestId: string,
  category: OntologyCrossPackageErrorCategory,
  code: string,
  status: number
): NextResponse {
  const response: OntologyCrossPackageResponse = {
    ok: false,
    requestId,
    error: {
      category,
      code,
      issues: [{ code, message: 'The request was rejected at the transport boundary' }],
      retryable: category === 'unavailable',
      remediation: 'Correct the request or retry with the current references.',
    },
  };
  return NextResponse.json(response, { status });
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const actorId = request.headers.get('x-originos-actor-id')?.trim();
  if (!actorId) {
    return errorResponse('unknown', 'authorization', 'ACTOR_REQUIRED', 401);
  }

  let parsed: unknown;
  try {
    parsed = await request.json();
  } catch {
    return errorResponse('unknown', 'validation', 'INVALID_JSON', 400);
  }
  if (!isCrossPackageRequest(parsed)) {
    return errorResponse('unknown', 'validation', 'INVALID_REQUEST', 400);
  }

  try {
    const response = await createOntologyCrossPackageService().invoke({
      ...parsed,
      actorId,
    });
    return NextResponse.json(response, {
      status: response.ok ? 200 : statusForError(response.error.category),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : '';
    if (message === 'PROJECT_TASK_SOURCE_UNAVAILABLE' || message === 'WORK_ITEM_RECOVERY_UNAVAILABLE') {
      return errorResponse(parsed.requestId, 'unavailable', 'CAPABILITY_NOT_READY', 503);
    }
    return errorResponse(parsed.requestId, 'internal', 'TRANSPORT_INTERNAL_ERROR', 500);
  }
}
