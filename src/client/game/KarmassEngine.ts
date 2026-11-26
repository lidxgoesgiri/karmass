// CSP-safe PixiJS build: the Reddit WebView may block `new Function`/eval used by Pixi shader codegen.
import 'pixi.js/unsafe-eval';
import {
  Application,
  Container,
  Graphics,
  Text,
  type FederatedPointerEvent,
} from 'pixi.js';
import type Matter from 'matter-js';
import type { Attempt, PublicOption } from '../../shared/types';
import {
  BALANCED_ZONE_DEG,
  MAX_TILT_DEG,
  massFromPercent,
  tier,
  tiltDegrees,
} from '../../shared/physics';
import { BalanceCore, drawStar } from './BalanceCore';
import { BlockSprite } from './BlockSprite';
import { FxController } from './FxController';
import { PhysicsWorld, computeLayout, type Layout } from './PhysicsWorld';
import { sound } from './SoundSynth';
import { C, FONT_MONO, isLight, loadFonts, onThemeChange } from './theme';

export type EngineMode = 'vote' | 'weigh' | 'locked';
export type EngineHooks = {
  onSlots: (left: string | null, right: string | null) => void;
  onVotePick: (id: string | null) => void;
};

type Place = 'dock' | 'left' | 'right';
type Slot = {
  sprite: BlockSprite;
  index: number;
  place: Place;
  tx: number;
  ty: number;
  body: Matter.Body | null;
  impacted: boolean;
  pct: number;
};
type Drag = {
  id: string;
  sx: number;
  sy: number;
  ox: number;
  oy: number;
  moved: boolean;
  from: Place;
};
type Tween = {
  t: number;
  dur: number;
  step: (k: number) => void;
  done?: () => void;
};
type DropRun = {
  attempt: Attempt;
  impacts: number;
  fallMs: number;
  tiltIn: number | null;
  settleMs: number;
  tiltMs: number;
};

const STEP_MS = 1000 / 60;
const MAX_FRAME_MS = 50;
const SPRING_K = 70;
const TOUCH_LIFT_PX = 36;
const DEG = Math.PI / 180;

const easeOut = (k: number) => 1 - (1 - k) ** 3;

// Orchestrates the PixiJS stage and the Matter.js world (Blueprint §6):
// single Pixi ticker clock, fixed 60 Hz physics with a 50 ms cap, 1:1 transform mirroring.
export class KarmassEngine {
  private app = new Application();
  private world = new Container();
  private glowBack = new Container(); // bloom group: gauge, star, plank + core
  private bg = new Graphics();
  private dockPanel = new Graphics();
  private gauge = new Graphics();
  private fulcrum = new Graphics();
  private pads = new Graphics();
  private padText: Text[] = [];
  private star = new Graphics();
  private plankView = new Container();
  private plankGfx = new Graphics();
  private core = new BalanceCore();
  private blockLayer = new Container();
  private fxLayer = new Container();
  private fx: FxController | null = null;
  private physics: PhysicsWorld | null = null;
  private L: Layout = computeLayout(360, 440);
  private slots = new Map<string, Slot>();
  private mode: EngineMode = 'locked';
  private votePick: string | null = null;
  private drag: Drag | null = null;
  private hoverPad: Place | null = null;
  private tweens: Tween[] = [];
  private theta = 0;
  private omega = 0;
  private thetaTarget = 0;
  private damping = 9;
  private phase: 'idle' | 'charging' | 'falling' | 'tilting' | 'resolved' =
    'idle';
  private run: DropRun | null = null;
  private finishDrop: (() => void) | null = null;
  private clock = 0;
  private acc = 0;
  private plankBalanced = false;
  private unsubTheme: (() => void) | null = null;
  private destroyed = false;
  private resizeObs: ResizeObserver | null = null;

  constructor(private hooks: EngineHooks) {}

