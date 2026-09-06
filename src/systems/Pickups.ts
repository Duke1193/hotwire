import Phaser from 'phaser';
import { PICKUPS } from '../config';
import type { World } from '../world/World';
import type { WeaponId } from './Combat';
import { WEAPONS } from './Combat';

export type PickupKind = WeaponId | 'health' | 'armor';

interface Crate {
  kind: PickupKind;
  x: number;
  y: number;
  crate: Phaser.GameObjects.Image;
  glow: Phaser.GameObjects.Image;
  cooldown: number;
}

const KIND_TINT: Record<PickupKind, number> = {
  pistol: 0xffe9a8,
  auto: 0xa8e0ff,
  shotgun: 0xffc46b,
  health: 0x7ee0a1,
  armor: 0x9fb6ff,
};

/** The lid marking says what is inside before you are close enough to read. */
const KIND_TEXTURE: Record<PickupKind, string> = {
  pistol: 'crate-weapon',
  auto: 'crate-ammo',
  shotgun: 'crate-weapon',
  health: 'crate-health',
  armor: 'crate-armor',
};

/**
 * Supply crates tucked into the parts of the city you would otherwise never
 * drive through — courtyards, car parks, alleys behind blocks. Original
 * presentation on purpose: a low crate with a light beacon, sitting on the
 * ground. Nothing spins and nothing floats.
 */
export class Pickups {
  readonly crates: Crate[] = [];
  onCollect: ((kind: PickupKind, x: number, y: number) => void) | null = null;

  private pulse = 0;

  constructor(scene: Phaser.Scene, world: World) {
    const spots = this.placeCrates(world);
    const kinds: PickupKind[] = ['pistol', 'pistol', 'auto', 'shotgun', 'health', 'health', 'armor'];

    for (let i = 0; i < Math.min(PICKUPS.count, spots.length); i++) {
      const spot = spots[i];
      const kind = kinds[i % kinds.length];
      const glow = scene.add
        .image(spot.x, spot.y, 'beacon')
        .setTint(KIND_TINT[kind])
        .setBlendMode(Phaser.BlendModes.ADD)
        .setAlpha(0.45)
        .setDepth(6);
      const crate = scene.add.image(spot.x, spot.y, KIND_TEXTURE[kind]).setTint(KIND_TINT[kind]).setDepth(9);
      this.crates.push({ kind, x: spot.x, y: spot.y, crate, glow, cooldown: 0 });
    }
  }

  /** Quiet corners: block interiors and off-road lots, never the main roads. */
  private placeCrates(world: World): { x: number; y: number }[] {
    const spots: { x: number; y: number }[] = [];
    const rng = new Phaser.Math.RandomDataGenerator(['getaway-crates']);
    for (const block of world.blocks) {
      // On the pavement ring in a block corner: off the road, out of the way,
      // and never inside a building.
      const inset = 15;
      const corners = [
        { x: block.x + inset, y: block.y + inset },
        { x: block.x + block.w - inset, y: block.y + inset },
        { x: block.x + inset, y: block.y + block.h - inset },
        { x: block.x + block.w - inset, y: block.y + block.h - inset },
      ];
      const start = rng.between(0, 3);
      for (let i = 0; i < corners.length; i++) {
        const pick = corners[(start + i) % corners.length];
        if (world.blocksShot(pick.x, pick.y)) continue;
        spots.push(pick);
        break;
      }
    }
    return Phaser.Utils.Array.Shuffle(spots);
  }

  update(dtMs: number, px: number, py: number, wants: (kind: PickupKind) => boolean) {
    this.pulse += dtMs / 520;
    const breathe = 0.42 + Math.sin(this.pulse) * 0.16;

    for (const crate of this.crates) {
      if (crate.cooldown > 0) {
        crate.cooldown -= dtMs;
        if (crate.cooldown <= 0) {
          crate.crate.setVisible(true);
          crate.glow.setVisible(true);
        }
        continue;
      }

      crate.glow.setAlpha(breathe).setScale(0.9 + Math.sin(this.pulse) * 0.08);

      const dx = crate.x - px;
      const dy = crate.y - py;
      if (dx * dx + dy * dy > PICKUPS.radius * PICKUPS.radius) continue;
      if (!wants(crate.kind)) continue;

      crate.cooldown = PICKUPS.respawnMs;
      crate.crate.setVisible(false);
      crate.glow.setVisible(false);
      this.onCollect?.(crate.kind, crate.x, crate.y);
    }
  }
}

export function ammoFor(kind: PickupKind): number {
  if (kind === 'health' || kind === 'armor') return 0;
  return WEAPONS[kind].magazine;
}
