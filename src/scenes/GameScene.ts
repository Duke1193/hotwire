import Phaser from 'phaser';
import { DRIVE, HEAT, WORLD } from '../config';
import { Player } from '../entities/Player';
import { NEUTRAL, Vehicle } from '../entities/Vehicle';
import { CAR_SKINS } from '../gfx/Textures';
import { CameraRig } from '../systems/CameraRig';
import { Effects } from '../systems/Effects';
import { HeatSystem } from '../systems/HeatSystem';
import { PoliceSystem } from '../systems/PoliceSystem';
import { InputState, PlayerDriver } from '../systems/VehicleController';
import { World } from '../world/World';
import { clamp } from '../util/math';

export interface Hud {
  heat: number;
  heatLevel: number;
  heatPulse: number;
  status: string;
  evadeTimer: number;
  speedKmh: number;
  driving: boolean;
  police: number;
  prompt: string;
  alert: string;
  alertAlpha: number;
}

const ENTER_RADIUS = 82;
const DISPATCH = ['PATROL DISPATCHED', 'BACKUP DISPATCHED', 'ALL UNITS RESPONDING'];
const KMH_PER_UNIT = 19;

export class GameScene extends Phaser.Scene {
  readonly hud: Hud = {
    heat: 0,
    heatLevel: 0,
    heatPulse: 0,
    status: 'clear',
    evadeTimer: 0,
    speedKmh: 0,
    driving: false,
    police: 0,
    prompt: '',
    alert: '',
    alertAlpha: 0,
  };

  private world!: World;
  private player!: Player;
  private effects!: Effects;
  private heat!: HeatSystem;
  private police!: PoliceSystem;
  private rig!: CameraRig;
  private driver = new PlayerDriver();

  private cars: Vehicle[] = [];
  private current: Vehicle | null = null;
  private nearby: Vehicle | null = null;
  private enterCooldown = 0;
  private alertT = 0;

  private keys!: Record<string, Phaser.Input.Keyboard.Key>;
  private frame = 0;
  private wheel = new Phaser.Math.Vector2();
  private focus = new Phaser.Math.Vector2();
  private vel = new Phaser.Math.Vector2();

  private prompt!: Phaser.GameObjects.Container;
  private promptText!: Phaser.GameObjects.Text;
  private promptBg!: Phaser.GameObjects.Graphics;

  constructor() {
    super('game');
  }

  create() {
    this.matter.world.autoUpdate = true;

    this.world = new World();
    this.world.build(this);
    this.effects = new Effects(this, this.world.ground);
    this.heat = new HeatSystem();
    this.police = new PoliceSystem(this, this.world, this.heat);

    this.spawnParkedCars();

    const start = this.startPosition();
    this.player = new Player(this, start.x, start.y);

    this.cameras.main.setBounds(0, 0, this.world.width, this.world.height);
    this.cameras.main.setBackgroundColor(0x14161b);
    this.rig = new CameraRig(this.cameras.main);
    this.rig.follow(this.player.sprite);

    this.keys = this.input.keyboard!.addKeys(
      'W,A,S,D,UP,LEFT,DOWN,RIGHT,E,SPACE',
    ) as Record<string, Phaser.Input.Keyboard.Key>;
    this.input.keyboard!.on('keydown-E', () => this.toggleVehicle());

    this.buildPrompt();
    this.matter.world.on('collisionstart', this.onCollision, this);

    this.scene.launch('ui');
    this.cameras.main.fadeIn(450, 10, 12, 16);
  }

  // ------------------------------------------------------------- setup

  private startPosition(): Phaser.Math.Vector2 {
    // a few steps behind the first parked car, so the walk-up reads clearly
    const c = this.cars[0];
    if (!c) return new Phaser.Math.Vector2(WORLD.roadsX[0], WORLD.roadsY[0]);
    const cos = Math.cos(c.rotation);
    const sin = Math.sin(c.rotation);
    return new Phaser.Math.Vector2(c.x - cos * 112 + sin * 6, c.y - sin * 112 - cos * 6);
  }

  private spawnParkedCars() {
    const spots = Phaser.Utils.Array.Shuffle(this.world.parking.slice());
    const centre = new Phaser.Math.Vector2(WORLD.roadsX[1], WORLD.roadsY[1]);
    spots.sort(
      (a, b) =>
        Phaser.Math.Distance.Between(a.x, a.y, centre.x, centre.y) -
        Phaser.Math.Distance.Between(b.x, b.y, centre.x, centre.y),
    );

    const wanted = Math.min(14, spots.length);
    for (let i = 0; i < wanted; i++) {
      const s = spots[i];
      const skin = CAR_SKINS[i % CAR_SKINS.length];
      const v = new Vehicle(this, s.x, s.y, s.angle + Phaser.Math.FloatBetween(-0.04, 0.04), skin);
      this.cars.push(v);
    }
  }