  async mount(el: HTMLElement): Promise<void> {
    await Promise.all([
      loadFonts(),
      this.app.init({
        preference: 'webgl', // WebGPU support in mobile WebViews is inconsistent
        resizeTo: el,
        background: C.void,
        antialias: true,
        autoDensity: true,
        resolution: Math.min(window.devicePixelRatio || 1, 2),
      }),
    ]);
    if (this.destroyed) return this.app.destroy(true);
    el.appendChild(this.app.canvas);
    this.app.canvas.style.display = 'block';
    // HUD text above the stage changes height after data loads; window resize alone misses that.
    this.resizeObs = new ResizeObserver(() => this.app.resize());
    this.resizeObs.observe(el);

    this.plankView.addChild(this.plankGfx, this.core);
    this.padText = ['A', 'B'].map(
      (s) =>
        new Text({
          text: `SLOT ${s}`,
          style: {
            fontFamily: FONT_MONO,
            fontSize: 11,
            fill: C.muted,
            letterSpacing: 2,
          },
        })
    );
    this.padText.forEach((t) => t.anchor.set(0.5));
    this.glowBack.addChild(this.gauge, this.star, this.plankView);
    this.world.addChild(
      this.bg,
      this.dockPanel,
      this.fulcrum,
      this.pads,
      ...this.padText,
      this.glowBack,
      this.blockLayer,
      this.fxLayer
    );
    this.app.stage.addChild(this.world);
    this.fx = new FxController(this.app, this.world, this.fxLayer, [
      this.glowBack,
      this.fxLayer,
    ]);

    this.app.stage.eventMode = 'static';
    this.app.stage.hitArea = this.app.screen;
    this.app.stage.on('globalpointermove', (e) => this.onMove(e));
    this.app.stage.on('pointerup', (e) => this.onUp(e));
    this.app.stage.on('pointerupoutside', (e) => this.onUp(e));
    this.app.renderer.on('resize', () => this.relayout());
    this.relayout();
    this.fx.setBloom(!isLight());
    this.unsubTheme = onThemeChange(() => this.retheme());
    this.app.ticker.add((ticker) => this.tick(ticker.deltaMS));
  }

  destroy(): void {
    this.destroyed = true;
    this.resizeObs?.disconnect();
    this.unsubTheme?.();
    this.fx?.destroy();
    this.physics?.destroy();
    this.slots.forEach((s) => s.sprite.destroy());
    if (this.app.renderer) this.app.destroy(true, { children: true });
  }

  // ---------- public API used by the React shell ----------

  setOptions(options: PublicOption[]): void {
    this.slots.forEach((s) => s.sprite.destroy());
    this.slots.clear();
    options.forEach((o, index) => {
      const sprite = new BlockSprite(o.id, o.label);
      sprite.on('pointerdown', (e) => this.onDown(o.id, e));
      this.blockLayer.addChild(sprite);
      this.slots.set(o.id, {
        sprite,
        index,
        place: 'dock',
        tx: 0,
        ty: 0,
        body: null,
        impacted: false,
        pct: 0,
      });
    });
    this.votePick = null;
    this.relayout(true);
  }

  setRevealed(percents: Record<string, number>): void {
    this.slots.forEach((s, id) => s.sprite.setPercent(percents[id] ?? null));
  }

  setMode(mode: EngineMode): void {
    this.mode = mode;
    this.slots.forEach((s, id) => {
      s.sprite.cursor =
        mode === 'weigh' ? 'grab' : mode === 'vote' ? 'pointer' : 'default';
      if (mode === 'vote')
        s.sprite.setLook(id === this.votePick ? 'vote' : 'idle');
      else if (s.place === 'dock' && this.phase === 'idle')
        s.sprite.setLook('idle');
    });
    this.drawPads();
  }

  // Server round-trip in flight: held blocks lift and vibrate ("charging").
  charge(on: boolean): void {
    if (on && this.phase === 'idle') this.phase = 'charging';
    if (!on && this.phase === 'charging') this.phase = 'idle';
  }

  playDrop(attempt: Attempt): Promise<void> {
    const left = this.slots.get(attempt.left);
    const right = this.slots.get(attempt.right);
    if (!this.physics || !left || !right) return Promise.resolve();
    this.phase = 'falling';
    this.thetaTarget = 0;
    const { blockW, blockH } = this.L;
    left.pct = attempt.leftPct;
    right.pct = attempt.rightPct;
    for (const s of [left, right]) {
      s.sprite.rotation = 0;
      s.body = this.physics.addBlock(
        s.sprite.x,
        s.sprite.y,
        blockW,
        blockH,
        massFromPercent(s.pct)
      );
    }
    this.run = {
      attempt,
      impacts: 0,
      fallMs: 0,
      tiltIn: null,
      settleMs: 0,
      tiltMs: 0,
    };
    return new Promise((resolve) => (this.finishDrop = resolve));
  }

