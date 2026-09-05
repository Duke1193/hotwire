/**
 * All audio is synthesised at runtime with the Web Audio API — there are no
 * sound files in this project, so nothing here can be anyone else's work.
 * Everything is deliberately quiet: this is a bed, not a soundtrack.
 */
const STORE_KEY = 'getaway.muted';

export class AudioBus {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private ambientGain: GainNode | null = null;
  private engineOsc: OscillatorNode | null = null;
  private engineGain: GainNode | null = null;
  private engineFilter: BiquadFilterNode | null = null;
  private sirenOsc: OscillatorNode | null = null;
  private sirenGain: GainNode | null = null;
  private sirenLfo: OscillatorNode | null = null;
  private noise: AudioBuffer | null = null;
  private lastShout = 0;
  private lastHorn = 0;

  muted = localStorage.getItem(STORE_KEY) === '1';

  /** Must be called from a user gesture (the PLAY button). */
  start() {
    if (this.ctx) return;
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
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
    this.startAmbience();
    this.buildEngine();
    this.buildSiren();
  }

  setMuted(muted: boolean) {
    this.muted = muted;
    localStorage.setItem(STORE_KEY, muted ? '1' : '0');
    if (this.master && this.ctx) {
      this.master.gain.setTargetAtTime(muted ? 0 : 0.5, this.ctx.currentTime, 0.05);
    }
  }

  private makeNoise(ctx: AudioContext, seconds: number): AudioBuffer {
    const buf = ctx.createBuffer(1, ctx.sampleRate * seconds, ctx.sampleRate);
    const data = buf.getChannelData(0);
    let last = 0;
    for (let i = 0; i < data.length; i++) {
      // brown-ish noise reads as distant city rather than hiss
      last = (last + Math.random() * 2 - 1) * 0.5;
      data[i] = last;
    }
    return buf;
  }

  /** Low rumble of a city that is always somewhere over there. */
  private startAmbience() {
    const ctx = this.ctx!;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    src.loop = true;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 340;
    this.ambientGain = ctx.createGain();
    this.ambientGain.gain.value = 0.16;
    src.connect(filter).connect(this.ambientGain).connect(this.master!);
    src.start();
  }

  private buildEngine() {
    const ctx = this.ctx!;
    this.engineOsc = ctx.createOscillator();
    this.engineOsc.type = 'sawtooth';
    this.engineOsc.frequency.value = 60;
    this.engineFilter = ctx.createBiquadFilter();
    this.engineFilter.type = 'lowpass';
    this.engineFilter.frequency.value = 420;
    this.engineGain = ctx.createGain();
    this.engineGain.gain.value = 0;
    this.engineOsc.connect(this.engineFilter).connect(this.engineGain).connect(this.master!);
    this.engineOsc.start();
  }

  private buildSiren() {
    const ctx = this.ctx!;
    this.sirenOsc = ctx.createOscillator();
    this.sirenOsc.type = 'square';
    this.sirenOsc.frequency.value = 640;
    this.sirenGain = ctx.createGain();
    this.sirenGain.gain.value = 0;
    this.sirenLfo = ctx.createOscillator();
    this.sirenLfo.frequency.value = 0.9;
    const lfoDepth = ctx.createGain();
    lfoDepth.gain.value = 150;
    this.sirenLfo.connect(lfoDepth).connect(this.sirenOsc.frequency);
    const soften = ctx.createBiquadFilter();
    soften.type = 'lowpass';
    soften.frequency.value = 1400;
    this.sirenOsc.connect(soften).connect(this.sirenGain).connect(this.master!);
    this.sirenOsc.start();
    this.sirenLfo.start();
  }

  /** Engine note follows the car; 0 when on foot. */
  engine(speedRatio: number, throttle: number) {
    if (!this.ctx || !this.engineOsc) return;
    const t = this.ctx.currentTime;
    const target = speedRatio > 0.001 || throttle > 0 ? 0.05 + throttle * 0.05 : 0;
    this.engineGain!.gain.setTargetAtTime(target, t, 0.08);
    this.engineOsc.frequency.setTargetAtTime(52 + speedRatio * 150, t, 0.09);
    this.engineFilter!.frequency.setTargetAtTime(320 + speedRatio * 900, t, 0.12);
  }

  /** Siren volume tracks how close the nearest patrol is. */
  siren(active: boolean, closeness: number) {
    if (!this.ctx || !this.sirenGain) return;
    const target = active ? 0.02 + closeness * 0.05 : 0;
    this.sirenGain.gain.setTargetAtTime(target, this.ctx.currentTime, 0.25);
  }

  horn(pan = 0, distance = 0) {
    const now = performance.now();
    if (now - this.lastHorn < 260) return;
    this.lastHorn = now;
    this.blip(392, 0.22, 0.05 * falloff(distance), pan, 'square', 494);
  }

  crash(strength: number, pan = 0) {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = 260 + strength * 40;
    filter.Q.value = 0.8;
    const gain = ctx.createGain();
    const vol = Math.min(0.32, 0.05 + strength * 0.035);
    gain.gain.setValueAtTime(vol, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.34);
    src.connect(filter).connect(gain).connect(this.panner(pan));
    src.start(0, Math.random() * 1.5, 0.4);
  }

  shout(pan = 0, distance = 0) {
    const now = performance.now();
    if (now - this.lastShout < 900) return;
    this.lastShout = now;
    this.blip(520 + Math.random() * 180, 0.16, 0.035 * falloff(distance), pan, 'triangle');
  }

  private blip(freq: number, seconds: number, volume: number, pan: number, type: OscillatorType, second?: number) {
    if (!this.ctx || volume <= 0.001) return;
    const ctx = this.ctx;
    const out = this.panner(pan);
    const play = (f: number) => {
      const osc = ctx.createOscillator();
      osc.type = type;
      osc.frequency.value = f;
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(volume, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + seconds);
      osc.connect(gain).connect(out);
      osc.start();
      osc.stop(ctx.currentTime + seconds + 0.02);
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
