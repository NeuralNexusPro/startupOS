import { NextRequest, NextResponse } from 'next/server';

import {
  CanonicalOntologyStore,
  CanonicalOntologyAuthoringService,
  parseCanonicalOntologyAuthoringCommand,
  type CanonicalOntology,
  type CanonicalOntologyAuthoringResult,
} from '@originos/core/lib/features/ontology';
import {
  ProjectOntologyEntryService,
} from '@originos/core/lib/features/project';

const PROJECT_ID = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;

function response(data: unknown, status = 200): NextResponse {
  return NextResponse.json({
    success: status < 400,
    ...(status < 400 ? { data } : { error: data }),
    timestamp: new Date().toISOString(),
  }, { status });
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { id: projectId } = await params;
  if (!PROJECT_ID.test(projectId) || projectId.includes('..')) {
    return response({ code: 'INVALID_PROJECT_ID', message: '项目标识无效。' }, 400);
  }

  let envelope: unknown;
  try {
    envelope = await request.json();
  } catch {
    return response({ code: 'INVALID_JSON', message: '请求正文不是有效 JSON。' }, 400);
  }

  const parsed = parseCanonicalOntologyAuthoringCommand(envelope);
  if (!parsed.ok) {
    return response({
      code: 'INVALID_AUTHORING_COMMAND',
      message: '本体编辑命令无效。',
      details: parsed.issues,
    }, 400);
  }
  if (parsed.command.projectId !== projectId) {
    return response({
      code: 'PROJECT_ID_MISMATCH',
      message: '路径中的项目与编辑命令不一致。',
      details: [{
        code: 'PROJECT_ID_MISMATCH',
        message: 'projectId must match the route project.',
        path: 'projectId',
        severity: 'error',
      }],
    }, 400);
  }

  try {
    const result: CanonicalOntologyAuthoringResult =
      await new CanonicalOntologyAuthoringService().execute(parsed.command);
    return response(result);
  } catch (error) {
    console.error('[project canonical ontology] authoring failed', {
      projectId,
      operationId: parsed.command.operationId,
      name: error instanceof Error ? error.name : 'UnknownError',
    });
    return response({ code: 'ONTOLOGY_AUTHORING_FAILED', message: '无法更新项目本体，请稍后重试。' }, 500);
  }
}

/**
 * Returns the project-bound canonical ontology, or an explicit legacy state.
 * This transport intentionally has no fallback to business-model.json: legacy
 * conversion remains an explicit Core migration operation.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { id: projectId } = await params;
  if (!PROJECT_ID.test(projectId) || projectId.includes('..')) {
    return response({ code: 'INVALID_PROJECT_ID', message: '项目标识无效。' }, 400);
  }

  try {
    const entry = await new ProjectOntologyEntryService().resolveProject(projectId);
    if (entry.kind !== 'canonical') {
      return response({ entry });
    }

    const stored = await new CanonicalOntologyStore().readOntology(projectId);
    if (!stored || stored.data.id !== entry.ontology.ontologyId || stored.data.version !== entry.ontology.ontologyVersion) {
      return response({ entry: { kind: 'not_found' as const } });
    }

    return response({ entry, ontology: stored.data satisfies CanonicalOntology });
  } catch (error) {
    console.error('[project canonical ontology] read failed', {
      projectId,
      name: error instanceof Error ? error.name : 'UnknownError',
    });
    return response({ code: 'ONTOLOGY_READ_FAILED', message: '无法读取项目本体，请稍后重试。' }, 500);
  }
}
