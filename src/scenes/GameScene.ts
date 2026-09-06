import Phaser from 'phaser';
import { DRIVE, HEAT, WORLD } from '../config';
import { Player } from '../entities/Player';
import { NEUTRAL, Vehicle } from '../entities/Vehicle';
import { CAR_SKINS } from '../gfx/Textures';
import { HeatRun } from '../net/HeatRun';
import { RemotePlayers } from '../net/RemotePlayers';
import { onSession, Session } from '../session';
import { Analytics, track, trackOnce } from '../systems/Analytics';
import { AmbientEvents } from '../systems/AmbientEvents';
import { CameraRig } from '../systems/CameraRig';
import { Effects } from '../systems/Effects';
import { HeatSystem } from '../systems/HeatSystem';
import { Jobs } from '../systems/Jobs';
import { Onboarding } from '../systems/Onboarding';
import { Hazard, Pedestrians } from '../systems/Pedestrians';
import { PoliceSystem } from '../systems/PoliceSystem';
import { ScoreSystem } from '../systems/Score';
import { Traffic } from '../systems/Traffic';
import { InputHub } from '../systems/Input';
import { PlayerDriver } from '../systems/VehicleController';
import { World } from '../world/World';
import { clamp } from '../util/math';
import { hasTouch, haptic, isMobile } from '../util/device';

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
  score: number;
  scorePulse: number;
  scoreReason: string;
  teach: string;
  jobLabel: string;
  jobDistance: number;
  runTitle: string;
  runSubtitle: string;
  /** False while the nickname overlay is still up. */
  live: boolean;
}

