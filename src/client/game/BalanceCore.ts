import { Container, Graphics } from 'pixi.js';
import { C } from './theme';

// Original geometric emblem riding the balance mast (original art, never Snoo).
export class BalanceCore extends Container {
  private ring = new Graphics();
  private body = new Graphics();

  constructor(private radius = 12) {
    super();
    this.draw();
    this.addChild(this.ring, this.body);
  }

  draw(): void {
    const radius = this.radius;
    this.ring
      .clear()
      .circle(0, 0, radius + 5)
      .stroke({ width: 1.5, color: C.balance, alpha: 0.35 });
    this.body
      .clear()
      .poly([0, -radius, radius, 0, 0, radius, -radius, 0])
      .fill({ color: C.block })
      .stroke({ width: 2, color: C.ink, alpha: 0.9 })
      .circle(0, 0, radius * 0.32)
      .fill({ color: C.balance });
  }

  pulse(t: number): void {
    this.ring.scale.set(1 + Math.sin(t * 3) * 0.08);
    this.ring.alpha = 0.6 + Math.sin(t * 3) * 0.3;
  }
}

// Equilibrium star: the target the core reaches when the plank balances.
export const drawStar = (
  g: Graphics,
  r: number,
  color: number = C.gold
): Graphics => {
  const pts: number[] = [];
  for (let i = 0; i < 8; i++) {
    const a = (Math.PI / 4) * i - Math.PI / 2;
    const rr = i % 2 === 0 ? r : r * 0.38;
    pts.push(Math.cos(a) * rr, Math.sin(a) * rr);
  }
  return g.clear().poly(pts).fill({ color, alpha: 0.95 });
};
