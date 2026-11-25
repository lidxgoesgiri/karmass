import { useCallback, useEffect, useRef, useState } from 'react';
import { AnimatePresence } from 'motion/react';
import { context } from '@devvit/web/client';
import type {
  Attempt,
  DropResponse,
  GameState,
  Session,
} from '../shared/types';
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
      const res = await apiPost<DropResponse>(
        'drop',
        { edition: game.edition.number, left: slots.left, right: slots.right },
        5000
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
        setCardOpen(true);
      } else setPhase('result');
    } catch (e) {
      engine.charge(false);
      notify(
        e instanceof ApiFailure && e.status !== 0
          ? e.message
          : 'Connection hiccup. Your board was restored.'
      );
      await load(game.edition.number); // resync: the server is the source of truth for attempts
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

  const toggleMute = () => {
    sound.unlock();
    sound.setMuted(!muted);
    setMuted(!muted);
  };

  return (
    <div className="relative flex h-full flex-col overflow-hidden">
      <PromptHeader
        game={game}
        phase={phase}
        slotA={phase === 'vote' ? null : label(slots.left)}
        slotB={phase === 'vote' ? null : label(slots.right)}
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
            onPlayEdition={(n) => void load(n)}
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
  );
};
