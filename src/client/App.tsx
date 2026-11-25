import { useCallback, useEffect, useRef, useState } from 'react';
import { AnimatePresence } from 'motion/react';
import { context } from '@devvit/web/client';
import type {
  Attempt,
  DropResponse,
  GameState,
  PracticeRound,
  Session,
} from '../shared/types';
import { MAX_ATTEMPTS, evaluateDrop } from '../shared/physics';
import {
  ApiFailure,
  apiGet,
  apiPost,
  errorText,
  notify,
  revealedFrom,
} from './api';
import { ActionBar } from './components/ActionBar';
import { EndStateCard } from './components/EndStateCard';
import { PromptHeader, type Phase } from './components/PromptHeader';
import { KarmassEngine } from './game/KarmassEngine';
import { sound } from './game/SoundSynth';

const postEdition = (): number | null => {
  const e = context?.postData?.edition;
  return typeof e === 'number' ? e : null;
};

const phaseFor = (g: GameState): Phase =>
  g.session.final
    ? 'final'
    : g.mode === 'live' && g.player.loggedIn && !g.session.vote
      ? 'vote'
      : 'weigh';

// Practice drops resolve locally after a short "charging" beat so they feel like real drops.
const practiceDrop = async (
  game: GameState,
  percents: Record<string, number>,
  left: string,
  right: string
): Promise<DropResponse> => {
  await new Promise((r) => setTimeout(r, 280));
  const attempt = evaluateDrop(percents, left, right);
  const attempts = [...game.session.attempts, attempt];
  const done = attempt.balanced || attempts.length >= MAX_ATTEMPTS;
  return {
    attempt,
    player: game.player,
    session: {
      ...game.session,
      attempts,
      final: done
        ? {
            won: attempt.balanced,
            score: null,
            percents,
            voters: 0,
            at: Date.now(),
          }
        : null,
    },
  };
};

