import Phaser from 'phaser';
import { COMBAT } from '../config';
import type { World } from '../world/World';

export type WeaponId = 'pistol' | 'auto' | 'shotgun';

export interface WeaponSpec {
  id: WeaponId;
  name: string;
  short: string;
  damage: number;
  /** Milliseconds between shots. */
  fireMs: number;
  /** Radians of random spread per pellet. */
  spread: number;
  pellets: number;
  /** px per frame at 60Hz. */
  speed: number;
  rangeMs: number;
  magazine: number;
  auto: boolean;
  tint: number;
}

/**
 * Three archetypes, nothing more: something reliable, something fast and
 * something that hurts up close. All values are ours and tuned for a forgiving
 * time-to-kill so a thumb on a phone can still win a fight.
 */
export const WEAPONS: Record<WeaponId, WeaponSpec> = {
  pistol: {
    id: 'pistol',
    name: 'SIDEARM',
    short: 'SDR',
    damage: 24,
    fireMs: 340,
    spread: 0.045,
    pellets: 1,
    speed: 15,
    rangeMs: 900,
    magazine: 40,
    auto: false,
    tint: 0xffe9a8,
  },
  auto: {
    id: 'auto',
    name: 'BURSTER',
    short: 'BRS',
    damage: 13,
    fireMs: 110,
    spread: 0.13,
    pellets: 1,
    speed: 16,
    rangeMs: 780,
    magazine: 90,
    auto: true,
    tint: 0xa8e0ff,
  },
  shotgun: {
    id: 'shotgun',
    name: 'SCATTER',
    short: 'SCT',
    damage: 13,
    fireMs: 720,
    spread: 0.17,
    pellets: 6,
    speed: 14,
    rangeMs: 340,
    magazine: 18,
    auto: false,
    tint: 0xffc46b,
  },
};

export interface HitTarget {
  id: string;
  x: number;
  y: number;
}

interface Bullet {
  sprite: Phaser.GameObjects.Image;
  vx: number;
  vy: number;
  life: number;
  damage: number;
  /** Only our own shots test for hits; remote ones are visual. */
  mine: boolean;
  active: boolean;
}

export interface ShotWire {
  x: number;
  y: number;
  a: number;
  w: WeaponId;
  /** Pellet angles are derived from a seed so both sides look the same. */
  s: number;
}

/**
 * On-foot gunplay.
 *
 * V1 NETWORK MODEL (deliberate): the shooter decides what it hit, against the
 * interpolated position it can see, and tells the victim. The victim always
 * applies the damage. That is trivially cheatable and slightly unfair under
 * lag, and it is the right trade for a social prototype — the alternative is
 * an authoritative server we are explicitly not building.
 */
export class Combat {
  weapon: WeaponId | null = null;
  ammo = 0;
  /** Set once the player has fired at least one shot. */
  hasFired = false;

  onShot: ((wire: ShotWire) => void) | null = null;
  onHit: ((targetId: string, damage: number) => void) | null = null;
  onNoise: ((x: number, y: number, weapon: WeaponId) => void) | null = null;

  private pool: Bullet[] = [];
  private nextShotAt = 0;
  private flash: Phaser.GameObjects.Image;
  private flashMs = 0;

  constructor(scene: Phaser.Scene, private world: World) {
    this.flash = scene.add.image(-999, -999, 'flash-pistol').setDepth(14).setVisible(false);
    for (let i = 0; i < COMBAT.poolSize; i++) {
      const sprite = scene.add.image(-999, -999, 'bullet').setDepth(13).setVisible(false);
      this.pool.push({ sprite, vx: 0, vy: 0, life: 0, damage: 0, mine: false, active: false });
    }
  }

  get spec(): WeaponSpec | null {
    return this.weapon ? WEAPONS[this.weapon] : null;
  }

  give(id: WeaponId, ammo: number) {
    if (this.weapon === id) this.ammo = Math.min(this.ammo + ammo, WEAPONS[id].magazine * 2);
    else {
      this.weapon = id;
      this.ammo = ammo;
    }
  }

