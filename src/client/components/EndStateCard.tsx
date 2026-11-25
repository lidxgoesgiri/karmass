import { useEffect, useState } from 'react';
import { motion } from 'motion/react';
import type {
  ArchiveEntry,
  GameState,
  LeaderboardResponse,
  Player,
} from '../../shared/types';
import { PRIOR_VOTES, TIER_LABEL, tier } from '../../shared/physics';
import { apiGet, apiPost, errorText, notify, pad3 } from '../api';
import { formatCountdown, useCountUp, useNow, useScramble } from '../hooks';
import { Avatar, CloseIcon } from './Icons';

type Tab = 'results' | 'leaderboard' | 'archive';

type Props = {
  game: GameState;
  onClose: () => void;
  onPlayEdition: (n: number) => void;
  onShared: () => void;
  onPlayer: (p: Player) => void;
};

export const EndStateCard = ({
  game,
  onClose,
  onPlayEdition,
  onShared,
  onPlayer,
}: Props) => {
  const [tab, setTab] = useState<Tab>('results');
  const final = game.session.final;
  const winning = game.session.attempts.at(-1);
  const t = final?.won && winning ? tier(winning.delta) : null;
  const title = useScramble(
    final?.won ? (t ? TIER_LABEL[t] : 'Balanced') : 'Ratio’d',
    650
  );
  const points = useCountUp(final?.score ?? 0);

  return (
    <motion.div
      className="absolute inset-0 z-20 flex items-end justify-center bg-void/70 p-2 backdrop-blur-sm sm:items-center"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
    >
      <motion.section
        role="dialog"
        aria-label="Results"
        className="beam flex max-h-full w-full max-w-[460px] flex-col overflow-hidden rounded-2xl border border-line bg-[#0e0e12]/95"
        initial={{ y: 40, scale: 0.97 }}
        animate={{ y: 0, scale: 1 }}
        exit={{ y: 30, opacity: 0 }}
        transition={{ type: 'spring', stiffness: 420, damping: 32 }}
      >
        <div className="flex items-start gap-3 px-4 pt-4">
          <Avatar src={game.player.snoovatar} size={44} />
          <div className="min-w-0 flex-1">
            <p className="font-mono text-[10.5px] tracking-[0.14em] text-muted">
              KARMASS #{pad3(game.edition.number)} ·{' '}
              {game.player.username ? `u/${game.player.username}` : 'GUEST'}
            </p>
            <h2
              className={`font-mono text-xl font-bold tracking-wide ${final?.won ? 'text-win' : 'text-light'}`}
            >
              {title.toUpperCase()}
            </h2>
            <p className="font-mono text-[12px] text-muted">
              {winning ? `Δ ${winning.delta}` : ''} ·{' '}
              {game.session.attempts.length}/3 drops
              {final?.score ? (
                <span className="text-gold"> · {points} pts</span>
              ) : null}
            </p>
          </div>
          <button
            className="grid size-9 place-items-center rounded-full text-muted hover:text-ink"
            onClick={onClose}
            aria-label="Close results"
          >
            <CloseIcon />
          </button>
        </div>

        <div
          className="mx-4 mt-3 grid grid-cols-3 rounded-full border border-line p-0.5 text-[12px] font-semibold"
          role="tablist"
        >
          {(['results', 'leaderboard', 'archive'] as const).map((k) => (
            <button
              key={k}
              role="tab"
              aria-selected={tab === k}
              className={`relative min-h-8 rounded-full capitalize ${tab === k ? 'text-void' : 'text-muted'}`}
              onClick={() => setTab(k)}
            >
              {tab === k && (
                <motion.span
                  layoutId="tab-pill"
                  className="absolute inset-0 rounded-full bg-ink"
                  transition={{ type: 'spring', stiffness: 500, damping: 36 }}
                />
              )}
              <span className="relative">{k}</span>
            </button>
          ))}
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
          {tab === 'results' && (
            <Results game={game} onShared={onShared} onPlayer={onPlayer} />
          )}
          {tab === 'leaderboard' && (
            <Leaderboard edition={game.edition.number} />
          )}
          {tab === 'archive' && (
            <Archive current={game.edition.number} onPlay={onPlayEdition} />
          )}
        </div>
      </motion.section>
    </motion.div>
  );
};

