import './index.css';

import { requestExpandedMode } from '@devvit/web/client';
import { StrictMode, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import type { SplashData } from '../shared/types';
import { apiGet, pad3 } from './api';
import { useScramble } from './hooks';

// Inline feed view: React + CSS only (no PixiJS / Matter.js) so it loads in well under a second.
// Tap/click input only; the game opens in expanded mode from a real click.
export const Splash = () => {
  const [data, setData] = useState<SplashData | null>(null);
  const title = useScramble('KARMASS', 900);

  useEffect(() => {
    apiGet<SplashData>('splash', 6000).then(setData, () => setData(null));
  }, []);

  const cta = !data
    ? 'WEIGH TODAY’S PROMPT'
    : data.finished
      ? 'SEE YOUR RESULT'
      : data.mode === 'archive'
        ? 'PLAY THIS ARCHIVE EDITION'
        : 'WEIGH TODAY’S PROMPT';

  return (
    <main className="dot-grid flex h-full flex-col items-center justify-center gap-3 overflow-hidden px-5 text-center">
      <p className="flex items-center gap-1.5 rounded-full border border-line bg-void/80 px-3 py-1 font-mono text-[10.5px] tracking-[0.14em] text-muted">
        <span
          className={`size-1.5 rounded-full ${data?.mode === 'archive' ? 'bg-muted' : 'bg-win shadow-[0_0_8px_var(--color-win)]'}`}
        />
        {data ? (
          <>
            {data.mode === 'live' ? 'LIVE' : 'ARCHIVE'} · EDITION #
            {pad3(data.edition)}
            <span className="hidden min-[340px]:inline">
              {' '}
              · {data.voters} {data.voters === 1 ? 'VOTE' : 'VOTES'}
            </span>
          </>
        ) : (
          'DAILY EDITION'
        )}
      </p>

      <div>
        <h1 className="font-mono text-[clamp(38px,13vw,68px)] leading-none font-bold tracking-[0.08em]">
          {title}
        </h1>
        <p className="mt-1 text-[13px] tracking-wide text-muted">
          Weigh the Hivemind.
        </p>
      </div>

      <Seesaw />

      <p className="max-w-[34ch] text-[14px] leading-snug font-semibold [text-wrap:balance] text-ink/90">
        {data?.prompt ?? 'Drop 2 words with balanced Hivemind weight.'}
      </p>

      <button
        className="drop-ready min-h-12 rounded-full bg-heavy px-7 font-bold tracking-wide text-on-accent transition active:scale-[0.97]"
        onClick={(e) => requestExpandedMode(e.nativeEvent, 'game')}
      >
        {cta}
      </button>

      <p className="font-mono text-[10.5px] tracking-[0.12em] text-muted">
        {data?.finished
          ? data.won
            ? 'YOU BALANCED IT TODAY'
            : 'RATIO’D TODAY · TRY TOMORROW'
          : data && data.streak > 0
            ? `STREAK: ${data.streak} ${data.streak === 1 ? 'DAY' : 'DAYS'} · KEEP IT ALIVE`
            : 'VOTE · DROP · BALANCE · 3 TRIES'}
      </p>
    </main>
  );
};

// Original emblem: triangle fulcrum, beam with two word blocks, Balance Core and equilibrium star.
const Seesaw = () => (
  <svg
    width="220"
    height="92"
    viewBox="0 0 220 92"
    aria-hidden="true"
    className="max-w-[70vw]"
  >
    <path
      d="M110 18 l3 6 6 3 -6 3 -3 6 -3 -6 -6 -3 6 -3z"
      className="fill-gold"
    />
    <g className="sway">
      <rect
        x="40"
        y="46"
        width="44"
        height="18"
        rx="5"
        strokeWidth="1.5"
        className="fill-block stroke-heavy"
      />
      <rect
        x="136"
        y="46"
        width="44"
        height="18"
        rx="5"
        strokeWidth="1.5"
        className="fill-block stroke-light"
      />
      <line
        x1="110"
        y1="66"
        x2="110"
        y2="44"
        strokeWidth="1.5"
        className="stroke-muted"
      />
      <path
        d="M110 36 l7 7 -7 7 -7 -7z"
        strokeWidth="1.5"
        className="fill-block stroke-ink"
      />
      <circle cx="110" cy="43" r="2.2" className="fill-win" />
      <rect
        x="26"
        y="64"
        width="168"
        height="6"
        rx="3"
        className="fill-steel"
      />
    </g>
    <path
      d="M110 70 L126 90 L94 90 Z"
      strokeWidth="1.5"
      className="fill-fulcrum stroke-line"
    />
  </svg>
);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Splash />
  </StrictMode>
);