  clear() {
    this.weapon = null;
    this.ammo = 0;
  }

  /** Fires if a weapon is held, it has ammo and the cooldown has elapsed. */
  tryFire(nowMs: number, x: number, y: number, angle: number): boolean {
    const spec = this.spec;
    if (!spec || this.ammo <= 0 || nowMs < this.nextShotAt) return false;

    this.nextShotAt = nowMs + spec.fireMs;
    this.ammo--;
    this.hasFired = true;

    const seed = (Math.random() * 65535) | 0;
    this.emit(spec, x, y, angle, seed, true);
    this.showFlash(spec, x, y, angle);
    this.onShot?.({ x: Math.round(x), y: Math.round(y), a: +angle.toFixed(3), w: spec.id, s: seed });
    this.onNoise?.(x, y, spec.id);
    if (this.ammo <= 0) this.weapon = null;
    return true;
  }

  /** Draws someone else's shot. Their client decides whether it hit us. */
  remoteShot(wire: ShotWire) {
    const spec = WEAPONS[wire.w];
    if (!spec) return;
    this.emit(spec, wire.x, wire.y, wire.a, wire.s, false);
    this.showFlash(spec, wire.x, wire.y, wire.a);
    this.onNoise?.(wire.x, wire.y, spec.id);
  }

  private emit(spec: WeaponSpec, x: number, y: number, angle: number, seed: number, mine: boolean) {
    // A tiny deterministic PRNG so both clients scatter pellets identically.
    let state = seed || 1;
    const rand = () => {
      state = (state * 1664525 + 1013904223) >>> 0;
      return state / 4294967296 - 0.5;
    };

    for (let p = 0; p < spec.pellets; p++) {
      const bullet = this.pool.find((b) => !b.active);
      if (!bullet) return;
      const a = angle + rand() * 2 * spec.spread;
      bullet.vx = Math.cos(a) * spec.speed;
      bullet.vy = Math.sin(a) * spec.speed;
      bullet.life = spec.rangeMs;
      bullet.damage = spec.damage;
      bullet.mine = mine;
      bullet.active = true;
      bullet.sprite
        .setPosition(x + Math.cos(angle) * 14, y + Math.sin(angle) * 14)
        .setRotation(a)
        .setTint(spec.tint)
        .setVisible(true);
    }
  }

  /** One short flash at the muzzle, shaped per weapon. */
  private showFlash(spec: WeaponSpec, x: number, y: number, angle: number) {
    this.flash
      .setTexture(`flash-${spec.id}`)
      .setPosition(x + Math.cos(angle) * 17, y + Math.sin(angle) * 17)
      .setRotation(angle)
      .setOrigin(0.1, 0.5)
      .setAlpha(0.95)
      .setVisible(true);
    this.flashMs = spec.id === 'shotgun' ? 90 : 55;
  }

  update(dtMs: number, dtScale: number, targets: HitTarget[]) {
    if (this.flashMs > 0) {
      this.flashMs -= dtMs;
      this.flash.setAlpha(Math.max(0, this.flashMs / 60));
      if (this.flashMs <= 0) this.flash.setVisible(false);
    }

    for (const b of this.pool) {
      if (!b.active) continue;
      b.life -= dtMs;
      const sprite = b.sprite;
      sprite.x += b.vx * dtScale;
      sprite.y += b.vy * dtScale;

      if (b.life <= 0 || this.world.blocksShot(sprite.x, sprite.y)) {
        this.retire(b);
        continue;
      }

      if (!b.mine) continue;
      for (const t of targets) {
        const dx = t.x - sprite.x;
        const dy = t.y - sprite.y;
        if (dx * dx + dy * dy > COMBAT.hitRadius * COMBAT.hitRadius) continue;
        this.onHit?.(t.id, b.damage);
        this.retire(b);
        break;
      }
    }
  }

  private retire(b: Bullet) {
    b.active = false;
    b.sprite.setVisible(false).setPosition(-999, -999);
  }
}
