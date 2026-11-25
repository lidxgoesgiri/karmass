// Cyber-Reddit palette (Blueprint §3) as Pixi numeric colors. Dark is the signature look; the
// light palette follows Reddit's theme toggle (prefers-color-scheme), mirroring index.css.
type Palette = Record<
  | 'void'
  | 'grid'
  | 'block'
  | 'panel'
  | 'line'
  | 'steel'
  | 'fulcrum'
  | 'heavy'
  | 'light'
  | 'balance'
  | 'gold'
  | 'ink'
  | 'muted',
  number
>;

const DARK: Palette = {
  void: 0x09090b,
  grid: 0x222228,
  block: 0x141418,
  panel: 0x0e0e12,
  line: 0x27272a,
  steel: 0x3f3f46,
  fulcrum: 0x1c1c21,
  heavy: 0xff4500,
  light: 0x7193ff,
  balance: 0x00f5a0,
  gold: 0xffb800,
  ink: 0xfafafa,
  muted: 0xa1a1aa,
};

const LIGHT: Palette = {
  void: 0xf4f4f6,
  grid: 0xd4d4da,
  block: 0xffffff,
  panel: 0xffffff,
  line: 0xd4d4d8,
  steel: 0xa1a1aa,
  fulcrum: 0xe4e4e7,
  heavy: 0xe63e00,
  light: 0x3d63f5,
  balance: 0x00a870,
  gold: 0xd99a00,
  ink: 0x18181b,
  muted: 0x5c5c66,
};

const query =
  typeof window !== 'undefined' && window.matchMedia
    ? window.matchMedia('(prefers-color-scheme: light)')
    : null;

export const isLight = (): boolean => query?.matches ?? false;

// Live palette: read at draw time, so redrawing after a theme change picks up new colors.
export const C: Palette = { ...(isLight() ? LIGHT : DARK) };

export const onThemeChange = (cb: () => void): (() => void) => {
  const handler = () => {
    Object.assign(C, isLight() ? LIGHT : DARK);
    cb();
  };
  query?.addEventListener('change', handler);
  return () => query?.removeEventListener('change', handler);
};

export const FONT_DISPLAY = 'Space Grotesk, system-ui, sans-serif';
export const FONT_MONO = 'JetBrains Mono, ui-monospace, monospace';

export const loadFonts = async (): Promise<void> => {
  try {
    await Promise.all([
      document.fonts.load('600 14px "Space Grotesk"'),
      document.fonts.load('600 12px "JetBrains Mono"'),
    ]);
  } catch {
    // fall back to system fonts; never block the game on fonts
  }
};