// Thin React shell: WebGL arena in the middle, HUD overlays around it.
export const App = () => {
  const stageRef = useRef<HTMLDivElement>(null);
  const engineRef = useRef<KarmassEngine | null>(null);
  const inFlight = useRef(false); // double-taps must never spend two attempts
  const [game, setGame] = useState<GameState | null>(null);
  const [phase, setPhase] = useState<Phase>('loading');
  const [error, setError] = useState<string | null>(null);
  const [slots, setSlots] = useState<{
    left: string | null;
    right: string | null;
  }>({ left: null, right: null });
  const [votePick, setVotePick] = useState<string | null>(null);
  const [last, setLast] = useState<Attempt | null>(null);
  const [cardOpen, setCardOpen] = useState(false);
  const [muted, setMuted] = useState(sound.muted);
  const [announce, setAnnounce] = useState('');
  // Practice: final weights of a past edition, evaluated locally (no score, no storage).
  const [practice, setPractice] = useState<Record<string, number> | null>(null);
  const dailyRef = useRef<GameState | null>(null);

  const apply = useCallback((g: GameState) => {
    const engine = engineRef.current;
    const next = phaseFor(g);
    setGame(g);
    setLast(null);
    setVotePick(null);
    setPhase(next);
    setCardOpen(next === 'final');
    if (!engine) return;
    engine.resetRound();
    engine.setOptions(g.edition.options);
    engine.setRevealed(revealedFrom(g.session));
    engine.setMode(
      next === 'vote' ? 'vote' : next === 'weigh' ? 'weigh' : 'locked'
    );
  }, []);

  const load = useCallback(
    async (n: number | null) => {
      setPhase('loading');
      setError(null);
      try {
        apply(await apiGet<GameState>(n ? `state?edition=${n}` : 'state'));
      } catch (e) {
        setError(errorText(e));
        setPhase('error');
      }
    },
    [apply]
  );

  useEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    const engine = new KarmassEngine({
      onSlots: (left, right) => setSlots({ left, right }),
      onVotePick: setVotePick,
    });
    engineRef.current = engine;
    engine.mount(el).then(
      () => void load(postEdition()),
      (e) => {
        console.error(e);
        setError('Your device could not start the WebGL stage.');
        setPhase('error');
      }
    );
    return () => engine.destroy();
  }, [load]);

  const label = (id: string | null) =>
    game?.edition.options.find((o) => o.id === id)?.label ?? null;

  const lockVote = async () => {
    if (!game || !votePick || inFlight.current) return;
    inFlight.current = true;
    sound.unlock();
    try {
      const session = await apiPost<Session>('vote', {
        edition: game.edition.number,
        optionId: votePick,
      });
      sound.play('vote');
      setGame({ ...game, session, voters: game.voters + 1 });
      engineRef.current?.setMode('weigh');
      setPhase('weigh');
      setAnnounce(`Vote locked for ${label(votePick)}. Now drop two words.`);
    } catch (e) {
      notify(errorText(e));
    } finally {
      inFlight.current = false;
    }
  };

  const drop = async () => {
    const engine = engineRef.current;
    if (!game || !engine || !slots.left || !slots.right || inFlight.current)
      return;
    inFlight.current = true;
    sound.unlock();
    setPhase('dropping');
    engine.setMode('locked');
    engine.charge(true);
    try {
      const res = practice
        ? await practiceDrop(game, practice, slots.left, slots.right)
        : await apiPost<DropResponse>(
            'drop',
            {
              edition: game.edition.number,
              left: slots.left,
              right: slots.right,
            },
            10000 // Devvit cold starts can exceed 5 s; a timeout triggers a resync
          );
      engine.charge(false);
      await engine.playDrop(res.attempt);
      const a = res.attempt;
      setLast(a);
      setGame((g) =>
        g ? { ...g, session: res.session, player: res.player } : g
      );
      setAnnounce(
        `${label(a.left)} ${a.leftPct}%, ${label(a.right)} ${a.rightPct}%. ${a.balanced ? 'Balanced!' : `Tipped by ${a.delta}.`}`
      );
      if (res.session.final) {
        engine.setRevealed(res.session.final.percents);
        setPhase('final');
        setCardOpen(!practice);
      } else setPhase('result');
    } catch (e) {
      engine.charge(false);
      notify(
        e instanceof ApiFailure && e.status !== 0
          ? e.message
          : 'Connection hiccup. Your board was restored.'
      );
      if (!practice)
        await load(game.edition.number); // resync: the server owns attempts
      else retry();
    } finally {
      inFlight.current = false;
    }
  };

  const retry = () => {
    const engine = engineRef.current;
    if (!engine || !game) return;
    engine.resetRound();
    engine.setRevealed(revealedFrom(game.session));
    engine.setMode('weigh');
    setLast(null);
    setPhase('weigh');
  };

  const startPractice = async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    try {
      // Never start with the edition on screen: its weights were just revealed.
      const exclude = game?.edition.number ?? 0;
      const round = await apiGet<PracticeRound>(`practice?exclude=${exclude}`);
      if (!practice && game) dailyRef.current = game;
      const base = dailyRef.current;
      if (!base) return;
      apply({
        ...base,
        edition: round.edition,
        mode: 'archive',
        voters: 0,
        session: { vote: null, attempts: [], final: null, shared: false },
      });
      setPractice(round.percents);
    } catch (e) {
      notify(errorText(e));
    } finally {
      inFlight.current = false;
    }
  };

  const exitPractice = () => {
    const base = dailyRef.current;
    setPractice(null);
    if (!base) return void load(postEdition());
    apply(base);
    setCardOpen(false);
  };

  const toggleMute = () => {
    sound.unlock();
    sound.setMuted(!muted);
    if (muted) sound.play('lock'); // audible confirmation when turning sound back on
    setMuted(!muted);
  };

  // Finished sessions show the last tested pair in the prompt instead of empty slots.
  const shownPair =
    phase === 'final' ? (game?.session.attempts.at(-1) ?? null) : null;

  return (
    // Phones use the full height (thumb zone at the bottom); wide screens get a compact
    // centered column instead of a stretched arena.
    <div className="dot-grid flex h-full items-center justify-center overflow-hidden">
      <div className="relative flex h-full w-full max-w-[760px] sm:max-h-[760px] flex-col overflow-hidden">
        <PromptHeader
          game={game}
          phase={phase}
          practice={Boolean(practice)}
          onExitPractice={exitPractice}
          slotA={phase === 'vote' ? null : label(shownPair?.left ?? slots.left)}
          slotB={
            phase === 'vote' ? null : label(shownPair?.right ?? slots.right)
          }
          muted={muted}
          onToggleMute={toggleMute}
        />
        <div className="relative min-h-0 flex-1">
          <div ref={stageRef} className="absolute inset-0 touch-none" />
          {phase === 'loading' && (
            <p className="pointer-events-none absolute inset-x-0 top-1/3 text-center font-mono text-[12px] tracking-[0.2em] text-muted">
              WEIGHING THE HIVEMIND…
            </p>
          )}
          {phase === 'error' && error && (
            <p className="absolute inset-x-6 top-1/3 text-center text-[14px] text-muted">
              {error}
            </p>
          )}
        </div>
        <ActionBar
          phase={phase}
          practice={Boolean(practice)}
          won={game?.session.final?.won ?? false}
          onPractice={() => void startPractice()}
          onExitPractice={exitPractice}
          canVote={Boolean(votePick)}
          canDrop={Boolean(slots.left && slots.right)}
          last={last}
          attemptsUsed={game?.session.attempts.length ?? 0}
          onVote={lockVote}
          onDrop={drop}
          onRetry={retry}
          onResults={() => setCardOpen(true)}
          onReload={() => void load(game?.edition.number ?? postEdition())}
        />
        <AnimatePresence>
          {cardOpen && game && (
            <EndStateCard
              game={game}
              onClose={() => setCardOpen(false)}
              onPractice={() => {
                setCardOpen(false);
                void startPractice();
              }}
              onPlayEdition={(n) => {
                setPractice(null);
                void load(n);
              }}
              onShared={() =>
                setGame((g) =>
                  g ? { ...g, session: { ...g.session, shared: true } } : g
                )
              }
              onPlayer={(player) => setGame((g) => (g ? { ...g, player } : g))}
            />
          )}
        </AnimatePresence>
        <div aria-live="polite" className="sr-only">
          {announce}
        </div>
      </div>
    </div>
  );
};
