import { DRIVE, SCORE } from '../config';

/** One number. No currency, no economy — just something to beat. */
export class ScoreSystem {
  value = 0;
  /** Highest score this player has reached; survives starting a new run. */
  best = 0;
  /** Set for a moment after points land, so the HUD can pop. */
  pulse = 0;
  lastReason = '';

  private streakMs = 0;

  add(points: number, reason: string) {
    if (points <= 0) return;
    this.value += Math.round(points);
    this.best = Math.max(this.best, this.value);
    this.pulse = 1;
    this.lastReason = reason;
  }

  set(value: number, best: number) {
    this.value = Math.max(0, Math.round(value));
    this.best = Math.max(this.best, best, this.value);
  }

  /** Sustained speed pays, so driving fast is worth something on its own. */
  update(dtMs: number, driving: boolean, forwardSpeed: number) {
    this.pulse = Math.max(0, this.pulse - dtMs / 900);

    const fast = driving && Math.abs(forwardSpeed) > DRIVE.maxSpeed * SCORE.streakSpeed;
    if (!fast) {
      this.streakMs = 0;
      return;
    }
    this.streakMs += dtMs;
    if (this.streakMs >= 1000) {
      this.streakMs -= 1000;
      this.value += Math.round(SCORE.streakRate);
      this.best = Math.max(this.best, this.value);
    }
  }

  escaped(level: number) {
    const points = SCORE.escape[Math.min(level, SCORE.escape.length - 1)];
    this.add(points, 'ESCAPED');
  }
}
