import Phaser from 'phaser';
import { ESCALATION, HEAT, POLICE } from '../config';
import { Vehicle } from '../entities/Vehicle';
import { POLICE_SKIN } from '../gfx/Textures';
import { World } from '../world/World';
import { HeatSystem } from './HeatSystem';
import { AIDriver } from './VehicleController';

interface Patrol {
  vehicle: Vehicle;
  driver: AIDriver;
  lightA: Phaser.GameObjects.Image;
  lightB: Phaser.GameObjects.Image;
  blink: number;
}

/** Spawns and drives pursuit cars according to the current HEAT level. */
export class PoliceSystem {
  readonly patrols: Patrol[] = [];
  nearestDist = Infinity;

  private spawnCooldown = 0;
  private standDownMs = 0;
  /** 0-3, mirroring the HEAT level the player can see. */
  private escalation = 0;
  private target = new Phaser.Math.Vector2();
  private away = new Phaser.Math.Vector2();

  constructor(private scene: Phaser.Scene, private world: World, private heat: HeatSystem) {}

  get count() {
    return this.patrols.length;
  }

  private desiredCount(): number {
    const lvl = this.heat.level;
    return lvl === 0 ? 0 : Math.min(lvl + (this.heat.value >= HEAT.max - 4 ? 1 : 0), 4);
  }

  /**
   * Higher HEAT does not just mean more cars: the units that turn up are
   * quicker and push harder, so escaping at level three genuinely costs more
   * than escaping at level one.
   */
  setEscalation(level: number) {
    this.escalation = Math.max(0, Math.min(level, ESCALATION.speed.length - 1));
  }

  update(dtMs: number, playerPos: Phaser.Math.Vector2, playerVel: Phaser.Math.Vector2, dtScale: number) {
    this.spawnCooldown -= dtMs;

    // No reinforcements while you are genuinely out of contact, otherwise a
    // getaway could never finish.
    const want = this.desiredCount();
    const canCall = this.patrols.length === 0 || this.heat.evadeTimer < 2;
    if (this.patrols.length < want && canCall && this.spawnCooldown <= 0) {
      this.spawn(playerPos);
      this.spawnCooldown = 1500;
    }

    // Once the heat is gone the units stop hunting and clear the area, so a
    // finished chase can actually finish.
    const standDown = this.heat.value <= 0;
    this.standDownMs = standDown ? this.standDownMs + dtMs : 0;

    // aim slightly ahead of where the player is going
    this.target.set(playerPos.x + playerVel.x * 16, playerPos.y + playerVel.y * 16);

    this.nearestDist = Infinity;
    for (let i = this.patrols.length - 1; i >= 0; i--) {
      const p = this.patrols[i];
      const v = p.vehicle;
      const dist = Phaser.Math.Distance.Between(v.x, v.y, playerPos.x, playerPos.y);
      this.nearestDist = Math.min(this.nearestDist, dist);

      if (standDown) {
        // head away from the player rather than orbiting them forever
        this.away.set(v.x + (v.x - playerPos.x) * 3, v.y + (v.y - playerPos.y) * 3);
        v.controls = p.driver.control(v, this.away, dtMs);
      } else {
        v.controls = p.driver.control(v, this.target, dtMs);
      }
      v.tuning.maxSpeed = POLICE.maxSpeed * ESCALATION.speed[this.escalation];
      v.update(dtScale);

      p.blink += dtMs;
      const on = Math.floor(p.blink / 130) % 2 === 0;
      const c = Math.cos(v.rotation);
      const s = Math.sin(v.rotation);
      p.lightA.setPosition(v.x - s * 7, v.y + c * 7).setAlpha(on ? 0.95 : 0.12);
      p.lightB.setPosition(v.x + s * 7, v.y - c * 7).setAlpha(on ? 0.12 : 0.95);

      const giveUp = standDown && (dist > 700 || this.standDownMs > 5200);
      if (dist > POLICE.despawnDist || giveUp || this.patrols.length > want + 1) {
        this.remove(i);
      }
    }
  }

  /** Called when the chase ends abruptly — an arrest, or a reset. */
  standDown() {
    for (let i = this.patrols.length - 1; i >= 0; i--) this.remove(i);
    this.spawnCooldown = 4000;
    this.standDownMs = 0;
    this.nearestDist = Infinity;
  }

  private spawn(playerPos: Phaser.Math.Vector2) {
    const spot =
      this.world.pickRoadPoint(playerPos, POLICE.spawnMinDist, POLICE.spawnMaxDist) ??
      this.world.pickRoadPoint(playerPos, 600, 2600);
    if (!spot) return;

    const angle = Math.atan2(playerPos.y - spot.y, playerPos.x - spot.x);
    const v = new Vehicle(this.scene, spot.x, spot.y, angle, POLICE_SKIN, true);
    v.tuning = {
      maxSpeed: POLICE.maxSpeed * ESCALATION.speed[this.escalation],
      accel: POLICE.accel,
      grip: 0.82,
    };
    v.controlled = true;

    const lightA = this.scene.add
      .image(spot.x, spot.y, 'puff')
      .setTint(0x4d8bff)
      .setBlendMode(Phaser.BlendModes.ADD)
      .setScale(1.5)
      .setDepth(16);
    const lightB = this.scene.add
      .image(spot.x, spot.y, 'puff')
      .setTint(0xff4d5e)
      .setBlendMode(Phaser.BlendModes.ADD)
      .setScale(1.5)
      .setDepth(16);

    this.patrols.push({
      vehicle: v,
      driver: new AIDriver((0.92 + Math.random() * 0.16) * ESCALATION.aggression[this.escalation]),
      lightA,
      lightB,
      blink: Math.random() * 400,
    });
  }

  private remove(index: number) {
    const p = this.patrols[index];
    p.lightA.destroy();
    p.lightB.destroy();
    p.vehicle.destroy();
    this.patrols.splice(index, 1);
  }
}
