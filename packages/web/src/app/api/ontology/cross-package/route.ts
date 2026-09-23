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
  'inspect_bound_task',
  'control_bound_task',
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object';
}

function isCrossPackageRequest(value: unknown): value is OntologyCrossPackageRequest {
  if (!isRecord(value)) {
    return false;
  }
  const requestId = value['requestId'];
  const projectId = value['projectId'];
  const type = value['type'];
  const expectedRevision = value['expectedRevision'];
  return value['contractVersion'] === '1'
    && typeof requestId === 'string'
    && requestId.trim().length > 0
    && typeof projectId === 'string'
    && projectId.trim().length > 0
    && typeof type === 'string'
    && REQUEST_TYPES.has(type)
    && ((type !== 'submit_action' && type !== 'control_bound_task')
      || (Number.isSafeInteger(expectedRevision) && (expectedRevision as number) >= 0));
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
