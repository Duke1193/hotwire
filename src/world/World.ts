import Phaser from 'phaser';
import { COLORS, WORLD } from '../config';
import { LaneGrid, WalkGraph } from './Graphs';

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface ParkingSpot {
  x: number;
  y: number;
  angle: number;
}

interface Span {
  a: number;
  b: number;
}

const BUILDING_TONES: { wall: number; roof: number; detail: number }[] = [
  { wall: 0x494857, roof: 0x8e8ca0, detail: 0xb3b1c4 },
  { wall: 0x5c4239, roof: 0xa8826f, detail: 0xcaa48f },
  { wall: 0x374757, roof: 0x6f88a0, detail: 0x94abc1 },
  { wall: 0x484f3a, roof: 0x8a9375, detail: 0xadb599 },
  { wall: 0x523c48, roof: 0x9a7889, detail: 0xbc9aab },
  { wall: 0x334e50, roof: 0x6a9296, detail: 0x8fb5b9 },
  { wall: 0x5d5234, roof: 0xab9a6d, detail: 0xccbc92 },
];

/** Procedurally generated city block: roads, sidewalks, buildings, props. */
export class World {
  readonly width = WORLD.width;
  readonly height = WORLD.height;

  buildings: Rect[] = [];
  parking: ParkingSpot[] = [];
  roadPoints: Phaser.Math.Vector2[] = [];
  props: { x: number; y: number; key: string; solid: boolean }[] = [];

  /** Baked ground layer. Skid marks get stamped straight into it. */
  ground!: Phaser.GameObjects.RenderTexture;

  /** Road grid used by traffic, and the sidewalk waypoints used by pedestrians. */
  readonly lanes = new LaneGrid();
  walk!: WalkGraph;
  blocks: Rect[] = [];

  private rng = new Phaser.Math.RandomDataGenerator([WORLD.seed]);

  build(scene: Phaser.Scene) {
    this.layout();

    // Everything static is drawn once and baked, so no Graphics command list
    // is re-submitted per frame.
    const g = scene.add.graphics().setVisible(false);
    this.paintRoads(g);
    this.paintBlocks(g);
    this.ground = scene.add.renderTexture(0, 0, this.width, this.height).setOrigin(0, 0).setDepth(0);
    this.ground.draw(g, 0, 0);
    g.destroy();

    const bg = scene.add.graphics().setVisible(false);
    this.paintBuildings(bg);
    const roofs = scene.add.renderTexture(0, 0, this.width, this.height).setOrigin(0, 0).setDepth(20);
    roofs.draw(bg, 0, 0);
    bg.destroy();

    this.spawnProps(scene);
    this.createBodies(scene);
    this.walk = new WalkGraph(this.blocks);
  }

  // ---------------------------------------------------------------- layout

  private spans(centres: number[], limit: number): Span[] {
    const hw = WORLD.roadHalfWidth;
    const out: Span[] = [];
    let prev = 0;
    for (const c of centres) {
      if (c - hw - prev > 0) out.push({ a: prev, b: c - hw });
      prev = c + hw;
    }
    if (limit - prev > 0) out.push({ a: prev, b: limit });
    return out;
  }

  private layout() {
    const xs = this.spans(WORLD.roadsX, this.width);
    const ys = this.spans(WORLD.roadsY, this.height);
    this.blocks = [];
    for (const sx of xs) {
      for (const sy of ys) {
        const w = sx.b - sx.a;
        const h = sy.b - sy.a;
        if (w < 150 || h < 150) continue;
        this.blocks.push({ x: sx.a, y: sy.a, w, h });
      }
    }

    // Navigation points down the middle of every road, used for police spawns.
    for (const rx of WORLD.roadsX) {
      for (let y = 140; y < this.height - 140; y += 160) this.roadPoints.push(new Phaser.Math.Vector2(rx, y));
    }
    for (const ry of WORLD.roadsY) {
      for (let x = 140; x < this.width - 140; x += 160) this.roadPoints.push(new Phaser.Math.Vector2(x, ry));
    }
  }

  // ---------------------------------------------------------------- paint