  resetRound(): void {
    this.physics?.clearBlocks();
    this.slots.forEach((s) => {
      s.body = null;
      s.impacted = false;
      s.place = 'dock';
      s.sprite.setLook('idle');
    });
    this.run = null;
    this.phase = 'idle';
    this.plankBalanced = false;
    this.restoreCore();
    this.relayout(true);
    this.emitSlots();
  }

  // ---------- input ----------

  private onDown(id: string, e: FederatedPointerEvent): void {
    sound.unlock();
    if (this.mode === 'locked' || this.phase !== 'idle') return;
    const s = this.slots.get(id);
    if (!s) return;
    this.blockLayer.addChild(s.sprite); // bring to front
    this.drag = {
      id,
      sx: e.global.x,
      sy: e.global.y,
      ox: s.sprite.x - e.global.x,
      oy:
        e.pointerType === 'touch'
          ? -TOUCH_LIFT_PX - this.L.blockH / 2
          : s.sprite.y - e.global.y,
      moved: false,
      from: s.place,
    };
  }

  private onMove(e: FederatedPointerEvent): void {
    const d = this.drag;
    if (!d || this.mode !== 'weigh') return;
    if (!d.moved && Math.hypot(e.global.x - d.sx, e.global.y - d.sy) < 6)
      return;
    d.moved = true;
    const s = this.slots.get(d.id);
    if (!s) return;
    s.sprite.position.set(e.global.x + d.ox, e.global.y + d.oy);
    s.sprite.cursor = 'grabbing';
    const pad = this.padAt(s.sprite.x, s.sprite.y);
    if (pad !== this.hoverPad) {
      this.hoverPad = pad;
      this.drawPads();
    }
  }

  private onUp(_e: FederatedPointerEvent): void {
    const d = this.drag;
    this.drag = null;
    if (!d) return;
    const s = this.slots.get(d.id);
    if (!s) return;
    s.sprite.cursor = this.mode === 'weigh' ? 'grab' : 'pointer';
    this.hoverPad = null;

    if (!d.moved) return this.tap(d.id);
    if (this.mode !== 'weigh') return;
    const pad = this.padAt(s.sprite.x, s.sprite.y);
    const back = this.isOverDock(s.sprite.y) ? 'dock' : d.from;
    this.place(d.id, pad ?? (d.from === 'dock' ? 'dock' : back));
    this.drawPads();
    this.emitSlots();
  }

  // Tap (pointer, keyboard or screen reader): vote pick, or quick-slot A then B
  // (a full B is swapped back to the dock); tapping a slotted block returns it.
  tap(id: string): void {
    const s = this.slots.get(id);
    if (!s || this.phase !== 'idle') return;
    if (this.mode === 'vote') {
      this.votePick = this.votePick === id ? null : id;
      this.slots.forEach((o, oid) =>
        o.sprite.setLook(oid === this.votePick ? 'vote' : 'idle')
      );
      sound.play('tick');
      this.hooks.onVotePick(this.votePick);
      return;
    }
    if (this.mode !== 'weigh') return;
    if (s.place === 'dock')
      this.place(id, this.occupant('left') ? 'right' : 'left');
    else this.place(id, 'dock');
    this.drawPads();
    this.emitSlots();
  }

  clearSlots(): void {
    if (this.mode !== 'weigh' || this.phase !== 'idle') return;
    this.slots.forEach((s) => (s.place = 'dock'));
    this.retarget();
    this.drawPads();
    this.emitSlots();
  }

  private place(id: string, to: Place): void {
    const s = this.slots.get(id);
    if (!s) return;
    if (to !== 'dock') {
      const other = this.occupant(to);
      if (other && other !== id) {
        const o = this.slots.get(other);
        if (o) o.place = s.place; // swap: the displaced block takes our old spot
      }
      sound.play('lock');
    } else sound.play('tick');
    s.place = to;
    this.retarget();
  }

  private occupant(place: Place): string | null {
    for (const [id, s] of this.slots) if (s.place === place) return id;
    return null;
  }

  private padAt(x: number, y: number): Place | null {
    const { pivot, padDX, padY, blockW, blockH } = this.L;
    for (const [p, px] of [
      ['left', pivot.x - padDX],
      ['right', pivot.x + padDX],
    ] as const)
      if (Math.abs(x - px) < blockW * 0.7 && Math.abs(y - padY) < blockH * 1.3)
        return p;
    return null;
  }

  private isOverDock(y: number): boolean {
    return y > this.L.dockTop - this.L.blockH / 2;
  }

  private emitSlots(): void {
    this.hooks.onSlots(this.occupant('left'), this.occupant('right'));
  }

