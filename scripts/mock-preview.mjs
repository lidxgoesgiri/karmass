// Local QA only: serves dist/client with an in-memory /api that reuses the real pure game rules
// (src/server/core). Not deployed. Usage: npm run build && npm run preview
// Query flags on game.html / splash.html: ?guest=1 (logged out), ?edition=N (post edition).
import { existsSync, readFileSync } from 'node:fs';
import { preview } from 'vite';
import {
  editionFor,
  publicEdition,
  blankPrompt,
} from '../src/server/core/editions.ts';
import {
  countVotes,
  currentPercents,
  evaluateDrop,
  finalize,
  flairText,
  isOption,
  nextUtcMidnight,
  pickPractice,
  utcDate,
  validateDrop,
  DAY_MS,
} from '../src/server/core/game.ts';

const now = Date.now();
const released = new Map([
  [1, utcDate(now - 2 * DAY_MS)],
  [2, utcDate(now - DAY_MS)],
  [3, utcDate(now)],
]);
const votes = new Map([[3, { o1: 4, o3: 2, o5: 1 }]]);
const sessions = new Map();
const player = { streak: 2, bestStreak: 4, flairEnabled: true };
const empty = () => ({ vote: null, attempts: [], final: null, shared: false });

const json = (res, status, body) => {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(body));
};
const readBody = (req) =>
  new Promise((ok) => {
    let s = '';
    req.on('data', (c) => (s += c));
    req.on('end', () => ok(s ? JSON.parse(s) : {}));
  });

const api = async (req, res, url, guest) => {
  const route = url.pathname.replace('/api/', '');
  const body = req.method === 'POST' ? await readBody(req) : {};
  const n = Number(body.edition ?? url.searchParams.get('edition') ?? 3);
  const date = released.get(n);
  const mode = date === utcDate(Date.now()) ? 'live' : 'archive';
  const key = `${n}:${mode}:${guest ? 'guest' : 'me'}`;
  const session = sessions.get(key) ?? empty();
  const v = votes.get(n) ?? {};
  const ed = editionFor(n);
  const me = {
    loggedIn: !guest,
    username: guest ? null : 'local_tester',
    snoovatar: null,
    streak: guest ? 0 : player.streak,
    bestStreak: player.bestStreak,
    flairEnabled: player.flairEnabled,
    flair: !guest && player.flairEnabled ? flairText(player.streak) : null,
  };
  if (route === 'practice') {
    const rows = [...released].map(([number, d]) => ({ number, date: d }));
    const pick = pickPractice(rows, utcDate(Date.now()), Number(url.searchParams.get('exclude') ?? 0), Math.random);
    if (!pick) return json(res, 404, { error: 'Practice unlocks once the first daily edition has ended.' });
    return json(res, 200, { edition: publicEdition(pick.number, pick.date), percents: currentPercents(editionFor(pick.number), votes.get(pick.number) ?? {}) });
  }
  if (route === 'archive')
    return json(
      res,
      200,
      [...released]
        .reverse()
        .map(([num, d]) => ({
          number: num,
          date: d,
          prompt: blankPrompt(editionFor(num).prompt),
          live: d === utcDate(Date.now()),
        }))
    );
  if (!date)
    return json(res, 404, { error: 'This edition is not available yet.' });
  switch (route) {
    case 'splash':
      return json(res, 200, {
        edition: n,
        date,
        prompt: blankPrompt(ed.prompt),
        mode,
        voters: countVotes(v),
        finished: Boolean(session.final),
        won: session.final?.won ?? false,
        streak: me.streak,
        username: me.username,
      });
    case 'state':
      return json(res, 200, {
        edition: publicEdition(n, date),
        mode,
        voters: countVotes(v),
        session,
        player: me,
        nextEditionAt: nextUtcMidnight(Date.now()),
      });
    case 'vote':
      if (
        guest ||
        mode !== 'live' ||
        session.vote ||
        !isOption(ed, body.optionId)
      )
        return json(res, 409, { error: 'Cannot vote.' });
      v[body.optionId] = (v[body.optionId] ?? 0) + 1;
      votes.set(n, v);
      sessions.set(key, { ...session, vote: body.optionId });
      return json(res, 200, sessions.get(key));
    case 'drop': {
      const err = validateDrop(
        ed,
        session,
        body.left,
        body.right,
        mode === 'live' && !guest
      );
      if (err) return json(res, 409, { error: err });
      const percents = currentPercents(ed, v);
      const attempt = evaluateDrop(percents, body.left, body.right);
      const attempts = [...session.attempts, attempt];
      const final = finalize(
        attempt,
        attempts.length,
        percents,
        countVotes(v),
        Date.now()
      );
      sessions.set(key, { ...session, attempts, final });
      await new Promise((r) => setTimeout(r, 350)); // simulate network so the charge state is visible
      return json(res, 200, {
        attempt,
        session: sessions.get(key),
        player: me,
      });
    }
    case 'share':
      sessions.set(key, { ...session, shared: true });
      return json(res, 200, { ok: true });
    case 'flair':
      player.flairEnabled = Boolean(body.enabled);
      return json(res, 200, {
        ...me,
        flairEnabled: player.flairEnabled,
        flair: player.flairEnabled ? flairText(player.streak) : null,
      });
    case 'leaderboard':
      return json(res, 200, {
        entries: [
          {
            rank: 1,
            username: 'equilibrium_enjoyer',
            snoovatar: null,
            score: 1075,
            delta: 0,
            attempts: 1,
          },
          {
            rank: 2,
            username: 'seesaw_sage',
            snoovatar: null,
            score: 1040,
            delta: 1,
            attempts: 2,
          },
        ],
        me: null,
        total: 2,
      });
    default:
      return json(res, 404, { error: 'Unknown route' });
  }
};

const server = await preview({
  configFile: false,
  build: { outDir: 'dist/client' },
  preview: { port: 4173, strictPort: false },
  plugins: [
    {
      name: 'karmass-mock-api',
      configurePreviewServer(srv) {
        srv.middlewares.use(async (req, res, next) => {
          const url = new URL(req.url ?? '/', 'http://localhost');
          const guest =
            (req.headers.referer ?? '').includes('guest=1') ||
            url.searchParams.has('guest');
          if (url.pathname.startsWith('/api/'))
            return api(req, res, url, guest);
          if (url.pathname.endsWith('.html')) {
            const edition = Number(url.searchParams.get('edition') ?? 3);
            const ctx = guest
              ? { postData: { edition } }
              : {
                  postData: { edition },
                  userId: 't2_local',
                  username: 'local_tester',
                  subredditName: 'karmass_dev',
                };
            const file = new URL(
              `../dist/client${url.pathname}`,
              import.meta.url
            );
            if (existsSync(file)) {
              const html = readFileSync(file, 'utf8').replace(
                '<head>',
                `<head><script>globalThis.devvit={context:${JSON.stringify(ctx)}}</script>`
              );
              res.setHeader('Content-Type', 'text/html');
              return res.end(html);
            }
          }
          next();
        });
      },
    },
  ],
});
server.printUrls();