  private paintRoads(g: Phaser.GameObjects.Graphics) {
    const hw = WORLD.roadHalfWidth;

    g.fillStyle(COLORS.asphaltEdge, 1);
    g.fillRect(0, 0, this.width, this.height);

    g.fillStyle(COLORS.asphalt, 1);
    for (const rx of WORLD.roadsX) g.fillRect(rx - hw, 0, hw * 2, this.height);
    for (const ry of WORLD.roadsY) g.fillRect(0, ry - hw, this.width, hw * 2);

    // asphalt grain
    g.fillStyle(0xffffff, 0.02);
    for (let i = 0; i < 900; i++) {
      const x = this.rng.between(0, this.width);
      const y = this.rng.between(0, this.height);
      g.fillRect(x, y, this.rng.between(6, 26), this.rng.between(2, 5));
    }

    const isNearCross = (v: number, centres: number[]) => centres.some((c) => Math.abs(v - c) < hw + 26);

    // dashed centre lines
    g.fillStyle(COLORS.line, 0.5);
    for (const rx of WORLD.roadsX) {
      for (let y = 0; y < this.height; y += 56) {
        if (isNearCross(y + 16, WORLD.roadsY)) continue;
        g.fillRect(rx - 2, y, 4, 30);
      }
    }
    for (const ry of WORLD.roadsY) {
      for (let x = 0; x < this.width; x += 56) {
        if (isNearCross(x + 16, WORLD.roadsX)) continue;
        g.fillRect(x, ry - 2, 30, 4);
      }
    }

    // road edge lines
    g.fillStyle(COLORS.lineDim, 0.45);
    for (const rx of WORLD.roadsX) {
      g.fillRect(rx - hw + 7, 0, 2, this.height);
      g.fillRect(rx + hw - 9, 0, 2, this.height);
    }
    for (const ry of WORLD.roadsY) {
      g.fillRect(0, ry - hw + 7, this.width, 2);
      g.fillRect(0, ry + hw - 9, this.width, 2);
    }

    // crossing stripes on every intersection approach
    g.fillStyle(COLORS.line, 0.34);
    for (const rx of WORLD.roadsX) {
      for (const ry of WORLD.roadsY) {
        for (let i = 0; i < 6; i++) {
          const o = -hw + 14 + i * 22;
          g.fillRect(rx + o, ry - hw - 22, 13, 18);
          g.fillRect(rx + o, ry + hw + 4, 13, 18);
          g.fillRect(rx - hw - 22, ry + o, 18, 13);
          g.fillRect(rx + hw + 4, ry + o, 18, 13);
        }
      }
    }
  }

  private paintBlocks(g: Phaser.GameObjects.Graphics) {
    const pad = WORLD.sidewalk;
    for (const b of this.blocks) {
      // sidewalk slab
      g.fillStyle(COLORS.sidewalk, 1);
      g.fillRect(b.x, b.y, b.w, b.h);
      g.fillStyle(COLORS.sidewalkEdge, 1);
      g.fillRect(b.x, b.y, b.w, 3);
      g.fillRect(b.x, b.y + b.h - 3, b.w, 3);
      g.fillRect(b.x, b.y, 3, b.h);
      g.fillRect(b.x + b.w - 3, b.y, 3, b.h);

      // paving joints
      g.fillStyle(0x000000, 0.09);
      for (let x = b.x + 34; x < b.x + b.w; x += 34) g.fillRect(x, b.y, 1, b.h);
      for (let y = b.y + 34; y < b.y + b.h; y += 34) g.fillRect(b.x, y, b.w, 1);

      const lot: Rect = { x: b.x + pad, y: b.y + pad, w: b.w - pad * 2, h: b.h - pad * 2 };
      if (lot.w < 80 || lot.h < 80) continue;

      const roll = this.rng.frac();
      if (roll < 0.16) {
        this.paintPark(g, lot);
      } else if (roll < 0.28) {
        this.paintCarPark(g, lot);
      } else {
        g.fillStyle(COLORS.lot, 1);
        g.fillRect(lot.x, lot.y, lot.w, lot.h);
        this.splitLot(lot, 0);
      }
    }
  }

  private paintPark(g: Phaser.GameObjects.Graphics, lot: Rect) {
    g.fillStyle(COLORS.grass, 1);
    g.fillRect(lot.x, lot.y, lot.w, lot.h);
    g.fillStyle(0x5d9166, 0.55);
    for (let i = 0; i < 26; i++) {
      g.fillCircle(
        this.rng.between(lot.x + 10, lot.x + lot.w - 10),
        this.rng.between(lot.y + 10, lot.y + lot.h - 10),
        this.rng.between(10, 26),
      );
    }
    // gravel path
    g.fillStyle(0x9a9486, 0.9);
    g.fillRect(lot.x + lot.w * 0.45, lot.y, 26, lot.h);

    const count = Math.floor((lot.w * lot.h) / 26000);
    for (let i = 0; i < count; i++) {
      const x = this.rng.between(lot.x + 30, lot.x + lot.w - 30);
      const y = this.rng.between(lot.y + 30, lot.y + lot.h - 30);
      if (Math.abs(x - (lot.x + lot.w * 0.45 + 13)) < 34) continue;
      this.props.push({ x, y, key: 'tree', solid: true });
    }
  }