const Results = ({
  game,
  onShared,
  onPlayer,
}: Pick<Props, 'game' | 'onShared' | 'onPlayer'>) => {
  const { session, player, edition, mode } = game;
  const final = session.final;
  const now = useNow(1000);
  const [busy, setBusy] = useState(false);
  const tested = new Set(session.attempts.flatMap((a) => [a.left, a.right]));
  const won = session.attempts.find((a) => a.balanced);
  const rows = edition.options
    .map((o) => ({ ...o, pct: final?.percents[o.id] ?? 0 }))
    .sort((a, b) => b.pct - a.pct);
  const max = Math.max(1, ...rows.map((r) => r.pct));

  const share = async () => {
    setBusy(true);
    try {
      await apiPost('share', { edition: edition.number });
      notify('Result posted to the comments.');
      onShared();
    } catch (e) {
      notify(errorText(e));
    } finally {
      setBusy(false);
    }
  };

  const toggleFlair = async () => {
    try {
      onPlayer(
        await apiPost<Player>('flair', { enabled: !player.flairEnabled })
      );
    } catch (e) {
      notify(errorText(e));
    }
  };

  return (
    <div className="space-y-4">
      <ol className="space-y-1 font-mono text-[12px]">
        {session.attempts.map((a, i) => (
          <li key={i} className={a.balanced ? 'text-win' : 'text-muted'}>
            Drop {i + 1}: {a.balanced ? 'BALANCED!' : 'Tipped'} (Δ {a.delta})
          </li>
        ))}
      </ol>

      <div>
        <p className="mb-1.5 font-mono text-[10.5px] tracking-[0.14em] text-muted">
          THE HIVEMIND SAID
        </p>
        <ul className="space-y-1.5">
          {rows.map((r) => {
            const inWin = won && (won.left === r.id || won.right === r.id);
            return (
              <li key={r.id} className="text-[13px]">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="truncate">
                    {r.label}
                    {session.vote === r.id && (
                      <span className="ml-1.5 rounded bg-gold/15 px-1 font-mono text-[10px] text-gold">
                        YOUR VOTE
                      </span>
                    )}
                    {tested.has(r.id) && !inWin && (
                      <span className="ml-1.5 font-mono text-[10px] text-muted">
                        TESTED
                      </span>
                    )}
                  </span>
                  <span
                    className={`font-mono font-bold ${inWin ? 'text-win' : 'text-ink'}`}
                  >
                    {r.pct}%
                  </span>
                </div>
                <div className="mt-0.5 h-1.5 overflow-hidden rounded-full bg-line">
                  <motion.div
                    className={`h-full rounded-full ${inWin ? 'bg-win' : 'bg-muted/60'}`}
                    initial={{ width: 0 }}
                    animate={{ width: `${(r.pct / max) * 100}%` }}
                    transition={{ type: 'spring', stiffness: 120, damping: 20 }}
                  />
                </div>
              </li>
            );
          })}
        </ul>
        <p className="mt-2 text-[11px] leading-snug text-muted">
          Based on {final?.voters ?? 0} Redditor{' '}
          {final?.voters === 1 ? 'vote' : 'votes'} plus {PRIOR_VOTES} starter
          votes when you finished.
        </p>
      </div>

      {player.loggedIn && mode === 'live' && (
        <div className="flex items-center justify-between gap-3 rounded-xl border border-line px-3 py-2 text-[12px]">
          <div>
            <p className="font-mono text-ink">
              Streak: {player.streak} {player.streak === 1 ? 'day' : 'days'}
            </p>
            <p className="text-muted">
              {player.flairEnabled
                ? `Wins set your flair here${player.flair ? `: ${player.flair}` : ''}.`
                : 'Auto flair is off.'}
            </p>
          </div>
          <button
            role="switch"
            aria-checked={player.flairEnabled}
            aria-label="Auto flair"
            onClick={toggleFlair}
            className={`relative h-6 w-11 shrink-0 rounded-full transition ${player.flairEnabled ? 'bg-win' : 'bg-line'}`}
          >
            <span
              className={`absolute top-0.5 size-5 rounded-full bg-void transition-all ${player.flairEnabled ? 'left-[22px]' : 'left-0.5'}`}
            />
          </button>
        </div>
      )}

      <p className="font-mono text-[11px] tracking-wider text-muted">
        {mode === 'live'
          ? `NEXT EDITION IN ${formatCountdown(game.nextEditionAt - now)}`
          : `ARCHIVE EDITION · ${edition.date}`}
      </p>

      {player.loggedIn ? (
        <button
          className="min-h-12 w-full rounded-full bg-heavy font-bold tracking-wide text-void transition active:scale-[0.97] disabled:opacity-40"
          disabled={busy || session.shared}
          onClick={share}
        >
          {session.shared
            ? 'SHARED TO COMMENTS'
            : `SHARE RESULT AS u/${player.username}`}
        </button>
      ) : (
        <p className="text-center text-[12px] text-muted">
          Sign in to share your result and keep a streak.
        </p>
      )}
      <p className="text-center text-[10.5px] text-muted">
        Posts a spoiler-free reply to the pinned comment. Never automatic.
      </p>
    </div>
  );
};

