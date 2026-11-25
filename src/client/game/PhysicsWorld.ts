import Matter from 'matter-js';

export type Layout = {
  W: number;
  H: number;
  dockTop: number;
  dockX0: number;
  dockY0: number;
  dockW: number;
  dockH: number;
  gapX: number;
  gapY: number;
  blockW: number;
  blockH: number;
  pivot: { x: number; y: number };
  plankLen: number;
  plankThick: number;
  mastR: number;
  fulcrumH: number;
  padY: number;
  padDX: number;
  starY: number;
};

const clamp = (v: number, lo: number, hi: number) =>
  Math.max(lo, Math.min(hi, v));

// Stage (seesaw) on top, 3×2 dock in the bottom ~38% thumb zone. Fits 360×(620-HUD) and 720×512.
export const computeLayout = (W: number, H: number): Layout => {
  const dockH = clamp(H * 0.38, 124, 196);
  const dockTop = H - dockH;
  const dockW = Math.min(W - 20, 640);
  const gapX = 8;
  const gapY = 8;
  const blockW = (dockW - 2 * gapX) / 3;
  const blockH = clamp((dockH - 28 - gapY) / 2, 46, 64);
  const stageH = dockTop;
  const plankThick = 10;
  const plankLen = Math.min(W * 0.84, blockW * 2 + 160, 560);
  const pivot = { x: W / 2, y: stageH * 0.74 };
  const mastR = clamp(stageH * 0.2, 32, 60);
  const fulcrumH = clamp(stageH - pivot.y - 8, 24, 46);
  const padY =
    pivot.y - plankThick / 2 - blockH / 2 - Math.max(28, stageH * 0.12);
  const padDX = Math.max(
    plankLen / 2 - blockW / 2 - 8,
    blockW / 2 + mastR * 0.5 + 6
  );
  return {
    W,
    H,
    dockTop,
    dockX0: (W - dockW) / 2,
    dockY0: dockTop + (dockH - (2 * blockH + gapY)) / 2,
    dockW,
    dockH,
    gapX,
    gapY,
    blockW,
    blockH,
    pivot,
    plankLen,
    plankThick,
    mastR,
    fulcrumH,
    padY,
    padDX,
    starY: Math.max(16, pivot.y - mastR - 40),
  };
};

// Matter.js world: a kinematic (static, angle-driven) plank with end lips + dynamic word blocks.
// The plank angle is driven by the engine so the visual always matches the server verdict.
export class PhysicsWorld {
  readonly engine = Matter.Engine.create({
    gravity: { x: 0, y: 1, scale: 0.001 * 1.35 },
  });
  readonly plank: Matter.Body;
  private blocks = new Set<Matter.Body>();

  constructor(L: Layout, onImpact: (block: Matter.Body) => void) {
    const { x, y } = L.pivot;
    const half = L.plankLen / 2;
    const lipH = 16;
    const parts = [
      Matter.Bodies.rectangle(x, y, L.plankLen, L.plankThick),
      Matter.Bodies.rectangle(
        x - half + 3,
        y - L.plankThick / 2 - lipH / 2,
        6,
        lipH
      ),
      Matter.Bodies.rectangle(
        x + half - 3,
        y - L.plankThick / 2 - lipH / 2,
        6,
        lipH
      ),
    ];
    this.plank = Matter.Body.create({
      parts,
      friction: 0.6,
      frictionStatic: 0.9,
    });
    Matter.Body.setStatic(this.plank, true);
    Matter.Composite.add(this.engine.world, this.plank);

    Matter.Events.on(this.engine, 'collisionStart', (e) => {
      for (const { bodyA, bodyB } of e.pairs) {
        if (bodyA.parent === this.plank && this.blocks.has(bodyB))
          onImpact(bodyB);
        else if (bodyB.parent === this.plank && this.blocks.has(bodyA))
          onImpact(bodyA);
      }
    });
  }

  // angularVelocity is per fixed step; keeping it in sync lets resting blocks ride the plank.
  setPlankAngle(angle: number, perStepVelocity: number): void {
    Matter.Body.setAngle(this.plank, angle);
    Matter.Body.setAngularVelocity(this.plank, perStepVelocity);
  }

  addBlock(
    x: number,
    y: number,
    w: number,
    h: number,
    mass: number
  ): Matter.Body {
    const body = Matter.Bodies.rectangle(x, y, w, h, {
      chamfer: { radius: 8 },
      restitution: 0.25,
      friction: 0.6,
      frictionStatic: 0.9,
    });
    Matter.Body.setMass(body, mass);
    this.blocks.add(body);
    Matter.Composite.add(this.engine.world, body);
    return body;
  }

  clearBlocks(): void {
    this.blocks.forEach((b) => Matter.Composite.remove(this.engine.world, b));
    this.blocks.clear();
  }

  step(ms: number): void {
    Matter.Engine.update(this.engine, ms);
  }

  destroy(): void {
    Matter.Events.off(this.engine, 'collisionStart', undefined);
    Matter.Engine.clear(this.engine);
  }
}
