// Zero-asset procedural SFX (Web Audio). The context is created on the first user gesture,
// suspended while the post is hidden, and respects a persisted mute toggle.

type Voice = 'tick' | 'lock' | 'thump' | 'blip' | 'chime' | 'boing' | 'vote';

const MUTE_KEY = 'karmass:muted';
const MASTER_GAIN = 0.9;

class SoundSynth {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  muted = readMuted();

  constructor() {
    document.addEventListener('visibilitychange', () => {
      if (!this.ctx) return;
      if (document.hidden) void this.ctx.suspend().catch(() => {});
      else this.resume();
    });
    // Any real gesture inside the post unlocks audio. Browsers only grant activation on
    // click/pointerup/touchend/keydown (touch pointerdown does not count), so listen to all.
    for (const type of [
      'pointerdown',
      'pointerup',
      'click',
      'touchend',
      'keydown',
    ])
      window.addEventListener(type, () => this.unlock(), {
        capture: true,
        passive: true,
      });
  }

  unlock(): void {
    if (!this.ctx) {
      try {
        this.ctx = new AudioContext();
      } catch {
        return; // Web Audio unavailable: the game stays silent but playable
      }
      this.master = this.ctx.createGain();
      this.master.gain.value = this.muted ? 0 : MASTER_GAIN;
      this.master.connect(this.ctx.destination);
    }
    this.resume();
  }

  private resume(): void {
    if (this.ctx && this.ctx.state !== 'running')
      void this.ctx.resume().catch(() => {});
  }

  setMuted(muted: boolean): void {
    this.muted = muted;
    try {
      localStorage.setItem(MUTE_KEY, muted ? '1' : '0');
    } catch {
      // storage can be unavailable inside some WebViews; mute still works for this session
    }
    if (this.master) this.master.gain.value = muted ? 0 : MASTER_GAIN;
  }

  play(voice: Voice, intensity = 1): void {
    const ctx = this.ctx;
    const out = this.master;
    if (!ctx || !out || this.muted) return;
    // A context that is still starting (or was interrupted) queues sounds until it runs.
    if (ctx.state !== 'running') this.resume();
    const t = ctx.currentTime;
    switch (voice) {
      case 'tick':
        return tone(ctx, out, t, 'square', 1600, 1600, 0.03, 0.06);
      case 'blip':
        return tone(
          ctx,
          out,
          t,
          'triangle',
          1100 + Math.random() * 500,
          900,
          0.03,
          0.05
        );
      case 'lock':
        tone(ctx, out, t, 'sine', 520, 520, 0.05, 0.12);
        return tone(ctx, out, t + 0.05, 'sine', 780, 780, 0.07, 0.12);
      case 'vote':
        tone(ctx, out, t, 'sine', 660, 660, 0.09, 0.14);
        return tone(ctx, out, t + 0.08, 'sine', 990, 990, 0.16, 0.12);
      case 'thump':
        // Sub-bass body plus a mid 'knock' so the impact is audible on laptop/phone speakers.
        tone(ctx, out, t, 'sine', 110 * (0.8 + 0.4 * intensity), 42, 0.22, 0.5);
        tone(
          ctx,
          out,
          t,
          'triangle',
          260 * (0.8 + 0.3 * intensity),
          90,
          0.12,
          0.3
        );
        return noise(ctx, out, t, 0.09, 0.25 * intensity);
      case 'chime':
        [523.25, 659.25, 783.99, 1046.5].forEach((f, i) =>
          tone(ctx, out, t + i * 0.08, 'sine', f, f, 0.7, 0.13)
        );
        return;
      case 'boing':
        return tone(ctx, out, t, 'sine', 320, 85, 0.4, 0.22, 14);
    }
  }
}

function tone(
  ctx: AudioContext,
  out: AudioNode,
  t: number,
  type: OscillatorType,
  from: number,
  to: number,
  dur: number,
  gain: number,
  vibratoHz = 0
): void {
  const osc = ctx.createOscillator();
  const g = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(from, t);
  osc.frequency.exponentialRampToValueAtTime(Math.max(to, 1), t + dur);
  if (vibratoHz) {
    const lfo = ctx.createOscillator();
    const depth = ctx.createGain();
    lfo.frequency.value = vibratoHz;
    depth.gain.value = 18;
    lfo.connect(depth).connect(osc.frequency);
    lfo.start(t);
    lfo.stop(t + dur);
  }
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(gain, t + 0.008);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  osc.connect(g).connect(out);
  osc.start(t);
  osc.stop(t + dur + 0.02);
}

function noise(
  ctx: AudioContext,
  out: AudioNode,
  t: number,
  dur: number,
  gain: number
): void {
  const buf = ctx.createBuffer(
    1,
    Math.ceil(ctx.sampleRate * dur),
    ctx.sampleRate
  );
  const data = buf.getChannelData(0);
  for (let i = 0; i < data.length; i++)
    data[i] = (Math.random() * 2 - 1) * (1 - i / data.length);
  const src = ctx.createBufferSource();
  const filter = ctx.createBiquadFilter();
  const g = ctx.createGain();
  src.buffer = buf;
  filter.type = 'lowpass';
  filter.frequency.value = 1400;
  g.gain.value = gain;
  src.connect(filter).connect(g).connect(out);
  src.start(t);
}

function readMuted(): boolean {
  try {
    return localStorage.getItem(MUTE_KEY) === '1';
  } catch {
    return false;
  }
}

export const sound = new SoundSynth();
