/**
 * Every sound in Getaway is synthesised here at runtime with the Web Audio
 * API. There are no audio files in this repository, nothing is sampled, and
 * nothing imitates a specific cue from another game — the palette is built
 * from oscillators, filtered noise and envelopes we wrote ourselves.
 *
 * The intent is the *feel* of an old top-down arcade driving game: a low city
 * hum, a buzzy engine that tracks speed, harsh tyre scrub, a two-tone siren,
 * and short bright blips for gameplay moments.
 */
const STORE_KEY = 'getaway.muted';
const GAG_KEY = 'getaway.gags';

export type Cue =
  | 'missionAccepted'
  | 'checkpoint'
  | 'missionDone'
  | 'missionFailed'
  | 'heat'
  | 'escaped'
  | 'playerJoined'
  | 'heatRunStart'
  | 'heatRunWin'
  | 'district'
  | 'pickup'
  | 'down'
  | 'wrecked'
  | 'ignite';

interface Note {
  f: number;
  /** seconds from the start of the cue */
  at: number;
  len: number;
  type?: OscillatorType;
  gain?: number;
}

/** Short original motifs. Deliberately plain intervals, no borrowed melodies. */
const CUES: Record<Cue, { notes: Note[]; volume: number }> = {
  missionAccepted: {
    volume: 0.07,
    notes: [
      { f: 523, at: 0, len: 0.09 },
      { f: 784, at: 0.09, len: 0.13 },
    ],
  },
  checkpoint: { volume: 0.06, notes: [{ f: 1046, at: 0, len: 0.07 }] },
  missionDone: {
    volume: 0.08,
    notes: [
      { f: 523, at: 0, len: 0.09 },
      { f: 659, at: 0.09, len: 0.09 },
      { f: 880, at: 0.18, len: 0.2 },
    ],
  },
  missionFailed: {
    volume: 0.07,
    notes: [
      { f: 392, at: 0, len: 0.15, type: 'square' },
      { f: 262, at: 0.14, len: 0.26, type: 'square' },
    ],
  },
  heat: {
    volume: 0.09,
    notes: [
      { f: 116, at: 0, len: 0.16, type: 'sawtooth' },
      { f: 116, at: 0.2, len: 0.22, type: 'sawtooth' },
    ],
  },
  escaped: {
    volume: 0.07,
    notes: [
      { f: 784, at: 0, len: 0.14 },
      { f: 523, at: 0.13, len: 0.34 },
    ],
  },
  playerJoined: {
    volume: 0.06,
    notes: [
      { f: 660, at: 0, len: 0.06, type: 'sine' },
      { f: 990, at: 0.07, len: 0.1, type: 'sine' },
    ],
  },
  heatRunStart: {
    volume: 0.08,
    notes: [
      { f: 349, at: 0, len: 0.1, type: 'square' },
      { f: 523, at: 0.1, len: 0.1, type: 'square' },
      { f: 698, at: 0.2, len: 0.22, type: 'square' },
    ],
  },
  district: {
    volume: 0.055,
    notes: [
      { f: 294, at: 0, len: 0.07, type: 'square' },
      { f: 392, at: 0.07, len: 0.14, type: 'square' },
    ],
  },
  pickup: {
    volume: 0.07,
    notes: [
      { f: 784, at: 0, len: 0.05 },
      { f: 1175, at: 0.05, len: 0.1 },
    ],
  },
  down: {
    volume: 0.085,
    notes: [
      { f: 220, at: 0, len: 0.16, type: 'sawtooth' },
      { f: 147, at: 0.15, len: 0.34, type: 'sawtooth' },
    ],
  },
  ignite: {
    volume: 0.09,
    notes: [
      { f: 92, at: 0, len: 0.3, type: 'sawtooth' },
      { f: 58, at: 0.12, len: 0.34, type: 'sawtooth', gain: 0.8 },
    ],
  },
  wrecked: {
    volume: 0.09,
    notes: [
      { f: 165, at: 0, len: 0.12, type: 'square' },
      { f: 123, at: 0.11, len: 0.14, type: 'square' },
      { f: 82, at: 0.23, len: 0.4, type: 'sawtooth' },
    ],
  },
  heatRunWin: {
    volume: 0.09,
    notes: [
      { f: 523, at: 0, len: 0.09 },
      { f: 659, at: 0.09, len: 0.09 },
      { f: 784, at: 0.18, len: 0.09 },
      { f: 1046, at: 0.27, len: 0.28 },
    ],
  },
};

