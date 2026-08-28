export interface RetryPolicyOptions {
  baseDelayMs?: number;
  maxDelayMs?: number;
  jitterRatio?: number;
  random?: () => number;
}

export function computeRetryDelayMs(attempt: number, options: RetryPolicyOptions = {}): number {
  if (!Number.isSafeInteger(attempt) || attempt < 1) throw new Error('Retry attempt must be a positive integer');
  const base = options.baseDelayMs ?? 1_000;
  const maximum = options.maxDelayMs ?? 5 * 60_000;
  const ratio = options.jitterRatio ?? 0.2;
  if (base < 1 || maximum < base || ratio < 0 || ratio > 1) throw new Error('Invalid retry policy');
  const bounded = Math.min(maximum, base * (2 ** (attempt - 1)));
  const random = options.random?.() ?? Math.random();
  const jitter = bounded * ratio * ((Math.max(0, Math.min(1, random)) * 2) - 1);
  return Math.min(maximum, Math.max(1, Math.round(bounded + jitter)));
}
