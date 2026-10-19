import { NextRequest, NextResponse } from 'next/server';

import { ProjectOntologyEntryService } from '@originos/core/lib/features/project';
import type { LegacyOntologySourceKind } from '@originos/core/lib/features/ontology';

const PROJECT_ID = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;
const SOURCE_KINDS = new Set<LegacyOntologySourceKind>([
  'ontology',
  'ontology-model',
  'business-model',
]);

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

  let body: { confirmed?: unknown; sourceKind?: unknown };
  try {
    body = await request.json() as { confirmed?: unknown; sourceKind?: unknown };
  } catch {
    return response({ code: 'INVALID_JSON', message: '请求正文不是有效 JSON。' }, 400);
  }
  if (typeof body.confirmed !== 'boolean') {
    return response({ code: 'INVALID_REQUEST', message: '必须明确是否确认迁移。' }, 400);
  }
  const sourceKind = typeof body.sourceKind === 'string' && SOURCE_KINDS.has(body.sourceKind as LegacyOntologySourceKind)
    ? body.sourceKind as LegacyOntologySourceKind
    : undefined;
  if (body.confirmed && !sourceKind) {
    return response({ code: 'SOURCE_KIND_REQUIRED', message: '确认迁移时必须使用预览返回的数据来源。' }, 400);
  }

  try {
    const service = new ProjectOntologyEntryService();
    if (!body.confirmed) {
      const preview = await service.previewLegacyOntology(projectId, sourceKind);
      return response({ mode: 'dry-run', ...preview });
    }
    const ontology = await service.migrateAndBindSelectedLegacyOntology(projectId, sourceKind!);
    return response({ mode: 'migrated', ontology });
  } catch (error) {
    console.error('[project ontology migration] failed', {
      projectId,
      sourceKind,
      confirmed: body.confirmed,
      name: error instanceof Error ? error.name : 'UnknownError',
    });
    return response({
      code: 'ONTOLOGY_MIGRATION_FAILED',
      message: error instanceof Error ? error.message : '本体迁移失败，请稍后重试。',
    }, 500);
  }
}