  private paintCarPark(g: Phaser.GameObjects.Graphics, lot: Rect) {
    g.fillStyle(0x4b4f59, 1);
    g.fillRect(lot.x, lot.y, lot.w, lot.h);
    g.fillStyle(COLORS.line, 0.55);
    for (let x = lot.x + 30; x < lot.x + lot.w - 20; x += 44) {
      g.fillRect(x, lot.y + 16, 2, 54);
      g.fillRect(x, lot.y + lot.h - 70, 2, 54);
    }
    g.fillStyle(0x000000, 0.16);
    g.fillRect(lot.x, lot.y + lot.h * 0.5 - 24, lot.w, 48);

    for (let x = lot.x + 52; x < lot.x + lot.w - 40; x += 44) {
      if (this.rng.frac() < 0.45) this.parking.push({ x, y: lot.y + 42, angle: -Math.PI / 2 });
      if (this.rng.frac() < 0.45) this.parking.push({ x, y: lot.y + lot.h - 42, angle: Math.PI / 2 });
    }
  }

  /** Recursively cut a lot into building footprints. */
  private splitLot(lot: Rect, depth: number) {
    const minSide = 96;
    const canSplit = depth < 2 && (lot.w > minSide * 2.2 || lot.h > minSide * 2.2) && this.rng.frac() < 0.86;

    if (canSplit) {
      const horizontal = lot.w >= lot.h;
      const t = this.rng.realInRange(0.36, 0.64);
      const gap = this.rng.between(14, 26);
      if (horizontal) {
        const cut = Math.floor(lot.w * t);
        this.splitLot({ x: lot.x, y: lot.y, w: cut - gap / 2, h: lot.h }, depth + 1);
        this.splitLot({ x: lot.x + cut + gap / 2, y: lot.y, w: lot.w - cut - gap / 2, h: lot.h }, depth + 1);
      } else {
        const cut = Math.floor(lot.h * t);
        this.splitLot({ x: lot.x, y: lot.y, w: lot.w, h: cut - gap / 2 }, depth + 1);
        this.splitLot({ x: lot.x, y: lot.y + cut + gap / 2, w: lot.w, h: lot.h - cut - gap / 2 }, depth + 1);
      }
      return;
    }

    const inset = this.rng.between(4, 14);
    const r: Rect = { x: lot.x + inset, y: lot.y + inset, w: lot.w - inset * 2, h: lot.h - inset * 2 };
    if (r.w < 60 || r.h < 60) return;
    this.buildings.push(r);
  }

  private paintBuildings(g: Phaser.GameObjects.Graphics) {
    for (const b of this.buildings) {
      const tone = BUILDING_TONES[this.rng.between(0, BUILDING_TONES.length - 1)];
      const storeys = this.rng.between(2, 6);
      const lift = Phaser.Math.Clamp(storeys * 2.6, 5, 16);

      // ground shadow, cast down-right
      g.fillStyle(0x000000, 0.32);
      g.fillRoundedRect(b.x + lift * 0.9, b.y + lift * 1.25, b.w, b.h, 4);

      // wall block, then the roof face offset up-left to fake height
      g.fillStyle(tone.wall, 1);
      g.fillRoundedRect(b.x, b.y, b.w, b.h, 3);
      const rx = b.x - lift * 0.18;
      const ry = b.y - lift * 0.5;
      const rw = b.w - lift * 0.5;
      const rh = b.h - lift * 0.5;
      g.fillStyle(tone.roof, 1);
      g.fillRoundedRect(rx, ry, rw, rh, 3);

      // parapet: light on the top-left, dark on the bottom-right
      g.lineStyle(2, 0xffffff, 0.1);
      g.beginPath();
      g.moveTo(rx + 2, ry + rh - 2);
      g.lineTo(rx + 2, ry + 2);
      g.lineTo(rx + rw - 2, ry + 2);
      g.strokePath();
      g.lineStyle(2, 0x000000, 0.18);
      g.beginPath();
      g.moveTo(rx + rw - 2, ry + 2);
      g.lineTo(rx + rw - 2, ry + rh - 2);
      g.lineTo(rx + 2, ry + rh - 2);
      g.strokePath();

      // roof furniture
      const units = this.rng.between(1, 3);
      for (let i = 0; i < units; i++) {
        const uw = this.rng.between(16, Math.max(20, Math.floor(rw * 0.26)));
        const uh = this.rng.between(14, Math.max(18, Math.floor(rh * 0.24)));
        const ux = this.rng.between(rx + 14, Math.max(rx + 15, rx + rw - uw - 14));
        const uy = this.rng.between(ry + 14, Math.max(ry + 15, ry + rh - uh - 14));
        g.fillStyle(0x000000, 0.22);
        g.fillRoundedRect(ux + 4, uy + 5, uw, uh, 2);
        g.fillStyle(tone.detail, 1);
        g.fillRoundedRect(ux, uy, uw, uh, 2);
        g.fillStyle(0xffffff, 0.08);
        g.fillRect(ux + 2, uy + 2, uw - 4, 3);
      }

      // roof hatch / skylight strip for a bit of texture
      if (rw > 120 && rh > 90) {
        g.fillStyle(0xffffff, 0.05);
        g.fillRect(rx + 10, ry + rh * 0.62, rw - 20, 6);
      }

      g.lineStyle(1.5, 0x14161b, 0.45);
      g.strokeRoundedRect(b.x, b.y, b.w, b.h, 3);
    }
  }

