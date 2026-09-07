/**
 * Spoken mission flavour.
 *
 * Every line here is written for this game and spoken by the browser's own
 * speech synthesiser at request time. There are no voice files in this
 * repository, nothing is recorded, and nothing is transcribed from anywhere
 * else — the words below are ours and deliberately generic street-dispatch
 * phrasing rather than anything quoted.
 *
 * The audio is a bonus, never the message: the same words always go up on
 * screen through the announcement system, so a device with no speech support,
 * a muted tab or a player who has turned voice off loses nothing.
 */
const STORE_KEY = 'getaway.voice';

export type VoiceLine =
  | 'jobOffer'
  | 'jobPickup'
  | 'jobDrop'
  | 'jobDone'
  | 'jobFailed'
  | 'heatUp'
  | 'escaped'
  | 'busted';

/** Two or three per moment so a session does not repeat itself immediately. */
const LINES: Record<VoiceLine, string[]> = {
  jobOffer: ['Job on the board. Get moving.', 'Work came in. Take it.', 'Got something for you. Go.'],
  jobPickup: ['Package is waiting. Pick it up.', 'Grab the parcel and roll.', 'Collect it. Do not hang about.'],
  jobDrop: ['Take it across town.', 'Drop point is marked. Move.', 'Deliver it. Clock is running.'],
  jobDone: ['Clean work. Paid.', 'Delivered. Nice.', 'That is done. Good.'],
  jobFailed: ['You lost it. Forget the money.', 'Job is dead. Move on.', 'That one is gone.'],
  heatUp: ['Units are on you.', 'They have called it in.', 'Heat is climbing. Lose them.'],
  escaped: ['You are clear. Stay quiet.', 'Lost them. Keep it that way.', 'Clean. Go dark for a bit.'],
  busted: ['They got you.', 'That is a pull over.', 'Caught. Bad night.'],
};

/**
 * Wraps the Web Speech API, which is present on Safari, Chrome and Firefox but
 * is allowed to do nothing at all — every call here is best effort.
 */
export class Voice {
  /** Player preference, remembered. Independent of the sound toggle. */
  enabled = localStorage.getItem(STORE_KEY) !== '0';
  /** Called just before a line, so a squelch can open the channel. */
  onOpen: (() => void) | null = null;

  private synth: SpeechSynthesis | null = null;
  private voice: SpeechSynthesisVoice | null = null;
  private lastAt = 0;
  private lastIndex: Partial<Record<VoiceLine, number>> = {};

  get available(): boolean {
    return this.synth !== null;
  }

  /** Called from the same user gesture that starts the audio context. */
  start() {
    if (this.synth) return;
    const synth = typeof window !== 'undefined' ? window.speechSynthesis : undefined;
    if (!synth || typeof SpeechSynthesisUtterance !== 'function') return;
    this.synth = synth;
    this.pickVoice();
    // Safari populates the voice list asynchronously, sometimes long after.
    synth.addEventListener?.('voiceschanged', () => this.pickVoice());
  }

  setEnabled(on: boolean) {
    this.enabled = on;
    localStorage.setItem(STORE_KEY, on ? '1' : '0');
    if (!on) this.stop();
  }

  stop() {
    try {
      this.synth?.cancel();
    } catch {
      /* nothing to cancel */
    }
  }

  /**
   * Speaks one line for a moment. `muted` follows the game's sound toggle, so
   * turning the game down turns dispatch down with it.
   */
  say(kind: VoiceLine, muted: boolean) {
    if (!this.enabled || muted || !this.synth) return;
    const now = performance.now();
    // Dispatch does not talk over itself, and never twice in a breath.
    if (now - this.lastAt < 2600) return;
    this.lastAt = now;

    const line = this.pick(kind);
    let utterance: SpeechSynthesisUtterance;
    try {
      utterance = new SpeechSynthesisUtterance(line);
    } catch {
      return;
    }
    if (this.voice) utterance.voice = this.voice;
    utterance.lang = this.voice?.lang ?? 'en-US';
    // Clipped and a little flat: someone reading off a handset, not acting.
    utterance.rate = 1.14;
    utterance.pitch = 0.82;
    utterance.volume = 0.85;

    this.onOpen?.();
    try {
      this.synth.cancel();
      this.synth.speak(utterance);
    } catch {
      /* a browser is entitled to refuse */
    }
  }

  /** Never the same line twice in a row for the same moment. */
  private pick(kind: VoiceLine): string {
    const options = LINES[kind];
    let index = (Math.random() * options.length) | 0;
    if (options.length > 1 && index === this.lastIndex[kind]) index = (index + 1) % options.length;
    this.lastIndex[kind] = index;
    return options[index];
  }

  private pickVoice() {
    if (!this.synth) return;
    let voices: SpeechSynthesisVoice[] = [];
    try {
      voices = this.synth.getVoices();
    } catch {
      return;
    }
    if (!voices.length) return;
    const english = voices.filter((v) => v.lang?.toLowerCase().startsWith('en'));
    // Prefer a local voice: a network one would round-trip the line, and the
    // line is meant to land the instant the mission does.
    this.voice = english.find((v) => v.localService) ?? english[0] ?? null;
  }
}
