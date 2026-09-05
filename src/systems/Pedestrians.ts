import Phaser from 'phaser';
import { PEDS } from '../config';
import { PED_JACKETS } from '../gfx/Textures';
import type { World } from '../world/World';
import { clamp } from '../util/math';

/** Anything a pedestrian might want to get away from. */
export interface Hazard {
  x: number;
  y: number;
  /** px per physics step, same units as Vehicle.speed */
  speed: number;
  /** Direction of travel, so we can tell "driving past" from "driving at me". */
  vx: number;
  vy: number;
  siren: boolean;
}

const enum State {
  Walk,
  Wait,
  KerbWait,
  Cross,
  Flee,
  Stumble,
}

interface Ped {
  sprite: Phaser.GameObjects.Image;
  shadow: Phaser.GameObjects.Image;
  node: number;
  from: number;
  state: State;
  timer: number;
  facing: number;
  bob: number;
  speed: number;
  kx: number;
  ky: number;
  /** Frames skipped while far away, so movement stays consistent. */
  slow: boolean;
}

const NEAR = 980;
const SCALE = 1.12;

/**
 * Crowd simulation on the sidewalk waypoint graph. Pedestrians never leave the
 * graph — even panicking they run to a waypoint — so they can never walk into
 * a building and we never need collision or pathfinding for them.
 */
export class Pedestrians {
  private peds: Ped[] = [];
  private frame = 0;

  /** Called when someone visibly panics near the camera. */
  onShout: ((x: number, y: number) => void) | null = null;

  constructor(private scene: Phaser.Scene, private world: World, focus: Phaser.Math.Vector2) {
    for (let i = 0; i < PEDS.count; i++) {
      const key = `ped-${1 + (i % (PED_JACKETS.length - 1))}`;
      const node = this.world.walk.inBand(focus.x, focus.y, 140, 1020);
      const p = this.world.walk.nodes[node];
      const shadow = this.scene.add
        .image(p.x + 3, p.y + 5, key)
        .setTint(0x000000)
        .setAlpha(0.26)
        .setScale(SCALE * 1.02)
        .setDepth(5);
      const sprite = this.scene.add.image(p.x, p.y, key).setDepth(8).setScale(SCALE);
      this.peds.push({
        sprite,
        shadow,
        node,
        from: node,
        state: State.Walk,
        timer: 0,
        facing: 0,
        bob: Math.random() * 6,
        speed: PEDS.speed * Phaser.Math.FloatBetween(0.82, 1.2),
        kx: 0,
        ky: 0,
        slow: false,
      });
      this.retarget(this.peds[this.peds.length - 1]);
    }
  }

  get count() {
    return this.peds.length;
  }

  /** Scatter everyone near a point — used by crashes and ambient incidents. */
  shock(x: number, y: number, radius: number) {
    const r2 = radius * radius;
    for (const ped of this.peds) {
      const dx = ped.sprite.x - x;
      const dy = ped.sprite.y - y;
      if (dx * dx + dy * dy > r2) continue;
      this.panic(ped, x, y, 2600);
    }
  }

  update(dtMs: number, focus: Phaser.Math.Vector2, hazards: Hazard[]) {
    this.frame++;
    const slowTick = this.frame % 8 === 0;

    for (const ped of this.peds) {
      const dx = ped.sprite.x - focus.x;
      const dy = ped.sprite.y - focus.y;
      const dist2 = dx * dx + dy * dy;

      if (dist2 > PEDS.despawn * PEDS.despawn) {
        this.recycle(ped, focus);
        continue;
      }

      const near = dist2 < NEAR * NEAR;
      if (!near) {
        // Far crowds still move, just eight times less often.
        if (!slowTick) continue;
        this.step(ped, dtMs * 8, null);
        continue;
      }
      this.step(ped, dtMs, hazards);
    }
  }

  private step(ped: Ped, dtMs: number, hazards: Hazard[] | null) {
    const dt = dtMs / 16.6667;
    ped.timer -= dtMs;

    if (hazards) this.checkHazards(ped, hazards);

    switch (ped.state) {
      case State.Stumble: {
        ped.sprite.x += ped.kx * dt;
        ped.sprite.y += ped.ky * dt;
        ped.kx *= 0.86;
        ped.ky *= 0.86;
        if (ped.timer <= 0) {
          ped.state = State.Flee;
          ped.timer = 1800;
          this.retarget(ped);
        }
        break;
      }
      case State.Wait:
        if (ped.timer <= 0) ped.state = State.Walk;
        break;
      case State.KerbWait: {
        if (!hazards || this.crossingClear(ped, hazards) || ped.timer <= -4000) {
          ped.state = State.Cross;
        }
        break;
      }
      default:
        break;
    }

    if (ped.state === State.Wait || ped.state === State.KerbWait || ped.state === State.Stumble) {
      this.draw(ped, 0);
      return;
    }

    const target = this.world.walk.nodes[ped.node];
    const tx = target.x - ped.sprite.x;
    const ty = target.y - ped.sprite.y;
    const d = Math.hypot(tx, ty);

    let speed = ped.speed;
    if (ped.state === State.Cross) speed *= 1.45;
    if (ped.state === State.Flee) speed = PEDS.runSpeed;

    if (d < 4) {
      if (ped.state === State.Flee && ped.timer > 0) {
        this.retarget(ped);
      } else if (ped.state === State.Flee) {
        ped.state = State.Walk;
        this.retarget(ped);
      } else {
        this.arrive(ped);
      }
      this.draw(ped, 0);
      return;
    }

    const move = Math.min(speed * dt, d);
    ped.sprite.x += (tx / d) * move;
    ped.sprite.y += (ty / d) * move;
    ped.facing = Phaser.Math.Angle.RotateTo(ped.facing, Math.atan2(ty, tx), 0.3 * dt);
    this.draw(ped, move);
  }

