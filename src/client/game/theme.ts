// Cyber-Reddit palette (Blueprint §3) as Pixi numeric colors.
export const C = {
  void: 0x09090b,
  grid: 0x1f1f24,
  block: 0x141418,
  line: 0x27272a,
  steel: 0x3f3f46,
  heavy: 0xff4500,
  light: 0x7193ff,
  balance: 0x00f5a0,
  gold: 0xffb800,
  ink: 0xfafafa,
  muted: 0xa1a1aa,
} as const;

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
