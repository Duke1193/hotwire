import Phaser from 'phaser';
import { AMBIENT, POLICE } from '../config';
import { Vehicle } from '../entities/Vehicle';
import { POLICE_SKIN } from '../gfx/Textures';
import type { Pedestrians } from './Pedestrians';
import type { Traffic } from './Traffic';
import { AIDriver } from './VehicleController';

type Kind = 'pursuit' | 'pileup' | 'reckless' | 'panic';

interface Chase {
  vehicle: Vehicle;
  driver: AIDriver;
  lightA: Phaser.GameObjects.Image;
  lightB: Phaser.GameObjects.Image;
  blink: number;
  targetIndex: number;
}

/**
 * Small incidents that happen near the player without involving them, so the
 * city keeps moving when they stand still. Every event is time-boxed and
 * tears itself down; nothing here is scripted beyond "make something move".
 */
export class AmbientEvents {
  private nextIn = 12000;
  private activeUntil = 0;
  private kind: Kind | null = null;
  private chase: Chase | null = null;
  private chaseTarget = new Phaser.Math.Vector2();

  onCrash: ((x: number, y: number, strength: number) => void) | null = null;

  constructor(
    private scene: Phaser.Scene,
    private traffic: Traffic,
    private peds: Pedestrians,
  ) {}

  /** The ambient patrol, so pedestrians and traffic can react to its lights. */
  get pursuitCar(): Vehicle | null {
    return this.chase?.vehicle ?? null;
  }

  update(dtMs: number, dtScale: number, focus: Phaser.Math.Vector2) {
    if (this.chase) this.driveChase(dtMs, dtScale);

    if (this.kind) {
      this.activeUntil -= dtMs;
      if (this.activeUntil <= 0) this.end();
      return;
    }

    this.nextIn -= dtMs;
    if (this.nextIn > 0) return;
    this.nextIn = Phaser.Math.Between(AMBIENT.minGap, AMBIENT.maxGap);
    this.begin(focus);
  }

  private begin(focus: Phaser.Math.Vector2) {
    const roll = Math.random();
    const kind: Kind = roll < 0.3 ? 'pursuit' : roll < 0.6 ? 'pileup' : roll < 0.82 ? 'reckless' : 'panic';
    const car = this.traffic.nearest(focus.x, focus.y, AMBIENT.nearMin);
    if (!car || Phaser.Math.Distance.Between(car.vehicle.x, car.vehicle.y, focus.x, focus.y) > AMBIENT.nearMax) {
      this.nextIn = 6000; // nothing suitable nearby, try again shortly
      return;
    }

    this.kind = kind;
    switch (kind) {
      case 'pursuit':
        this.traffic.makeReckless(car, 24000);
        this.startChase(car.vehicle);
        this.activeUntil = 24000;
        break;
      case 'pileup': {
        // stall one car and shove the next one into the back of it
        this.traffic.stall(car, 11000);
        const behind = this.traffic.nearest(car.vehicle.x, car.vehicle.y, 60);
        if (behind) this.traffic.makeReckless(behind, 2600);
        this.onCrash?.(car.vehicle.x, car.vehicle.y, 5);
        this.peds.shock(car.vehicle.x, car.vehicle.y, 300);
        this.activeUntil = 12000;
        break;
      }
      case 'reckless':
        this.traffic.makeReckless(car, 16000);
        this.activeUntil = 16000;
        break;
      default:
        this.peds.shock(car.vehicle.x, car.vehicle.y, 340);
        this.activeUntil = 3000;
        break;
    }
  }

  private end() {
    this.kind = null;
    this.activeUntil = 0;
    this.stopChase();
  }

  private startChase(target: Vehicle) {
    const angle = Math.random() * Math.PI * 2;
    const x = target.x - Math.cos(angle) * 220;
    const y = target.y - Math.sin(angle) * 220;
    const vehicle = new Vehicle(this.scene, x, y, angle, POLICE_SKIN, true);
    vehicle.controlled = true;
    vehicle.tuning = { maxSpeed: POLICE.maxSpeed * 0.94, accel: POLICE.accel, grip: 0.82 };

    const light = (tint: number) =>
      this.scene.add.image(x, y, 'puff').setTint(tint).setBlendMode(Phaser.BlendModes.ADD).setScale(1.5).setDepth(16);

    this.chase = {
      vehicle,
      driver: new AIDriver(0.9),
      lightA: light(0x4d8bff),
      lightB: light(0xff4d5e),
      blink: 0,
      targetIndex: this.traffic.cars.findIndex((c) => c.vehicle === target),
    };
  }

  private driveChase(dtMs: number, dtScale: number) {
    const chase = this.chase!;
    const target = this.traffic.cars[chase.targetIndex];
    if (!target) {
      this.stopChase();
      return;
    }
    this.chaseTarget.set(target.vehicle.x, target.vehicle.y);
    const v = chase.vehicle;
    v.controls = chase.driver.control(v, this.chaseTarget, dtMs);
    v.update(dtScale);

    chase.blink += dtMs;
    const on = Math.floor(chase.blink / 130) % 2 === 0;
    const c = Math.cos(v.rotation);
    const s = Math.sin(v.rotation);
    chase.lightA.setPosition(v.x - s * 7, v.y + c * 7).setAlpha(on ? 0.95 : 0.12);
    chase.lightB.setPosition(v.x + s * 7, v.y - c * 7).setAlpha(on ? 0.12 : 0.95);
  }

  private stopChase() {
    if (!this.chase) return;
    this.chase.lightA.destroy();
    this.chase.lightB.destroy();
    this.chase.vehicle.destroy();
    this.chase = null;
  }
}
