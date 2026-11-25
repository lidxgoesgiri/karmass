// Pure game rules (no Redis / Reddit I/O) so they can be unit-tested and reused by the local mock.
import type { Attempt, Edition, Final, Session } from '../../shared/types.ts';
import {
  MAX_ATTEMPTS,
  TIER_LABEL,
  blendPercents,
  score,
  tier,
} from '../../shared/physics.ts';

export const DAY_MS = 86_400_000;

export const utcDate = (ms: number): string =>
  new Date(ms).toISOString().slice(0, 10);

export const nextUtcMidnight = (ms: number): number =>
  (Math.floor(ms / DAY_MS) + 1) * DAY_MS;

export const currentPercents = (
  edition: Edition,
  liveVotes: Record<string, string | number>
): Record<string, number> => {
  const pct = blendPercents(
    edition.options.map((o) => o.seedVotes),
    edition.options.map((o) => Number(liveVotes[o.id] ?? 0))
  );
  return Object.fromEntries(edition.options.map((o, i) => [o.id, pct[i] ?? 0]));
};

export const countVotes = (
  liveVotes: Record<string, string | number>
): number =>
  Object.values(liveVotes).reduce<number>((a, v) => a + Number(v), 0);

export const isOption = (edition: Edition, id: unknown): id is string =>
  typeof id === 'string' && edition.options.some((o) => o.id === id);

export const validateDrop = (
  edition: Edition,
  session: Session,
  left: unknown,
  right: unknown,
  needsVote: boolean
): string | null => {
  if (!isOption(edition, left) || !isOption(edition, right))
    return 'Unknown word block.';
  if (left === right) return 'Pick two different word blocks.';
  if (session.final) return 'You already finished this edition.';
  if (session.attempts.length >= MAX_ATTEMPTS) return 'No attempts left.';
  if (needsVote && !session.vote) return 'Cast your vote first.';
  return null;
};

export { evaluateDrop } from '../../shared/physics.ts';

export const finalize = (
  attempt: Attempt,
  attemptNumber: number,
  percents: Record<string, number>,
  voters: number,
  now: number
): Final | null =>
  attempt.balanced || attemptNumber >= MAX_ATTEMPTS
    ? {
        won: attempt.balanced,
        score: attempt.balanced ? score(attempt.delta, attemptNumber) : null,
        percents,
        voters,
        at: now,
      }
    : null;

// Redis hash → Session. Fields: vote, a1..a3 (Attempt JSON), fin (Final JSON), shared.
export const parseSession = (hash: Record<string, string>): Session => {
  const attempts: Attempt[] = [];
  for (let i = 1; i <= MAX_ATTEMPTS; i++) {
    const raw = hash[`a${i}`];
    if (raw) attempts.push(JSON.parse(raw) as Attempt);
  }
  return {
    vote: hash.vote ?? null,
    attempts,
    final: hash.fin ? (JSON.parse(hash.fin) as Final) : null,
    shared: hash.shared === '1',
  };
};

export type Streak = { streak: number; best: number; last: string };

// Streak = consecutive UTC days with a completed live edition (win or loss).
export const nextStreak = (prev: Streak | null, today: string): Streak => {
  if (prev?.last === today) return prev;
  const yesterday = utcDate(Date.parse(`${today}T00:00:00Z`) - DAY_MS);
  const streak = prev?.last === yesterday ? prev.streak + 1 : 1;
  return { streak, best: Math.max(streak, prev?.best ?? 0), last: today };
};

export const flairText = (streak: number): string =>
  streak >= 7
    ? 'Hivemind Whisperer'
    : streak >= 3
      ? `${streak}-Day Balanced`
      : 'Balanced Rookie';

// Leaderboard score with an earlier-finish tiebreak packed into the fraction.
export const leaderboardScore = (points: number, finishedAt: number): number =>
  points + (1 - finishedAt / 1e13);

export const shareText = (
  editionNumber: number,
  session: Session,
  streak: number,
  voters: number
): string => {
  const drops = session.attempts.map((a, i) => {
    if (!a.balanced) return `Drop ${i + 1}: Tipped (Δ ${a.delta})`;
    const t = tier(a.delta);
    return `Drop ${i + 1}: BALANCED! (Δ ${a.delta})${t ? ` — *${TIER_LABEL[t]}*` : ''}`;
  });
  const won = session.final?.won ?? false;
  return [
    `**KARMASS #${String(editionNumber).padStart(3, '0')}**${won ? '' : ' — Ratio’d'}`,
    '',
    ...drops.map((d) => `${d}  `),
    '',
    `Streak: ${streak} ${streak === 1 ? 'day' : 'days'} | Weighed alongside ${voters} ${voters === 1 ? 'Redditor' : 'Redditors'}`,
    '',
    '*Think you can read today’s Hivemind?*',
  ].join('\n');
};

// Practice draws from editions whose live day is over (never today's or future prompts),
// avoiding an immediate repeat when there is more than one to choose from.
export const pickPractice = <T extends { number: number; date: string }>(
  released: T[],
  today: string,
  exclude: number,
  rand: () => number
): T | null => {
  const past = released.filter((r) => r.date !== '' && r.date < today);
  const pool = past.length > 1 ? past.filter((r) => r.number !== exclude) : past;
  return pool[Math.floor(rand() * pool.length)] ?? null;
};