  // ---------- layout & drawing ----------

  private relayout(snap = false): void {
    if (this.destroyed || !this.app.renderer) return;
    const resting = [...this.slots.values()].some((s) => s.body);
    if (resting && this.phase !== 'resolved') return; // never mid-drop
    // After a finished drop the blocks only decorate; drop their bodies so the stage can re-fit.
    if (resting) this.slots.forEach((s) => (s.body = null));
    const { width, height } = this.app.screen;
    this.L = computeLayout(width, height);
    const L = this.L;

    this.physics?.destroy();
    this.physics = new PhysicsWorld(L, (b) => this.onImpact(b));
    this.plankView.position.set(L.pivot.x, L.pivot.y);

    this.drawStatic();
    this.restoreCore();

    this.slots.forEach((s) => s.sprite.setBox(L.blockW, L.blockH));
    this.retarget(snap);
    this.drawPads();
  }

  // Everything drawn from the live palette; called on layout and on theme change.
  private drawStatic(): void {
    const L = this.L;
    this.bg.clear();
    for (let x = 11; x < L.W; x += 22)
      for (let y = 11; y < L.H; y += 22) this.bg.circle(x, y, 1);
    this.bg.fill({ color: C.grid });

    this.dockPanel
      .clear()
      .roundRect(L.dockX0 - 6, L.dockTop + 4, L.dockW + 12, L.dockH - 10, 16)
      .fill({ color: C.panel, alpha: 0.92 })
      .stroke({ width: 1, color: C.line, alpha: 0.8 });

    this.drawGauge();
    const base = L.fulcrumH;
    this.fulcrum
      .clear()
      .poly([
        L.pivot.x,
        L.pivot.y + 2,
        L.pivot.x + base * 0.75,
        L.pivot.y + base,
        L.pivot.x - base * 0.75,
        L.pivot.y + base,
      ])
      .fill({ color: C.fulcrum })
      .stroke({ width: 1.5, color: C.line })
      .moveTo(L.W * 0.08, L.pivot.y + base + 1)
      .lineTo(L.W * 0.92, L.pivot.y + base + 1)
      .stroke({ width: 1, color: C.line, alpha: 0.7 });
    drawStar(this.star, 11);
    this.star.position.set(L.pivot.x, L.starY);
    this.drawPlank();
    this.drawPads();
  }

  // Reddit's light/dark toggle reaches the webview as prefers-color-scheme.
  private retheme(): void {
    if (this.destroyed || !this.app.renderer) return;
    this.app.renderer.background.color = C.void;
    this.fx?.setBloom(!isLight()); // neon bloom washes out on a light background
    this.drawStatic();
    this.core.draw();
    this.padText.forEach((t) => (t.style.fill = C.muted));
    this.slots.forEach((sl) => sl.sprite.retheme());
  }

  private retarget(snap = false): void {
    const L = this.L;
    this.slots.forEach((s) => {
      if (s.place === 'dock') {
        const col = s.index % 3;
        const row = Math.floor(s.index / 3);
        s.tx = L.dockX0 + col * (L.blockW + L.gapX) + L.blockW / 2;
        s.ty = L.dockY0 + row * (L.blockH + L.gapY) + L.blockH / 2;
      } else {
        s.tx = L.pivot.x + (s.place === 'left' ? -L.padDX : L.padDX);
        s.ty = L.padY;
      }
      if (snap) s.sprite.position.set(s.tx, s.ty);
    });
  }

  private drawGauge(): void {
    const { pivot, mastR } = this.L;
    const up = -Math.PI / 2;
    const r = mastR + 3;
    this.gauge
      .clear()
      .arc(
        pivot.x,
        pivot.y,
        r,
        up - MAX_TILT_DEG * DEG,
        up + MAX_TILT_DEG * DEG
      )
      .stroke({ width: 3, color: C.line, cap: 'round' })
      .arc(
        pivot.x,
        pivot.y,
        r,
        up - BALANCED_ZONE_DEG * DEG,
        up + BALANCED_ZONE_DEG * DEG
      )
      .stroke({ width: 3, color: C.balance, alpha: 0.75, cap: 'round' });
  }