  private buildPrompt() {
    this.promptBg = this.add.graphics();
    this.promptText = this.add
      .text(0, 0, '[E] ENTER', {
        fontFamily: 'ui-monospace, Menlo, monospace',
        fontSize: '15px',
        color: '#f4f7ff',
      })
      .setOrigin(0.5, 0.5);
    this.prompt = this.add.container(0, 0, [this.promptBg, this.promptText]).setDepth(40).setVisible(false);

    const w = this.promptText.width + 18;
    const h = 24;
    this.promptBg.fillStyle(0x0e1118, 0.82);
    this.promptBg.fillRoundedRect(-w / 2, -h / 2, w, h, 5);
    this.promptBg.lineStyle(1.5, 0x69d8ff, 0.85);
    this.promptBg.strokeRoundedRect(-w / 2, -h / 2, w, h, 5);
  }

  // ------------------------------------------------------------- input

  private readInput(): InputState {
    const k = this.keys;
    return {
      up: k.W.isDown || k.UP.isDown,
      down: k.S.isDown || k.DOWN.isDown,
      left: k.A.isDown || k.LEFT.isDown,
      right: k.D.isDown || k.RIGHT.isDown,
      handbrake: k.SPACE.isDown,
    };
  }

  private toggleVehicle() {
    if (this.enterCooldown > 0) return;
    this.enterCooldown = 280;

    if (this.current) {
      if (Math.abs(this.current.forwardSpeed) > DRIVE.exitSpeed) return;
      this.exitVehicle();
    } else if (this.nearby) {
      this.enterVehicle(this.nearby);
    }
  }

  private enterVehicle(v: Vehicle) {
    this.current = v;
    v.occupied = true;
    v.controlled = true;
    this.player.setActive(false);
    this.prompt.setVisible(false);
    this.rig.follow(v.sprite);
  }

  private exitVehicle() {
    const v = this.current!;
    const side = this.freeSideOf(v);
    v.occupied = false;
    v.controlled = false;
    v.controls = { ...NEUTRAL };
    this.current = null;
    this.player.setActive(true, side.x, side.y);
    this.rig.follow(this.player.sprite);
  }

  /** Find a spot next to the car that is not inside geometry. */
  private freeSideOf(v: Vehicle): Phaser.Math.Vector2 {
    const dist = v.skin.width * 0.5 + 22;
    const candidates: Phaser.Math.Vector2[] = [];
    for (const dir of [-1, 1]) {
      candidates.push(
        new Phaser.Math.Vector2(v.x - Math.sin(v.rotation) * dir * dist, v.y + Math.cos(v.rotation) * dir * dist),
      );
    }
    candidates.push(
      new Phaser.Math.Vector2(
        v.x - Math.cos(v.rotation) * (v.skin.length * 0.5 + 20),
        v.y - Math.sin(v.rotation) * (v.skin.length * 0.5 + 20),
      ),
    );

    for (const c of candidates) {
      if (c.x < 16 || c.y < 16 || c.x > this.world.width - 16 || c.y > this.world.height - 16) continue;
      const hits = this.matter.intersectPoint(c.x, c.y) as MatterJS.BodyType[];
      const blocked = hits.some((b) => b.label === 'solid' || b.label === 'prop');
      if (!blocked) return c;
    }
    return new Phaser.Math.Vector2(v.x, v.y);
  }

  // ------------------------------------------------------------- collisions

  private onCollision(event: Phaser.Physics.Matter.Events.CollisionStartEvent) {
    for (const pair of event.pairs) {
      const a = pair.bodyA as MatterJS.BodyType;
      const b = pair.bodyB as MatterJS.BodyType;
      const va = this.vehicleOf(a);
      const vb = this.vehicleOf(b);
      if (!va && !vb) continue;

      const n = (pair as unknown as { collision: { normal: { x: number; y: number } } }).collision.normal;
      const rx = a.velocity.x - b.velocity.x;
      const ry = a.velocity.y - b.velocity.y;
      const mag = Math.abs(rx * n.x + ry * n.y);
      if (mag < 1.4) continue;

      const cx = (a.position.x + b.position.x) / 2;
      const cy = (a.position.y + b.position.y) / 2;

      const playerInvolved = (va && va === this.current) || (vb && vb === this.current);
      if (playerInvolved) {
        this.effects.impact(cx, cy, mag);
      } else if (mag > 3.4 && this.cameras.main.worldView.contains(cx, cy)) {
        this.effects.bump(cx, cy);
      }

      if (playerInvolved && mag > HEAT.impactFloor) {
        const me = this.current!;
        const other = va === me ? vb : va;
        let gain = Math.min((mag - HEAT.impactFloor) * HEAT.impactScale, HEAT.maxPerImpact);
        if (other?.isPolice) {
          // Ramming a patrol is provocation; being rammed by one is not, or
          // heat would spiral on its own while you sit still.
          gain *= me.speed > other.speed * 1.05 ? 1.5 : 0.12;
        }
        this.heat.add(gain);
      }
    }
  }

