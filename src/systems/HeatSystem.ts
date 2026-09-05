import { HEAT } from '../config';
import { clamp } from '../util/math';

export type HeatStatus = 'clear' | 'wanted' | 'pursuit' | 'evading';

/**
 * HEAT: a single 0-100 meter. Crashes raise it, police contact holds it,
 * staying clear of every patrol drains it fast.
 */
export class HeatSystem {
  value = 0;
  status: HeatStatus = 'clear';
  /** Seconds spent out of contact; drives the escape drain. */
  evadeTimer = 0;
  /** Set for one frame when the meter crosses into a new level. */
  levelUp = false;

  private lastLevel = 0;
  private flashT = 0;

  get level(): number {
    let lvl = 0;
    for (const t of HEAT.thresholds) if (this.value >= t) lvl++;
    return lvl;
  }

  /** Bright pulse value used by the UI, 0..1. */
  get pulse(): number {
    return this.flashT;
  }

  add(amount: number) {
    if (amount <= 0) return;
    this.value = clamp(this.value + amount, 0, HEAT.max);
    this.flashT = 1;
    this.evadeTimer = 0;
  }

  update(dtMs: number, nearestPoliceDist: number, policeCount: number) {
    const dt = dtMs / 1000;
    this.flashT = Math.max(0, this.flashT - dt * 2.2);

    const inContact = policeCount > 0 && nearestPoliceDist < HEAT.contactRadius;
    if (inContact) {
      this.evadeTimer = 0;
      this.status = 'pursuit';
    } else {
      this.evadeTimer += dt;
      this.status = policeCount > 0 ? 'evading' : this.value > 0 ? 'wanted' : 'clear';
    }

    if (!inContact) {
      const drain = this.evadeTimer > HEAT.escapeTime ? HEAT.escapeDecay : HEAT.idleDecay;
      this.value = clamp(this.value - drain * dt, 0, HEAT.max);
    }

    const lvl = this.level;
    this.levelUp = lvl > this.lastLevel;
    this.lastLevel = lvl;
  }
}