  private drawPlank(): void {
    const { plankLen: len, plankThick: th, mastR } = this.L;
    this.plankGfx
      .clear()
      .moveTo(0, -th / 2)
      .lineTo(0, -mastR + 12)
      .stroke({ width: 2, color: C.muted, alpha: 0.6 })
      .roundRect(-len / 2, -th / 2, len, th, 4)
      .fill({ color: this.plankBalanced ? C.balance : C.steel })
      .stroke({ width: 1, color: C.ink, alpha: 0.12 })
      .rect(-len / 2, -th / 2 - 16, 6, 16)
      .rect(len / 2 - 6, -th / 2 - 16, 6, 16)
      .fill({ color: C.steel });
  }

  private drawPads(): void {
    const { pivot, padDX, padY, blockW, blockH } = this.L;
    this.pads.clear();
    const show = this.mode === 'weigh' && this.phase === 'idle';
    (['left', 'right'] as const).forEach((p, i) => {
      const cx = pivot.x + (p === 'left' ? -padDX : padDX);
      const txt = this.padText[i];
      const empty = !this.occupant(p);
      if (txt) {
        txt.position.set(cx, padY);
        txt.visible = show && empty;
      }
      if (!show || !empty) return;
      const hot = this.hoverPad === p;
      dashedRect(
        this.pads,
        cx - blockW / 2,
        padY - blockH / 2,
        blockW,
        blockH,
        hot ? C.balance : C.muted
      );
    });
  }

  private restoreCore(): void {
    this.plankView.addChild(this.core);
    this.core.position.set(0, -this.L.mastR);
    this.core.alpha = 1;
    this.core.scale.set(1);
    this.star.scale.set(1);
  }

  // ---------- simulation ----------

  private tick(deltaMS: number): void {
    const dt = Math.min(deltaMS, MAX_FRAME_MS);
    this.clock += dt / 1000;
    this.acc += dt;
    while (this.acc >= STEP_MS) {
      this.stepPlank(STEP_MS / 1000);
      this.physics?.step(STEP_MS);
      this.acc -= STEP_MS;
    }
    this.plankView.rotation = this.theta;

    const lerp = 1 - Math.exp(-dt * 0.018);
    this.slots.forEach((s, id) => {
      const sp = s.sprite;
      if (s.body) {
        sp.position.set(s.body.position.x, s.body.position.y);
        sp.rotation = s.body.angle;
        return;
      }
      if (this.drag?.id === id && this.drag.moved) return;
      const lift = this.phase === 'charging' && s.place !== 'dock' ? -16 : 0;
      sp.x += (s.tx - sp.x) * lerp;
      sp.y += (s.ty + lift - sp.y) * lerp;
      sp.rotation *= 1 - lerp;
      if (this.phase === 'charging' && s.place !== 'dock') {
        sp.x += (Math.random() - 0.5) * 2.4;
        sp.y += (Math.random() - 0.5) * 2.4;
      }
    });

    this.core.pulse(this.clock);
    this.star.rotation += dt * 0.0006;
    this.padText.forEach(
      (t) => (t.alpha = 0.55 + Math.sin(this.clock * 3) * 0.25)
    );
    this.tweens = this.tweens.filter((tw) => {
      tw.t = Math.min(tw.t + dt, tw.dur);
      tw.step(tw.t / tw.dur);
      if (tw.t < tw.dur) return true;
      tw.done?.();
      return false;
    });
    this.fx?.update(dt);
    this.advanceDrop(dt);
  }

  private stepPlank(dt: number): void {
    if (this.phase === 'idle' || this.phase === 'charging') {
      this.thetaTarget = Math.sin(this.clock * 1.1) * 0.025; // attract-mode sway
      this.damping = 9;
    }
    const a =
      SPRING_K * (this.thetaTarget - this.theta) - this.damping * this.omega;
    this.omega += a * dt;
    this.theta += this.omega * dt;
    this.physics?.setPlankAngle(this.theta, this.omega * dt);
  }

  private onImpact(body: Matter.Body): void {
    const s = [...this.slots.values()].find((x) => x.body === body);
    if (!s || s.impacted || !this.run) return;
    s.impacted = true;
    this.run.impacts++;
    const intensity = massFromPercent(s.pct) / 8;
    this.fx?.shockwave(s.sprite.x, s.sprite.y + this.L.blockH / 2);
    this.fx?.shake(3 + intensity * 2);
    sound.play('thump', intensity);
    sound.vibrate(15);
    s.sprite.setPercent(s.pct, true);
    this.omega += (s.place === 'left' ? -1 : 1) * 0.5 * intensity; // the plank feels the hit
  }

