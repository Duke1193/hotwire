export type ObjectiveKind = 'crewwar' | 'heatrun' | 'pursuit' | 'busted' | 'job' | 'free';

export interface Objective {
  kind: ObjectiveKind;
  /** Short heading, e.g. HOT DELIVERY. */
  title: string;
  /** What to actually do, in plain words. */
  line: string;
  /** Metres to the target, when there is one. */
  distance?: number;
  /** Seconds remaining, when something is on a clock. */
  seconds?: number;
  /** Anything else worth a glance: HEAT 3, or a crew score. */
  extra?: string;
  accent?: number;
}

export interface Announcement {
  title: string;
  line: string;
}

const FREE_ROAM: Objective = {
  kind: 'free',
  title: 'FREE ROAM',
  line: 'Find a job or cause some trouble',
};

/**
 * One answer to "what matters right now?".
 *
 * The game pushes a new objective whenever the situation changes; anything
 * that changes the heading or the instruction also fires a centre-screen
 * announcement, so a change can never be missed just because someone was
 * looking at the road.
 */
export class Objectives {
  current: Objective = FREE_ROAM;
  /** Set for a couple of seconds when something changes. */
  announcement: Announcement | null = null;
  announceMs = 0;

  private key = '';

  set(objective: Objective) {
    const key = `${objective.kind}|${objective.title}|${objective.line}`;
    this.current = objective;
    if (key === this.key) return;
    this.key = key;
    if (objective.kind !== 'free' || this.announceMs > 0) this.announce(objective.title, objective.line);
  }

  free() {
    this.set(FREE_ROAM);
  }

  /** Force a notification without changing the persistent card. */
  announce(title: string, line: string) {
    this.announcement = { title, line };
    this.announceMs = 2600;
  }

  update(dtMs: number) {
    if (this.announceMs <= 0) return;
    this.announceMs -= dtMs;
    if (this.announceMs <= 0) this.announcement = null;
  }

  /** 0..1, used to fade the centre notification in and out. */
  get announceAlpha(): number {
    if (this.announceMs <= 0) return 0;
    if (this.announceMs > 2200) return (2600 - this.announceMs) / 400;
    if (this.announceMs < 450) return this.announceMs / 450;
    return 1;
  }
}
