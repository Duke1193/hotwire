import Phaser from 'phaser';
import { Controls, Vehicle } from '../entities/Vehicle';
import { angleDelta, clamp } from '../util/math';

export interface InputState {
  up: boolean;
  down: boolean;
  left: boolean;
  right: boolean;
  handbrake: boolean;
}

/** Translates raw key state into vehicle controls. */
export class PlayerDriver {
  readonly controls: Controls = { throttle: 0, brake: 0, steer: 0, handbrake: false };

  control(input: InputState): Controls {
    this.controls.throttle = input.up ? 1 : 0;
    this.controls.brake = input.down ? 1 : 0;
    this.controls.steer = (input.right ? 1 : 0) - (input.left ? 1 : 0);
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
