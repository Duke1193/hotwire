import Phaser from 'phaser';
import { PEDS, TRAFFIC, WORLD } from '../config';
import type { Rect } from './World';

/** East, South, West, North. Index doubles as the direction id everywhere. */
export const DIRS = [
  { x: 1, y: 0 },
  { x: 0, y: 1 },
  { x: -1, y: 0 },
  { x: 0, y: -1 },
] as const;

export const DIR_ANGLE = [0, Math.PI / 2, Math.PI, -Math.PI / 2];

/**
 * The road network as a grid of intersections. Traffic never pathfinds: it
 * drives to the next intersection in its current direction and picks a new
 * one on arrival, which is enough to look like a working city.
 */
export class LaneGrid {
  readonly cols = WORLD.roadsX.length;
  readonly rows = WORLD.roadsY.length;

  /** Lane-centre position at intersection (i,j) for a car travelling `dir`. */
  point(i: number, j: number, dir: number, out: Phaser.Math.Vector2): Phaser.Math.Vector2 {
    const cx = WORLD.roadsX[i];
    const cy = WORLD.roadsY[j];
    const lane = TRAFFIC.lane;
    switch (dir) {
      case 0:
        return out.set(cx, cy + lane); // east: keep right, south half
      case 1:
        return out.set(cx - lane, cy); // south: keep right, west half
      case 2:
        return out.set(cx, cy - lane);
      default:
        return out.set(cx + lane, cy);
    }
  }

  /** Neighbouring intersection in `dir`, or null at the edge of the grid. */
  step(i: number, j: number, dir: number): { i: number; j: number } | null {
    const d = DIRS[dir];
    const ni = i + d.x;
    const nj = j + d.y;
    if (ni < 0 || nj < 0 || ni >= this.cols || nj >= this.rows) return null;
    return { i: ni, j: nj };
  }

  /** Pick a turn: mostly straight, never a U-turn, always inside the grid. */
  chooseDir(i: number, j: number, dir: number): number {
    const straight = dir;
    const left = (dir + 3) % 4;
    const right = (dir + 1) % 4;
    const options: number[] = [];
    if (this.step(i, j, straight)) options.push(straight, straight, straight);
    if (this.step(i, j, left)) options.push(left);
    if (this.step(i, j, right)) options.push(right);
    if (!options.length) return (dir + 2) % 4; // dead end: turn around
    return options[(Math.random() * options.length) | 0];
  }

  randomNode(): { i: number; j: number } {
    return { i: (Math.random() * this.cols) | 0, j: (Math.random() * this.rows) | 0 };
  }
}

export interface WalkLink {
  to: number;
  /** True when the link steps off the kerb and over a road. */
  cross: boolean;
}

export interface WalkNode {
  x: number;
  y: number;
  links: WalkLink[];
}

const CELL = 320;

/**
 * Sidewalk waypoints: a loop around every block, plus crossing links between
 * block corners at each intersection (where the painted crossings are).
 */
export class WalkGraph {
  nodes: WalkNode[] = [];
  private buckets = new Map<number, number[]>();

  constructor(blocks: Rect[]) {
    for (const b of blocks) this.ring(b);
    this.crossings();
    this.index();
  }

  private ring(b: Rect) {
    const inset = 13;
    const x0 = b.x + inset;
    const y0 = b.y + inset;
    const x1 = b.x + b.w - inset;
    const y1 = b.y + b.h - inset;
    const corners = [
      { x: x0, y: y0 },
      { x: x1, y: y0 },
      { x: x1, y: y1 },
      { x: x0, y: y1 },
    ];

    const first = this.nodes.length;
    for (let c = 0; c < 4; c++) {
      const a = corners[c];
      const d = corners[(c + 1) % 4];
      const len = Math.hypot(d.x - a.x, d.y - a.y);
      const steps = Math.max(1, Math.round(len / PEDS.nodeSpacing));
      for (let s = 0; s < steps; s++) {
        const t = s / steps;
        this.nodes.push({ x: a.x + (d.x - a.x) * t, y: a.y + (d.y - a.y) * t, links: [] });
      }
    }

    const last = this.nodes.length;
    for (let n = first; n < last; n++) {
      const next = n + 1 < last ? n + 1 : first;
      this.link(n, next, false);
    }
  }

  private link(a: number, b: number, cross: boolean) {
    if (a === b) return;
    if (!this.nodes[a].links.some((l) => l.to === b)) this.nodes[a].links.push({ to: b, cross });
    if (!this.nodes[b].links.some((l) => l.to === a)) this.nodes[b].links.push({ to: a, cross });
  }

  /** Join block corners across each intersection so pedestrians can cross. */
  private crossings() {
    const reach = WORLD.roadHalfWidth + 70;
    for (const rx of WORLD.roadsX) {
      for (const ry of WORLD.roadsY) {
        const near: number[] = [];
        for (let n = 0; n < this.nodes.length; n++) {
          const p = this.nodes[n];
          if (Math.abs(p.x - rx) < reach && Math.abs(p.y - ry) < reach) near.push(n);
        }
        for (let a = 0; a < near.length; a++) {
          for (let b = a + 1; b < near.length; b++) {
            const pa = this.nodes[near[a]];
            const pb = this.nodes[near[b]];
            const dx = Math.abs(pa.x - pb.x);
            const dy = Math.abs(pa.y - pb.y);
            // straight across one road only, never diagonally through traffic
            const acrossX = dx > WORLD.roadHalfWidth && dy < 46;
            const acrossY = dy > WORLD.roadHalfWidth && dx < 46;
            if (acrossX || acrossY) this.link(near[a], near[b], true);
          }
        }
      }
    }
  }

  private index() {
    for (let n = 0; n < this.nodes.length; n++) {
      const key = this.key(this.nodes[n].x, this.nodes[n].y);
      const list = this.buckets.get(key);
      if (list) list.push(n);
      else this.buckets.set(key, [n]);
    }
  }

  private key(x: number, y: number) {
    return ((y / CELL) | 0) * 1000 + ((x / CELL) | 0);
  }

  /** Nearest waypoint to a point, searching the surrounding buckets only. */
  nearest(x: number, y: number): number {
    let best = -1;
    let bestD = Infinity;
    const cx = (x / CELL) | 0;
    const cy = (y / CELL) | 0;
    for (let oy = -1; oy <= 1; oy++) {
      for (let ox = -1; ox <= 1; ox++) {
        const list = this.buckets.get((cy + oy) * 1000 + (cx + ox));
        if (!list) continue;
        for (const n of list) {
          const p = this.nodes[n];
          const d = (p.x - x) * (p.x - x) + (p.y - y) * (p.y - y);
          if (d < bestD) {
            bestD = d;
            best = n;
          }
        }
      }
    }
    if (best < 0) best = (Math.random() * this.nodes.length) | 0;
    return best;
  }

  /** A waypoint in a distance band around a point, for spawning/recycling. */
  inBand(x: number, y: number, min: number, max: number): number {
    for (let attempt = 0; attempt < 24; attempt++) {
      const n = (Math.random() * this.nodes.length) | 0;
      const p = this.nodes[n];
      const d = Math.hypot(p.x - x, p.y - y);
      if (d >= min && d <= max) return n;
    }
    return (Math.random() * this.nodes.length) | 0;
  }
}
