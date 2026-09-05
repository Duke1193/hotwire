import Phaser from 'phaser';
import { DRIVE } from '../config';
import { CarSkin } from '../gfx/Textures';
import { clamp, decay, lerp } from '../util/math';

export interface Controls {
  throttle: number;
  brake: number;
  steer: number;
  handbrake: boolean;
}

export const NEUTRAL: Controls = { throttle: 0, brake: 0, steer: 0, handbrake: false };

export interface VehicleTuning {
  maxSpeed: number;
  accel: number;
  grip: number;
}

/**
 * Arcade car. Matter owns the collisions; we own the feel: every frame we
 * decompose the body velocity into forward/lateral components, drive the
 * forward one and bleed the lateral one off according to grip.
 */
export class Vehicle {
  readonly sprite: Phaser.Physics.Matter.Sprite;
  readonly shadow: Phaser.GameObjects.Image;
  readonly skin: CarSkin;
  readonly isPolice: boolean;

  controls: Controls = { ...NEUTRAL };
  tuning: VehicleTuning;

  /** Signed speed along the nose, px/step. */
  forwardSpeed = 0;
  /** Sideways speed, px/step. Positive = sliding right. */
  lateralSpeed = 0;
  steerAmount = 0;
  occupied = false;
  /** When false the car is a loose prop: no steering input, just drag. */
  controlled = false;
  /** Set on destroy so any list still holding this car can skip it. */
  dead = false;

  private stuckMs = 0;
  private lastX = 0;
  private lastY = 0;

  constructor(scene: Phaser.Scene, x: number, y: number, angle: number, skin: CarSkin, isPolice = false) {
    this.skin = skin;
    this.isPolice = isPolice;
    this.tuning = { maxSpeed: DRIVE.maxSpeed, accel: DRIVE.accel, grip: DRIVE.grip };

    this.shadow = scene.add
      .image(x + 6, y + 8, skin.key)
      .setTint(0x000000)
      .setAlpha(0.32)
      .setDepth(6);

    this.sprite = scene.matter.add.sprite(x, y, skin.key, undefined, {
      label: isPolice ? 'police' : 'car',
      frictionAir: 0,
      friction: 0.02,
      frictionStatic: 0,
      restitution: 0.24,
    });
    this.sprite.setBody(
      { type: 'rectangle', width: skin.length, height: skin.width },
      { label: isPolice ? 'police' : 'car', chamfer: { radius: 6 } },
    );
    this.sprite.setMass(isPolice ? 12 : 11);
    this.sprite.setFrictionAir(0);
    this.sprite.setRotation(angle);
    this.sprite.setDepth(10);
    this.sprite.setData('vehicle', this);
  }

  get x() {
    return this.sprite.x;
  }
  get y() {
    return this.sprite.y;
  }
  get rotation() {
    return this.sprite.rotation;
  }
  /** Speed magnitude in px/step. */
  get speed() {
    const v = this.sprite.body as MatterJS.BodyType;
    return Math.hypot(v.velocity.x, v.velocity.y);
  }
  get slipping() {
    return Math.abs(this.lateralSpeed) > DRIVE.slipThreshold && Math.abs(this.forwardSpeed) > 1.4;
  }

  /** World-space position of a wheel, for skid marks and dust. */
  wheelPos(front: boolean, right: boolean, out: Phaser.Math.Vector2) {
    const c = Math.cos(this.rotation);
    const s = Math.sin(this.rotation);
    const fx = (front ? 1 : -1) * this.skin.length * 0.31;
    const rx = (right ? 1 : -1) * this.skin.width * 0.42;
    out.set(this.x + c * fx - s * rx, this.y + s * fx + c * rx);
    return out;
  }

