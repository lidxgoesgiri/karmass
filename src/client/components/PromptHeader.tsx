import { Fragment } from 'react';
import type { GameState } from '../../shared/types';
import { BALANCE_THRESHOLD, MAX_ATTEMPTS } from '../../shared/physics';
import { pad3 } from '../api';
import { CloseIcon, SoundIcon } from './Icons';

export type Phase =
  'loading' | 'error' | 'vote' | 'weigh' | 'dropping' | 'result' | 'final';

type Props = {
  game: GameState | null;
  phase: Phase;
  practice: boolean;
  slotA: string | null;
  slotB: string | null;
  muted: boolean;
  onToggleMute: () => void;
  onExitPractice: () => void;
};

const hintFor = (
  phase: Phase,
  game: GameState | null,
  practice: boolean
): string => {
  if (!game) return 'Loading today’s Hivemind…';
  const retry = game.session.attempts.length > 0;
  switch (phase) {
    case 'vote':
      return 'Step 1 · Tap the answer you honestly believe fits best, then lock your vote.';
    case 'weigh':
      if (retry) return 'Use the revealed weights to deduce a balanced pair.';
      if (practice)
        return 'Practice · past edition · unlimited rounds, no score or streak.';
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
      if (practice)
        return game.session.final?.won
          ? 'Balanced! Ready for another round?'
          : 'Ratio’d. Shake it off and try another round.';
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
  practice,
  slotA,
  slotB,
  muted,
  onToggleMute,
  onExitPractice,
}: Props) => {
  const used = game?.session.attempts.length ?? 0;
  const parts = (game?.edition.prompt ?? '').split(/(\{A\}|\{B\})/);
  return (
    <header className="mx-auto w-full max-w-[720px] shrink-0 px-3 pt-2 pb-1.5">
      <div className="flex min-h-11 items-center gap-2 font-mono text-[10.5px] tracking-[0.14em] text-muted">
        <span className="shrink-0 text-ink">
          KARMASS #{game ? pad3(game.edition.number) : '---'}
        </span>
        {game && practice && (
          <button
            className="flex shrink-0 items-center gap-1 rounded-full border border-gold/60 px-2 py-0.5 text-gold"
            onClick={onExitPractice}
            aria-label="Exit practice mode"
          >
            PRACTICE
            <CloseIcon size={12} />
          </button>
        )}
        {game && !practice && (
          <span className="flex shrink-0 items-center gap-1 rounded-full border border-line px-2 py-0.5">
            <span
              className={`size-1.5 rounded-full ${game.mode === 'live' ? 'bg-win' : 'bg-muted'}`}
            />
            {game.mode === 'live' ? 'LIVE' : 'ARCHIVE'}
          </span>
        )}
        {game && !practice && (
          <span className="hidden truncate min-[360px]:inline">
            {game.voters} {game.voters === 1 ? 'VOTE' : 'VOTES'}
          </span>
        )}
        <span
          className="ml-auto flex shrink-0 items-center gap-1"
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
          className="-mr-2 grid size-11 shrink-0 place-items-center rounded-full text-muted hover:text-ink"
          onClick={onToggleMute}
          aria-label={muted ? 'Unmute sound' : 'Mute sound'}
        >
          <SoundIcon muted={muted} />
        </button>
      </div>
      <p className="text-[15px] leading-snug font-semibold [text-wrap:balance] sm:text-[17px]">
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
        {hintFor(phase, game, practice)}
      </p>
    </header>
  );
};

// whitespace-nowrap keeps a chip's border from splitting across two lines on narrow phones.
const SlotChip = ({ label, name }: { label: string | null; name: string }) =>
  label ? (
    <span className="mx-0.5 inline-block rounded-md border border-win/60 bg-win/10 px-1.5 whitespace-nowrap text-win">
      {label}
    </span>
  ) : (
    <span className="slot-pulse mx-0.5 inline-block rounded-md border border-dashed border-muted/60 px-1.5 font-mono text-[12px] tracking-widest whitespace-nowrap text-muted">
      [ SLOT {name} ]
    </span>
  );
