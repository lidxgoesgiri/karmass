// Route-level tests for the game API: Hono handlers + Redis key logic, with Devvit's
// redis/reddit/context replaced by an in-memory fake.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const m = vi.hoisted(() => {
  const strings = new Map<string, string>();
  const hashes = new Map<string, Map<string, string>>();
  const zsets = new Map<string, Map<string, number>>();
  const hash = (k: string) => hashes.get(k) ?? hashes.set(k, new Map()).get(k)!;
  const zset = (k: string) => zsets.get(k) ?? zsets.set(k, new Map()).get(k)!;
  const sorted = (k: string) =>
    [...zset(k)].map(([member, score]) => ({ member, score })).sort((a, b) => a.score - b.score);

  const redis = {
    get: async (k: string) => strings.get(k),
    incrBy: async (k: string, n: number) => {
      const v = Number(strings.get(k) ?? 0) + n;
      strings.set(k, String(v));
      return v;
    },
    del: async (...keys: string[]) => keys.forEach((k) => (strings.delete(k), hashes.delete(k), zsets.delete(k))),
    expire: async () => {},
    hGet: async (k: string, f: string) => hash(k).get(f),
    hGetAll: async (k: string) => Object.fromEntries(hash(k)),
    hSet: async (k: string, values: Record<string, string>) => {
      Object.entries(values).forEach(([f, v]) => hash(k).set(f, v));
      return Object.keys(values).length;
    },
    hSetNX: async (k: string, f: string, v: string) => (hash(k).has(f) ? 0 : (hash(k).set(f, v), 1)),
    hIncrBy: async (k: string, f: string, n: number) => {
      const v = Number(hash(k).get(f) ?? 0) + n;
      hash(k).set(f, String(v));
      return v;
    },
    hDel: async (k: string, fields: string[]) => fields.filter((f) => hash(k).delete(f)).length,
    hMGet: async (k: string, fields: string[]) => fields.map((f) => hash(k).get(f) ?? null),
    zAdd: async (k: string, ...members: { member: string; score: number }[]) => {
      members.forEach(({ member, score }) => zset(k).set(member, score));
      return members.length;
    },
    zRem: async (k: string, members: string[]) => members.filter((x) => zset(k).delete(x)).length,
    zCard: async (k: string) => zset(k).size,
    zRank: async (k: string, member: string) => {
      const i = sorted(k).findIndex((e) => e.member === member);
      return i < 0 ? undefined : i;
    },
    zRange: async (k: string, start: number, stop: number, opts: { reverse?: boolean }) => {
      const list = opts?.reverse ? sorted(k).reverse() : sorted(k);
      return list.slice(start, stop < 0 ? undefined : stop + 1);
    },
  };

  const reddit = {
    comments: [] as { id: string; text: string; runAs?: string }[],
    flairs: [] as { username: string; text?: string }[],
    submitComment: vi.fn(async (o: { id: string; text: string; runAs?: string }) => {
      reddit.comments.push(o);
      return { id: 't1_new', distinguish: async () => {} };
    }),
    setUserFlair: vi.fn(async (o: { username: string; text?: string }) => void reddit.flairs.push(o)),
    removeUserFlair: vi.fn(async () => {}),
    getSnoovatarUrl: vi.fn(async () => undefined),
    submitCustomPost: vi.fn(async () => ({ id: 't3_new', permalink: '/r/Karmass/comments/new' })),
  };

  const ctx: Record<string, unknown> = {};
  const reset = () => {
    strings.clear();
    hashes.clear();
    zsets.clear();
    reddit.comments.length = 0;
    reddit.flairs.length = 0;
    for (const k of Object.keys(ctx)) delete ctx[k];
    Object.assign(ctx, {
      userId: 't2_alice',
      username: 'alice',
      subredditName: 'Karmass',
      postId: 't3_p1',
      postData: { edition: 1 },
    });
  };
  return { redis, reddit, ctx, reset };
});

vi.mock('@devvit/web/server', () => ({ context: m.ctx, redis: m.redis, reddit: m.reddit }));

import { api } from './api';
import { attachPost, castVote, releaseEdition } from '../services/hivemindRedis';
import { DAY_MS, utcDate } from '../core/game';

