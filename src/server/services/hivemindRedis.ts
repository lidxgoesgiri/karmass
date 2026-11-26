// Redis key schema. Aggregates (votes, edition meta) are kept for archive play; anything that
// identifies a user expires within 30 days (Devvit data-retention guidance).
import { redis } from '@devvit/web/server';
import type {
  Attempt,
  Final,
  LeaderboardEntry,
  LeaderboardResponse,
  Mode,
  Session,
} from '../../shared/types';
import { leaderboardScore, parseSession, type Streak } from '../core/game';

const USER_TTL_S = 30 * 86_400;

const key = {
  counter: 'editionCounter',
  released: 'released', // zset: edition number → number
  dailyPosted: 'dailyPosted', // hash: UTC date → '1'
  postEdition: 'postEdition', // hash: postId → edition number
  meta: (n: number) => `ed:${n}`, // hash: date, postId, stickyId
  votes: (n: number) => `ed:${n}:votes`, // hash: optionId → live vote count
  session: (n: number, who: string, mode: Mode) =>
    `ed:${n}:${mode === 'live' ? 's' : 'a'}:${who}`,
  lb: (n: number) => `ed:${n}:lb`,
  lbUsers: (n: number) => `ed:${n}:lbu`,
  user: (id: string) => `u:${id}`,
};

export type EditionMeta = {
  date: string;
  postId?: `t3_${string}`;
  stickyId?: `t1_${string}`;
};

const isPostId = (s: string | undefined): s is `t3_${string}` =>
  Boolean(s?.startsWith('t3_'));
const isCommentId = (s: string | undefined): s is `t1_${string}` =>
  Boolean(s?.startsWith('t1_'));

// ---- editions ----

export const nextEditionNumber = (): Promise<number> =>
  redis.incrBy(key.counter, 1);

// shortcut: check-then-decrement is not atomic; only a second publish landing in the same
// millisecond as a failed one could collide. Switch to a watch/multi transaction if that matters.
export const returnEditionNumber = async (n: number): Promise<void> => {
  if ((await redis.get(key.counter)) === String(n))
    await redis.incrBy(key.counter, -1);
};

export const claimDailyPost = async (date: string): Promise<boolean> =>
  (await redis.hSetNX(key.dailyPosted, date, '1')) === 1;

export const releaseEdition = async (
  n: number,
  date: string
): Promise<void> => {
  await redis.hSet(key.meta(n), { date });
  await redis.zAdd(key.released, { member: String(n), score: n });
};

export const unreleaseEdition = async (n: number): Promise<void> => {
  await redis.zRem(key.released, [String(n)]);
  await redis.del(key.meta(n));
};

export const attachPost = async (
  n: number,
  postId: string,
  stickyId: string | null
) => {
  await redis.hSet(key.meta(n), stickyId ? { postId, stickyId } : { postId });
  await redis.hSet(key.postEdition, { [postId]: String(n) });
};

export const getEditionMeta = async (
  n: number
): Promise<EditionMeta | null> => {
  const h = await redis.hGetAll(key.meta(n));
  if (!h.date) return null;
  return {
    date: h.date,
    ...(isPostId(h.postId) && { postId: h.postId }),
    ...(isCommentId(h.stickyId) && { stickyId: h.stickyId }),
  };
};

export const editionForPost = async (
  postId: string
): Promise<number | null> => {
  const v = await redis.hGet(key.postEdition, postId);
  return v ? Number(v) : null;
};

export const listReleased = async (
  limit: number
): Promise<{ number: number; date: string }[]> => {
  const rows = await redis.zRange(key.released, 0, limit - 1, {
    by: 'rank',
    reverse: true,
  });
  const dates = await Promise.all(
    rows.map((r) => redis.hGet(key.meta(Number(r.member)), 'date'))
  );
  return rows.map((r, i) => ({
    number: Number(r.member),
    date: dates[i] ?? '',
  }));
};

// ---- votes & sessions ----

export const getVotes = (n: number): Promise<Record<string, string>> =>
  redis.hGetAll(key.votes(n));

export const loadSession = async (
  n: number,
  who: string,
  mode: Mode
): Promise<Session> =>
  parseSession(await redis.hGetAll(key.session(n, who, mode)));

