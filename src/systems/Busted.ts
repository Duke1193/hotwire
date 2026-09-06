import { BUSTED } from '../config';
import { clamp } from '../util/math';

export interface ContainmentInput {
  policeCount: number;
  nearestDist: number;
  speed: number;
  inVehicle: boolean;
}

/**
 * Getting caught.
 *
 * Being near a patrol is not an arrest — being *held* by one is. Progress only
 * builds while a unit is in contact range and you are barely moving, and it
 * drains quickly the moment you get going again. Driving past a patrol at
 * speed, or trading paint at 120km/h, can never busted you.
 */
export class Capture {
  /** 0..1. At 1 the player is caught. */
  progress = 0;
  contained = false;
  /** Seconds of grace after being released, so you are not re-arrested instantly. */
  immunity = 0;

  update(dtMs: number, input: ContainmentInput): boolean {
    const dt = dtMs / 1000;
    if (this.immunity > 0) {
      this.immunity = Math.max(0, this.immunity - dt);
      this.progress = 0;
      this.contained = false;
      return false;
    }

    this.contained =
      input.policeCount > 0 && input.nearestDist < BUSTED.range && Math.abs(input.speed) < BUSTED.escapeSpeed;

    if (this.contained) {
      const seconds = input.inVehicle ? BUSTED.inVehicle : BUSTED.onFoot;
      this.progress = clamp(this.progress + dt / seconds, 0, 1);
    } else {
      this.progress = clamp(this.progress - dt * BUSTED.recover, 0, 1);
    }

    if (this.progress >= 1) {
      this.progress = 0;
      this.contained = false;
      this.immunity = BUSTED.immunityMs / 1000;
      return true;
    }
    return false;
  }

  reset(immunityMs = BUSTED.immunityMs) {
    this.progress = 0;
    this.contained = false;
    this.immunity = immunityMs / 1000;
  }
}
