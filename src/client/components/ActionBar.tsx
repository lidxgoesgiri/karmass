import type { Attempt } from '../../shared/types';
import { MAX_ATTEMPTS } from '../../shared/physics';
import type { Phase } from './PromptHeader';

type Props = {
  phase: Phase;
  practice: boolean;
  won: boolean;
  canVote: boolean;
  canDrop: boolean;
  last: Attempt | null;
  attemptsUsed: number;
  onVote: () => void;
  onDrop: () => void;
  onRetry: () => void;
  onResults: () => void;
  onPractice: () => void;
  onExitPractice: () => void;
  onReload: () => void;
};

const primary =
  'min-h-12 rounded-full px-5 font-bold tracking-wide transition active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-40';
const secondary = `${primary} border border-line bg-block text-ink`;

export const ActionBar = (p: Props) => {
  const left = MAX_ATTEMPTS - p.attemptsUsed;
  return (
    <footer className="mx-auto flex w-full max-w-[720px] shrink-0 items-center justify-center gap-2.5 px-3 pt-1.5 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
      {p.phase === 'vote' && (
        <button
          className={`${primary} w-full max-w-sm bg-gold text-void`}
          disabled={!p.canVote}
          onClick={p.onVote}
        >
          LOCK MY VOTE
        </button>
      )}
      {(p.phase === 'weigh' || p.phase === 'dropping') && (
        <button
          className={`${primary} w-full max-w-sm bg-heavy text-void ${p.canDrop && p.phase === 'weigh' ? 'drop-ready' : ''}`}
          disabled={!p.canDrop || p.phase === 'dropping'}
          onClick={p.onDrop}
        >
          {p.phase === 'dropping' ? 'WEIGHING…' : 'DROP!'}
        </button>
      )}
      {p.phase === 'result' && p.last && (
        <>
          <div className="min-w-0 font-mono text-[11px] leading-tight tracking-wider text-muted">
            <div className="text-light">TIPPED · Δ {p.last.delta}</div>
            <div>
              {left} {left === 1 ? 'DROP' : 'DROPS'} LEFT
            </div>
          </div>
          <button className={`${primary} bg-ink text-void`} onClick={p.onRetry}>
            TRY AGAIN
          </button>
        </>
      )}
      {p.phase === 'final' && p.practice && (
        <>
          <div
            className={`min-w-0 font-mono text-[11px] leading-tight tracking-wider ${p.won ? 'text-win' : 'text-light'}`}
          >
            {p.won ? 'BALANCED' : 'RATIO’D'}
            {p.last ? ` · Δ ${p.last.delta}` : ''}
          </div>
          <button
            className={`${primary} bg-gold text-void`}
            onClick={p.onPractice}
          >
            NEXT ROUND
          </button>
          <button className={secondary} onClick={p.onExitPractice}>
            EXIT
          </button>
        </>
      )}
      {p.phase === 'final' && !p.practice && (
        <>
          <button
            className={`${secondary} max-w-56 flex-1`}
            onClick={p.onResults}
          >
            RESULTS
          </button>
          <button
            className={`${primary} max-w-56 flex-1 bg-gold text-void`}
            onClick={p.onPractice}
          >
            PRACTICE ∞
          </button>
        </>
      )}
      {p.phase === 'error' && (
        <button
          className={`${primary} w-full max-w-sm bg-ink text-void`}
          onClick={p.onReload}
        >
          RETRY
        </button>
      )}
    </footer>
  );
};
