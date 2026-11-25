import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BANK_SIZE, editionFor, postTitle, publicEdition } from './editions.ts';
import {
  currentPercents,
  evaluateDrop,
  finalize,
  flairText,
  inLiveGrace,
  leaderboardScore,
  nextStreak,
  nextUtcMidnight,
  parseSession,
  pickPractice,
  practiceCandidates,
  shareText,
  validateDrop,
} from './game.ts';
import type { Session } from '../../shared/types.ts';

const ed1 = editionFor(1);
const empty: Session = { vote: null, attempts: [], final: null, shared: false };

test('public edition hides seeds and shuffles display order deterministically', () => {
  const pub = publicEdition(1, '2026-12-01');
  assert.equal(JSON.stringify(pub).includes('seedVotes'), false);
  assert.deepEqual(pub, publicEdition(1, '2026-12-01'));
  assert.notDeepEqual(
    pub.options.map((o) => o.id),
    ed1.options.map((o) => o.id),
    'edition #1 is authored heaviest-first; display must not mirror it'
  );
  assert.equal(new Set(pub.options.map((o) => o.id)).size, 6);
});

test('edition numbers cycle through the bank', () => {
  assert.equal(editionFor(BANK_SIZE + 1).prompt, ed1.prompt);
  assert.equal(editionFor(BANK_SIZE + 1).number, BANK_SIZE + 1);
  assert.match(postTitle(1), /^KARMASS #001: .*___ and ___\.$/);
});

test('percents blend seeds with live votes', () => {
  const seeds = currentPercents(ed1, {});
  assert.equal(seeds.o1, 25);
  const shifted = currentPercents(ed1, { o6: '100' });
  assert.ok(shifted.o6! > 50);
});

test('drop validation guards the trust boundary', () => {
  assert.equal(
    validateDrop(ed1, empty, 'o1', 'o1', false),
    'Pick two different word blocks.'
  );
  assert.equal(
    validateDrop(ed1, empty, 'o1', 'x', false),
    'Unknown word block.'
  );
  assert.equal(
    validateDrop(ed1, empty, 'o1', 'o2', true),
    'Cast your vote first.'
  );
  assert.equal(
    validateDrop(ed1, { ...empty, vote: 'o3' }, 'o1', 'o2', true),
    null
  );
  const full = {
    ...empty,
    attempts: [1, 2, 3].map(() => evaluateDrop({}, 'o1', 'o2')),
  };
  assert.equal(validateDrop(ed1, full, 'o1', 'o2', false), 'No attempts left.');
});

test('evaluate + finalize: win, retry, and ratio on the last attempt', () => {
  const pct = currentPercents(ed1, {});
  const win = evaluateDrop(pct, 'o1', 'o2'); // 25 vs 21
  assert.equal(win.delta, 4);
  assert.equal(win.balanced, true);
  assert.equal(finalize(win, 1, pct, 0, 1)?.won, true);
  const tip = evaluateDrop(pct, 'o1', 'o6'); // 25 vs 7
  assert.equal(tip.balanced, false);
  assert.equal(finalize(tip, 2, pct, 0, 1), null);
  const ratio = finalize(tip, 3, pct, 0, 1);
  assert.equal(ratio?.won, false);
  assert.equal(ratio?.score, null);
});

test('parseSession reads the Redis hash layout', () => {
  const a = evaluateDrop({ o1: 25, o2: 21 }, 'o1', 'o2');
  const s = parseSession({ vote: 'o4', a1: JSON.stringify(a), shared: '1' });
  assert.equal(s.vote, 'o4');
  assert.deepEqual(s.attempts, [a]);
  assert.equal(s.shared, true);
  assert.equal(s.final, null);
});

test('streaks count consecutive UTC days', () => {
  const d1 = nextStreak(null, '2026-12-01');
  assert.deepEqual(d1, { streak: 1, best: 1, last: '2026-12-01' });
  const d2 = nextStreak(d1, '2026-12-02');
  assert.equal(d2.streak, 2);
  assert.equal(nextStreak(d2, '2026-12-02'), d2);
  const gap = nextStreak(d2, '2026-12-05');
  assert.deepEqual(gap, { streak: 1, best: 2, last: '2026-12-05' });
  assert.equal(flairText(1), 'Balanced Rookie');
  assert.equal(flairText(4), '4-Day Balanced');
  assert.equal(flairText(7), 'Hivemind Whisperer');
});

test('leaderboard tiebreak prefers earlier finishes without crossing points', () => {
  const early = leaderboardScore(1000, 1_800_000_000_000);
  const late = leaderboardScore(1000, 1_800_000_500_000);
  assert.ok(early > late);
  assert.ok(late > leaderboardScore(999, 0) - 1 && Math.floor(late) === 1000);
});

test('share text is spoiler-free', () => {
  const pct = currentPercents(ed1, {});
  const attempts = [
    evaluateDrop(pct, 'o1', 'o6'),
    evaluateDrop(pct, 'o3', 'o4'),
  ];
  const text = shareText(
    1,
    { ...empty, attempts, final: finalize(attempts[1]!, 2, pct, 3, 0) },
    1,
    3
  );
  assert.match(text, /KARMASS #001/);
  assert.match(text, /Drop 2: BALANCED! \(Δ 2\)/);
  for (const o of ed1.options) assert.equal(text.includes(o.label), false);
});

test('next UTC midnight', () => {
  assert.equal(
    nextUtcMidnight(Date.parse('2026-12-01T13:00:00Z')),
    Date.parse('2026-12-02T00:00:00Z')
  );
});

test('practice pool: finished editions + practice bank, no immediate repeat', () => {
  const rows = [
    { number: 3, date: '2026-12-03' },
    { number: 2, date: '2026-12-02' },
    { number: 1, date: '2026-12-01' },
  ];
  const bank = [1001, 1002];
  assert.deepEqual(
    practiceCandidates(rows, Date.parse('2026-12-03T12:00:00Z'), bank),
    [2, 1, 1001, 1002]
  );
  assert.deepEqual(
    practiceCandidates([rows[0]!], Date.parse('2026-12-03T12:00:00Z'), bank),
    bank,
    'day one: bank only'
  );
  const first = () => 0;
  assert.equal(pickPractice([2, 1001], 2, first), 1001);
  assert.equal(pickPractice([1001], 1001, first), 1001);
  assert.equal(pickPractice([], 0, first), null);
  assert.equal(editionFor(1001).number, 1001);
  assert.notEqual(editionFor(1001).prompt, editionFor(1).prompt);
});

test('live grace: only the first hours after UTC midnight, only for yesterday', () => {
  const at = (iso: string) => Date.parse(iso);
  assert.equal(inLiveGrace('2026-12-01', at('2026-12-02T01:30:00Z')), true);
  assert.equal(inLiveGrace('2026-12-01', at('2026-12-02T02:30:00Z')), false);
  assert.equal(inLiveGrace('2026-11-30', at('2026-12-02T01:00:00Z')), false);
  assert.equal(inLiveGrace('2026-12-02', at('2026-12-02T01:00:00Z')), false);
});

test('practice skips yesterday while its live grace window is open', () => {
  const rows = [
    { number: 2, date: '2026-12-02' },
    { number: 1, date: '2026-12-01' },
  ];
  const inGrace = Date.parse('2026-12-03T00:30:00Z');
  const afterGrace = Date.parse('2026-12-03T03:00:00Z');
  assert.deepEqual(practiceCandidates(rows, inGrace, []), [1]);
  assert.deepEqual(practiceCandidates(rows, afterGrace, []), [2, 1]);
});
