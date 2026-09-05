import Phaser from 'phaser';
import { clamp, decay, lerp } from '../util/math';

const WALK_SPEED = 3.2;
const BASE_SCALE = 1.15;
const ACCEL = 0.6;

/** On-foot character. Simple circle body so kerbs never snag you. */
export class Player {
  readonly sprite: Phaser.Physics.Matter.Sprite;
  readonly shadow: Phaser.GameObjects.Image;
  private facing = 0;
  private bob = 0;

  constructor(scene: Phaser.Scene, x: number, y: number) {
    this.shadow = scene.add
      .image(x + 3, y + 5, 'ped')
      .setTint(0x000000)
      .setAlpha(0.3)
      .setScale(BASE_SCALE)
      .setDepth(6);
    this.sprite = scene.matter.add.sprite(x, y, 'ped', undefined, { label: 'player' });
    this.sprite.setCircle(9, { label: 'player', restitution: 0.05 });
    this.sprite.setFrictionAir(0.22);
    this.sprite.setFixedRotation();
    this.sprite.setMass(1.4);
    this.sprite.setDepth(11);
  }

  get x() {
    return this.sprite.x;
  }
  get y() {
    return this.sprite.y;
  }
  get visible() {
    return this.sprite.visible;
  }

  setActive(on: boolean, x = this.x, y = this.y) {
    this.sprite.setVisible(on);
    this.shadow.setVisible(on);
    if (on) {
      this.sprite.setPosition(x, y);
      this.sprite.setVelocity(0, 0);
      this.sprite.world.add(this.sprite.body as MatterJS.BodyType);
    } else {
      this.sprite.world.remove(this.sprite.body as MatterJS.BodyType, true);
    }
  }

  update(dtScale: number, ix: number, iy: number) {
    const body = this.sprite.body as MatterJS.BodyType;
    let vx = body.velocity.x;
    let vy = body.velocity.y;
    const len = Math.hypot(ix, iy);

    if (len > 0) {
      const nx = ix / len;
      const ny = iy / len;
      vx = lerp(vx, nx * WALK_SPEED, clamp(ACCEL * dtScale, 0, 1));
      vy = lerp(vy, ny * WALK_SPEED, clamp(ACCEL * dtScale, 0, 1));
      this.facing = Phaser.Math.Angle.RotateTo(this.facing, Math.atan2(ny, nx), 0.35 * dtScale);
      this.bob += dtScale * 0.32;
    } else {
      const d = decay(0.72, dtScale);
      vx *= d;
      vy *= d;
      this.bob = lerp(this.bob, 0, 0.2);
    }

    this.sprite.setVelocity(vx, vy);
    this.sprite.setRotation(this.facing);
    const s = 1 + Math.sin(this.bob) * 0.06;
    this.sprite.setScale(BASE_SCALE * s, BASE_SCALE / s);

    this.shadow.setPosition(this.x + 3, this.y + 5).setRotation(this.facing);
  }
}
