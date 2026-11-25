import { Hono, type Context as HonoContext } from 'hono';
import { context } from '@devvit/web/server';
import type {
  ApiError,
  ArchiveEntry,
  DropRequest,
  DropResponse,
  FlairRequest,
  GameState,
  LeaderboardResponse,
  Mode,
  Player,
  Session,
  ShareRequest,
  SplashData,
  VoteRequest,
} from '../../shared/types';
import { blankPrompt, editionFor, publicEdition } from '../core/editions';
import {
  countVotes,
  currentPercents,
  evaluateDrop,
  finalize,
  flairText,
  isOption,
  nextStreak,
  nextUtcMidnight,
  shareText,
  utcDate,
  validateDrop,
  DAY_MS,
} from '../core/game';
import {
  addToLeaderboard,
  castVote,
  claimAttempt,
  claimShare,
  editionForPost,
  getEditionMeta,
  getLeaderboard,
  getUser,
  getVotes,
  listReleased,
  loadSession,
  saveAttempt,
  saveStreak,
  setFlairOff,
  unclaimShare,
  type EditionMeta,
  type UserRecord,
} from '../services/hivemindRedis';
import {
  applyFlair,
  clearFlair,
  postShareComment,
  snoovatarFor,
} from '../services/redditNative';
import { MAX_ATTEMPTS } from '../../shared/physics';

export const api = new Hono();

const fail = (
  c: HonoContext,
  error: string,
  status: 400 | 401 | 404 | 409 | 500 = 400
) => c.json<ApiError>({ error }, status);

// Logged-out viewers can still play (keyed by loid) but never vote, rank, stream or share.
const whoAmI = (): string | null =>
  context.userId ?? (context.loid ? `loid:${context.loid}` : null);

type Resolved = { n: number; meta: EditionMeta; mode: Mode };

const resolveEdition = async (requested: unknown): Promise<Resolved | null> => {
  const fromPost =
    typeof context.postData?.edition === 'number'
      ? context.postData.edition
      : context.postId
        ? await editionForPost(context.postId)
        : null;
  const n = Number(requested ?? fromPost);
  if (!Number.isInteger(n) || n < 1) return null;
  const meta = await getEditionMeta(n); // only released editions are playable (no future leaks)
  if (!meta) return null;
  return {
    n,
    meta,
    mode: meta.date === utcDate(Date.now()) ? 'live' : 'archive',
  };
};

const activeStreak = (user: UserRecord, today: string): number => {
  const s = user.streak;
  if (!s) return 0;
  const yesterday = utcDate(Date.parse(`${today}T00:00:00Z`) - DAY_MS);
  return s.last === today || s.last === yesterday ? s.streak : 0;
};

const playerFor = (user: UserRecord | null): Player => {
  const streak = user ? activeStreak(user, utcDate(Date.now())) : 0;
  const flairEnabled = !(user?.flairOff ?? false);
  return {
    loggedIn: Boolean(context.userId),
    username: context.username ?? null,
    snoovatar: context.snoovatar ?? null,
    streak,
    bestStreak: user?.streak?.best ?? 0,
    flairEnabled,
    flair: streak > 0 && flairEnabled ? flairText(streak) : null,
  };
};

const loadPlayer = async (): Promise<Player> =>
  playerFor(context.userId ? await getUser(context.userId) : null);

api.get('/splash', async (c) => {
  const ed = await resolveEdition(c.req.query('edition'));
  if (!ed) return fail(c, 'This edition is not available yet.', 404);
  const who = whoAmI();
  const [votes, session, player] = await Promise.all([
    getVotes(ed.n),
    who ? loadSession(ed.n, who, ed.mode) : null,
    loadPlayer(),
  ]);
  return c.json<SplashData>({
    edition: ed.n,
    date: ed.meta.date,
    prompt: blankPrompt(editionFor(ed.n).prompt),
    mode: ed.mode,
    voters: countVotes(votes),
    finished: Boolean(session?.final),
    won: session?.final?.won ?? false,
    streak: player.streak,
    username: player.username,
  });
});

api.get('/state', async (c) => {
  const ed = await resolveEdition(c.req.query('edition'));
  if (!ed) return fail(c, 'This edition is not available yet.', 404);
  const who = whoAmI();
  if (!who) return fail(c, 'Sign in to play Karmass.', 401);
  const [votes, session, player] = await Promise.all([
    getVotes(ed.n),
    loadSession(ed.n, who, ed.mode),
    loadPlayer(),
  ]);
  return c.json<GameState>({
    edition: publicEdition(ed.n, ed.meta.date),
    mode: ed.mode,
    voters: countVotes(votes),
    session,
    player,
    nextEditionAt: nextUtcMidnight(Date.now()),
  });
});

api.post('/vote', async (c) => {
  const body = await c.req.json<VoteRequest>().catch(() => null);
  const ed = await resolveEdition(body?.edition);
  if (!ed) return fail(c, 'This edition is not available.', 404);
  if (!context.userId) return fail(c, 'Sign in to vote.', 401);
  if (ed.mode !== 'live')
    return fail(c, 'Voting closed for this edition.', 409);
  if (!isOption(editionFor(ed.n), body?.optionId))
    return fail(c, 'Unknown word block.');
  const session = await loadSession(ed.n, context.userId, 'live');
  if (session.final) return fail(c, 'You already finished this edition.', 409);
  if (!(await castVote(ed.n, context.userId, body.optionId)))
    return fail(c, 'You already voted today.', 409);
  return c.json<Session>(await loadSession(ed.n, context.userId, 'live'));
});