  private spawnProps(scene: Phaser.Scene) {
    // street furniture along the kerb of every block
    for (const b of this.blocks) {
      const step = 132;
      for (let x = b.x + 60; x < b.x + b.w - 40; x += step) {
        this.pushKerbProp(x, b.y + 13);
        this.pushKerbProp(x + 46, b.y + b.h - 13);
      }
      for (let y = b.y + 60; y < b.y + b.h - 40; y += step) {
        this.pushKerbProp(b.x + 13, y + 46);
        this.pushKerbProp(b.x + b.w - 13, y);
      }
      this.collectParking(b);
    }

    for (const p of this.props) {
      const shadow = scene.add.image(p.x + 5, p.y + 7, p.key);
      shadow.setTint(0x000000).setAlpha(0.28).setDepth(6);
      if (p.key === 'tree') shadow.setScale(0.95);
      const img = scene.add.image(p.x, p.y, p.key).setDepth(9);
      if (p.key === 'lamp') {
        shadow.setAlpha(0.2);
        img.setDepth(19);
      }
    }
  }

  private pushKerbProp(x: number, y: number) {
    if (x < 20 || y < 20 || x > this.width - 20 || y > this.height - 20) return;
    const roll = this.rng.frac();
    if (roll < 0.45) this.props.push({ x, y, key: 'tree', solid: true });
    else if (roll < 0.68) this.props.push({ x, y, key: 'planter', solid: true });
    else if (roll < 0.86) this.props.push({ x, y, key: 'lamp', solid: false });
  }

  /** Kerbside parking bays, parallel to the adjacent road. */
  private collectParking(b: Rect) {
    const off = 34;
    const along = 205;
    const nearRoadX = (x: number) => WORLD.roadsX.some((rx) => Math.abs(x - rx) < WORLD.roadHalfWidth + 12);
    const nearRoadY = (y: number) => WORLD.roadsY.some((ry) => Math.abs(y - ry) < WORLD.roadHalfWidth + 12);

    for (let x = b.x + 90; x < b.x + b.w - 70; x += along) {
      if (nearRoadX(x)) continue;
      if (b.y > 40) this.parking.push({ x, y: b.y - off, angle: 0 });
      if (b.y + b.h < this.height - 40) this.parking.push({ x: x + 60, y: b.y + b.h + off, angle: Math.PI });
    }
    for (let y = b.y + 90; y < b.y + b.h - 70; y += along) {
      if (nearRoadY(y)) continue;
      if (b.x > 40) this.parking.push({ x: b.x - off, y, angle: -Math.PI / 2 });
      if (b.x + b.w < this.width - 40) this.parking.push({ x: b.x + b.w + off, y: y + 60, angle: Math.PI / 2 });
    }
  }

  private createBodies(scene: Phaser.Scene) {
    for (const b of this.buildings) {
      scene.matter.add.rectangle(b.x + b.w / 2, b.y + b.h / 2, b.w, b.h, {
        isStatic: true,
        label: 'solid',
        friction: 0.4,
        restitution: 0.16,
      });
    }
    for (const p of this.props) {
      if (!p.solid) continue;
      scene.matter.add.circle(p.x, p.y, p.key === 'tree' ? 15 : 16, {
        isStatic: true,
        label: 'prop',
        restitution: 0.3,
      });
    }
    scene.matter.world.setBounds(0, 0, this.width, this.height, 96);
  }

  /** Cheap line-of-fire test: bullets stop at buildings, not at kerbs. */
  blocksShot(x: number, y: number): boolean {
    if (x < 0 || y < 0 || x > this.width || y > this.height) return true;
    for (const b of this.buildings) {
      if (x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h) return true;
    }
    return false;
  }

  /** A road point at least `min` px from `from`. */
  pickRoadPoint(from: Phaser.Math.Vector2, min: number, max: number): Phaser.Math.Vector2 | null {
    const options = this.roadPoints.filter((p) => {
      const d = Phaser.Math.Distance.Between(p.x, p.y, from.x, from.y);
      return d >= min && d <= max;
    });
    if (!options.length) return null;
    return options[Math.floor(Math.random() * options.length)];
  }
}