const ENTER_RADIUS = 82;
const DISPATCH = ['PATROL DISPATCHED', 'BACKUP DISPATCHED', 'ALL UNITS RESPONDING'];
/** Never show a key name to someone holding a phone. */
const ENTER_LABEL = hasTouch ? 'ENTER' : '[E] ENTER';
const EXIT_LABEL = hasTouch ? 'EXIT' : '[E] EXIT';
const KMH_PER_UNIT = 19;
/** Skid marks are stamped less often on phones. */
const SKID_EVERY = isMobile ? 3 : 2;

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
    score: 0,
    scorePulse: 0,
    scoreReason: '',
    teach: '',
    jobLabel: '',
    jobDistance: 0,
    runTitle: '',
    runSubtitle: '',
    live: false,
  };

  private world!: World;
  private player!: Player;
  private effects!: Effects;
  private heat!: HeatSystem;
  private police!: PoliceSystem;
  private rig!: CameraRig;
  private traffic!: Traffic;
  private peds!: Pedestrians;
  private ambient!: AmbientEvents;
  private score!: ScoreSystem;
  private jobs!: Jobs;
  private onboarding!: Onboarding;
  private driver = new PlayerDriver();

  private session: Session | null = null;
  private remotes: RemotePlayers | null = null;
  private heatRun: HeatRun | null = null;
  /** False until the player has a name: the city runs, input does not. */
  private live = false;

  private cars: Vehicle[] = [];
  private current: Vehicle | null = null;
  private nearby: Vehicle | null = null;
  private enterCooldown = 0;
  private alertT = 0;

  private hub!: InputHub;
  private frame = 0;
  private wheel = new Phaser.Math.Vector2();
  private focus = new Phaser.Math.Vector2();
  private vel = new Phaser.Math.Vector2();

  /** Reused every frame; nothing in the loop allocates. */
  private obstacles: Vehicle[] = [];
  private policeCars: Vehicle[] = [];
  private hazards: Hazard[] = [];
  private hazardPool: Hazard[] = [];

  private walked = 0;
  private driven = 0;
  private heatPeak = 0;
  private pruneAt = 0;
  private escapes = 0;
  private jobsDone = 0;
  private lastHeatLevel = 0;
  private lastRunPhase = 'idle';

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
    this.score = new ScoreSystem();

    this.spawnParkedCars();

    const start = this.startPosition();
    this.player = new Player(this, start.x, start.y);
    this.focus.set(start.x, start.y);

    this.traffic = new Traffic(this, this.world, this.focus);
    this.peds = new Pedestrians(this, this.world, this.focus);
    this.ambient = new AmbientEvents(this, this.traffic, this.peds);
    this.jobs = new Jobs(this, this.world, this.score);
    this.onboarding = new Onboarding();
    this.jobs.enabled = this.onboarding.jobsUnlocked;

    this.cameras.main.setBounds(0, 0, this.world.width, this.world.height);
    this.cameras.main.setBackgroundColor(0x14161b);
    this.rig = new CameraRig(this.cameras.main);
    this.rig.follow(this.player.sprite);

    this.hub = new InputHub(this);

    this.buildPrompt();
    this.matter.world.on('collisionstart', this.onCollision, this);

    this.traffic.onHorn = (x, y) => this.hear(x, y, 'horn');
    this.peds.onShout = (x, y) => this.hear(x, y, 'shout');
    this.ambient.onCrash = (x, y, strength) => {
      this.hear(x, y, 'crash', strength);
      this.traffic.shock(x, y, 320);
    };
    this.jobs.onCompleted = () => this.onJobDone();
    this.jobs.onOffered = () => this.session?.audio.cue('missionAccepted');
    this.jobs.onPickedUp = () => this.session?.audio.cue('checkpoint');
    this.jobs.onFailed = () => this.session?.audio.cue('missionFailed');

    onSession((s) => this.attach(s));

    this.scene.launch('ui');
    this.cameras.main.fadeIn(450, 10, 12, 16);
  }

  // ------------------------------------------------------------- session

  private attach(session: Session) {
    this.session = session;
    this.live = true;
    this.remotes = new RemotePlayers(this, session.net);
    this.heatRun = new HeatRun(session.net, session.identity.nickname, session.identity.id);

    session.net.onEvent = (type, payload, from) => this.heatRun?.onNetEvent(type, payload, from);
    session.net.onRosterChange = () => this.refreshRoster();
    session.net.onPeerJoin = (peer) => {
      session.overlay.toast(`${peer.nickname.toUpperCase()} JOINED`);
      session.audio.cue('playerJoined');
    };
    session.overlay.onHeatRun = () => this.heatRun?.start();
    this.refreshRoster();
  }

  private refreshRoster() {
    const session = this.session;
    if (!session) return;
    const entries = [
      { name: session.identity.nickname, score: this.score.value, self: true },
      ...[...session.net.peers.values()].map((p) => ({ name: p.nickname, score: p.score, self: false })),
    ].sort((a, b) => b.score - a.score);
    session.overlay.setRoster(entries);
    session.overlay.setRoom(session.room.code, session.net.onlineCount, session.net.status);
  }

  // ------------------------------------------------------------- setup

  private startPosition(): Phaser.Math.Vector2 {
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
      this.cars.push(new Vehicle(this, s.x, s.y, s.angle + Phaser.Math.FloatBetween(-0.04, 0.04), skin));
    }
  }

  private buildPrompt() {
    this.promptBg = this.add.graphics();
    this.promptText = this.add
      .text(0, 0, ENTER_LABEL, { fontFamily: 'ui-monospace, Menlo, monospace', fontSize: '15px', color: '#f4f7ff' })
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

  private toggleVehicle() {
    if (!this.live || this.enterCooldown > 0) return;
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
    track('vehicle_entered');
    trackOnce('first_vehicle_entered');
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
    track('vehicle_exited');
  }

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
      if (!hits.some((b) => b.label === 'solid' || b.label === 'prop')) return c;
    }
    return new Phaser.Math.Vector2(v.x, v.y);
  }

  // ------------------------------------------------------------- audio

  /** Position a world sound relative to the camera and play it. */
  private hear(x: number, y: number, kind: 'horn' | 'shout' | 'crash', strength = 1) {
    const audio = this.session?.audio;
    if (!audio) return;
    const cam = this.cameras.main;
    const dx = x - (cam.scrollX + cam.width / 2 / cam.zoom);
    const dy = y - (cam.scrollY + cam.height / 2 / cam.zoom);
    const dist = Math.hypot(dx, dy);
    if (dist > 1100) return;
    const pan = clamp(dx / 700, -1, 1);
    if (kind === 'horn') audio.horn(pan, dist);
    else if (kind === 'shout') audio.shout(pan, dist);
    else audio.crash(strength, pan);
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
        this.hear(cx, cy, 'crash', mag);
        if (mag > 6) haptic(28);
      } else if (mag > 3.4 && this.cameras.main.worldView.contains(cx, cy)) {
        this.effects.bump(cx, cy);
        if (mag > 5) this.hear(cx, cy, 'crash', mag * 0.6);
      }

      // A real bang scatters the street, whoever caused it.
      if (mag > 5.5) {
        this.peds.shock(cx, cy, 260);
        this.traffic.shock(cx, cy, 240);
      }

      if (playerInvolved && mag > HEAT.impactFloor) {
        const me = this.current!;
        const other = va === me ? vb : va;
        let gain = Math.min((mag - HEAT.impactFloor) * HEAT.impactScale, HEAT.maxPerImpact);
        if (other?.isPolice) {
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

  override update(time: number, delta: number) {
    const dt = Math.min(delta, 50);
    const dtScale = dt / 16.6667;
    this.frame++;
    this.enterCooldown = Math.max(0, this.enterCooldown - dt);

    const input = this.hub.update(this.live);
    if (this.hub.consumeAction()) this.toggleVehicle();
    const beforeX = this.focus.x;
    const beforeY = this.focus.y;

    if (this.current) {
      this.current.controls = this.driver.control(input);
      this.current.update(dtScale);
      this.focus.set(this.current.x, this.current.y);
      const body = this.current.sprite.body as MatterJS.BodyType;
      this.vel.set(body.velocity.x, body.velocity.y);
      this.driven += Math.hypot(this.focus.x - beforeX, this.focus.y - beforeY);
      if (Math.abs(this.current.forwardSpeed) > DRIVE.maxSpeed * 0.4) trackOnce('first_drive');
    } else {
      this.player.update(dtScale, input.moveX, input.moveY);
      this.focus.set(this.player.x, this.player.y);
      const body = this.player.sprite.body as MatterJS.BodyType;
      this.vel.set(body.velocity.x, body.velocity.y);
      this.walked += Math.hypot(this.focus.x - beforeX, this.focus.y - beforeY);
    }

    for (const v of this.cars) {
      if (v !== this.current) v.update(dtScale);
    }

    this.collectVehicles();
    this.traffic.update(dt, dtScale, this.focus, this.obstacles, this.policeCars);
    this.police.update(dt, this.focus, this.vel, dtScale);
    this.ambient.update(dt, dtScale, this.focus);
    // Patrols can be despawned by the two calls above, so rebuild the lists
    // before anything else reads them.
    this.collectVehicles();
    this.collectHazards();
    this.peds.update(dt, this.focus, this.hazards);

    const heatBefore = this.heat.value;
    this.heat.update(dt, this.police.nearestDist, this.police.count);
    this.heatPeak = Math.max(this.heatPeak, this.heat.value);
    this.onHeatChange(heatBefore);

    this.score.update(dt, !!this.current, this.current?.forwardSpeed ?? 0);
    this.jobs.enabled = this.onboarding.jobsUnlocked;
    this.jobs.update(dt, this.focus, !!this.current);
    this.teach(dt);
    this.tyreFx();
    this.updatePrompt();
    this.network(dt);
    this.updateAudio(time);

    if (this.heat.levelUp) {
      this.hud.alert = DISPATCH[Math.min(this.heat.level, DISPATCH.length) - 1];
      this.alertT = 2200;
      haptic([0, 24, 40, 24]);
      this.session?.audio.cue('heat');
    }
    if (this.heat.level !== this.lastHeatLevel) {
      track('heat_level_changed', { level: this.heat.level, from: this.lastHeatLevel });
      this.lastHeatLevel = this.heat.level;
    }
    this.alertT = Math.max(0, this.alertT - dt);

    const speedRatio = this.current ? Math.abs(this.current.forwardSpeed) / DRIVE.maxSpeed : 0;
    this.rig.update(dtScale, this.vel.x, this.vel.y, !!this.current, speedRatio);
    this.syncHud();
  }

  /** One pass over every physical vehicle, reused by traffic and pedestrians. */
  private collectVehicles() {
    this.obstacles.length = 0;
    this.policeCars.length = 0;
    for (const c of this.cars) if (!c.dead) this.obstacles.push(c);
    for (const c of this.traffic.cars) if (!c.vehicle.dead) this.obstacles.push(c.vehicle);
    for (const p of this.police.patrols) {
      if (p.vehicle.dead) continue;
      this.obstacles.push(p.vehicle);
      this.policeCars.push(p.vehicle);
    }
    const chase = this.ambient.pursuitCar;
    if (chase && !chase.dead) {
      this.obstacles.push(chase);
      this.policeCars.push(chase);
    }
    if (this.current) this.obstacles.push(this.current);
  }

  private collectHazards() {
    this.hazards.length = 0;
    if (this.current) this.addHazard(this.current);
    else if (this.player.visible) this.addHazard(this.player);
    for (const p of this.policeCars) this.addHazard(p, true);
    for (const c of this.traffic.cars) {
      const v = c.vehicle;
      if (!v.dead && v.speed > 2.2) this.addHazard(v);
    }
  }

  private addHazard(source: Vehicle | Player, siren = false) {
    const i = this.hazards.length;
    let h = this.hazardPool[i];
    if (!h) {
      h = { x: 0, y: 0, speed: 0, vx: 0, vy: 0, siren: false };
      this.hazardPool[i] = h;
    }
    const body = source.sprite.body as MatterJS.BodyType | null;
    h.x = source.x;
    h.y = source.y;
    h.vx = body?.velocity.x ?? 0;
    h.vy = body?.velocity.y ?? 0;
    h.speed = Math.hypot(h.vx, h.vy);
    h.siren = siren;
    this.hazards.push(h);
  }

  // ------------------------------------------------------------- progression

  private onHeatChange(before: number) {
    if (before <= 0 && this.heat.value > 0) trackOnce('heat_started');

    if (this.heatPeak >= HEAT.thresholds[0] && this.heat.value <= 0 && this.police.count === 0) {
      const level = this.heatPeak >= HEAT.thresholds[2] ? 3 : this.heatPeak >= HEAT.thresholds[1] ? 2 : 1;
      this.score.escaped(level);
      this.heatPeak = 0;
      this.escapes++;
      track('pursuit_escaped', { level });
      trackOnce('first_pursuit_escaped', { level });
      this.session?.audio.cue('escaped');
      this.refreshRoster();
      if (this.escapes === 1) this.nudge('THAT WAS CLOSE.');
    }
  }

  private onJobDone() {
    this.jobsDone++;
    trackOnce('first_mission_completed');
    haptic([0, 18, 50, 26]);
    this.session?.audio.cue('missionDone');
    this.refreshRoster();
    if (this.jobsDone === 1) this.nudge('FIRST JOB DONE.');
  }

  /** Invite prompts only at moments worth interrupting for, and never twice. */
  private nudge(line: string) {
    const session = this.session;
    if (!session || session.net.peers.size > 0) return;
    session.overlay.showNudge(line);
  }

  private teach(dt: number) {
    this.onboarding.update(dt, {
      walked: this.walked,
      nearVehicle: !!this.nearby,
      driving: !!this.current,
      driven: this.driven,
      heat: this.heat.value,
      police: this.police.count,
    });
  }

  // ------------------------------------------------------------- network

  private network(dt: number) {
    const session = this.session;
    if (!session) return;

    const moving = this.vel.lengthSq() > 0.05;
    session.net.publish(
      {
        x: Math.round(this.focus.x * 10) / 10,
        y: Math.round(this.focus.y * 10) / 10,
        rotation: Math.round((this.current ? this.current.rotation : this.player.sprite.rotation) * 1000) / 1000,
        velocityX: Math.round(this.vel.x * 100) / 100,
        velocityY: Math.round(this.vel.y * 100) / 100,
        vehicleType: this.current ? this.current.skin.key : 'ped',
        inVehicle: !!this.current,
        heat: Math.round(this.heat.value),
        score: this.score.value,
      },
      moving,
    );

    this.remotes?.update();
    if (this.heatRun && this.heatRun.phase !== this.lastRunPhase) {
      this.lastRunPhase = this.heatRun.phase;
      if (this.lastRunPhase === 'running') session.audio.cue('heatRunStart');
      if (this.lastRunPhase === 'over') session.audio.cue('heatRunWin');
    }
    this.heatRun?.update(dt, this.heat.value, this.heat.level, this.police.count, (points) => {
      this.score.add(points, 'HEAT RUN');
      this.refreshRoster();
    });

    this.pruneAt -= dt;
    if (this.pruneAt <= 0) {
      this.pruneAt = 2000;
      session.net.prune();
      session.overlay.setRoom(session.room.code, session.net.onlineCount, session.net.status);
      Analytics.setContext({
        online_player_count: session.net.onlineCount,
        multiplayer: session.net.onlineCount > 1,
        current_heat: Math.round(this.heat.value),
        score: this.score.value,
      });
    }
  }

  private updateAudio(nowMs: number) {
    const audio = this.session?.audio;
    if (!audio) return;
    const v = this.current;
    const ratio = v ? Math.abs(v.forwardSpeed) / DRIVE.maxSpeed : 0;
    audio.engine(ratio, v ? v.controls.throttle : 0, !!v);
    audio.tyres(v ? clamp((Math.abs(v.lateralSpeed) - 1.2) / 4.5, 0, 1) : 0);
    if (v && v.controls.brake > 0.5 && v.forwardSpeed > 6) audio.brake(0);

    const chasing = this.police.count > 0 && this.police.nearestDist < 900;
    audio.siren(chasing || !!this.ambient.pursuitCar, chasing ? clamp(1 - this.police.nearestDist / 900, 0, 1) : 0.25);
    audio.ambience(nowMs);
  }

  // ------------------------------------------------------------- hud + fx

  private syncHud() {
    const h = this.hud;
    h.heat = this.heat.value;
    h.heatLevel = this.heat.level;
    h.heatPulse = this.heat.pulse;
    h.status = this.heat.status;
    h.evadeTimer = this.heat.evadeTimer;
    h.driving = !!this.current;
    h.police = this.police.count;
    h.speedKmh = this.current ? Math.abs(this.current.forwardSpeed) * KMH_PER_UNIT : 0;
    h.alertAlpha = clamp(this.alertT / 420, 0, 1);
    h.score = this.score.value;
    h.scorePulse = this.score.pulse;
    h.scoreReason = this.score.lastReason;
    h.teach = this.live ? this.onboarding.text : '';
    h.jobLabel = this.jobs.label;
    h.jobDistance = this.jobs.distance;
    h.runTitle = this.heatRun?.title ?? '';
    h.runSubtitle = this.heatRun?.subtitle ?? '';
    h.live = this.live;
  }

  private tyreFx() {
    if (this.frame % SKID_EVERY !== 0) return;
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
      this.hud.prompt = canExit ? EXIT_LABEL : '';
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
    this.hud.prompt = best ? ENTER_LABEL : '';

    if (best) {
      this.prompt.setVisible(true).setPosition(best.x, best.y - 40 + Math.sin(this.frame * 0.09) * 2);
    } else {
      this.prompt.setVisible(false);
    }
  }
}