const Leaderboard = ({ edition }: { edition: number }) => {
  const [data, setData] = useState<LeaderboardResponse | null>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    apiGet<LeaderboardResponse>(`leaderboard?edition=${edition}`).then(
      setData,
      (e) => setErr(errorText(e))
    );
  }, [edition]);
  if (err) return <p className="text-[13px] text-muted">{err}</p>;
  if (!data)
    return <p className="font-mono text-[12px] text-muted">LOADING…</p>;
  if (!data.entries.length)
    return (
      <p className="text-[13px] text-muted">
        No balanced drops yet. Be the first on the board.
      </p>
    );
  const rows =
    data.me && !data.entries.some((e) => e.rank === data.me?.rank)
      ? [...data.entries, data.me]
      : data.entries;
  return (
    <ol className="space-y-1">
      {rows.map((e) => (
        <li
          key={`${e.rank}-${e.username}`}
          className={`flex items-center gap-2.5 rounded-lg px-2 py-1.5 text-[13px] ${data.me?.username === e.username ? 'bg-win/10' : ''}`}
        >
          <span className="w-6 font-mono text-muted">{e.rank}</span>
          <Avatar src={e.snoovatar} size={28} />
          <span className="min-w-0 flex-1 truncate">u/{e.username}</span>
          <span className="font-mono text-[11px] text-muted">
            Δ{e.delta} · {e.attempts}x
          </span>
          <span className="w-12 text-right font-mono font-bold text-gold">
            {e.score}
          </span>
        </li>
      ))}
      <li className="pt-1 text-center font-mono text-[10.5px] text-muted">
        {data.total} BALANCED TODAY
      </li>
    </ol>
  );
};

const Archive = ({
  current,
  onPlay,
}: {
  current: number;
  onPlay: (n: number) => void;
}) => {
  const [rows, setRows] = useState<ArchiveEntry[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    apiGet<ArchiveEntry[]>('archive').then(setRows, (e) =>
      setErr(errorText(e))
    );
  }, []);
  if (err) return <p className="text-[13px] text-muted">{err}</p>;
  if (!rows)
    return <p className="font-mono text-[12px] text-muted">LOADING…</p>;
  return (
    <ul className="space-y-1.5">
      {rows.map((r) => (
        <li key={r.number}>
          <button
            className={`w-full rounded-xl border px-3 py-2 text-left transition hover:border-muted ${r.number === current ? 'border-win/60' : 'border-line'}`}
            onClick={() => onPlay(r.number)}
          >
            <span className="flex items-center justify-between font-mono text-[10.5px] tracking-[0.14em] text-muted">
              <span>
                #{pad3(r.number)} · {r.date}
              </span>
              <span className={r.live ? 'text-win' : ''}>
                {r.live ? 'LIVE' : 'ARCHIVE'}
              </span>
            </span>
            <span className="mt-0.5 block text-[13px] leading-snug">
              {r.prompt}
            </span>
          </button>
        </li>
      ))}
    </ul>
  );
};