  private draw(ped: Ped, moved: number) {
    ped.bob += moved * 0.22;
    const s = 1 + Math.sin(ped.bob) * 0.07;
    ped.sprite.setRotation(ped.facing).setScale(SCALE * s, SCALE / s);
    ped.shadow.setPosition(ped.sprite.x + 3, ped.sprite.y + 5).setRotation(ped.facing);
  }

  /** Reached a waypoint: pick the next one, maybe loiter, maybe cross. */
  private arrive(ped: Ped) {
    const node = this.world.walk.nodes[ped.node];
    const links = node.links;
    if (!links.length) return;

    let pick = links[(Math.random() * links.length) | 0];
    if (links.length > 1 && pick.to === ped.from && Math.random() < 0.85) {
      // prefer to keep going rather than turn back on the spot
      for (let i = 0; i < 3; i++) {
        const alt = links[(Math.random() * links.length) | 0];
        if (alt.to !== ped.from) {
          pick = alt;
          break;
        }
      }
    }

    ped.from = ped.node;
    ped.node = pick.to;

    if (pick.cross) {
      ped.state = State.KerbWait;
      ped.timer = 0;
    } else if (Math.random() < 0.12) {
      ped.state = State.Wait;
      ped.timer = Phaser.Math.Between(900, 3200);
    } else {
      ped.state = State.Walk;
    }
  }

  /** Only step off the kerb when nothing is bearing down on the crossing. */
  private crossingClear(ped: Ped, hazards: Hazard[]): boolean {
    const target = this.world.walk.nodes[ped.node];
    const mx = (ped.sprite.x + target.x) * 0.5;
    const my = (ped.sprite.y + target.y) * 0.5;
    for (const h of hazards) {
      if (h.speed < 0.6) continue;
      const dx = h.x - mx;
      const dy = h.y - my;
      const reach = 120 + h.speed * 26;
      if (dx * dx + dy * dy < reach * reach) return false;
    }
    return true;
  }

  private checkHazards(ped: Ped, hazards: Hazard[]) {
    for (const h of hazards) {
      const dx = ped.sprite.x - h.x;
      const dy = ped.sprite.y - h.y;
      const d2 = dx * dx + dy * dy;

      if (d2 < 22 * 22 && h.speed > 1.2) {
        // clipped by a car: knocked aside, then bolts
        const d = Math.max(0.001, Math.sqrt(d2));
        ped.state = State.Stumble;
        ped.timer = 420;
        ped.kx = (dx / d) * clamp(h.speed * 0.5, 1.6, 5);
        ped.ky = (dy / d) * clamp(h.speed * 0.5, 1.6, 5);
        this.onShout?.(ped.sprite.x, ped.sprite.y);
        return;
      }

      // Sirens turn heads on their own. Everything else only frightens people
      // when it is actually coming at them — traffic in the next lane passes
      // within 60px of the pavement all day and nobody should care.
      const scare = h.siren ? PEDS.scareDist * 1.4 : PEDS.scareDist;
      if (d2 > scare * scare) continue;
      if (!h.siren) {
        if (h.speed <= PEDS.scareSpeed) continue;
        const d = Math.max(0.001, Math.sqrt(d2));
        const vlen = Math.max(0.001, Math.hypot(h.vx, h.vy));
        // dx/dy point from the vehicle to the pedestrian, so a positive dot
        // product with its velocity means it is heading their way.
        const closing = (dx * h.vx + dy * h.vy) / (d * vlen);
        if (closing < 0.78) continue;
      }
      if (ped.state !== State.Flee) this.panic(ped, h.x, h.y, h.siren ? 1500 : 2200);
      return;
    }
  }

  private panic(ped: Ped, fromX: number, fromY: number, ms: number) {
    if (ped.state === State.Stumble) return;
    const first = ped.state !== State.Flee;
    ped.state = State.Flee;
    ped.timer = Math.max(ped.timer, ms);
    this.retarget(ped, fromX, fromY);
    if (first && Math.random() < 0.25) this.onShout?.(ped.sprite.x, ped.sprite.y);
  }

  /** Aim at a neighbouring waypoint, preferring one away from the threat. */
  private retarget(ped: Ped, awayX?: number, awayY?: number) {
    const here = this.world.walk.nearest(ped.sprite.x, ped.sprite.y);
    const links = this.world.walk.nodes[here].links;
    if (!links.length) return;

    let best = links[0].to;
    if (awayX !== undefined && awayY !== undefined) {
      let bestScore = -Infinity;
      for (const l of links) {
        const n = this.world.walk.nodes[l.to];
        // run away from the threat, and never sprint across a road to do it
        const score = Math.hypot(n.x - awayX, n.y - awayY) - (l.cross ? 400 : 0);
        if (score > bestScore) {
          bestScore = score;
          best = l.to;
        }
      }
    } else {
      best = links[(Math.random() * links.length) | 0].to;
    }
    ped.from = here;
    ped.node = best;
  }

  private recycle(ped: Ped, focus: Phaser.Math.Vector2) {
    const node = this.world.walk.inBand(focus.x, focus.y, PEDS.spawnMin, PEDS.spawnMax);
    const p = this.world.walk.nodes[node];
    ped.sprite.setPosition(p.x, p.y);
    ped.shadow.setPosition(p.x + 3, p.y + 5);
    ped.node = node;
    ped.from = node;
    ped.state = State.Walk;
    ped.timer = 0;
    ped.kx = 0;
    ped.ky = 0;
    this.retarget(ped);
  }
}
