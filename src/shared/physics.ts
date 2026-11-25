import type { Attempt } from './types';

// Single source of truth for balance rules, shared by server verdicts and client visuals.
// Tuned per audit (2026-11-25): PRD's Δ≤8 let ~56% of random pairs win on the first try; Δ≤4 → ~31%.

export const BALANCE_THRESHOLD = 4; // max |P_A - P_B| in percentage points that counts as balanced
export const MAX_ATTEMPTS = 3;
export const PRIOR_VOTES = 100; // virtual seed votes per edition (Bayesian prior)
export const DEG_PER_POINT = 2; // visual tilt per percentage point → balanced zone is ±8°
export const MAX_TILT_DEG = 25;
// Practice-only prompts use edition numbers above this (daily numbers never get there).
export const PRACTICE_BASE = 1000; // visual clamp for a fully tipped plank
export const BALANCED_ZONE_DEG = BALANCE_THRESHOLD * DEG_PER_POINT;

export type Tier = 'perfect' | 'solid' | 'close';

export const massFromPercent = (percent: number): number => 2 + 0.12 * percent;

export const weightDelta = (a: number, b: number): number => Math.abs(a - b);

export const isBalanced = (delta: number): boolean =>
  delta <= BALANCE_THRESHOLD;

// Positive = left side heavier. The client maps this to a counter-clockwise plank rotation.
export const tiltDegrees = (left: number, right: number): number =>
  Math.max(
    -MAX_TILT_DEG,
    Math.min(MAX_TILT_DEG, (left - right) * DEG_PER_POINT)
  );

export const tier = (delta: number): Tier | null =>
  delta <= 1
    ? 'perfect'
    : delta <= 3
      ? 'solid'
      : delta <= BALANCE_THRESHOLD
        ? 'close'
        : null;

export const TIER_LABEL: Record<Tier, string> = {
  perfect: 'Perfect Equilibrium',
  solid: 'Solid Balance',
  close: 'Close Call',
};

// Attempts weigh 25 pts each so a first-try win beats a third-try perfect.
export const score = (delta: number, attempt: number): number =>
  (100 - delta) * 10 + (MAX_ATTEMPTS + 1 - attempt) * 25;

// Integer percentages from seed + live votes; integers keep tier ranges unambiguous.
export const blendPercents = (
  seedVotes: number[],
  liveVotes: number[]
): number[] => {
  const totals = seedVotes.map((seed, i) => seed + (liveVotes[i] ?? 0));
  const sum = totals.reduce((a, b) => a + b, 0);
  return totals.map((t) => (sum === 0 ? 0 : Math.round((t / sum) * 100)));
};

// One drop verdict, used by the server for daily/archive play and by the client for practice.
export const evaluateDrop = (
  percents: Record<string, number>,
  left: string,
  right: string
): Attempt => {
  const leftPct = percents[left] ?? 0;
  const rightPct = percents[right] ?? 0;
  const delta = weightDelta(leftPct, rightPct);
  return { left, right, leftPct, rightPct, delta, balanced: isBalanced(delta) };
};
