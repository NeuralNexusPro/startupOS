/**
 * Instance Relations API
 * GET  /api/ontology-data/relations/instances?ontologyId=xxx — 列表
 * POST /api/ontology-data/relations/instances?ontologyId=xxx — 创建
 * DELETE /api/ontology-data/relations/instances?ontologyId=xxx — 删除（body 传 relationId）
 *
 * ONT9-T1-D: legacy 写通道已停用，POST/DELETE 统一结构化拒绝（GET 只读行为保持）。
 */

import { existsSync } from 'fs';
import fs from 'fs/promises';

import { NextRequest, NextResponse } from 'next/server';

import { instanceRelationsPath, ontologyDir } from '@originos/core/lib/features/ontology-data-store/config';
import {
  getAllowedRelationTypes,
  type ConceptRelation,
  type InstanceRelation,
} from '@originos/core/lib/features/ontology-data-store/relation-validator';

import { canonicalEditUnavailable } from '../../_shared';

import type { ApiResponse } from '@originos/core/types';

function getRelationsPath(ontologyId: string): string {
  return instanceRelationsPath(ontologyId);
}

function getOntologyPath(ontologyId: string): string {
  return `${ontologyDir(ontologyId)}/ontology.json`;
}

async function readInstanceRelations(ontologyId: string): Promise<InstanceRelation[]> {
  const filePath = getRelationsPath(ontologyId);
  if (!existsSync(filePath)) return [];
  const content = await fs.readFile(filePath, 'utf-8');
  const data = JSON.parse(content);
  return data.relations ?? [];
}

async function loadOntologyConcepts(ontologyId: string): Promise<ConceptRelation[]> {
  const filePath = getOntologyPath(ontologyId);
  if (!existsSync(filePath)) return [];
  const content = await fs.readFile(filePath, 'utf-8');
  const ontology = JSON.parse(content);
  return (ontology.relations ?? []).map((r: any) => ({
    id: r.id,
    sourceId: r.sourceId,
    targetId: r.targetId,
    type: r.type,
    cardinality: r.cardinality || 'N:M',
  })) as ConceptRelation[];
}

export async function GET(request: NextRequest): Promise<NextResponse<ApiResponse<unknown>>> {
  try {
    const ontologyId = request.nextUrl.searchParams.get('ontologyId');
    if (!ontologyId) {
      return NextResponse.json<ApiResponse<unknown>>(
        { success: false, error: { code: 'INVALID_REQUEST', message: 'ontologyId is required' }, timestamp: new Date().toISOString() },
        { status: 400 }
      );
    }

    const relations = await readInstanceRelations(ontologyId);
    const constraints = await loadOntologyConcepts(ontologyId);
    const allowedTypes = getAllowedRelationTypes(
      request.nextUrl.searchParams.get('sourceConceptId') || '',
      request.nextUrl.searchParams.get('targetConceptId') || '',
      constraints
    );

    return NextResponse.json<ApiResponse<{ relations: InstanceRelation[]; constraints: ConceptRelation[]; allowedTypes: string[] }>>({
      success: true,
      data: { relations, constraints, allowedTypes },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    return NextResponse.json<ApiResponse<unknown>>(
      { success: false, error: { code: 'INTERNAL_ERROR', message: error instanceof Error ? error.message : 'Failed to get relations' }, timestamp: new Date().toISOString() },
      { status: 500 }
    );
  }
}

export async function POST(): Promise<ReturnType<typeof canonicalEditUnavailable>> {
  return canonicalEditUnavailable();
}

export async function DELETE(): Promise<ReturnType<typeof canonicalEditUnavailable>> {
  return canonicalEditUnavailable();
}