  private advanceDrop(dt: number): void {
    const run = this.run;
    if (!run) return;
    if (this.phase === 'falling') {
      run.fallMs += dt;
      if (run.tiltIn === null && (run.impacts >= 2 || run.fallMs > 1400))
        run.tiltIn = 420; // cipher time
      if (run.tiltIn !== null && (run.tiltIn -= dt) <= 0) {
        const { leftPct, rightPct, delta } = run.attempt;
        this.thetaTarget = -tiltDegrees(leftPct, rightPct) * DEG;
        this.damping = tier(delta) === 'close' ? 4.2 : 8; // a close call wobbles dramatically
        this.phase = 'tilting';
      }
      return;
    }
    if (this.phase !== 'tilting') return;
    run.tiltMs += dt;
    const settled =
      Math.abs(this.theta - this.thetaTarget) < 0.004 &&
      Math.abs(this.omega) < 0.03;
    run.settleMs = settled ? run.settleMs + dt : 0;
    if (run.settleMs >= 500 || run.tiltMs > 3500) this.resolve(run.attempt);
  }

  private resolve(a: Attempt): void {
    this.phase = 'resolved';
    const left = this.slots.get(a.left);
    const right = this.slots.get(a.right);
    if (a.balanced) {
      this.plankBalanced = true;
      this.drawPlank();
      left?.sprite.setLook('balance');
      right?.sprite.setLook('balance');
      this.launchCoreToStar();
      sound.vibrate([20, 40, 30]);
    } else {
      const leftHeavy = a.leftPct > a.rightPct;
      left?.sprite.setLook(leftHeavy ? 'heavy' : 'light');
      right?.sprite.setLook(leftHeavy ? 'light' : 'heavy');
      this.fx?.rgbSplit();
      this.fx?.shake(8);
      sound.play('boing');
      sound.vibrate(60);
      this.dropCoreOff(leftHeavy ? -1 : 1);
    }
    setTimeout(() => {
      const done = this.finishDrop;
      this.finishDrop = null;
      done?.();
    }, 1200);
  }

  private launchCoreToStar(): void {
    const from = this.core.getGlobalPosition();
    this.fxLayer.addChild(this.core);
    this.core.position.copyFrom(from);
    const to = { x: this.star.x, y: this.star.y };
    this.tweens.push({
      t: 0,
      dur: 520,
      step: (k) => {
        const e = easeOut(k);
        this.core.position.set(
          from.x + (to.x - from.x) * e,
          from.y + (to.y - from.y) * e - Math.sin(k * Math.PI) * 30
        );
      },
      done: () => {
        this.fx?.burst(to.x, to.y, C.gold, 48);
        this.fx?.shockwave(to.x, to.y);
        sound.play('chime');
        this.tweens.push({
          t: 0,
          dur: 600,
          step: (k) => this.star.scale.set(1 + Math.sin(k * Math.PI) * 0.9),
        });
      },
    });
  }

  private dropCoreOff(side: -1 | 1): void {
    const from = this.core.getGlobalPosition();
    this.fxLayer.addChild(this.core);
    this.core.position.copyFrom(from);
    const end = {
      x: this.L.pivot.x + side * (this.L.plankLen / 2 + 24),
      y: this.L.H + 40,
    };
    this.tweens.push({
      t: 0,
      dur: 900,
      step: (k) => {
        this.core.x = from.x + (end.x - from.x) * k;
        this.core.y =
          from.y + (end.y - from.y) * k * k - Math.sin(k * Math.PI) * 40;
        this.core.rotation = side * k * 4;
        this.core.alpha = 1 - k * 0.6;
      },
    });
  }
}

function dashedRect(
  g: Graphics,
  x: number,
  y: number,
  w: number,
  h: number,
  color: number
): void {
  const dash = 7;
  const gap = 5;
  const edges: [number, number, number, number][] = [
    [x, y, x + w, y],
    [x + w, y, x + w, y + h],
    [x + w, y + h, x, y + h],
    [x, y + h, x, y],
  ];
  for (const [x1, y1, x2, y2] of edges) {
    const len = Math.hypot(x2 - x1, y2 - y1);
    for (let d = 0; d < len; d += dash + gap) {
      const a = d / len;
      const b = Math.min(d + dash, len) / len;
      g.moveTo(x1 + (x2 - x1) * a, y1 + (y2 - y1) * a).lineTo(
        x1 + (x2 - x1) * b,
        y1 + (y2 - y1) * b
      );
    }
  }
  g.stroke({ width: 1.5, color, alpha: 0.8 });
}
