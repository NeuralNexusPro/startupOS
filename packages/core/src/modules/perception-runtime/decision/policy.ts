import type { JevDecisionAnswer, PerceptionDecisionCandidate } from '../../../types/perception';

export const JEV_AUTO_THRESHOLD = 0.8 as const;

export type DecisionPolicyResult =
  | { action: 'pending'; reason: 'JEV_INVALID_RESPONSE' | 'LOW_CONFIDENCE' | 'HITL_REQUIRED' | 'NOTIFY_USER' }
  | { action: 'ignore'; selectedKey: 'ignore' }
  | { action: 'dispatch'; selectedKey: string; candidate: Extract<PerceptionDecisionCandidate, { action: 'dispatch' }> };

export function evaluateDecisionPolicy(
  answer: JevDecisionAnswer | undefined,
  candidates: readonly PerceptionDecisionCandidate[],
  ruleRequiresHitl: boolean,
): DecisionPolicyResult {
  const confidence = answer?.routeTarget?.confidence;
  const needsHitl = answer?.needsHitl;
  const selected = answer && candidates.find((candidate) => candidate.key === answer.routeTarget.choice);
  if (!selected || !validUnit(confidence) || !validUnit(needsHitl) || !validDistribution(answer?.routeTarget?.probabilities, candidates)) {
    return { action: 'pending', reason: 'JEV_INVALID_RESPONSE' };
  }
  if (ruleRequiresHitl || needsHitl! >= 0.5) return { action: 'pending', reason: 'HITL_REQUIRED' };
  if (confidence! <= JEV_AUTO_THRESHOLD) return { action: 'pending', reason: 'LOW_CONFIDENCE' };
  if (selected.action === 'ignore') return { action: 'ignore', selectedKey: 'ignore' };
  if (selected.action === 'notify_user') return { action: 'pending', reason: 'NOTIFY_USER' };
  return { action: 'dispatch', selectedKey: selected.key, candidate: selected };
}

function validUnit(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1;
}

function validDistribution(probabilities: Record<string, number> | undefined, candidates: readonly PerceptionDecisionCandidate[]): boolean {
  if (!probabilities || Object.keys(probabilities).length !== candidates.length) return false;
  if (candidates.some(({ key }) => !validUnit(probabilities[key]))) return false;
  return Math.abs(Object.values(probabilities).reduce((sum, value) => sum + value, 0) - 1) <= 0.001;
}
