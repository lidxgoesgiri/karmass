import { Container, Graphics, type Application, type Filter } from 'pixi.js';
import {
  AdvancedBloomFilter,
  RGBSplitFilter,
  ShockwaveFilter,
} from 'pixi-filters';

type Particle = {
  g: Graphics;
  vx: number;
  vy: number;
  life: number;
  max: number;
};

const LOW_FPS = 45;
const LOW_FPS_WINDOW_MS = 1000;

// Filters default to resolution 1 and no MSAA, which blurs everything on 125%/150%/200%
// displays. Inherit the renderer's resolution and antialiasing instead.
const crisp = <T extends Filter>(f: T): T => {
  f.resolution = 'inherit';
  f.antialias = 'inherit';
  return f;
};

// Post-processing, particles and screen shake, with a one-way quality fallback on slow devices.
// Bloom only touches the glow layers (gauge, star, plank, particles) so word blocks stay sharp.
export class FxController {
  lowQuality = false;
  private bloom: AdvancedBloomFilter | null = crisp(
    new AdvancedBloomFilter({
      threshold: 0.55,
      bloomScale: 0.9,
      brightness: 1,
      blur: 8,
      quality: 5,
    })
  );
  private shock: { f: ShockwaveFilter; t: number } | null = null;
  private rgb: { f: RGBSplitFilter; t: number } | null = null;
  private shakeLeft = 0;
  private shakePower = 0;
  private particles: Particle[] = [];
  private slowMs = 0;
  private bloomOn = true;

  constructor(
    private app: Application,
    private world: Container,
    private layer: Container,
    private glow: Container[]
  ) {
    this.world.filterArea = this.app.screen;
    this.sync();
  }

  update(dtMs: number): void {
    this.watchFps(dtMs);
    const dt = dtMs / 1000;
    if (this.shock) {
      this.shock.t += dt;
      this.shock.f.time = this.shock.t;
      if (this.shock.t > 0.45) this.clear('shock');
    }
    if (this.rgb) {
      this.rgb.t += dtMs;
      if (this.rgb.t > 140) this.clear('rgb');
    }
    if (this.shakeLeft > 0) {
      this.shakeLeft -= dtMs;
      const k = Math.max(this.shakeLeft, 0) / 220;
      this.world.position.set(
        (Math.random() - 0.5) * this.shakePower * k,
        (Math.random() - 0.5) * this.shakePower * k
      );
    } else this.world.position.set(0, 0);
    this.particles = this.particles.filter((p) => {
      p.life += dtMs;
      p.vy += 900 * dt;
      p.g.x += p.vx * dt;
      p.g.y += p.vy * dt;
      p.g.alpha = Math.max(0, 1 - p.life / p.max);
      if (p.life < p.max) return true;
      p.g.destroy();
      return false;
    });
  }

  shockwave(x: number, y: number): void {
    this.shock = {
      f: crisp(
        new ShockwaveFilter({
          center: { x, y },
          amplitude: 14,
          wavelength: 80,
          speed: 420,
          radius: 170,
          brightness: 1.15,
        })
      ),
      t: 0,
    };
    this.sync();
  }

  rgbSplit(): void {
    this.rgb = {
      f: crisp(
        new RGBSplitFilter({
          red: { x: -6, y: 0 },
          green: { x: 0, y: 3 },
          blue: { x: 6, y: -2 },
        })
      ),
      t: 0,
    };
    this.sync();
  }

  shake(power: number): void {
    this.shakePower = power;
    this.shakeLeft = 220;
  }

  burst(x: number, y: number, color: number, count: number): void {
    const n = this.lowQuality ? Math.ceil(count / 2) : count;
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const speed = 140 + Math.random() * 260;
      const g = new Graphics()
        .circle(0, 0, 1.5 + Math.random() * 2.5)
        .fill({ color });
      g.position.set(x, y);
      this.layer.addChild(g);
      this.particles.push({
        g,
        vx: Math.cos(a) * speed,
        vy: Math.sin(a) * speed - 220,
        life: 0,
        max: 700 + Math.random() * 500,
      });
    }
  }

  setBloom(on: boolean): void {
    this.bloomOn = on;
    this.sync();
  }

  destroy(): void {
    this.particles.forEach((p) => p.g.destroy());
    this.particles = [];
  }

  private watchFps(dtMs: number): void {
    if (this.lowQuality) return;
    this.slowMs = 1000 / Math.max(dtMs, 1) < LOW_FPS ? this.slowMs + dtMs : 0;
    if (this.slowMs < LOW_FPS_WINDOW_MS) return;
    this.lowQuality = true; // one-way: never flap back to bloom mid-session
    this.bloom = null;
    this.sync();
  }

  private clear(which: 'shock' | 'rgb'): void {
    if (which === 'shock') this.shock = null;
    else this.rgb = null;
    this.sync();
  }

  private sync(): void {
    const transient: Filter[] = [];
    if (this.shock) transient.push(this.shock.f);
    if (this.rgb) transient.push(this.rgb.f);
    this.world.filters = transient;
    const bloom = this.bloomOn ? this.bloom : null;
    this.glow.forEach((c) => (c.filters = bloom ? [bloom] : []));
  }
}
