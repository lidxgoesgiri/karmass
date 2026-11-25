import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  BALANCE_THRESHOLD,
  BALANCED_ZONE_DEG,
  blendPercents,
  isBalanced,
  massFromPercent,
  score,
  tier,
  tiltDegrees,
} from './physics.ts';

test('mass formula M = 2 + 0.12P', () => {
  assert.equal(massFromPercent(0), 2);
  assert.equal(massFromPercent(25), 5);
});

test('balance boundary is inclusive and matches the visual zone', () => {
  assert.equal(isBalanced(BALANCE_THRESHOLD), true);
  assert.equal(isBalanced(BALANCE_THRESHOLD + 1), false);
  assert.equal(Math.abs(tiltDegrees(25, 21)), BALANCED_ZONE_DEG);
  assert.ok(Math.abs(tiltDegrees(25, 20)) > BALANCED_ZONE_DEG);
  assert.equal(tiltDegrees(90, 0), 25);
  assert.equal(tiltDegrees(0, 90), -25);
});

test('tiers', () => {
  assert.equal(tier(0), 'perfect');
  assert.equal(tier(1), 'perfect');
  assert.equal(tier(2), 'solid');
  assert.equal(tier(3), 'solid');
  assert.equal(tier(4), 'close');
  assert.equal(tier(5), null);
});

test('score: first-try win beats third-try perfect', () => {
  assert.equal(score(0, 1), 1075);
  assert.ok(score(2, 1) > score(0, 3));
});

test('blend: prior only, then live votes shift weights', () => {
  assert.deepEqual(blendPercents([25, 75], [0, 0]), [25, 75]);
  assert.deepEqual(blendPercents([25, 75], [100, 0]), [63, 38]);
  assert.deepEqual(blendPercents([0, 0], [0, 0]), [0, 0]);
});
