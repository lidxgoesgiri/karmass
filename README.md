# KARMASS — Weigh the Hivemind

> A 60-second daily social-physics game that lives inside a Reddit post.

**Karmass** (Karma + Mass) turns the Hivemind's opinion into physical weight.
Every day brings a fresh prompt with two blanks and six word blocks. Each block weighs exactly as much as its share of today's Redditor votes.

1. Vote for the answer you believe.
2. Drop two blocks on a seesaw.
3. If the crowd weighs them nearly the same, the plank balances.

|                |                                                                                   |
| -------------- | --------------------------------------------------------------------------------- |
| App listing    | `https://developers.reddit.com/apps/karmass-game` _(TODO after first `devvit upload`)_ |
| Test subreddit | `r/TODO` _(public, fewer than 200 members)_                                       |
| Live demo post | _(TODO)_                                                                          |
| Demo video     | _(TODO: under 60 seconds, public on YouTube)_                                     |

## How to play

1. **Open today's post** in your feed and tap **WEIGH TODAY'S PROMPT**.
   - Example prompt: _"The two snacks people buy most for a movie are [ A ] and [ B ]."_
2. **Vote (step 1).** Tap the one answer you honestly believe fits best, then **LOCK MY VOTE**. Your vote adds real weight to that block for everyone today.
3. **Weigh (step 2).** Drag two different blocks onto **SLOT A** and **SLOT B**, or tap a block to quick-slot it. Then press **DROP!**
4. The blocks fall and the seesaw tilts by the real gap in their weights.
   - **Balanced:** the two weights differ by **4 points or less**. You win.
   - **Tipped:** the two weights you tested stay revealed on the dock. Use them to deduce a better pair.
5. You have **3 drops** per day. When you finish, all six weights unlock.

### Scoring

| Result              | Weight gap (Δ)              |
| ------------------- | --------------------------- |
| Perfect Equilibrium | 0–1 points                  |
| Solid Balance       | 2–3 points                  |
| Close Call          | 4 points                    |
| Ratio'd             | no balanced drop in 3 tries |

Leaderboard score: `(100 − Δ) × 10 + (4 − drops used) × 25`. Ties go to whoever finished first.

## Reddit-native features

- **A fresh edition every day.** A scheduler publishes one post per UTC day. Moderators can also publish the next edition from the subreddit menu.
- **Archive play.** Past editions stay playable with their final weights, from the old post or the in-game Archive tab. They never touch votes, streaks or the leaderboard.
- **Snoovatars.** Your official Reddit avatar appears on your result card and on the daily leaderboard. In-game, the seesaw carries Karmass's own Balance Core emblem.
- **Streaks and flair.**
  - Consecutive days played build a streak.
  - Wins set community flair: `Balanced Rookie`, then `N-Day Balanced`, then `Hivemind Whisperer` at 7+ days.
  - Flair is disclosed in the result card and can be switched off there.
- **Spoiler-free sharing.**
  - One tap posts your drop log, never the words, as a reply to the post's pinned comment.
  - Sharing is never automatic.
- **Honest cold start.**
  - Each edition starts from 100 curated starter votes so the first player gets meaningful physics.
  - Real votes take over as people play.
  - The result card always states how many real votes your result was based on.

## Tech stack

- **Platform:** [Devvit Web](https://developers.reddit.com/docs) Interactive Posts, with a Hono server, Devvit Redis, and the scheduler and triggers.
- **Inline splash (feed view):** React and CSS only, so it loads instantly.
- **Expanded game:**
  - PixiJS v8 with `pixi-filters` (bloom, shockwave, RGB split) on WebGL.
  - Matter.js at a fixed 60 Hz step.
  - React and Motion for the HUD.
- **Audio:** procedural Web Audio, with no audio files.
- **Rules:** `src/shared/physics.ts` holds the balance rules shared by client and server. The server decides every verdict; the client only animates it.

```
src/
  shared/   physics.ts (balance rules), types.ts (API contracts)
  server/   index.ts, routes/ (api, menu, scheduler, triggers), core/ (pure rules, editions, publishing),
            services/ (hivemindRedis.ts, redditNative.ts), data/editions.json (24-edition bank)
  client/   splash.tsx (inline), main.tsx + App.tsx (expanded), components/ (HUD), game/ (Pixi + Matter arena)
scripts/    check-bundle-size.mjs, mock-preview.mjs (local QA with an in-memory API)
```

## Development

Requires Node.js 24 or newer.

```bash
npm install
npx devvit login               # once
npm run dev                    # playtest on your dev subreddit
npm run build && npm run preview   # local QA without Reddit (mock API)
npm run check                  # types, lint, unit tests, build, bundle budget (< 1.5 MB gzipped)
npm run deploy                 # check + devvit upload (this app is never published during the hackathon)
```

## Credits and licenses

- Built from the official `reddit/devvit-template-react` (BSD-3-Clause).
- Libraries, all MIT: PixiJS, pixi-filters, Matter.js, React, Motion, and Hono.
- Fonts: Space Grotesk and JetBrains Mono, both under the SIL Open Font License 1.1, self-hosted via Fontsource.
- Visual effects (decrypt text, border beam, dot grid, number ticker) are original implementations.
- All game art is original geometry. Karmass draws no Snoo artwork and uses no Reddit logos or vote glyphs.
