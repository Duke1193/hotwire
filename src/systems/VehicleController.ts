import Phaser from 'phaser';
import { Controls, Vehicle } from '../entities/Vehicle';
import type { InputState } from './Input';
import { angleDelta, clamp } from '../util/math';

/** Passes the merged keyboard/touch state through to the car. */
export class PlayerDriver {
  readonly controls: Controls = { throttle: 0, brake: 0, steer: 0, handbrake: false };

  control(input: InputState): Controls {
    this.controls.throttle = input.throttle;
    this.controls.brake = input.brake;
    this.controls.steer = input.steer;
    this.controls.handbrake = input.handbrake;
    return this.controls;
  }
}

/** Chase AI: aim at a lead point, back out when wedged against geometry. */
export class AIDriver {
  readonly controls: Controls = { throttle: 0, brake: 0, steer: 0, handbrake: false };
  private stuck = 0;
  private reversing = 0;
  private wobble = Math.random() * 100;

  constructor(private aggression = 1) {}

  control(self: Vehicle, target: Phaser.Math.Vector2, dtMs: number): Controls {
    const c = this.controls;
    const dx = target.x - self.x;
    const dy = target.y - self.y;
    const dist = Math.hypot(dx, dy);
    const delta = angleDelta(self.rotation, Math.atan2(dy, dx));
    this.wobble += dtMs * 0.002;

    if (Math.abs(self.forwardSpeed) < 0.7 && this.reversing <= 0) {
      this.stuck += dtMs;
      if (this.stuck > 620) {
        this.reversing = 780;
        this.stuck = 0;
      }
    } else if (Math.abs(self.forwardSpeed) > 1.2) {
      this.stuck = 0;
    }

    if (this.reversing > 0) {
      this.reversing -= dtMs;
      c.throttle = 0;
      c.brake = 1;
      c.steer = delta > 0 ? -1 : 1;
      c.handbrake = false;
      return c;
    }

    // sharper angle => less throttle, so they actually make the corner
    const align = clamp(1 - Math.abs(delta) / 1.9, 0, 1);
    let throttle = 0.34 + align * 0.66 * this.aggression;
    let brake = 0;

    if (dist < 130 && self.forwardSpeed > 6) {
      throttle = 0;
      brake = 0.6;
    }
    if (Math.abs(delta) > 2.4 && self.forwardSpeed > 5) {
      throttle = 0;
      brake = 0.4;
    }

    c.throttle = throttle;
    c.brake = brake;
    c.steer = clamp(delta * 2.4 + Math.sin(this.wobble) * 0.08, -1, 1);
    c.handbrake = Math.abs(delta) > 1.5 && self.forwardSpeed > 8.4;
    return c;
  }
}

/**
 * Ambient traffic. Aims at the next lane point, keeps a gap to whatever is in
 * front, and slows for police. No traffic lights, no right-of-way: enough
 * behaviour to read as a working street, not a simulation.
 */
export class TrafficDriver {
  readonly controls: Controls = { throttle: 0, brake: 0, steer: 0, handbrake: false };

  control(self: Vehicle, tx: number, ty: number, gap: number, desired: number): Controls {
    const c = this.controls;
    const delta = angleDelta(self.rotation, Math.atan2(ty - self.y, tx - self.x));
    const align = clamp(1 - Math.abs(delta) / 1.6, 0, 1);
    const speed = self.forwardSpeed;

    let throttle = speed < desired ? 0.45 + align * 0.55 : 0;
    let brake = 0;

    if (speed > desired * 1.12) brake = 0.32;
    if (gap < 62) {
      throttle = 0;
      brake = 1;
    } else if (gap < 118) {
      throttle = 0;
      brake = 0.45;
    }
    // slow down for a corner rather than understeering into the kerb
    if (Math.abs(delta) > 0.7 && speed > desired * 0.55) {
      throttle *= 0.3;
      brake = Math.max(brake, 0.28);
    }

    c.throttle = throttle;
    c.brake = brake;
    c.steer = clamp(delta * 2.1, -1, 1);
    c.handbrake = false;
    return c;
  }
}
