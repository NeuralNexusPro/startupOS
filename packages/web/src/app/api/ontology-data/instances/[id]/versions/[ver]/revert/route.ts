/**
 * Instance Version Revert API
 * POST /api/ontology-data/instances/[id]/versions/[ver]/revert — 回滚到指定版本
 *
 * ONT9-T1-D: legacy 写通道已停用，POST 统一结构化拒绝。
 */

import { canonicalEditUnavailable } from '../../../../../_shared';

export async function POST(): Promise<ReturnType<typeof canonicalEditUnavailable>> {
  return canonicalEditUnavailable();
}
