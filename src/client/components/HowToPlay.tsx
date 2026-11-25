import { motion } from 'motion/react';
import { BALANCE_THRESHOLD, MAX_ATTEMPTS } from '../../shared/physics';
import { CloseIcon } from './Icons';

const STEPS = [
  {
    title: 'Vote',
    body: 'Tap the answer you honestly believe fits best. Your vote adds weight to that word for everyone today.',
    color: 'text-gold',
  },
  {
    title: 'Weigh',
    body: 'Drag (or tap) two words onto the seesaw and press DROP! Each word weighs its share of today’s votes.',
    color: 'text-heavy',
  },
  {
    title: 'Balance',
    body: `Within ${BALANCE_THRESHOLD} points is balanced. Tipped? The tested weights stay revealed, so use your ${MAX_ATTEMPTS} drops to deduce a pair.`,
    color: 'text-win',
  },
];

// First-visit explainer (also behind the ? button). Kept to three steps so play starts in seconds.
export const HowToPlay = ({ onClose }: { onClose: () => void }) => (
  <motion.div
    className="absolute inset-0 z-30 flex items-end justify-center bg-void/70 p-2 backdrop-blur-sm sm:items-center"
    initial={{ opacity: 0 }}
    animate={{ opacity: 1 }}
    exit={{ opacity: 0 }}
  >
    <motion.section
      role="dialog"
      aria-modal="true"
      aria-labelledby="how-title"
      className="beam w-full max-w-[420px] rounded-2xl border border-line bg-panel/95 p-4"
      initial={{ y: 30, scale: 0.97 }}
      animate={{ y: 0, scale: 1 }}
      exit={{ y: 20, opacity: 0 }}
      transition={{ type: 'spring', stiffness: 420, damping: 32 }}
    >
      <div className="flex items-start justify-between">
        <div>
          <p className="font-mono text-[10.5px] tracking-[0.14em] text-muted">
            HOW TO PLAY · 60 SECONDS A DAY
          </p>
          <h2
            id="how-title"
            className="font-mono text-xl font-bold tracking-wide"
          >
            WEIGH THE HIVEMIND
          </h2>
        </div>
        <button
          className="grid size-11 place-items-center rounded-full text-muted hover:text-ink"
          onClick={onClose}
          aria-label="Close how to play"
        >
          <CloseIcon />
        </button>
      </div>
      <ol className="mt-3 space-y-3">
        {STEPS.map((s, i) => (
          <li key={s.title} className="flex gap-3">
            <span
              className={`grid size-7 shrink-0 place-items-center rounded-full border border-line font-mono text-[12px] font-bold ${s.color}`}
            >
              {i + 1}
            </span>
            <div>
              <p className={`font-bold ${s.color}`}>{s.title}</p>
              <p className="text-[13px] leading-snug text-muted">{s.body}</p>
            </div>
          </li>
        ))}
      </ol>
      <p className="mt-3 text-[11.5px] leading-snug text-muted">
        New edition every day at 00:00 UTC. Finished? Play unlimited Practice
        rounds. Keyboard: <kbd className="font-mono">1–6</kbd> pick,{' '}
        <kbd className="font-mono">Enter</kbd> confirm,{' '}
        <kbd className="font-mono">Backspace</kbd> clear.
      </p>
      <button
        autoFocus
        className="mt-4 min-h-12 w-full rounded-full bg-heavy font-bold tracking-wide text-on-accent transition active:scale-[0.97]"
        onClick={onClose}
      >
        LET&apos;S WEIGH
      </button>
    </motion.section>
  </motion.div>
);