const call = async (method: 'GET' | 'POST', path: string, body?: unknown) => {
  const res = await api.request(path, {
    method,
    headers: { 'Content-Type': 'application/json' },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  return { status: res.status, json: await res.json() };
};

const NOW = Date.parse('2026-12-03T12:00:00Z');
const TODAY = utcDate(NOW);
const YESTERDAY = utcDate(NOW - DAY_MS);

beforeEach(async () => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
  m.reset();
  await releaseEdition(1, TODAY);
  await attachPost(1, 't3_p1', 't1_sticky');
});
afterEach(() => vi.useRealTimers());

describe('state', () => {
  it('serves the live edition without leaking seed weights', async () => {
    const { status, json } = await call('GET', '/state');
    expect(status).toBe(200);
    expect(json.mode).toBe('live');
    expect(json.edition.number).toBe(1);
    expect(JSON.stringify(json)).not.toContain('seedVotes');
    expect(json.session.vote).toBeNull();
  });

  it('refuses editions that are not released yet', async () => {
    const { status } = await call('GET', '/state?edition=2');
    expect(status).toBe(404);
  });
});

describe('vote and drop', () => {
  it('requires a vote before dropping, and counts each vote once', async () => {
    expect((await call('POST', '/drop', { edition: 1, left: 'o3', right: 'o4' })).status).toBe(409);
    expect((await call('POST', '/vote', { edition: 1, optionId: 'o1' })).status).toBe(200);
    expect((await call('POST', '/vote', { edition: 1, optionId: 'o2' })).status).toBe(409);
    expect((await call('GET', '/state')).json.voters).toBe(1);
  });

  it('rejects identical or unknown blocks', async () => {
    await call('POST', '/vote', { edition: 1, optionId: 'o1' });
    expect((await call('POST', '/drop', { edition: 1, left: 'o3', right: 'o3' })).status).toBe(409);
    expect((await call('POST', '/drop', { edition: 1, left: 'o3', right: 'zz' })).status).toBe(409);
  });

  it('a balanced drop finishes the run, ranks the player and sets flair', async () => {
    await call('POST', '/vote', { edition: 1, optionId: 'o1' });
    const { status, json } = await call('POST', '/drop', { edition: 1, left: 'o3', right: 'o4' });
    expect(status).toBe(200);
    expect(json.attempt.balanced).toBe(true);
    expect(json.session.final.won).toBe(true);
    expect(json.player.streak).toBe(1);
    const lb = (await call('GET', '/leaderboard?edition=1')).json;
    expect(lb.entries[0].username).toBe('alice');
    expect(m.reddit.flairs.at(-1)).toMatchObject({ username: 'alice', text: 'Balanced Rookie' });
    expect((await call('POST', '/drop', { edition: 1, left: 'o1', right: 'o2' })).status).toBe(409);
  });

  it('three tipped drops end in a ratio with no fourth attempt', async () => {
    await call('POST', '/vote', { edition: 1, optionId: 'o1' });
    for (let i = 0; i < 3; i++)
      expect((await call('POST', '/drop', { edition: 1, left: 'o1', right: 'o6' })).status).toBe(200);
    const s = (await call('GET', '/state')).json.session;
    expect(s.final.won).toBe(false);
    expect(Object.keys(s.final.percents)).toHaveLength(6);
    expect((await call('POST', '/drop', { edition: 1, left: 'o1', right: 'o6' })).status).toBe(409);
    expect((await call('GET', '/leaderboard?edition=1')).json.total).toBe(0);
  });
});

describe('share', () => {
  it('needs a finished run, replies to the sticky as the user, and only once', async () => {
    expect((await call('POST', '/share', { edition: 1 })).status).toBe(409);
    await call('POST', '/vote', { edition: 1, optionId: 'o1' });
    await call('POST', '/drop', { edition: 1, left: 'o3', right: 'o4' });
    expect((await call('POST', '/share', { edition: 1 })).status).toBe(200);
    expect(m.reddit.comments.at(-1)).toMatchObject({ id: 't1_sticky', runAs: 'USER' });
    expect(m.reddit.comments.at(-1)?.text).not.toMatch(/Typing fake notes|Refreshing empty inbox/);
    expect((await call('POST', '/share', { edition: 1 })).status).toBe(409);
  });
});

describe('archive, grace and guests', () => {
  it('past editions are archive: no voting, no ranking', async () => {
    await releaseEdition(2, utcDate(NOW - 3 * DAY_MS));
    const { json } = await call('GET', '/state?edition=2');
    expect(json.mode).toBe('archive');
    expect((await call('POST', '/vote', { edition: 2, optionId: 'o1' })).status).toBe(409);
    expect((await call('POST', '/drop', { edition: 2, left: 'o1', right: 'o2' })).status).toBe(200);
  });

  it('a run started yesterday stays live shortly after midnight', async () => {
    const justAfterMidnight = Date.parse(`${TODAY}T00:30:00Z`);
    vi.setSystemTime(justAfterMidnight);
    await releaseEdition(2, YESTERDAY);
    await castVote(2, 't2_alice', 'o1');
    expect((await call('GET', '/state?edition=2')).json.mode).toBe('live');
    m.ctx.userId = 't2_bob';
    m.ctx.username = 'bob';
    expect((await call('GET', '/state?edition=2')).json.mode).toBe('archive');
  });

  it('logged-out players can play without voting and are never ranked', async () => {
    m.ctx.userId = undefined;
    m.ctx.username = undefined;
    m.ctx.loid = 'guest-1';
    expect((await call('POST', '/vote', { edition: 1, optionId: 'o1' })).status).toBe(401);
    expect((await call('POST', '/drop', { edition: 1, left: 'o3', right: 'o4' })).status).toBe(200);
    expect((await call('GET', '/leaderboard?edition=1')).json.total).toBe(0);
  });
});

describe('practice', () => {
  it('never serves the live edition; falls back to the practice bank on day one', async () => {
    for (let i = 0; i < 15; i++) {
      const { status, json } = await call('GET', '/practice?exclude=1');
      expect(status).toBe(200);
      expect(json.edition.number).toBeGreaterThan(1000);
      expect(JSON.stringify(json)).not.toContain('seedVotes');
    }
  });
});