api.post('/drop', async (c) => {
  const body = await c.req.json<DropRequest>().catch(() => null);
  const ed = await resolveEdition(body?.edition);
  if (!ed) return fail(c, 'This edition is not available.', 404);
  const who = whoAmI();
  if (!who) return fail(c, 'Sign in to play Karmass.', 401);

  const edition = editionFor(ed.n);
  const needsVote = ed.mode === 'live' && Boolean(context.userId);
  const before = await loadSession(ed.n, who, ed.mode);
  const invalid = validateDrop(
    edition,
    before,
    body?.left,
    body?.right,
    needsVote
  );
  if (invalid || !body) return fail(c, invalid ?? 'Bad request.', 409);

  const index = await claimAttempt(ed.n, who, ed.mode);
  if (index > MAX_ATTEMPTS) return fail(c, 'No attempts left.', 409);

  const votes = await getVotes(ed.n);
  const percents = currentPercents(edition, votes);
  const voters = countVotes(votes);
  const attempt = evaluateDrop(percents, body.left, body.right);
  const now = Date.now();
  const final = finalize(attempt, index, percents, voters, now);
  const finishedNow = await saveAttempt(
    ed.n,
    who,
    ed.mode,
    index,
    attempt,
    final
  );

  if (
    finishedNow &&
    final &&
    ed.mode === 'live' &&
    context.userId &&
    context.username
  ) {
    await recordLiveFinish(
      ed.n,
      context.userId,
      context.username,
      attempt.delta,
      index,
      final.score,
      now
    );
  }

  return c.json<DropResponse>({
    attempt,
    session: await loadSession(ed.n, who, ed.mode),
    player: await loadPlayer(),
  });
});

// Leaderboard, streak and flair only change for signed-in players finishing the live edition.
async function recordLiveFinish(
  n: number,
  userId: string,
  username: string,
  delta: number,
  attempts: number,
  points: number | null,
  now: number
): Promise<void> {
  try {
    const user = await getUser(userId);
    const streak = nextStreak(user.streak, utcDate(now));
    await saveStreak(userId, streak);
    if (points === null) return;
    const snoovatar = context.snoovatar ?? (await snoovatarFor(username));
    await addToLeaderboard(
      n,
      userId,
      { username, snoovatar, score: points, delta, attempts },
      now
    );
    if (!user.flairOff) await applyFlair(username, flairText(streak.streak));
  } catch (error) {
    console.error('recordLiveFinish failed', error);
  }
}

api.post('/share', async (c) => {
  const body = await c.req.json<ShareRequest>().catch(() => null);
  const ed = await resolveEdition(body?.edition);
  if (!ed) return fail(c, 'This edition is not available.', 404);
  if (!context.userId || !context.username)
    return fail(c, 'Sign in to share.', 401);
  const session = await loadSession(ed.n, context.userId, ed.mode);
  if (!session.final) return fail(c, 'Finish the edition before sharing.', 409);
  if (!(await claimShare(ed.n, context.userId, ed.mode)))
    return fail(c, 'You already shared this result.', 409);
  const target = ed.meta.stickyId ?? ed.meta.postId ?? context.postId;
  if (!target) return fail(c, 'No thread to share into.', 404);
  const player = await loadPlayer();
  try {
    const text = shareText(ed.n, session, player.streak, session.final.voters);
    await postShareComment(
      target as `t1_${string}` | `t3_${string}`,
      text,
      context.username
    );
    return c.json({ ok: true });
  } catch (error) {
    console.error('share failed', error);
    await unclaimShare(ed.n, context.userId, ed.mode);
    return fail(c, 'Could not post your result. Please try again.', 500);
  }
});

api.get('/leaderboard', async (c) => {
  const ed = await resolveEdition(c.req.query('edition'));
  if (!ed) return fail(c, 'This edition is not available.', 404);
  return c.json<LeaderboardResponse>(
    await getLeaderboard(ed.n, context.userId, 10)
  );
});

api.get('/archive', async (c) => {
  const today = utcDate(Date.now());
  const rows = await listReleased(30);
  return c.json<ArchiveEntry[]>(
    rows.map((r) => ({
      number: r.number,
      date: r.date,
      prompt: blankPrompt(editionFor(r.number).prompt),
      live: r.date === today,
    }))
  );
});

api.post('/flair', async (c) => {
  const body = await c.req.json<FlairRequest>().catch(() => null);
  if (!context.userId || !context.username)
    return fail(c, 'Sign in to change flair.', 401);
  if (typeof body?.enabled !== 'boolean') return fail(c, 'Bad request.');
  await setFlairOff(context.userId, !body.enabled);
  const player = await loadPlayer();
  if (!body.enabled) await clearFlair(context.username);
  else if (player.flair) await applyFlair(context.username, player.flair);
  return c.json<Player>(player);
});
