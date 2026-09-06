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
  /** Small line above the headline, e.g. ENTERING. */
  kicker?: string;
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
  announce(title: string, line = '', kicker = '', ms = 2600) {
    this.announcement = { kicker, title, line };
    this.announceMs = ms;
    this.announceTotal = ms;
  }

  update(dtMs: number) {
    if (this.announceMs <= 0) return;
    this.announceMs -= dtMs;
    if (this.announceMs <= 0) this.announcement = null;
  }

  private announceTotal = 2600;

  /** 0..1, snapping in fast and easing out — arcade, not cinematic. */
  get announceAlpha(): number {
    if (this.announceMs <= 0) return 0;
    const elapsed = this.announceTotal - this.announceMs;
    if (elapsed < 90) return elapsed / 90;
    if (this.announceMs < 380) return this.announceMs / 380;
    return 1;
  }

  /** 0..1 for a quick scale punch as a notification lands. */
  get announcePunch(): number {
    const elapsed = this.announceTotal - this.announceMs;
    return elapsed < 220 ? 1 - elapsed / 220 : 0;
  }
}