  private vehicleOf(body: MatterJS.BodyType): Vehicle | null {
    const go = (body as unknown as { gameObject?: Phaser.GameObjects.GameObject }).gameObject;
    if (!go) return null;
    return (go.getData?.('vehicle') as Vehicle) ?? null;
  }

  // ------------------------------------------------------------- loop

  override update(_time: number, delta: number) {
    const dt = Math.min(delta, 50);
    const dtScale = dt / 16.6667;
    this.frame++;
    this.enterCooldown = Math.max(0, this.enterCooldown - dt);

    const input = this.readInput();

    if (this.current) {
      this.current.controls = this.driver.control(input);
      this.current.update(dtScale);
      this.focus.set(this.current.x, this.current.y);
      const body = this.current.sprite.body as MatterJS.BodyType;
      this.vel.set(body.velocity.x, body.velocity.y);
    } else {
      const ix = (input.right ? 1 : 0) - (input.left ? 1 : 0);
      const iy = (input.down ? 1 : 0) - (input.up ? 1 : 0);
      this.player.update(dtScale, ix, iy);
      this.focus.set(this.player.x, this.player.y);
      const body = this.player.sprite.body as MatterJS.BodyType;
      this.vel.set(body.velocity.x, body.velocity.y);
    }

    for (const v of this.cars) {
      if (v === this.current) continue;
      v.update(dtScale);
    }

    this.police.update(dt, this.focus, this.vel, dtScale);
    this.heat.update(dt, this.police.nearestDist, this.police.count);

    this.tyreFx();
    this.updatePrompt();

    if (this.heat.levelUp) {
      this.hud.alert = DISPATCH[Math.min(this.heat.level, DISPATCH.length) - 1];
      this.alertT = 2200;
    }
    this.alertT = Math.max(0, this.alertT - dt);
    this.hud.alertAlpha = clamp(this.alertT / 420, 0, 1);

    const speedRatio = this.current ? Math.abs(this.current.forwardSpeed) / DRIVE.maxSpeed : 0;
    this.rig.update(dtScale, this.vel.x, this.vel.y, !!this.current, speedRatio);

    this.hud.heat = this.heat.value;
    this.hud.heatLevel = this.heat.level;
    this.hud.heatPulse = this.heat.pulse;
    this.hud.status = this.heat.status;
    this.hud.evadeTimer = this.heat.evadeTimer;
    this.hud.driving = !!this.current;
    this.hud.police = this.police.count;
    this.hud.speedKmh = this.current ? Math.abs(this.current.forwardSpeed) * KMH_PER_UNIT : 0;
  }

  /** Skid marks and tyre smoke for every car that is sliding. */
  private tyreFx() {
    if (this.frame % 2 !== 0) return;
    const all: Vehicle[] = [];
    if (this.current) all.push(this.current);
    for (const p of this.police.patrols) all.push(p.vehicle);

    for (const v of all) {
      const braking = v.controls.brake > 0 && v.forwardSpeed > 6;
      if (!v.slipping && !braking && !v.controls.handbrake) continue;
      const intensity = clamp(Math.abs(v.lateralSpeed) / 5 + (braking ? 0.35 : 0), 0.12, 0.85);
      for (const right of [false, true]) {
        v.wheelPos(false, right, this.wheel);
        this.effects.skid(this.wheel.x, this.wheel.y, v.rotation, intensity * 0.85);
      }
      if (v === this.current && v.slipping && this.frame % 6 === 0) {
        v.wheelPos(false, Math.random() > 0.5, this.wheel);
        this.effects.tyreDust(this.wheel.x, this.wheel.y);
      }
    }
  }

  private updatePrompt() {
    if (this.current) {
      this.nearby = null;
      const canExit = Math.abs(this.current.forwardSpeed) <= DRIVE.exitSpeed;
      this.hud.prompt = canExit ? '[E] EXIT' : '';
      this.prompt.setVisible(false);
      return;
    }

    let best: Vehicle | null = null;
    let bestD = ENTER_RADIUS;
    for (const v of this.cars) {
      const d = Phaser.Math.Distance.Between(v.x, v.y, this.player.x, this.player.y);
      if (d < bestD) {
        bestD = d;
        best = v;
      }
    }
    this.nearby = best;
    this.hud.prompt = best ? '[E] ENTER' : '';

    if (best) {
      this.prompt.setVisible(true);
      this.prompt.setPosition(best.x, best.y - 40 + Math.sin(this.frame * 0.09) * 2);
    } else {
      this.prompt.setVisible(false);
    }
  }
}
