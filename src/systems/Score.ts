import { DRIVE, SCORE } from '../config';

/** One number. No currency, no economy — just something to beat. */
export class ScoreSystem {
  value = 0;
  /** Set for a moment after points land, so the HUD can pop. */
  pulse = 0;
  lastReason = '';

  private streakMs = 0;

  add(points: number, reason: string) {
    if (points <= 0) return;
    this.value += Math.round(points);
    this.pulse = 1;
    this.lastReason = reason;
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
    }
  }

  escaped(level: number) {
    const points = SCORE.escape[Math.min(level, SCORE.escape.length - 1)];
    this.add(points, 'ESCAPED');
  }
}