// One honest vote per user per edition; hSetNX makes double taps harmless.
export const castVote = async (
  n: number,
  who: string,
  optionId: string
): Promise<boolean> => {
  const k = key.session(n, who, 'live');
  if ((await redis.hSetNX(k, 'vote', optionId)) !== 1) return false;
  await redis.hIncrBy(key.votes(n), optionId, 1);
  await redis.expire(k, USER_TTL_S);
  return true;
};

// Atomic attempt counter: concurrent DROPs can never exceed MAX_ATTEMPTS.
export const claimAttempt = (
  n: number,
  who: string,
  mode: Mode
): Promise<number> => redis.hIncrBy(key.session(n, who, mode), 'n', 1);

// Returns true when this call is the one that finished the session.
export const saveAttempt = async (
  n: number,
  who: string,
  mode: Mode,
  index: number,
  attempt: Attempt,
  final: Final | null
): Promise<boolean> => {
  const k = key.session(n, who, mode);
  await redis.hSet(k, { [`a${index}`]: JSON.stringify(attempt) });
  const finished = final
    ? (await redis.hSetNX(k, 'fin', JSON.stringify(final))) === 1
    : false;
  await redis.expire(k, USER_TTL_S);
  return finished;
};

export const claimShare = async (
  n: number,
  who: string,
  mode: Mode
): Promise<boolean> =>
  (await redis.hSetNX(key.session(n, who, mode), 'shared', '1')) === 1;

export const unclaimShare = async (
  n: number,
  who: string,
  mode: Mode
): Promise<void> => {
  await redis.hDel(key.session(n, who, mode), ['shared']);
};

// ---- leaderboard ----

type LbUser = Omit<LeaderboardEntry, 'rank'>;

export const addToLeaderboard = async (
  n: number,
  userId: string,
  user: LbUser,
  at: number
) => {
  await redis.zAdd(key.lb(n), {
    member: userId,
    score: leaderboardScore(user.score, at),
  });
  await redis.hSet(key.lbUsers(n), { [userId]: JSON.stringify(user) });
  await redis.expire(key.lb(n), USER_TTL_S);
  await redis.expire(key.lbUsers(n), USER_TTL_S);
};

export const getLeaderboard = async (
  n: number,
  userId: string | undefined,
  limit: number
): Promise<LeaderboardResponse> => {
  const [top, total] = await Promise.all([
    redis.zRange(key.lb(n), 0, limit - 1, { by: 'rank', reverse: true }),
    redis.zCard(key.lb(n)),
  ]);
  const ids = top.map((t) => t.member);
  const myAsc = userId ? await redis.zRank(key.lb(n), userId) : undefined;
  const wanted =
    userId && myAsc !== undefined && !ids.includes(userId)
      ? [...ids, userId]
      : ids;
  const raw = wanted.length ? await redis.hMGet(key.lbUsers(n), wanted) : [];
  const entry = (id: string, rank: number): LeaderboardEntry | null => {
    const json = raw[wanted.indexOf(id)];
    return json ? { rank, ...(JSON.parse(json) as LbUser) } : null;
  };
  const entries = ids.flatMap((id, i) => entry(id, i + 1) ?? []);
  const me =
    userId && myAsc !== undefined ? entry(userId, total - myAsc) : null;
  return { entries, me, total };
};

export const clearLeaderboard = (n: number): Promise<void> =>
  redis.del(key.lb(n), key.lbUsers(n));

// ---- user streak & flair preference ----

export type UserRecord = { streak: Streak | null; flairOff: boolean };

export const getUser = async (id: string): Promise<UserRecord> => {
  const h = await redis.hGetAll(key.user(id));
  return {
    streak: h.last
      ? { streak: Number(h.streak), best: Number(h.best), last: h.last }
      : null,
    flairOff: h.flairOff === '1',
  };
};

export const saveStreak = async (id: string, s: Streak): Promise<void> => {
  await redis.hSet(key.user(id), {
    streak: String(s.streak),
    best: String(s.best),
    last: s.last,
  });
  await redis.expire(key.user(id), USER_TTL_S);
};

export const setFlairOff = async (id: string, off: boolean): Promise<void> => {
  await redis.hSet(key.user(id), { flairOff: off ? '1' : '0' });
  await redis.expire(key.user(id), USER_TTL_S);
};

export const unclaimDailyPost = async (date: string): Promise<void> => {
  await redis.hDel(key.dailyPosted, [date]);
};

export const isDailyPublished = async (date: string): Promise<boolean> =>
  Boolean(await redis.hGet(key.dailyPosted, date));
