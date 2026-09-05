import Phaser from 'phaser';
import { TRAFFIC } from '../config';
import { Vehicle } from '../entities/Vehicle';
import { CAR_SKINS } from '../gfx/Textures';
import type { World } from '../world/World';
import { TrafficDriver } from './VehicleController';

interface Car {
  vehicle: Vehicle;
  driver: TrafficDriver;
  i: number;
  j: number;
  dir: number;
  target: Phaser.Math.Vector2;
  /** How long we have been going nowhere while wanting to move. */
  stuckMs: number;
  hornMs: number;
  reckless: boolean;
  /** Short-lived states pushed in by crashes, police and ambient events. */
  brakeMs: number;
  yieldMs: number;
  boostMs: number;
}

/** Ambient city traffic driving a lane grid. */
export class Traffic {
  readonly cars: Car[] = [];

  onHorn: ((x: number, y: number) => void) | null = null;

  private probe = new Phaser.Math.Vector2();

  constructor(private scene: Phaser.Scene, private world: World, focus: Phaser.Math.Vector2) {
    for (let n = 0; n < TRAFFIC.count; n++) {
      const skin = CAR_SKINS[n % CAR_SKINS.length];
      const vehicle = new Vehicle(this.scene, -900 - n * 80, -900, 0, skin);
      vehicle.controlled = true;
      const car: Car = {
        vehicle,
        driver: new TrafficDriver(),
        i: 0,
        j: 0,
        dir: 0,
        target: new Phaser.Math.Vector2(),
        stuckMs: 0,
        hornMs: 0,
        reckless: false,
        brakeMs: 0,
        yieldMs: 0,
        boostMs: 0,
      };
      this.cars.push(car);
      this.place(car, focus, 240, 1350);
    }
  }

  /** Everything in front of a crash stands on the brakes for a moment. */
  shock(x: number, y: number, radius: number) {
    const r2 = radius * radius;
    for (const car of this.cars) {
      const dx = car.vehicle.x - x;
      const dy = car.vehicle.y - y;
      if (dx * dx + dy * dy < r2) car.brakeMs = Math.max(car.brakeMs, 1400);
    }
  }

  /** Used by the ambient event system to single a driver out. */
  nearest(x: number, y: number, min = 0): Car | null {
    let best: Car | null = null;
    let bestD = Infinity;
    for (const car of this.cars) {
      const d = Phaser.Math.Distance.Between(car.vehicle.x, car.vehicle.y, x, y);
      if (d < min || d >= bestD) continue;
      bestD = d;
      best = car;
    }
    return best;
  }

  makeReckless(car: Car, ms: number) {
    car.boostMs = ms;
  }

  stall(car: Car, ms: number) {
    car.brakeMs = ms;
  }

