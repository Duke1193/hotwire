import Phaser from 'phaser';
import { COLORS, District, DISTRICTS, LANDMARKS, WORLD } from '../config';
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

  /** Named places, for signage and for telling a friend where to meet. */
  landmarks: { name: string; x: number; y: number }[] = [];

  /** Road grid used by traffic, and the sidewalk waypoints used by pedestrians. */
  readonly lanes = new LaneGrid();
  walk!: WalkGraph;
  blocks: Rect[] = [];

  private rng = new Phaser.Math.RandomDataGenerator([WORLD.seed]);
  /** Landmark name texts, drawn into the roof layer then discarded. */
  private pendingLabels: Phaser.GameObjects.Text[] = [];

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
    this.paintLandmarks(scene, bg);
    const roofs = scene.add.renderTexture(0, 0, this.width, this.height).setOrigin(0, 0).setDepth(20);
    roofs.draw(bg, 0, 0);
    for (const label of this.pendingLabels) {
      roofs.draw(label, label.x, label.y);
      label.destroy();
    }
    this.pendingLabels.length = 0;
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

    // Surface history: patches, cracks, drain covers and oil marks. All baked,
    // so a busier-looking road costs nothing at runtime.
    for (const rx of WORLD.roadsX) this.paintRoadWear(g, rx, 0, WORLD.roadHalfWidth, this.height, true);
    for (const ry of WORLD.roadsY) this.paintRoadWear(g, 0, ry, this.width, WORLD.roadHalfWidth, false);

    // stop bars on every intersection approach
    g.fillStyle(COLORS.line, 0.32);
    for (const rx of WORLD.roadsX) {
      for (const ry of WORLD.roadsY) {
        g.fillRect(rx + 6, ry - hw - 8, hw - 14, 5);
        g.fillRect(rx - hw + 8, ry + hw + 3, hw - 14, 5);
        g.fillRect(rx - hw - 8, ry - hw + 8, 5, hw - 14);
        g.fillRect(rx + hw + 3, ry + 6, 5, hw - 14);
      }
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

  /** Patches, cracks, drains and grime down one road. */
  private paintRoadWear(
    g: Phaser.GameObjects.Graphics,
    cx: number,
    cy: number,
    halfW: number,
    length: number,
    vertical: boolean,
  ) {
    const count = Math.floor(length / 150);
    for (let i = 0; i < count; i++) {
      const along = this.rng.between(40, length - 40);
      const across = this.rng.between(-halfW + 14, halfW - 14);
      const x = vertical ? cx + across : along;
      const y = vertical ? along : cy + across;

      const roll = this.rng.frac();
      if (roll < 0.42) {
        // resurfaced patch
        g.fillStyle(0x000000, 0.14);
        g.fillRect(x - 26, y - 16, this.rng.between(40, 90), this.rng.between(22, 44));
      } else if (roll < 0.7) {
        // crack
        g.fillStyle(0x000000, 0.22);
        const len = this.rng.between(18, 46);
        if (vertical) g.fillRect(x, y, 2, len);
        else g.fillRect(x, y, len, 2);
      } else if (roll < 0.88) {
        // drain cover at the kerb
        const edge = across > 0 ? halfW - 11 : -halfW + 11;
        const dx = vertical ? cx + edge : x;
        const dy = vertical ? y : cy + edge;
        g.fillStyle(0x22252b, 1);
        g.fillRoundedRect(dx - 7, dy - 5, 14, 10, 2);
        g.fillStyle(0x000000, 0.5);
        for (let l = 0; l < 3; l++) g.fillRect(dx - 5, dy - 3 + l * 3, 10, 1);
      } else {
        // oil stain
        g.fillStyle(0x000000, 0.16);
        g.fillCircle(x, y, this.rng.between(7, 15));
      }
    }
  }

  private paintBlocks(g: Phaser.GameObjects.Graphics) {
    const pad = WORLD.sidewalk;
    for (const b of this.blocks) {
      const d = this.districtAt(b.x + b.w / 2, b.y + b.h / 2);

      // pavement slab, tinted per district
      g.fillStyle(d.pavement, 1);
      g.fillRect(b.x, b.y, b.w, b.h);

      // kerb: a bright edge and a dark shadow line, so the drop reads
      g.fillStyle(COLORS.sidewalkEdge, 1);
      g.fillRect(b.x, b.y, b.w, 3);
      g.fillRect(b.x, b.y + b.h - 4, b.w, 4);
      g.fillRect(b.x, b.y, 3, b.h);
      g.fillRect(b.x + b.w - 4, b.y, 4, b.h);
      g.fillStyle(0x000000, 0.22);
      g.fillRect(b.x, b.y + b.h - 6, b.w, 2);
      g.fillRect(b.x + b.w - 6, b.y, 2, b.h);

      // paving joints and a little wear
      g.fillStyle(0x000000, 0.1);
      for (let x = b.x + 34; x < b.x + b.w; x += 34) g.fillRect(x, b.y, 1, b.h);
      for (let y = b.y + 34; y < b.y + b.h; y += 34) g.fillRect(b.x, y, b.w, 1);
      g.fillStyle(0xffffff, 0.04);
      for (let i = 0; i < 14; i++) {
        g.fillRect(
          this.rng.between(b.x + 6, b.x + b.w - 30),
          this.rng.between(b.y + 6, b.y + b.h - 20),
          this.rng.between(12, 28),
          this.rng.between(3, 9),
        );
      }

      // painted kerb accents at the corners, in the district colour
      g.fillStyle(d.accent, 0.5);
      g.fillRect(b.x + 6, b.y + 5, 44, 3);
      g.fillRect(b.x + b.w - 50, b.y + b.h - 8, 44, 3);

      const lot: Rect = { x: b.x + pad, y: b.y + pad, w: b.w - pad * 2, h: b.h - pad * 2 };
      if (lot.w < 80 || lot.h < 80) continue;

      const roll = this.rng.frac();
      if (roll < d.green) {
        this.paintPark(g, lot, d);
      } else if (roll < d.green + 0.14) {
        this.paintCarPark(g, lot, d);
      } else {
        g.fillStyle(d.lot, 1);
        g.fillRect(lot.x, lot.y, lot.w, lot.h);
        this.splitLot(lot, 0);
      }
    }
  }

  private paintPark(g: Phaser.GameObjects.Graphics, lot: Rect, d: District) {
    g.fillStyle(COLORS.grass, 1);
    g.fillRect(lot.x, lot.y, lot.w, lot.h);
    g.fillStyle(d.accent, 0.16);
    g.fillRect(lot.x, lot.y, lot.w, 5);
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

  private paintCarPark(g: Phaser.GameObjects.Graphics, lot: Rect, d: District) {
    g.fillStyle(0x40444c, 1);
    g.fillRect(lot.x, lot.y, lot.w, lot.h);
    g.fillStyle(d.accent, 0.5);
    g.fillRect(lot.x, lot.y, lot.w, 4);
    g.fillStyle(COLORS.line, 0.6);
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
      const d = this.districtAt(b.x + b.w / 2, b.y + b.h / 2);
      const wall = d.walls[this.rng.between(0, d.walls.length - 1)];
      const roof = d.roofs[this.rng.between(0, d.roofs.length - 1)];
      const detail = d.details[this.rng.between(0, d.details.length - 1)];
      const storeys = this.rng.between(2, 7);
      const lift = Phaser.Math.Clamp(storeys * 2.8, 6, 20);

      // ground shadow, cast down-right
      g.fillStyle(0x000000, 0.36);
      g.fillRoundedRect(b.x + lift * 0.9, b.y + lift * 1.25, b.w, b.h, 4);

      // walls, then the roof face offset up-left to fake height
      g.fillStyle(wall, 1);
      g.fillRoundedRect(b.x, b.y, b.w, b.h, 3);
      const rx = b.x - lift * 0.18;
      const ry = b.y - lift * 0.5;
      const rw = b.w - lift * 0.5;
      const rh = b.h - lift * 0.5;
      g.fillStyle(roof, 1);
      g.fillRoundedRect(rx, ry, rw, rh, 3);

      this.paintRoofKit(g, rx, ry, rw, rh, detail, d);

      // parapet: light on the top-left, dark on the bottom-right
      g.lineStyle(2, 0xffffff, 0.12);
      g.beginPath();
      g.moveTo(rx + 2, ry + rh - 2);
      g.lineTo(rx + 2, ry + 2);
      g.lineTo(rx + rw - 2, ry + 2);
      g.strokePath();
      g.lineStyle(2, 0x000000, 0.24);
      g.beginPath();
      g.moveTo(rx + rw - 2, ry + 2);
      g.lineTo(rx + rw - 2, ry + rh - 2);
      g.lineTo(rx + 2, ry + rh - 2);
      g.strokePath();

      this.paintFrontage(g, b, d);

      g.lineStyle(1.5, 0x14161b, 0.5);
      g.strokeRoundedRect(b.x, b.y, b.w, b.h, 3);
    }
  }

  /** Vents, skylights, tanks and roof markings — the stuff you look down on. */
  private paintRoofKit(
    g: Phaser.GameObjects.Graphics,
    rx: number,
    ry: number,
    rw: number,
    rh: number,
    detail: number,
    d: District,
  ) {
    const units = this.rng.between(2, 5);
    for (let i = 0; i < units; i++) {
      const kind = this.rng.frac();
      const uw = this.rng.between(12, Math.max(16, Math.floor(rw * 0.24)));
      const uh = this.rng.between(10, Math.max(14, Math.floor(rh * 0.22)));
      const ux = this.rng.between(rx + 12, Math.max(rx + 13, rx + rw - uw - 12));
      const uy = this.rng.between(ry + 12, Math.max(ry + 13, ry + rh - uh - 12));

      g.fillStyle(0x000000, 0.26);
      g.fillRoundedRect(ux + 4, uy + 5, uw, uh, 2);

      if (kind < 0.42) {
        // plant housing
        g.fillStyle(detail, 1);
        g.fillRoundedRect(ux, uy, uw, uh, 2);
        g.fillStyle(0x000000, 0.2);
        for (let v = ux + 3; v < ux + uw - 2; v += 4) g.fillRect(v, uy + 2, 2, uh - 4);
      } else if (kind < 0.68) {
        // skylight
        g.fillStyle(0x1d2733, 1);
        g.fillRoundedRect(ux, uy, uw, uh, 2);
        g.fillStyle(0xbfe4ff, 0.28);
        g.fillRoundedRect(ux + 2, uy + 2, uw - 4, uh - 4, 1.5);
      } else if (kind < 0.86) {
        // water tank
        g.fillStyle(detail, 1);
        g.fillCircle(ux + uw / 2, uy + uh / 2, Math.min(uw, uh) / 2);
        g.fillStyle(0x000000, 0.22);
        g.fillCircle(ux + uw / 2, uy + uh / 2, Math.min(uw, uh) / 4);
      } else {
        // roof hatch
        g.fillStyle(d.accent, 0.85);
        g.fillRoundedRect(ux, uy, uw, uh * 0.7, 2);
      }
    }

    // service walkway across bigger roofs
    if (rw > 130 && rh > 100) {
      g.fillStyle(0xffffff, 0.06);
      g.fillRect(rx + 10, ry + rh * 0.58, rw - 20, 7);
      g.fillStyle(0x000000, 0.12);
      g.fillRect(rx + 10, ry + rh * 0.58 + 7, rw - 20, 2);
    }
  }

  /** Shop fronts, shutters and loading bays where a building meets the street. */
  private paintFrontage(g: Phaser.GameObjects.Graphics, b: Rect, d: District) {
    const industrial = this.rng.frac() < d.industrial;
    const bays = Math.max(1, Math.floor(b.w / 90));

    for (let i = 0; i < bays; i++) {
      const w = b.w / bays;
      const x = b.x + i * w + w * 0.18;
      const bw = w * 0.64;
      const y = b.y + b.h - 9;

      if (industrial) {
        // roller shutter with a painted bay number stripe
        g.fillStyle(0x000000, 0.3);
        g.fillRect(x, y - 5, bw, 12);
        g.fillStyle(0x8f959d, 1);
        g.fillRect(x, y - 4, bw, 10);
        g.fillStyle(0x000000, 0.22);
        for (let l = y - 3; l < y + 5; l += 3) g.fillRect(x, l, bw, 1);
        g.fillStyle(d.accent, 0.9);
        g.fillRect(x, y + 6, bw, 2);
      } else {
        // lit shopfront: awning bar over glass
        g.fillStyle(0x1d2733, 1);
        g.fillRect(x, y - 4, bw, 10);
        g.fillStyle(0xffe6b0, 0.32);
        g.fillRect(x + 2, y - 2, bw - 4, 6);
        g.fillStyle(d.accent, 0.85);
        g.fillRect(x - 2, y - 8, bw + 4, 4);
      }
    }
  }

  /**
   * Names the biggest building in each quarter and paints the name on its
   * roof. That is the whole navigation system: "meet me at the depot".
   */
  private paintLandmarks(scene: Phaser.Scene, g: Phaser.GameObjects.Graphics) {
    const used = new Set<number>();
    for (const spec of LANDMARKS) {
      let best = -1;
      let bestArea = 0;
      for (let i = 0; i < this.buildings.length; i++) {
        if (used.has(i)) continue;
        const b = this.buildings[i];
        if (this.districtIndex(b.x + b.w / 2, b.y + b.h / 2) !== spec.district) continue;
        const area = Math.min(b.w, b.h) * 2 + b.w + b.h;
        if (b.w < 150 || b.h < 110 || area <= bestArea) continue;
        bestArea = area;
        best = i;
      }
      if (best < 0) continue;
      used.add(best);

      const b = this.buildings[best];
      const cx = b.x + b.w / 2;
      const cy = b.y + b.h / 2;
      const d = DISTRICTS[spec.district];

      // painted panel and name, baked straight into the roof layer
      g.fillStyle(0x000000, 0.3);
      g.fillRect(b.x + 12, cy - 16, b.w - 24, 32);
      g.fillStyle(d.accent, 0.22);
      g.fillRect(b.x + 12, cy - 16, b.w - 24, 32);
      g.fillStyle(d.accent, 0.9);
      g.fillRect(b.x + 12, cy + 14, b.w - 24, 3);

      const size = Math.max(13, Math.min(24, Math.floor(b.w / (spec.name.length * 0.62))));
      const label = scene.add
        .text(cx, cy - 2, spec.name, {
          fontFamily: 'ui-monospace, Menlo, monospace',
          fontSize: `${size}px`,
          color: '#f4f7ff',
        })
        .setOrigin(0.5)
        .setVisible(false);
      label.setLetterSpacing?.(Math.round(size * 0.22));
      this.pendingLabels.push(label);
      this.landmarks.push({ name: spec.name, x: cx, y: cy });
    }
  }

  private spawnProps(scene: Phaser.Scene) {
    // street furniture along the kerb of every block, chosen per district
    for (const b of this.blocks) {
      const d = this.districtAt(b.x + b.w / 2, b.y + b.h / 2);
      const step = WORLD.propStep;
      for (let x = b.x + 54; x < b.x + b.w - 40; x += step) {
        this.pushKerbProp(x, b.y + 13, d);
        this.pushKerbProp(x + 42, b.y + b.h - 13, d);
      }
      for (let y = b.y + 54; y < b.y + b.h - 40; y += step) {
        this.pushKerbProp(b.x + 13, y + 42, d);
        this.pushKerbProp(b.x + b.w - 13, y, d);
      }
      this.collectParking(b);
    }

    for (const p of this.props) {
      const shadow = scene.add.image(p.x + 5, p.y + 7, p.key);
      shadow.setTint(0x000000).setAlpha(p.key === 'lamp' ? 0.22 : 0.4).setDepth(6);
      if (p.key === 'tree') shadow.setScale(0.95);
      const img = scene.add.image(p.x, p.y, p.key).setDepth(9);
      if (p.key === 'lamp') img.setDepth(19);
    }
  }

  /** The mix of street furniture is most of what tells the quarters apart. */
  private pushKerbProp(x: number, y: number, d: District) {
    if (x < 20 || y < 20 || x > this.width - 20 || y > this.height - 20) return;
    const roll = this.rng.frac();
    if (roll > 0.9) {
      this.props.push({ x, y, key: 'lamp', solid: false });
      return;
    }
    if (roll > 0.78) return; // leave gaps so the pavement is walkable

    const industrial = this.rng.frac() < d.industrial;
    const green = this.rng.frac() < d.green + 0.25;
    let key: string;
    if (industrial) {
      const pick = this.rng.frac();
      key = pick < 0.34 ? 'dumpster' : pick < 0.62 ? 'pallet' : pick < 0.82 ? 'barrier' : 'utility';
    } else if (d.name === 'NIGHT MARKET' && this.rng.frac() < 0.45) {
      key = 'stall';
    } else if (green) {
      key = this.rng.frac() < 0.7 ? 'tree' : 'planter';
    } else {
      const pick = this.rng.frac();
      key = pick < 0.4 ? 'bench' : pick < 0.7 ? 'planter' : 'utility';
    }
    this.props.push({ x, y, key, solid: true });
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
      const radius = p.key === 'tree' ? 15 : p.key === 'bench' || p.key === 'barrier' ? 13 : 16;
      scene.matter.add.circle(p.x, p.y, radius, { isStatic: true, label: 'prop', restitution: 0.3 });
    }
    scene.matter.world.setBounds(0, 0, this.width, this.height, 96);
  }

  /**
   * Which quarter of the city a point is in. The boundaries fall on the main
   * roads, so the change of materials reads as crossing a street rather than
   * as a seam in a texture.
   */
  districtIndex(x: number, y: number): number {
    const east = x > this.width * 0.5 ? 1 : 0;
    const south = y > this.height * 0.5 ? 1 : 0;
    return south * 2 + east;
  }

  districtAt(x: number, y: number): District {
    return DISTRICTS[this.districtIndex(x, y)];
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
