import { useEffect, useState } from 'react';

const GLYPHS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789#%$@';

const reducedMotion = (): boolean =>
  window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;

// Decrypt/scramble text effect (original implementation; no React Bits code).
export const useScramble = (text: string, durationMs = 700): string => {
  const [out, setOut] = useState(text);
  useEffect(() => {
    if (reducedMotion()) return;
    const start = performance.now();
    let raf = 0;
    const frame = (now: number) => {
      const k = Math.min((now - start) / durationMs, 1);
      const locked = Math.floor(k * text.length);
      setOut(
        Array.from(text, (ch, i) =>
          i < locked || ch === ' '
            ? ch
            : GLYPHS[Math.floor(Math.random() * GLYPHS.length)]
        ).join('')
      );
      if (k < 1) raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [text, durationMs]);
  return reducedMotion() ? text : out;
};

export const useNow = (intervalMs: number): number => {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
};

// Number ticker with ease-out.
export const useCountUp = (target: number, durationMs = 900): number => {
  const [value, setValue] = useState(0);
  useEffect(() => {
    const start = performance.now();
    let raf = 0;
    const frame = (now: number) => {
      const k = Math.min((now - start) / durationMs, 1);
      setValue(Math.round(target * (1 - (1 - k) ** 3)));
      if (k < 1) raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [target, durationMs]);
  return value;
};

export const formatCountdown = (ms: number): string => {
  const s = Math.max(0, Math.floor(ms / 1000));
  const hh = String(Math.floor(s / 3600)).padStart(2, '0');
  const mm = String(Math.floor((s % 3600) / 60)).padStart(2, '0');
  const ss = String(s % 60).padStart(2, '0');
  return `${hh}:${mm}:${ss}`;
};

const SEEN_KEY = 'karmass:seenHelp';

export const hasSeenHelp = (): boolean => {
  try {
    return localStorage.getItem(SEEN_KEY) === '1';
  } catch {
    return true; // storage blocked: don't nag on every visit
  }
};

export const markHelpSeen = (): void => {
  try {
    localStorage.setItem(SEEN_KEY, '1');
  } catch {
    // storage unavailable inside some WebViews
  }
};
