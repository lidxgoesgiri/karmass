import bank from '../data/editions.json' with { type: 'json' };
import type { Edition, PublicEdition, Theme } from '../../shared/types.ts';

const THEMES: readonly string[] = [
  'Relatable Habits',
  'Internet & Tech',
  'Reddit Classics',
];
const isTheme = (t: string): t is Theme => THEMES.includes(t);

const EDITIONS: Edition[] = bank.map((e) => {
  if (!isTheme(e.theme))
    throw new Error(`Unknown theme in edition #${e.number}: ${e.theme}`);
  return { ...e, theme: e.theme };
});

export const BANK_SIZE = EDITIONS.length;

// Edition numbers keep counting after the bank runs out; content cycles.
export const editionFor = (n: number): Edition => {
  const base = EDITIONS[(((n - 1) % BANK_SIZE) + BANK_SIZE) % BANK_SIZE]!;
  return { ...base, number: n };
};

// Deterministic per-edition shuffle so display order never leaks seed weights.
export const publicEdition = (n: number, date: string): PublicEdition => {
  const ed = editionFor(n);
  const rand = mulberry32(n * 7919);
  const options = ed.options.map(({ id, label }) => ({ id, label }));
  for (let i = options.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [options[i], options[j]] = [options[j]!, options[i]!];
  }
  return { number: n, theme: ed.theme, prompt: ed.prompt, date, options };
};

export const blankPrompt = (prompt: string): string =>
  prompt.replace('{A}', '___').replace('{B}', '___');

export const postTitle = (n: number): string =>
  `KARMASS #${String(n).padStart(3, '0')}: ${blankPrompt(editionFor(n).prompt)}`;

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
