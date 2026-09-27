import type { JevChoiceAnswer, JevDecisionAnswer, PerceptionDecisionCandidate } from '../../../types/perception';

export type DecisionPolicyResult =
  | { action: 'pending'; reason: 'JEV_INVALID_RESPONSE' | 'TARGET_AMBIGUOUS' | 'HITL_REQUIRED' | 'NOTIFY_USER' | 'USER_TARGET_SELECTION_REQUIRED' }
  | { action: 'ignore'; selectedKey: 'ignore' }
  | { action: 'dispatch'; selectedKey: string; candidate: Extract<PerceptionDecisionCandidate, { action: 'dispatch' }> };

export function evaluateDecisionPolicy(
  answer: JevDecisionAnswer | undefined,
  candidates: readonly PerceptionDecisionCandidate[],
  ruleRequiresHitl: boolean,
  forceUserAttention = false,
): DecisionPolicyResult {
  const confidence = answer?.routeTarget?.confidence;
  const needsHitl = answer?.needsHitl;
  const selected = answer && candidates.find((candidate) => candidate.key === answer.routeTarget.choice);
  const parallelDecision = answer?.needsUserAttention !== undefined || answer?.deliveryMode !== undefined;
  if (parallelDecision) {
    if (!validUnit(answer?.needsUserAttention) || !validChoice(answer?.deliveryMode, ['notify_user', 'invoke_target'])) {
      return { action: 'pending', reason: 'JEV_INVALID_RESPONSE' };
    }
    if (answer.needsUserAttention < 0.5 && !forceUserAttention) return { action: 'ignore', selectedKey: 'ignore' };
  }
  const routeCandidates = parallelDecision
    ? candidates.filter((candidate) => candidate.action === 'dispatch' || candidate.action === 'ask_user_to_choose_target')
    : candidates;
  if (!selected || !validUnit(confidence) || !validUnit(needsHitl) || !validDistribution(answer?.routeTarget?.probabilities, routeCandidates)) {
    return { action: 'pending', reason: 'JEV_INVALID_RESPONSE' };
  }
  if (ruleRequiresHitl || needsHitl! >= 0.5) return { action: 'pending', reason: 'HITL_REQUIRED' };
  if (selected.action === 'ignore') return { action: 'ignore', selectedKey: 'ignore' };
  if (selected.action === 'notify_user') return { action: 'pending', reason: 'NOTIFY_USER' };
  if (selected.action === 'ask_user_to_choose_target') return { action: 'pending', reason: 'USER_TARGET_SELECTION_REQUIRED' };
  if (!hasClearWinner(answer!.routeTarget.probabilities, routeCandidates)) return { action: 'pending', reason: 'TARGET_AMBIGUOUS' };
  if (parallelDecision && answer!.deliveryMode?.choice === 'notify_user') return { action: 'pending', reason: 'NOTIFY_USER' };
  return { action: 'dispatch', selectedKey: selected.key, candidate: selected };
}

function hasClearWinner(probabilities: Record<string, number>, candidates: readonly Pick<PerceptionDecisionCandidate, 'key'>[]): boolean {
  const values = candidates.map(({ key }) => probabilities[key] ?? 0).sort((left, right) => right - left);
  return (values[0] ?? 0) - (values[1] ?? 0) > 0.5;
}

function validChoice(answer: JevDecisionAnswer['deliveryMode'], keys: readonly string[]): answer is JevDecisionAnswer['deliveryMode'] & JevChoiceAnswer {
  return Boolean(answer && keys.includes(answer.choice) && validUnit(answer.confidence) && validDistribution(answer.probabilities, keys.map((key) => ({ key }))));
}

function validUnit(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1;
}

function validDistribution(probabilities: Record<string, number> | undefined, candidates: readonly Pick<PerceptionDecisionCandidate, 'key'>[]): boolean {
  if (!probabilities) return false;
  const candidateKeys = new Set(candidates.map(({ key }) => key));
  if (Object.keys(probabilities).some((key) => !candidateKeys.has(key))) return false;
  if (candidates.some(({ key }) => probabilities[key] !== undefined && !validUnit(probabilities[key]))) return false;
  return Math.abs(candidates.reduce((sum, { key }) => sum + (probabilities[key] ?? 0), 0) - 1) <= 0.001;
}
