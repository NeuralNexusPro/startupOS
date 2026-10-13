/**
 * API Route: Create Domain
 * POST /api/ontology-data/domains?ontologyId=xxx
 *
 * ONT9-T1-D: legacy 写通道已停用，写 handler 统一结构化拒绝（GET 只读行为保持）。
 */

import { canonicalEditUnavailable } from '../_shared';

export async function POST(): Promise<ReturnType<typeof canonicalEditUnavailable>> {
  return canonicalEditUnavailable();
}
