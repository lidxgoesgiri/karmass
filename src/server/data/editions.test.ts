import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import type { Edition } from '../../shared/types.ts';
import {
  BALANCE_THRESHOLD,
  PRIOR_VOTES,
  weightDelta,
} from '../../shared/physics.ts';

const editions: Edition[] = JSON.parse(
  readFileSync(new URL('./editions.json', import.meta.url), 'utf8')
);

const MAX_LABEL_CHARS = 25; // 3-column dock at 360px wide wraps to 2 lines max

test('edition bank invariants (PRD §6 curation criteria)', () => {
  assert.ok(
    editions.length >= 24,
    'bank must cover launch through the Dec 16 judging end'
  );
  editions.forEach((ed, i) => {
    const where = `edition #${ed.number}`;
    assert.equal(ed.number, i + 1, `${where}: numbers must be sequential`);
    assert.ok(
      ed.prompt.includes('{A}') && ed.prompt.includes('{B}'),
      `${where}: slots`
    );
    assert.equal(ed.options.length, 6, `${where}: 6 options`);
    assert.equal(
      new Set(ed.options.map((o) => o.id)).size,
      6,
      `${where}: unique ids`
    );
    assert.equal(
      new Set(ed.options.map((o) => o.label)).size,
      6,
      `${where}: unique labels`
    );
    const seeds = ed.options.map((o) => o.seedVotes);
    assert.equal(
      seeds.reduce((a, b) => a + b, 0),
      PRIOR_VOTES,
      `${where}: seeds sum`
    );
    assert.ok(
      Math.min(...seeds) >= 7 && Math.max(...seeds) <= 28,
      `${where}: 7-28% spread`
    );
    ed.options.forEach((o) =>
      assert.ok(
        o.label.length <= MAX_LABEL_CHARS,
        `${where}: label too long "${o.label}"`
      )
    );
    assert.ok(
      balancedPairs(seeds, BALANCE_THRESHOLD) >= 2,
      `${where}: needs 2+ balanced pairs`
    );
  });
});

// Difficulty report: share of the 15 possible pairs that win on seeds alone, per threshold.
test('difficulty report', () => {
  for (const t of [8, 5, 4, 3]) {
    const ratios = editions.map(
      (ed) =>
        balancedPairs(
          ed.options.map((o) => o.seedVotes),
          t
        ) / 15
    );
    const avg = ratios.reduce((a, b) => a + b, 0) / ratios.length;
    console.log(
      `threshold Δ<=${t}: avg random-pair win ${(avg * 100).toFixed(0)}%`
    );
  }
});

function balancedPairs(seeds: number[], threshold: number): number {
  let n = 0;
  for (let i = 0; i < seeds.length; i++)
    for (let j = i + 1; j < seeds.length; j++)
      if (weightDelta(seeds[i]!, seeds[j]!) <= threshold) n++;
  return n;
}
