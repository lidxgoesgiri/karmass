import { Fragment } from 'react';
import type { GameState } from '../../shared/types';
import { BALANCE_THRESHOLD, MAX_ATTEMPTS } from '../../shared/physics';
import { pad3 } from '../api';
import { SoundIcon } from './Icons';

export type Phase =
  'loading' | 'error' | 'vote' | 'weigh' | 'dropping' | 'result' | 'final';

type Props = {
  game: GameState | null;
  phase: Phase;
  slotA: string | null;
  slotB: string | null;
  muted: boolean;
  onToggleMute: () => void;
};

const hintFor = (phase: Phase, game: GameState | null): string => {
  if (!game) return 'Loading today’s Hivemind…';
  const retry = game.session.attempts.length > 0;
  switch (phase) {
    case 'vote':
      return 'Step 1 · Tap the answer you honestly believe fits best, then lock your vote.';
    case 'weigh':
      if (retry) return 'Use the revealed weights to deduce a balanced pair.';
      if (game.mode === 'archive')
        return 'Archive edition · final weights · streaks unaffected.';
      if (!game.player.loggedIn)
        return 'Guest play · sign in to vote, rank and keep a streak.';
      return `Step 2 · Drop 2 words whose Hivemind weights differ by ${BALANCE_THRESHOLD} points or less.`;
    case 'dropping':
      return 'Weighing the Hivemind…';
    case 'result':
      return 'Tipped. The tested weights stay revealed on the dock.';
    case 'final':
      return game.session.final?.won
        ? 'Balanced. See how the Hivemind voted.'
        : 'Ratio’d. All weights unlocked.';
    default:
      return '';
  }
};

export const PromptHeader = ({
  game,
  phase,
  slotA,
  slotB,
  muted,
  onToggleMute,
}: Props) => {
  const used = game?.session.attempts.length ?? 0;
  const parts = (game?.edition.prompt ?? '').split(/(\{A\}|\{B\})/);
  return (
    <header className="mx-auto w-full max-w-[720px] shrink-0 px-3 pt-2.5 pb-2">
      <div className="flex items-center gap-2 font-mono text-[10.5px] tracking-[0.14em] text-muted">
        <span className="text-ink">
          KARMASS #{game ? pad3(game.edition.number) : '---'}
        </span>
        {game && (
          <span className="flex items-center gap-1 rounded-full border border-line px-2 py-0.5">
            <span
              className={`size-1.5 rounded-full ${game.mode === 'live' ? 'bg-win' : 'bg-muted'}`}
            />
            {game.mode === 'live' ? 'LIVE' : 'ARCHIVE'}
          </span>
        )}
        {game && (
          <span className="hidden min-[340px]:inline">{game.voters} VOTES</span>
        )}
        <span
          className="ml-auto flex items-center gap-1"
          aria-label={`${MAX_ATTEMPTS - used} attempts left`}
        >
          {Array.from({ length: MAX_ATTEMPTS }, (_, i) => (
            <span
              key={i}
              className={`size-2 rounded-full ${i < MAX_ATTEMPTS - used ? 'bg-win shadow-[0_0_8px_#00F5A0]' : 'bg-line'}`}
            />
          ))}
        </span>
        <button
          className="-mr-1 grid size-9 place-items-center rounded-full text-muted hover:text-ink"
          onClick={onToggleMute}
          aria-label={muted ? 'Unmute sound' : 'Mute sound'}
        >
          <SoundIcon muted={muted} />
        </button>
      </div>
      <p className="mt-0.5 text-[15px] leading-snug font-semibold [text-wrap:balance] sm:text-[17px]">
        {parts.map((part, i) =>
          part === '{A}' || part === '{B}' ? (
            <SlotChip
              key={i}
              label={part === '{A}' ? slotA : slotB}
              name={part === '{A}' ? 'A' : 'B'}
            />
          ) : (
            <Fragment key={i}>{part}</Fragment>
          )
        )}
      </p>
      <p className="mt-1 text-[12px] leading-tight text-muted">
        {hintFor(phase, game)}
      </p>
    </header>
  );
};

const SlotChip = ({ label, name }: { label: string | null; name: string }) =>
  label ? (
    <span className="mx-0.5 rounded-md border border-win/60 bg-win/10 px-1.5 text-win">
      {label}
    </span>
  ) : (
    <span className="slot-pulse mx-0.5 rounded-md border border-dashed border-muted/60 px-1.5 font-mono text-[12px] tracking-widest text-muted">
      [ SLOT {name} ]
    </span>
  );