export class AudioBus {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;

  private engineOsc: OscillatorNode | null = null;
  private engineSub: OscillatorNode | null = null;
  private engineGain: GainNode | null = null;
  private engineFilter: BiquadFilterNode | null = null;

  private tyreGain: GainNode | null = null;
  private tyreFilter: BiquadFilterNode | null = null;

  private sirenOsc: OscillatorNode | null = null;
  private sirenGain: GainNode | null = null;
  private sirenLfo: OscillatorNode | null = null;
  private sirenFilter: BiquadFilterNode | null = null;

  private noise: AudioBuffer | null = null;
  private lastShout = 0;
  private lastChatter = 0;
  private lastGag = 0;
  private lastCrackle = 0;
  private lastHorn = 0;
  private lastSqueal = 0;
  private ambientHornAt = 0;

  muted = localStorage.getItem(STORE_KEY) === '1';
  /** The joke layer. On by default, off in one tap, remembered. */
  gags = localStorage.getItem(GAG_KEY) !== '0';

  /** Must be called from a user gesture — browsers will not start audio otherwise. */
  start() {
    if (this.ctx) {
      void this.ctx.resume();
      return;
    }
    const Ctor =
      window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return;
    try {
      this.ctx = new Ctor();
    } catch {
      return;
    }

    const ctx = this.ctx;
    this.master = ctx.createGain();
    this.master.gain.value = this.muted ? 0 : 0.5;
    this.master.connect(ctx.destination);

    this.noise = this.makeNoise(ctx, 2);
    this.buildAmbience();
    this.buildEngine();
    this.buildTyres();
    this.buildSiren();

    // iOS suspends the context whenever the tab goes away.
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) void this.ctx?.resume();
    });
  }

  setGags(on: boolean) {
    this.gags = on;
    localStorage.setItem(GAG_KEY, on ? '1' : '0');
  }

  setMuted(muted: boolean) {
    this.muted = muted;
    localStorage.setItem(STORE_KEY, muted ? '1' : '0');
    if (this.master && this.ctx) this.master.gain.setTargetAtTime(muted ? 0 : 0.5, this.ctx.currentTime, 0.05);
    if (!muted) void this.ctx?.resume();
  }

  // ------------------------------------------------------------- graph

  private makeNoise(ctx: AudioContext, seconds: number): AudioBuffer {
    const buf = ctx.createBuffer(1, ctx.sampleRate * seconds, ctx.sampleRate);
    const data = buf.getChannelData(0);
    let last = 0;
    for (let i = 0; i < data.length; i++) {
      // brown-ish noise reads as a distant city rather than hiss
      last = (last + Math.random() * 2 - 1) * 0.5;
      data[i] = last;
    }
    return buf;
  }

  private loopNoise(): AudioBufferSourceNode {
    const src = this.ctx!.createBufferSource();
    src.buffer = this.noise;
    src.loop = true;
    src.start();
    return src;
  }

  private buildAmbience() {
    const ctx = this.ctx!;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 340;
    const gain = ctx.createGain();
    gain.gain.value = 0.16;
    this.loopNoise().connect(filter).connect(gain).connect(this.master!);
  }

  private buildEngine() {
    const ctx = this.ctx!;
    this.engineOsc = ctx.createOscillator();
    this.engineOsc.type = 'sawtooth';
    this.engineOsc.frequency.value = 58;
    this.engineSub = ctx.createOscillator();
    this.engineSub.type = 'square';
    this.engineSub.frequency.value = 29;

    this.engineFilter = ctx.createBiquadFilter();
    this.engineFilter.type = 'lowpass';
    this.engineFilter.frequency.value = 420;
    this.engineFilter.Q.value = 3.5;

    this.engineGain = ctx.createGain();
    this.engineGain.gain.value = 0;

    this.engineOsc.connect(this.engineFilter);
    this.engineSub.connect(this.engineFilter);
    this.engineFilter.connect(this.engineGain).connect(this.master!);
    this.engineOsc.start();
    this.engineSub.start();
  }

  private buildTyres() {
    const ctx = this.ctx!;
    this.tyreFilter = ctx.createBiquadFilter();
    this.tyreFilter.type = 'bandpass';
    this.tyreFilter.frequency.value = 1800;
    this.tyreFilter.Q.value = 7;
    this.tyreGain = ctx.createGain();
    this.tyreGain.gain.value = 0;
    this.loopNoise().connect(this.tyreFilter).connect(this.tyreGain).connect(this.master!);
  }

  private buildSiren() {
    const ctx = this.ctx!;
    this.sirenOsc = ctx.createOscillator();
    this.sirenOsc.type = 'square';
    this.sirenOsc.frequency.value = 640;
    this.sirenGain = ctx.createGain();
    this.sirenGain.gain.value = 0;

    this.sirenLfo = ctx.createOscillator();
    this.sirenLfo.type = 'triangle';
    this.sirenLfo.frequency.value = 0.9;
    const depth = ctx.createGain();
    depth.gain.value = 150;
    this.sirenLfo.connect(depth).connect(this.sirenOsc.frequency);

    this.sirenFilter = ctx.createBiquadFilter();
    this.sirenFilter.type = 'lowpass';
    this.sirenFilter.frequency.value = 900;

    this.sirenOsc.connect(this.sirenFilter).connect(this.sirenGain).connect(this.master!);
    this.sirenOsc.start();
    this.sirenLfo.start();
  }

  // -------------------------------------------------------- continuous

  /** Engine note follows speed; a small idle floor keeps a parked car alive. */
  engine(speedRatio: number, throttle: number, seated: boolean) {
    if (!this.ctx || !this.engineOsc) return;
    const t = this.ctx.currentTime;
    const target = seated ? 0.028 + throttle * 0.045 + speedRatio * 0.02 : 0;
    this.engineGain!.gain.setTargetAtTime(target, t, 0.09);
    const rpm = 52 + speedRatio * 170 + throttle * 14;
    this.engineOsc.frequency.setTargetAtTime(rpm, t, 0.08);
    this.engineSub!.frequency.setTargetAtTime(rpm * 0.5, t, 0.12);
    this.engineFilter!.frequency.setTargetAtTime(320 + speedRatio * 1400, t, 0.12);
  }

  /** Tyre scrub while sliding; `slip` is 0..1. */
  tyres(slip: number) {
    if (!this.ctx || !this.tyreGain) return;
    const t = this.ctx.currentTime;
    this.tyreGain.gain.setTargetAtTime(Math.min(0.08, slip * 0.09), t, 0.06);
    this.tyreFilter!.frequency.setTargetAtTime(1500 + slip * 1700, t, 0.08);
  }

  /** Siren volume and urgency track how close the nearest patrol is. */
  siren(active: boolean, closeness: number) {
    if (!this.ctx || !this.sirenGain) return;
    const t = this.ctx.currentTime;
    this.sirenGain.gain.setTargetAtTime(active ? 0.018 + closeness * 0.05 : 0, t, 0.25);
    this.sirenLfo!.frequency.setTargetAtTime(0.75 + closeness * 0.85, t, 0.3);
    this.sirenFilter!.frequency.setTargetAtTime(700 + closeness * 1600, t, 0.3);
  }

  /** Occasional far-off horn so the city keeps talking when nothing happens. */
  ambience(nowMs: number) {
    if (!this.ctx) return;
    if (nowMs < this.ambientHornAt) return;
    this.ambientHornAt = nowMs + 12000 + Math.random() * 22000;
    this.blip(300 + Math.random() * 90, 0.3, 0.012, Math.random() * 2 - 1, 'square', 380);
  }

  // ---------------------------------------------------------- one-shots

  horn(pan = 0, distance = 0) {
    const now = performance.now();
    if (now - this.lastHorn < 260) return;
    this.lastHorn = now;
    this.blip(392, 0.22, 0.05 * falloff(distance), pan, 'square', 494);
  }

  brake(pan = 0) {
    const now = performance.now();
    if (now - this.lastSqueal < 700) return;
    this.lastSqueal = now;
    this.burst(0.22, 0.05, pan, 2400, 9);
  }

  crash(strength: number, pan = 0) {
    // Short, hard and a little crunchy: the hit should land, not rumble on.
    const heavy = strength > 6;
    const vol = Math.min(0.34, 0.06 + strength * 0.036);
    this.burst(heavy ? 0.3 : 0.16, vol, pan, heavy ? 190 : 480, heavy ? 0.6 : 1.6);
    // metallic edge on top of the body of the impact
    this.burst(0.07, vol * 0.6, pan, heavy ? 1900 : 2600, 5);
    if (heavy) this.blip(62, 0.22, 0.085, pan, 'sawtooth');
  }

  /** Each weapon gets its own report so you can hear what is shooting at you. */
  gunshot(weapon: 'pistol' | 'auto' | 'shotgun', pan = 0, distance = 0) {
    const near = falloff(distance);
    if (weapon === 'shotgun') {
      this.burst(0.2, 0.085 * near, pan, 560, 0.9);
      this.blip(84, 0.14, 0.06 * near, pan, 'sawtooth');
      return;
    }
    if (weapon === 'auto') {
      this.burst(0.06, 0.038 * near, pan, 2100, 3.2);
      this.blip(180, 0.05, 0.03 * near, pan, 'square');
      return;
    }
    this.burst(0.1, 0.055 * near, pan, 1250, 2);
    this.blip(140, 0.07, 0.035 * near, pan, 'square');
  }

  /**
   * Police radio: a squelch open, a handful of clipped vowels, a squelch
   * close. Two formant oscillators shaped by a syllable envelope, so it lands
   * as English-shaped speech through a bad speaker without being any words at
   * all — nothing here is recorded, sampled or transcribed from anywhere.
   */
  radio(closeness: number, pan = 0) {
    if (!this.ctx) return;
    const now = performance.now();
    // Short bursts, never a stream: the gap shortens as the heat rises.
    if (now - this.lastChatter < 5200 - closeness * 2600) return;
    this.lastChatter = now;

    const ctx = this.ctx;
    const out = this.panner(pan);
    const level = 0.05 + closeness * 0.05;

    const squelch = (at: number, vol: number) => {
      const src = ctx.createBufferSource();
      src.buffer = this.noise;
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.value = 2400;
      bp.Q.value = 1.4;
      const g = ctx.createGain();
      g.gain.setValueAtTime(vol, at);
      g.gain.exponentialRampToValueAtTime(0.0001, at + 0.05);
      src.connect(bp).connect(g).connect(out);
      src.start(at, Math.random(), 0.08);
    };

    const start = ctx.currentTime + 0.02;
    squelch(start, level * 0.9);

    // The band a hand radio actually passes, and nothing outside it.
    const band = ctx.createBiquadFilter();
    band.type = 'bandpass';
    band.frequency.value = 1500;
    band.Q.value = 1.1;
    const shape = ctx.createGain();
    shape.gain.value = 0;
    band.connect(shape).connect(out);

    const carrier = ctx.createOscillator();
    carrier.type = 'sawtooth';
    const formant = ctx.createOscillator();
    formant.type = 'square';
    carrier.connect(band);
    formant.connect(band);

    let at = start + 0.06;
    const syllables = 4 + ((Math.random() * 5) | 0);
    for (let i = 0; i < syllables; i++) {
      const len = 0.07 + Math.random() * 0.11;
      // Vowel-ish pitches with a falling contour, like someone reading a code
      const pitch = 96 + Math.random() * 54 - i * 3;
      carrier.frequency.setValueAtTime(pitch, at);
      formant.frequency.setValueAtTime(620 + Math.random() * 900, at);
      shape.gain.setValueAtTime(0.0001, at);
      shape.gain.exponentialRampToValueAtTime(level, at + 0.02);
      shape.gain.exponentialRampToValueAtTime(0.0001, at + len);
      at += len + 0.02 + Math.random() * 0.05;
    }

    carrier.start(start);
    formant.start(start);
    carrier.stop(at + 0.1);
    formant.stop(at + 0.1);
    squelch(at + 0.02, level * 0.7);
  }

  /** Low crackle from a burning shell, rate-limited across the whole street. */
  crackle(pan = 0, distance = 0) {
    const now = performance.now();
    if (now - this.lastCrackle < 220) return;
    this.lastCrackle = now;
    const near = falloff(distance);
    this.burst(0.14, 0.03 * near, pan, 420 + Math.random() * 500, 1.2);
  }

  /**
   * The joke. A short descending blat or a clipped burp, from somewhere on
   * the pavement. No gameplay effect, off in Settings, and rare enough that
   * it stays a surprise.
   */
  gag(pan = 0, distance = 0) {
    if (!this.ctx || !this.gags) return;
    const now = performance.now();
    if (now - this.lastGag < 25000) return;
    this.lastGag = now;

    const ctx = this.ctx;
    const out = this.panner(pan);
    const vol = 0.05 * falloff(distance);
    if (vol <= 0.002) return;
    const at = ctx.currentTime + 0.01;
    const burp = Math.random() < 0.42;
    const len = burp ? 0.22 : 0.4;

    const osc = ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(burp ? 128 : 92, at);
    osc.frequency.exponentialRampToValueAtTime(burp ? 62 : 41, at + len);

    // The wobble is the whole joke.
    const lfo = ctx.createOscillator();
    lfo.type = 'square';
    lfo.frequency.value = burp ? 22 : 34;
    const depth = ctx.createGain();
    depth.gain.value = burp ? 26 : 40;
    lfo.connect(depth).connect(osc.frequency);

    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(900, at);
    lp.frequency.exponentialRampToValueAtTime(280, at + len);

    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, at);
    g.gain.exponentialRampToValueAtTime(vol, at + 0.03);
    g.gain.exponentialRampToValueAtTime(0.0001, at + len);

    osc.connect(lp).connect(g).connect(out);
    osc.start(at);
    lfo.start(at);
    osc.stop(at + len + 0.05);
    lfo.stop(at + len + 0.05);
  }

  /** One click of dispatch opening the channel, before a spoken line. */
  squelch(volume = 0.05) {
    this.burst(0.07, volume, 0, 2300, 1.5);
  }

  shout(pan = 0, distance = 0) {
    const now = performance.now();
    if (now - this.lastShout < 900) return;
    this.lastShout = now;
    this.blip(520 + Math.random() * 180, 0.16, 0.035 * falloff(distance), pan, 'triangle');
  }

  cue(name: Cue) {
    const spec = CUES[name];
    if (!spec || !this.ctx) return;
    for (const note of spec.notes) {
      this.blip(note.f, note.len, (note.gain ?? 1) * spec.volume, 0, note.type ?? 'triangle', undefined, note.at);
    }
  }

  // ------------------------------------------------------------ helpers

  private burst(seconds: number, volume: number, pan: number, freq: number, q: number) {
    if (!this.ctx || volume <= 0.001) return;
    const ctx = this.ctx;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = freq;
    filter.Q.value = q;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(volume, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + seconds);
    src.connect(filter).connect(gain).connect(this.panner(pan));
    src.start(0, Math.random() * 1.5, seconds + 0.05);
  }

  private blip(
    freq: number,
    seconds: number,
    volume: number,
    pan: number,
    type: OscillatorType,
    second?: number,
    delay = 0,
  ) {
    if (!this.ctx || volume <= 0.001) return;
    const ctx = this.ctx;
    const out = this.panner(pan);
    const at = ctx.currentTime + delay;
    const play = (f: number) => {
      const osc = ctx.createOscillator();
      osc.type = type;
      osc.frequency.value = f;
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.0001, at);
      gain.gain.exponentialRampToValueAtTime(volume, at + 0.012);
      gain.gain.exponentialRampToValueAtTime(0.0001, at + seconds);
      osc.connect(gain).connect(out);
      osc.start(at);
      osc.stop(at + seconds + 0.03);
    };
    play(freq);
    if (second) play(second);
  }

  private panner(pan: number): AudioNode {
    const ctx = this.ctx!;
    if (!ctx.createStereoPanner) return this.master!;
    const node = ctx.createStereoPanner();
    node.pan.value = Math.max(-1, Math.min(1, pan));
    node.connect(this.master!);
    return node;
  }
}

function falloff(distance: number): number {
  return Math.max(0, 1 - distance / 900);
}
