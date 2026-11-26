import { Container, Graphics, Text } from 'pixi.js';
import { C, FONT_DISPLAY, FONT_MONO } from './theme';
import { sound } from './SoundSynth';

export type BlockLook =
  'idle' | 'hover' | 'vote' | 'heavy' | 'light' | 'balance' | 'dim';

const stroke = (
  look: BlockLook
): { color: number; alpha: number; width: number } =>
  ({
    idle: { color: C.line, alpha: 1, width: 1.5 },
    hover: { color: C.ink, alpha: 0.5, width: 1.5 },
    vote: { color: C.gold, alpha: 1, width: 2.5 },
    heavy: { color: C.heavy, alpha: 1, width: 2.5 },
    light: { color: C.light, alpha: 1, width: 2.5 },
    balance: { color: C.balance, alpha: 1, width: 2.5 },
    dim: { color: C.line, alpha: 0.6, width: 1 },
  })[look];

const CIPHER = '0123456789#%$@';

// Glassmorphic word block rendered entirely in the Pixi canvas (Zero-HTML arena rule).
export class BlockSprite extends Container {
  readonly id: string;
  private bg = new Graphics();
  private caption: Text;
  private pct: Text;
  private w = 100;
  private h = 56;
  private look: BlockLook = 'idle';
  private percent: number | null = null;
  private cipherTimer: ReturnType<typeof setInterval> | null = null;

  constructor(id: string, text: string) {
    super();
    this.id = id;
    this.caption = new Text({
      text,
      style: {
        fontFamily: FONT_DISPLAY,
        fontWeight: '600',
        fill: C.ink,
        align: 'center',
        wordWrap: true,
      },
    });
    this.pct = new Text({
      text: '',
      style: {
        fontFamily: FONT_MONO,
        fontWeight: '700',
        fontSize: 12,
        fill: C.balance,
        letterSpacing: 1,
      },
    });
    this.caption.anchor.set(0.5);
    this.pct.anchor.set(0.5);
    this.addChild(this.bg, this.caption, this.pct);
    this.eventMode = 'static';
    this.cursor = 'grab';
  }

  setBox(w: number, h: number): void {
    this.w = w;
    this.h = h;
    const fontSize = w < 110 ? 12.5 : w < 150 ? 14 : 15;
    this.caption.style.fontSize = fontSize;
    this.caption.style.lineHeight = fontSize * 1.15;
    this.caption.style.wordWrapWidth = w - 14;
    this.hitArea = {
      contains: (x: number, y: number) =>
        Math.abs(x) <= w / 2 && Math.abs(y) <= h / 2,
    };
    this.redraw();
  }

  setLook(look: BlockLook): void {
    if (this.look === look) return;
    this.look = look;
    this.redraw();
  }

  setPercent(p: number | null, animate = false): void {
    if (this.cipherTimer) clearInterval(this.cipherTimer);
    this.cipherTimer = null;
    this.percent = p;
    if (p === null) {
      this.pct.text = '';
      this.redraw();
      return;
    }
    const final = `${p}%`;
    if (!animate) {
      this.pct.text = final;
      this.redraw();
      return;
    }
    const start = performance.now();
    this.redraw();
    this.cipherTimer = setInterval(() => {
      if (performance.now() - start >= 400) {
        if (this.cipherTimer) clearInterval(this.cipherTimer);
        this.cipherTimer = null;
        this.pct.text = final;
        return;
      }
      this.pct.text = Array.from(final, (ch) =>
        ch === '%' ? '%' : CIPHER[Math.floor(Math.random() * CIPHER.length)]
      ).join('');
      sound.play('blip');
    }, 45);
  }

  retheme(): void {
    this.caption.style.fill = C.ink;
    this.redraw();
  }

  override destroy(): void {
    if (this.cipherTimer) clearInterval(this.cipherTimer);
    super.destroy({ children: true });
  }

  private redraw(): void {
    const { w, h } = this;
    const s = stroke(this.look);
    this.bg
      .clear()
      .roundRect(-w / 2, -h / 2, w, h, 10)
      .fill({ color: C.block, alpha: 0.94 })
      .stroke({ ...s })
      .moveTo(-w / 2 + 10, -h / 2 + 1.5)
      .lineTo(w / 2 - 10, -h / 2 + 1.5)
      .stroke({ width: 1, color: C.ink, alpha: 0.08 });
    const hasPct = this.percent !== null;
    this.caption.y = hasPct ? -7 : 0;
    this.pct.y = h / 2 - 11;
    this.pct.style.fill =
      this.look === 'heavy'
        ? C.heavy
        : this.look === 'light'
          ? C.light
          : C.balance;
    this.alpha = this.look === 'dim' ? 0.55 : 1;
  }
}
