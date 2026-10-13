/**
 * API Route: Full Sync from business-model.json → ontology.json
 * POST /api/ontology-data/sync?ontologyId=xxx
 *
 * ONT9-T1-D: legacy 写通道已停用，POST 统一结构化拒绝（原 business-model 同步副作用已移除）。
 */

import { canonicalEditUnavailable } from '../_shared';

export async function POST(): Promise<ReturnType<typeof canonicalEditUnavailable>> {
  return canonicalEditUnavailable();
}
