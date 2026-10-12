/**
 * API Route: Delete Domain
 * DELETE /api/ontology-data/domains/[id]?ontologyId=xxx
 *
 * ONT9-T1-D: legacy 写通道已停用，DELETE 统一结构化拒绝。
 */

import { canonicalEditUnavailable } from '../../_shared';

export async function DELETE(): Promise<ReturnType<typeof canonicalEditUnavailable>> {
  return canonicalEditUnavailable();
}