  update(dtScale: number) {
    const body = this.sprite.body as MatterJS.BodyType;
    if (!this.controlled) {
      this.idle(dtScale);
      return;
    }
    const rot = this.sprite.rotation;
    const cos = Math.cos(rot);
    const sin = Math.sin(rot);

    // decompose current velocity into car space
    let fwd = body.velocity.x * cos + body.velocity.y * sin;
    let lat = -body.velocity.x * sin + body.velocity.y * cos;

    const c = this.controls;
    const max = this.tuning.maxSpeed;

    if (c.throttle > 0) {
      const boost = fwd < 0 ? 2.1 : 1; // snappy change of direction
      fwd += this.tuning.accel * c.throttle * boost * dtScale;
    }
    if (c.brake > 0) {
      if (fwd > 0.25) fwd -= DRIVE.brake * c.brake * dtScale;
      else fwd -= DRIVE.reverseAccel * c.brake * dtScale;
    }
    if (c.throttle <= 0 && c.brake <= 0) {
      fwd *= decay(DRIVE.coastDrag, dtScale);
    }
    if (c.handbrake) {
      fwd *= decay(0.9925, dtScale);
    }

    fwd = clamp(fwd, -DRIVE.maxReverse, max);

    // steering: no authority when parked, less at top speed
    const absF = Math.abs(fwd);
    const ramp = clamp(absF / (max * DRIVE.steerSpeedRamp), 0, 1);
    const highSpeed = 1 - DRIVE.highSpeedSteerLoss * clamp(absF / max, 0, 1);
    const target = c.steer * DRIVE.maxTurn * ramp * highSpeed * Math.sign(fwd || 1);
    this.steerAmount = lerp(this.steerAmount, target, clamp(DRIVE.steerLerp * dtScale, 0, 1));
    this.sprite.setAngularVelocity(this.steerAmount);

    // grip: bleed lateral velocity, less of it while sliding
    const latBefore = lat;
    let grip = c.handbrake ? DRIVE.driftGrip : this.tuning.grip;
    // a hard turn at speed loosens the back end a little
    grip = clamp(grip + Math.abs(this.steerAmount) * (absF / max) * 1.9, 0, 0.965);
    lat *= decay(grip, dtScale);

    // Part of the scrubbed sideways momentum comes back as drive, so a slide
    // exits carrying speed instead of dying on the spot.
    if (fwd > 0.5 && c.brake <= 0) {
      const before = Math.hypot(fwd, latBefore);
      const after = Math.hypot(fwd, lat);
      const goal = lerp(after, before, DRIVE.slideRecovery);
      const sq = goal * goal - lat * lat;
      if (sq > 0) fwd = Math.min(max, Math.sqrt(sq));
    }

    this.forwardSpeed = fwd;
    this.lateralSpeed = lat;

    this.sprite.setVelocity(cos * fwd - sin * lat, sin * fwd + cos * lat);
    this.unwedge(dtScale, cos, sin, fwd);

    this.shadow.setPosition(this.x + 6, this.y + 8);
    this.shadow.setRotation(rot);
  }

  /**
   * Wedged into a kerb or a corner the solver cannot resolve? Walk the body
   * out by hand so you are never permanently stuck.
   */
  private unwedge(dtScale: number, cos: number, sin: number, fwd: number) {
    const moved = Math.hypot(this.x - this.lastX, this.y - this.lastY);
    this.lastX = this.x;
    this.lastY = this.y;

    const wants = this.controls.throttle > 0 || this.controls.brake > 0;
    if (!wants || moved > 0.3 * dtScale) {
      this.stuckMs = Math.max(0, this.stuckMs - 16.7 * dtScale);
      return;
    }

    this.stuckMs += 16.7 * dtScale;
    if (this.stuckMs < 380) return;
    const dir = this.controls.brake > 0 && fwd <= 0.2 ? -1 : 1;
    this.sprite.setPosition(this.x + cos * dir * 1.3 * dtScale, this.y + sin * dir * 1.3 * dtScale);
  }

  /** Parked / knocked-about behaviour: bleed off whatever a hit imparted. */
  private idle(dtScale: number) {
    const body = this.sprite.body as MatterJS.BodyType;
    const d = decay(0.955, dtScale);
    this.sprite.setVelocity(body.velocity.x * d, body.velocity.y * d);
    this.sprite.setAngularVelocity(body.angularVelocity * decay(0.9, dtScale));
    this.forwardSpeed = 0;
    this.lateralSpeed = 0;
    this.steerAmount = 0;
    this.shadow.setPosition(this.x + 6, this.y + 8).setRotation(this.sprite.rotation);
  }

  destroy() {
    this.dead = true;
    this.shadow.destroy();
    this.sprite.destroy();
  }
}