  update(dtMs: number, dtScale: number, focus: Phaser.Math.Vector2, obstacles: Vehicle[], police: Vehicle[]) {
    for (const car of this.cars) {
      const v = car.vehicle;
      const dist = Phaser.Math.Distance.Between(v.x, v.y, focus.x, focus.y);

      if (dist > TRAFFIC.despawn || car.stuckMs > 9000) {
        this.place(car, focus, TRAFFIC.spawnMin, TRAFFIC.spawnMax);
        continue;
      }

      car.brakeMs = Math.max(0, car.brakeMs - dtMs);
      car.boostMs = Math.max(0, car.boostMs - dtMs);
      car.yieldMs = Math.max(0, car.yieldMs - dtMs);
      car.hornMs = Math.max(0, car.hornMs - dtMs);

      // pull over for anything with lights on
      for (const p of police) {
        if (Phaser.Math.Distance.Between(p.x, p.y, v.x, v.y) < 280) {
          car.yieldMs = 900;
          break;
        }
      }

      // arrived at the intersection: choose the next leg
      if (Phaser.Math.Distance.Between(v.x, v.y, car.target.x, car.target.y) < 74) {
        const next = this.world.lanes.step(car.i, car.j, car.dir);
        if (next) {
          car.i = next.i;
          car.j = next.j;
        }
        car.dir = this.world.lanes.chooseDir(car.i, car.j, car.dir);
        const ahead = this.world.lanes.step(car.i, car.j, car.dir);
        const at = ahead ?? { i: car.i, j: car.j };
        this.world.lanes.point(at.i, at.j, car.dir, car.target);
      }

      const gap = this.gapAhead(v, obstacles);

      let desired = car.reckless || car.boostMs > 0 ? TRAFFIC.recklessSpeed : TRAFFIC.maxSpeed;
      if (car.yieldMs > 0) desired *= 0.35;
      if (car.brakeMs > 0) desired = 0;

      // nudge towards the kerb while yielding so patrols can get past
      let tx = car.target.x;
      let ty = car.target.y;
      if (car.yieldMs > 0) {
        const d = car.dir;
        tx += d === 0 || d === 2 ? 0 : (d === 1 ? -1 : 1) * 22;
        ty += d === 1 || d === 3 ? 0 : (d === 0 ? 1 : -1) * 22;
      }

      v.tuning.maxSpeed = Math.max(desired, 0.5);
      v.controls = car.driver.control(v, tx, ty, gap, desired);
      if (car.brakeMs > 0) {
        v.controls.throttle = 0;
        v.controls.brake = 1;
      }
      v.update(dtScale);

      // blocked for too long: sound off, then eventually give up and recycle
      const wantsToMove = desired > 0.5;
      if (wantsToMove && Math.abs(v.forwardSpeed) < 0.5) {
        car.stuckMs += dtMs;
        if (car.stuckMs > TRAFFIC.hornAfter && car.hornMs <= 0) {
          car.hornMs = 2400;
          this.onHorn?.(v.x, v.y);
        }
      } else {
        car.stuckMs = 0;
      }
    }
  }

  /** Distance to the nearest thing directly in front, or Infinity. */
  private gapAhead(self: Vehicle, obstacles: Vehicle[]): number {
    const fx = Math.cos(self.rotation);
    const fy = Math.sin(self.rotation);
    let gap = Infinity;
    for (const o of obstacles) {
      if (o === self) continue;
      const dx = o.x - self.x;
      const dy = o.y - self.y;
      if (dx * dx + dy * dy > TRAFFIC.feeler * TRAFFIC.feeler) continue;
      const along = dx * fx + dy * fy;
      if (along <= 0) continue;
      const side = Math.abs(-dx * fy + dy * fx);
      if (side > 27) continue;
      if (along < gap) gap = along;
    }
    return gap;
  }

  /** Drop a car onto a lane (or out of a parking bay) away from the player. */
  private place(car: Car, focus: Phaser.Math.Vector2, min: number, max: number) {
    const lanes = this.world.lanes;

    for (let attempt = 0; attempt < 26; attempt++) {
      const node = lanes.randomNode();
      const dir = (Math.random() * 4) | 0;
      if (!lanes.step(node.i, node.j, dir)) continue;
      lanes.point(node.i, node.j, dir, this.probe);
      const d = Phaser.Math.Distance.Between(this.probe.x, this.probe.y, focus.x, focus.y);
      if (d < min || d > max) continue;
      if (this.occupied(this.probe.x, this.probe.y)) continue;

      car.i = node.i;
      car.j = node.j;
      car.dir = dir;
      car.reckless = Math.random() < TRAFFIC.recklessChance;
      car.stuckMs = 0;
      car.brakeMs = 0;
      car.boostMs = 0;
      car.yieldMs = 0;

      const ahead = lanes.step(node.i, node.j, dir) ?? node;
      lanes.point(ahead.i, ahead.j, dir, car.target);

      const v = car.vehicle;
      v.sprite.setPosition(this.probe.x, this.probe.y);
      v.sprite.setRotation(Math.atan2(car.target.y - this.probe.y, car.target.x - this.probe.x));
      v.sprite.setVelocity(0, 0);
      v.sprite.setAngularVelocity(0);
      return;
    }

    // nowhere sensible right now; park it far away and try again next pass
    car.vehicle.sprite.setPosition(-900, -900);
    car.vehicle.sprite.setVelocity(0, 0);
  }

  private occupied(x: number, y: number): boolean {
    for (const car of this.cars) {
      const dx = car.vehicle.x - x;
      const dy = car.vehicle.y - y;
      if (dx * dx + dy * dy < 120 * 120) return true;
    }
    return false;
  }
}
