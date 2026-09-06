import { SCORE } from '../config';
import { track } from '../systems/Analytics';
import type { MultiplayerSystem } from './Multiplayer';

type Phase = 'idle' | 'running' | 'over';

interface Wire {
  kind: 'start' | 'armed' | 'win';
  nickname: string;
}

const RUN_MS = 180000;
const RESULT_MS = 7000;

/**
 * The one shared challenge: get to HEAT 2, then get back to zero. First one
 * out wins.
 *
 * ARBITRATION LIMITATION: there is no server, so each client simply believes
 * the first `win` message it sees. In a photo finish two clients can disagree
 * about the winner. That is an accepted trade for a social prototype — the
 * alternative is a coordinator process we deliberately are not building.
 */
export class HeatRun {
  phase: Phase = 'idle';
  /** Headline and sub-line for the HUD banner. */
  title = '';
  subtitle = '';

  private timer = 0;
  private armed = new Set<string>();
  private names = new Map<string, string>();
  private localArmed = false;
  private winner: string | null = null;

  constructor(private net: MultiplayerSystem, private nickname: string, private selfId: string) {}

  get active() {
    return this.phase !== 'idle';
  }

  /** Kick one off locally and tell the room. */
  start() {
    if (this.phase === 'running') return;
    this.begin();
    this.net.sendEvent('hr', { kind: 'start', nickname: this.nickname } satisfies Wire);
    track('heat_run_started');
  }

  onNetEvent(type: string, payload: unknown, from: string) {
    if (type !== 'hr') return;
    const msg = payload as Wire;
    if (!msg?.kind) return;
    this.names.set(from, (msg.nickname || 'PLAYER').toUpperCase());

    switch (msg.kind) {
      case 'start':
        if (this.phase !== 'running') this.begin();
        break;
      case 'armed':
        this.armed.add(from);
        break;
      case 'win':
        if (!this.winner) this.finish(from);
        break;
    }
  }

  update(dtMs: number, heat: number, heatLevel: number, police: number, onWin: (points: number) => void) {
    if (this.phase === 'idle') return;

    this.timer -= dtMs;

    if (this.phase === 'over') {
      if (this.timer <= 0) this.reset();
      return;
    }

    if (this.timer <= 0) {
      this.title = 'HEAT RUN OVER';
      this.subtitle = 'NOBODY GOT OUT';
      this.phase = 'over';
      this.timer = RESULT_MS;
      return;
    }

    if (!this.localArmed && heatLevel >= 2) {
      this.localArmed = true;
      this.armed.add(this.selfId);
      this.names.set(this.selfId, this.nickname.toUpperCase());
      this.net.sendEvent('hr', { kind: 'armed', nickname: this.nickname } satisfies Wire);
    }

    if (this.localArmed && !this.winner && heat <= 0 && police === 0) {
      this.net.sendEvent('hr', { kind: 'win', nickname: this.nickname } satisfies Wire);
      this.finish(this.selfId);
      onWin(SCORE.heatRunWin);
      track('heat_run_completed', { won: true });
    }

    this.describe();
  }

  private begin() {
    this.phase = 'running';
    this.timer = RUN_MS;
    this.armed.clear();
    this.localArmed = false;
    this.winner = null;
    this.title = 'HEAT RUN';
    this.subtitle = 'GET TO HEAT 2 AND ESCAPE';
  }

  private describe() {
    this.title = 'HEAT RUN';
    if (!this.armed.size) {
      this.subtitle = 'GET TO HEAT 2 AND ESCAPE';
      return;
    }
    const names: string[] = [];
    for (const id of this.armed) names.push(`${this.names.get(id) ?? 'PLAYER'} HAS HEAT`);
    this.subtitle = names.slice(0, 3).join('   ·   ');
  }

  private finish(winnerId: string) {
    this.winner = winnerId;
    this.phase = 'over';
    this.timer = RESULT_MS;
    const name = winnerId === this.selfId ? this.nickname.toUpperCase() : (this.names.get(winnerId) ?? 'PLAYER');
    this.title = `${name} ESCAPED`;
    this.subtitle = winnerId === this.selfId ? `+${SCORE.heatRunWin}` : 'HEAT RUN OVER';
    if (winnerId !== this.selfId) track('heat_run_completed', { won: false });
  }

  private reset() {
    this.phase = 'idle';
    this.title = '';
    this.subtitle = '';
    this.armed.clear();
    this.localArmed = false;
    this.winner = null;
  }
}
