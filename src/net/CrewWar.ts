import { CREW_WAR } from '../config';
import { track } from '../systems/Analytics';
import { crewAccent } from '../systems/Crew';
import type { MultiplayerSystem } from './Multiplayer';

type Phase = 'idle' | 'running' | 'over';

interface Wire {
  kind: 'start' | 'point' | 'end';
  crew?: string;
  name?: string;
  points?: number;
  reason?: string;
  winner?: string;
}

export interface CrewScore {
  tag: string;
  name: string;
  points: number;
  accent: number;
}

/**
 * One shared crew mode: first crew to ten points.
 *
 * Every point is broadcast and every client keeps the same tally, so all of
 * them reach the same total. There is no referee — two clients could disagree
 * about a photo finish if messages cross — which is the same accepted trade
 * as the Heat Run.
 */
export class CrewWar {
  phase: Phase = 'idle';
  winner: CrewScore | null = null;
  timer = 0;

  private scores = new Map<string, CrewScore>();

  constructor(private net: MultiplayerSystem) {}

  get active() {
    return this.phase === 'running';
  }

  /** Highest first, capped for display. */
  get board(): CrewScore[] {
    return [...this.scores.values()].sort((a, b) => b.points - a.points);
  }

  get leader(): CrewScore | null {
    return this.board[0] ?? null;
  }

  pointsFor(tag: string | undefined): number {
    return tag ? (this.scores.get(tag)?.points ?? 0) : 0;
  }

  start() {
    if (this.phase === 'running') return;
    this.begin();
    this.net.sendEvent('cw', { kind: 'start' } satisfies Wire);
    track('crew_war_started');
  }

  /** Called when the local player earns something worth a point. */
  award(tag: string | undefined, name: string | undefined, points: number, reason: string) {
    if (!this.active || !tag || points <= 0) return;
    this.apply(tag, name ?? tag, points);
    this.net.sendEvent('cw', { kind: 'point', crew: tag, name: name ?? tag, points, reason } satisfies Wire);
  }

  onNetEvent(type: string, payload: unknown) {
    if (type !== 'cw') return;
    const msg = payload as Wire;
    if (!msg?.kind) return;

    if (msg.kind === 'start') {
      if (this.phase !== 'running') this.begin();
      return;
    }
    if (msg.kind === 'point' && msg.crew) {
      if (this.phase !== 'running') this.begin();
      this.apply(msg.crew, msg.name ?? msg.crew, msg.points ?? 1);
      return;
    }
    if (msg.kind === 'end' && this.phase === 'running') {
      this.finish(this.scores.get(msg.winner ?? '') ?? this.leader);
    }
  }

  update(dtMs: number, onFinished: (winner: CrewScore | null) => void) {
    if (this.phase === 'idle') return;
    this.timer -= dtMs;

    if (this.phase === 'over') {
      if (this.timer <= 0) this.reset();
      return;
    }

    const leader = this.leader;
    if (leader && leader.points >= CREW_WAR.target) {
      this.net.sendEvent('cw', { kind: 'end', winner: leader.tag } satisfies Wire);
      this.finish(leader);
      onFinished(leader);
      return;
    }
    if (this.timer <= 0) {
      this.finish(this.leader);
      onFinished(this.leader);
    }
  }

  private apply(tag: string, name: string, points: number) {
    const existing = this.scores.get(tag);
    if (existing) {
      existing.points += points;
      if (name) existing.name = name;
    } else {
      this.scores.set(tag, { tag, name, points, accent: crewAccent(tag) });
    }
  }

  private begin() {
    this.phase = 'running';
    this.timer = CREW_WAR.durationMs;
    this.winner = null;
    this.scores.clear();
  }

  private finish(winner: CrewScore | null) {
    this.phase = 'over';
    this.timer = CREW_WAR.resultMs;
    this.winner = winner;
    track('crew_war_completed', { points: winner?.points ?? 0 });
  }

  private reset() {
    this.phase = 'idle';
    this.winner = null;
    this.timer = 0;
    this.scores.clear();
  }
}
