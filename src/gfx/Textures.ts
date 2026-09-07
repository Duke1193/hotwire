import Phaser from 'phaser';

export type CarClass =
  | 'compact'
  | 'sedan'
  | 'sport'
  | 'van'
  | 'delivery'
  | 'heavy'
  | 'truck'
  | 'fire'
  | 'patrol'
  | 'interceptor';

export interface CarSkin {
  key: string;
  cls: CarClass;
  length: number;
  width: number;
  body: number;
  trim: number;
  glass: number;
  /** Cabin position and size as fractions of the body length. */
  cabinAt: number;
  cabinLen: number;
  /** Corner rounding: low and sharp for sports, boxy for working vehicles. */
  round: number;
  /** Handling multipliers applied on top of the shared arcade model. */
  speed: number;
  accel: number;
  grip: number;
  /** How much punishment the shell takes before it is wrecked. */
  durability: number;
  /** Matter mass. A truck should shove a hatchback, not bounce off it. */
  mass: number;
}

/**
 * Eight silhouettes, not eight palettes. Proportions carry the information
 * and they are spread wide on purpose: the shortest civilian car is 40px and
 * the longest is 88px, boxes are square-cornered and the sports car is a
 * wedge, so class reads from the outline alone before any colour registers.
 *
 * Colours are flat, saturated and cheap-looking on purpose. No gradients.
 */
export const CAR_SKINS: CarSkin[] = [
  { key: 'car-compact', cls: 'compact', length: 40, width: 23, body: 0xd84a2f, trim: 0x8a2718, glass: 0x161d27,
    cabinAt: 0.24, cabinLen: 0.46, round: 7, speed: 0.94, accel: 1.12, grip: 1.05, durability: 0.8, mass: 8 },
  { key: 'car-sedan', cls: 'sedan', length: 54, width: 27, body: 0x2f7fc8, trim: 0x1b4f80, glass: 0x161d27,
    cabinAt: 0.28, cabinLen: 0.42, round: 5, speed: 1, accel: 1, grip: 1, durability: 1, mass: 11 },
  { key: 'car-sport', cls: 'sport', length: 60, width: 24, body: 0xf5c518, trim: 0x9a7a05, glass: 0x11171f,
    cabinAt: 0.16, cabinLen: 0.3, round: 3, speed: 1.18, accel: 1.2, grip: 1.08, durability: 0.72, mass: 9 },
  { key: 'car-van', cls: 'van', length: 64, width: 33, body: 0xdedac9, trim: 0x8a8779, glass: 0x161d27,
    cabinAt: 0.54, cabinLen: 0.28, round: 1, speed: 0.86, accel: 0.82, grip: 0.9, durability: 1.35, mass: 16 },
  { key: 'car-delivery', cls: 'delivery', length: 72, width: 32, body: 0x3f9c60, trim: 0x226039, glass: 0x161d27,
    cabinAt: 0.66, cabinLen: 0.24, round: 0, speed: 0.8, accel: 0.76, grip: 0.86, durability: 1.5, mass: 20 },
  { key: 'car-heavy', cls: 'heavy', length: 58, width: 32, body: 0x6a5aa0, trim: 0x3b3266, glass: 0x161d27,
    cabinAt: 0.3, cabinLen: 0.34, round: 3, speed: 1, accel: 0.9, grip: 0.94, durability: 1.3, mass: 15 },
  { key: 'car-truck', cls: 'truck', length: 88, width: 36, body: 0x9aa2ad, trim: 0x4d545e, glass: 0x161d27,
    cabinAt: 0.74, cabinLen: 0.22, round: 0, speed: 0.7, accel: 0.6, grip: 0.8, durability: 1.9, mass: 30 },
  { key: 'car-fire', cls: 'fire', length: 84, width: 35, body: 0xc42d22, trim: 0x7d1a12, glass: 0x161d27,
    cabinAt: 0.72, cabinLen: 0.24, round: 0, speed: 0.76, accel: 0.66, grip: 0.84, durability: 1.8, mass: 28 },
];

export const POLICE_SKIN: CarSkin = {
  key: 'car-patrol', cls: 'patrol', length: 56, width: 28, body: 0xeef1f6, trim: 0x1a2440, glass: 0x141b26,
  cabinAt: 0.28, cabinLen: 0.4, round: 4, speed: 1, accel: 1, grip: 1, durability: 1.1, mass: 12,
};

/** Turns up only when the heat is serious. */
export const INTERCEPTOR_SKIN: CarSkin = {
  key: 'car-interceptor', cls: 'interceptor', length: 62, width: 29, body: 0x232936, trim: 0x0b0f18, glass: 0x0f141d,
  cabinAt: 0.22, cabinLen: 0.32, round: 3, speed: 1.1, accel: 1.1, grip: 1.05, durability: 1.25, mass: 13,
};

const PAD = 8;

/** Index 0 is the local player; the rest are pedestrian variations. */
export const PED_JACKETS = [
  { coat: 0x47a0c4, shade: 0x2f7c9c, hair: 0x33383f },
  { coat: 0xc4715a, shade: 0x9c5544, hair: 0x2b2118 },
  { coat: 0x8f9aa8, shade: 0x6f7a88, hair: 0x413a33 },
  { coat: 0x6fae7a, shade: 0x51895c, hair: 0x2f2a24 },
  { coat: 0xb99a54, shade: 0x94793d, hair: 0x3a2f22 },
  { coat: 0x9b7fc0, shade: 0x7a61a0, hair: 0x2a2530 },
];

type Jacket = { coat: number; shade: number; hair: number };

/**
 * A person from directly above, nosing along +X: head, shoulders, two arms
 * and two legs. Flat blocks and one hard outline, no shading ramps — the
 * point is that a glance reads "person facing that way", not "detailed art".
 *
 * `swing` is -1, 0 or +1 and drives the walk cycle: arms and legs trade
 * places, which is the only animation a top-down figure this size needs.
 */
function drawPed(g: Phaser.GameObjects.Graphics, j: Jacket, swing: number) {
  const ink = 0x14161b;
  const skin = 0xe0b088;

  // Legs, furthest back and lowest in the stack, kicking fore and aft.
  g.fillStyle(0x2f333c, 1);
  g.fillRect(4, 10 - swing * 1.4, 7, 4);
  g.fillRect(4, 16 + swing * 1.4, 7, 4);

  // Arms outside the shoulders, swinging opposite the legs, hands on the end.
  g.fillStyle(j.shade, 1);
  g.fillRect(10 + swing * 2.2, 5, 8, 4);
  g.fillRect(10 - swing * 2.2, 21, 8, 4);
  g.fillStyle(skin, 1);
  g.fillRect(17 + swing * 2.2, 5, 3, 4);
  g.fillRect(17 - swing * 2.2, 21, 3, 4);

  // Torso: wide across the shoulders, short front to back, flat colour.
  g.fillStyle(ink, 1);
  g.fillRect(7, 7, 12, 16);
  g.fillStyle(j.coat, 1);
  g.fillRect(8, 8, 10, 14);

  // Head sits clear in front of the shoulders, so facing is unmistakable.
  g.fillStyle(ink, 1);
  g.fillCircle(21, 15, 4.6);
  g.fillStyle(skin, 1);
  g.fillCircle(21, 15, 3.6);
  g.fillStyle(j.hair, 1);
  g.fillRect(17.6, 11.6, 3.4, 6.8);
}

/**
 * Someone on the ground. Deliberately plain: face down, limbs out, no blood
 * and no pose borrowed from anywhere — a still figure so the street reads as
 * having consequences.
 */
function drawPedDown(g: Phaser.GameObjects.Graphics, j: Jacket) {
  g.fillStyle(0x000000, 0.2);
  g.fillRect(4, 6, 22, 18);

  // arms and legs thrown out, not folded
  g.fillStyle(j.shade, 1);
  g.fillRect(10, 3, 4, 8);
  g.fillRect(14, 20, 4, 8);
  g.fillStyle(0x2f333c, 1);
  g.fillRect(4, 9, 8, 4);
  g.fillRect(5, 16, 8, 4);

  // torso, flat on the road
  g.fillStyle(0x14161b, 1);
  g.fillRect(10, 8, 13, 13);
  g.fillStyle(j.coat, 0.9);
  g.fillRect(11, 9, 11, 11);

  // head turned to the side
  g.fillStyle(0x14161b, 1);
  g.fillCircle(24, 17, 4.2);
  g.fillStyle(0xc89a76, 1);
  g.fillCircle(24, 17, 3.3);
  g.fillStyle(j.hair, 1);
  g.fillRect(21.4, 14.2, 3.2, 5.6);
}

function roundRect(
  g: Phaser.GameObjects.Graphics,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
  fill: number,
  alpha = 1,
) {
  g.fillStyle(fill, alpha);
  g.fillRoundedRect(x, y, w, h, r);
}

function drawCar(g: Phaser.GameObjects.Graphics, s: CarSkin, police: boolean) {
  const L = s.length;
  const W = s.width;
  const x = PAD;
  const y = PAD;
  const r = s.round;

  // chassis: two flat blocks, body inside trim. No ramps, no sheen.
  roundRect(g, x, y, L, W, r, s.trim);
  roundRect(g, x + 2, y + 2, L - 4, W - 4, Math.max(0, r - 1), s.body);

  // one flat panel seam instead of a highlight
  g.fillStyle(s.trim, 0.55);
  g.fillRect(x + L * 0.5, y + 2, 1.5, W - 4);

  // cabin and glass, square and dark
  const cx = x + L * s.cabinAt;
  const cw = L * s.cabinLen;
  roundRect(g, cx, y + 3.5, cw, W - 7, Math.max(0, r - 2), s.trim);
  roundRect(g, cx + 2, y + 5, cw * 0.42, W - 10, Math.max(0, r - 3), s.glass);
  roundRect(g, cx + cw * 0.54, y + 5, cw * 0.4, W - 10, Math.max(0, r - 3), s.glass);

  if (s.cls === 'delivery' || s.cls === 'truck') {
    // cargo box behind the cab: darker block, ribbed, hard edge
    g.fillStyle(s.trim, 1);
    g.fillRect(x + 2, y + 2, L * (s.cabinAt - 0.03), W - 4);
    g.fillStyle(s.body, 0.32);
    g.fillRect(x + 4, y + 4, L * (s.cabinAt - 0.09), W - 8);
    g.fillStyle(0x0d0f14, 0.3);
    const ribs = s.cls === 'truck' ? 7 : 4;
    for (let i = 0; i < ribs; i++) g.fillRect(x + 7 + i * 7, y + 4, 2, W - 8);
  }

  if (s.cls === 'fire') {
    // a ladder down the deck and one painted stripe: a fire appliance without
    // any real service's markings, lettering or badge
    g.fillStyle(0x2b2f38, 1);
    g.fillRect(x + 4, y + W * 0.5 - 3, L * 0.62, 6);
    g.fillStyle(0x9aa2ad, 1);
    for (let i = 0; i < 8; i++) g.fillRect(x + 6 + i * 6, y + W * 0.5 - 3, 2, 6);
    g.fillStyle(0xeef1f6, 1);
    g.fillRect(x + 2, y + 3, L * 0.68, 3);
    g.fillRect(x + 2, y + W - 6, L * 0.68, 3);
    g.fillStyle(0xd8402f, 1);
    g.fillRoundedRect(x + L * 0.42, y + 4, 6, W - 8, 1);
    g.fillStyle(0xe8ecf2, 1);
    g.fillRoundedRect(x + L * 0.42 + 6.5, y + 4, 6, W - 8, 1);
  }

  if (s.cls === 'van') {
    // roof rails
    g.fillStyle(0x000000, 0.2);
    g.fillRect(x + 6, y + 3.5, L * 0.42, 2);
    g.fillRect(x + 6, y + W - 5.5, L * 0.42, 2);
  }

  if (s.cls === 'sport') {
    // a wedge nose taken out of the corners, twin stripes and a tail wing
    g.fillStyle(0x000000, 0);
    g.fillStyle(s.trim, 1);
    g.fillTriangle(x + L, y, x + L, y + 6, x + L - 12, y);
    g.fillTriangle(x + L, y + W, x + L, y + W - 6, x + L - 12, y + W);
    g.fillStyle(s.trim, 1);
    g.fillRect(x + L * 0.56, y + W * 0.28, L * 0.36, 3);
    g.fillRect(x + L * 0.56, y + W * 0.62, L * 0.36, 3);
    g.fillRect(x + 1, y + 1, 4, W - 2);
  }

  if (s.cls === 'heavy') {
    // broad shoulders and a bull bar
    g.fillStyle(s.trim, 1);
    g.fillRect(x + 4, y + 1.5, L - 8, 3.5);
    g.fillRect(x + 4, y + W - 5, L - 8, 3.5);
    g.fillStyle(0x8f97a5, 1);
    g.fillRect(x + L - 4, y + 3, 3, W - 6);
  }

  if (s.cls === 'van') {
    // a slab side, one window, nothing else
    g.fillStyle(0x0d0f14, 0.22);
    g.fillRect(x + 4, y + 4, L * 0.44, W - 8);
  }

  if (police) {
    const interceptor = s.cls === 'interceptor';
    g.fillStyle(s.trim, 1);
    g.fillRect(x + L * 0.1, y + 1.5, L * 0.62, interceptor ? 5 : 4);
    g.fillRect(x + L * 0.1, y + W - (interceptor ? 6.5 : 5.5), L * 0.62, interceptor ? 5 : 4);
    if (interceptor) {
      // push bar and a full-width light bar
      g.fillStyle(0x8f97a5, 1);
      g.fillRoundedRect(x + L - 7, y + 3, 5, W - 6, 1.5);
      g.fillStyle(0x2f6bd8, 1);
      g.fillRoundedRect(x + L * 0.3, y + 3, 7, W - 6, 2);
      g.fillStyle(0xd8402f, 1);
      g.fillRoundedRect(x + L * 0.3 + 7.5, y + 3, 7, W - 6, 2);
    } else {
      g.fillStyle(0x2f6bd8, 1);
      g.fillRoundedRect(x + L * 0.36, y + 3.5, 6, W - 7, 2);
      g.fillStyle(0xd8402f, 1);
      g.fillRoundedRect(x + L * 0.36 + 6.5, y + 3.5, 6, W - 7, 2);
    }
  }

  // lights: flat squares, no glow
  g.fillStyle(0xfff2c4, 1);
  g.fillRect(x + L - 5, y + 3, 4, 5);
  g.fillRect(x + L - 5, y + W - 8, 4, 5);
  g.fillStyle(0xd6503f, 1);
  g.fillRect(x + 1.5, y + 3, 3, 5);
  g.fillRect(x + 1.5, y + W - 8, 3, 5);

  // one hard black outline: the whole silhouette in a single stroke
  g.lineStyle(2, 0x0b0d12, 1);
  g.strokeRoundedRect(x + 1, y + 1, L - 2, W - 2, r);
}

function make(scene: Phaser.Scene, key: string, w: number, h: number, draw: (g: Phaser.GameObjects.Graphics) => void) {
  if (scene.textures.exists(key)) return;
  const g = scene.add.graphics();
  draw(g);
  g.generateTexture(key, w, h);
  g.destroy();
}

export function buildTextures(scene: Phaser.Scene) {
  for (const s of CAR_SKINS) {
    make(scene, s.key, s.length + PAD * 2, s.width + PAD * 2, (g) => drawCar(g, s, false));
  }
  for (const skin of [POLICE_SKIN, INTERCEPTOR_SKIN]) {
    make(scene, skin.key, skin.length + PAD * 2, skin.width + PAD * 2, (g) => drawCar(g, skin, true));
  }

  // Pedestrians, nose along +X. One set per jacket so NPCs read apart, and
  // three frames each so they actually walk: arms and legs trade places.
  PED_JACKETS.forEach((jacket, i) => {
    const base = i === 0 ? 'ped' : `ped-${i}`;
    make(scene, base, 30, 30, (g) => drawPed(g, jacket, 0));
    make(scene, `${base}-a`, 30, 30, (g) => drawPed(g, jacket, 1));
    make(scene, `${base}-b`, 30, 30, (g) => drawPed(g, jacket, -1));
    make(scene, `${base}-down`, 30, 30, (g) => drawPedDown(g, jacket));
  });

  // job pickup / dropoff ring
  make(scene, 'marker', 96, 96, (g) => {
    g.lineStyle(7, 0xffffff, 0.95);
    g.strokeCircle(48, 48, 40);
    g.lineStyle(3, 0xffffff, 0.5);
    g.strokeCircle(48, 48, 30);
    g.fillStyle(0xffffff, 0.14);
    g.fillCircle(48, 48, 27);
  });

  // small pointer used for off-screen job direction and remote-player tags
  make(scene, 'chev', 20, 20, (g) => {
    g.fillStyle(0xffffff, 1);
    g.beginPath();
    g.moveTo(18, 10);
    g.lineTo(4, 3);
    g.lineTo(7, 10);
    g.lineTo(4, 17);
    g.closePath();
    g.fillPath();
  });

  // Chunky three-step puff. Stepped rather than smooth on purpose: cheap
  // particles are half of why an old game looks like an old game.
  make(scene, 'puff', 16, 16, (g) => {
    g.fillStyle(0xffffff, 0.2);
    g.fillRect(1, 1, 14, 14);
    g.fillStyle(0xffffff, 0.45);
    g.fillRect(3, 3, 10, 10);
    g.fillStyle(0xffffff, 1);
    g.fillRect(6, 6, 4, 4);
  });

  // a lit pixel, not a dot
  make(scene, 'spark', 6, 6, (g) => {
    g.fillStyle(0xffffff, 1);
    g.fillRect(1, 1, 4, 4);
  });

  // Flame cell: three flat steps of fire, square-edged, no gradient.
  make(scene, 'flame', 18, 18, (g) => {
    g.fillStyle(0xff5a1e, 1);
    g.fillRect(2, 2, 14, 14);
    g.fillStyle(0xffa32b, 1);
    g.fillRect(4, 4, 10, 10);
    g.fillStyle(0xffe07a, 1);
    g.fillRect(7, 7, 4, 4);
  });

  // skid stamp
  make(scene, 'skid', 10, 8, (g) => {
    g.fillStyle(0x000000, 0.5);
    g.fillEllipse(5, 4, 9, 6);
  });

  // street furniture: industrial, market and civic
  make(scene, 'dumpster', 40, 34, (g) => {
    g.fillStyle(0x1f242c, 1);
    g.fillRoundedRect(3, 5, 34, 26, 3);
    g.fillStyle(0x3f6a4d, 1);
    g.fillRoundedRect(4, 6, 32, 24, 3);
    g.fillStyle(0x000000, 0.28);
    g.fillRect(4, 15, 32, 3);
    g.fillStyle(0x4f7f5d, 1);
    g.fillRoundedRect(6, 8, 28, 7, 2);
  });

  make(scene, 'pallet', 34, 30, (g) => {
    g.fillStyle(0x000000, 0.3);
    g.fillRoundedRect(5, 8, 26, 20, 2);
    g.fillStyle(0x8a6a44, 1);
    g.fillRoundedRect(4, 5, 26, 20, 2);
    g.fillStyle(0x6b5033, 1);
    g.fillRect(4, 12, 26, 3);
    g.fillStyle(0xa07e52, 1);
    g.fillRoundedRect(7, 2, 16, 12, 2);
  });

  make(scene, 'barrier', 44, 22, (g) => {
    g.fillStyle(0x1c2029, 1);
    g.fillRoundedRect(2, 6, 40, 12, 2);
    for (let i = 0; i < 5; i++) {
      g.fillStyle(i % 2 ? 0xe8ecf2 : 0xd8a83c, 1);
      g.fillRect(4 + i * 7.6, 8, 7, 8);
    }
    g.fillStyle(0x2b313b, 1);
    g.fillRect(6, 17, 5, 4);
    g.fillRect(33, 17, 5, 4);
  });

  make(scene, 'utility', 26, 30, (g) => {
    g.fillStyle(0x000000, 0.3);
    g.fillRoundedRect(5, 8, 18, 20, 2);
    g.fillStyle(0x76808c, 1);
    g.fillRoundedRect(4, 5, 18, 20, 2);
    g.fillStyle(0x545d68, 1);
    for (let i = 0; i < 3; i++) g.fillRect(7, 9 + i * 4, 12, 2);
    g.fillStyle(0xd8a83c, 0.9);
    g.fillRect(7, 20, 6, 3);
  });

  make(scene, 'bench', 36, 20, (g) => {
    g.fillStyle(0x000000, 0.26);
    g.fillRoundedRect(4, 8, 28, 10, 2);
    g.fillStyle(0x8a6a48, 1);
    g.fillRoundedRect(3, 4, 28, 10, 2);
    g.fillStyle(0x6d5238, 1);
    g.fillRect(3, 8, 28, 2);
    g.fillStyle(0x3d434d, 1);
    g.fillRect(6, 13, 4, 4);
    g.fillRect(24, 13, 4, 4);
  });

  make(scene, 'stall', 42, 42, (g) => {
    g.fillStyle(0x000000, 0.3);
    g.fillRoundedRect(6, 10, 32, 30, 3);
    g.fillStyle(0x2b313b, 1);
    g.fillRoundedRect(4, 6, 32, 30, 3);
    for (let i = 0; i < 4; i++) {
      g.fillStyle(i % 2 ? 0xe8ecf2 : 0xc4553f, 1);
      g.fillRect(5 + i * 7.8, 7, 7.8, 12);
    }
    g.fillStyle(0xffd8a0, 0.5);
    g.fillRect(8, 22, 24, 10);
  });

  // street trees
  make(scene, 'tree', 54, 54, (g) => {
    g.fillStyle(0x1e3324, 1);
    g.fillCircle(27, 27, 22);
    g.fillStyle(0x2f5a38, 1);
    g.fillCircle(27, 27, 19);
    g.fillStyle(0x3d7546, 1);
    g.fillCircle(24, 24, 13);
    g.fillStyle(0x4d8c55, 1);
    g.fillCircle(22, 22, 6);
  });

  // planter / bollard cluster
  make(scene, 'planter', 40, 40, (g) => {
    g.fillStyle(0x5c6069, 1);
    g.fillRoundedRect(4, 4, 32, 32, 6);
    g.fillStyle(0x3c5f3f, 1);
    g.fillRoundedRect(8, 8, 24, 24, 4);
    g.fillStyle(0x4e7a50, 1);
    g.fillCircle(20, 20, 7);
  });

  // street lamp head
  make(scene, 'lamp', 22, 22, (g) => {
    g.fillStyle(0x2b2e36, 1);
    g.fillCircle(11, 11, 6);
    g.fillStyle(0xf6e7a8, 0.85);
    g.fillCircle(11, 11, 3.2);
  });

  // Tiny top-down weapon silhouettes, held at the player's shoulder. Blocky
  // and readable at this zoom rather than detailed; nothing is modelled on a
  // real firearm.
  make(scene, 'wpn-pistol', 18, 12, (g) => {
    g.fillStyle(0x11151c, 1);
    g.fillRect(2, 4, 12, 4);
    g.fillRect(3, 6, 4, 5);
    g.fillStyle(0x525c6b, 1);
    g.fillRect(3, 5, 10, 2);
  });

  make(scene, 'wpn-auto', 22, 12, (g) => {
    g.fillStyle(0x11151c, 1);
    g.fillRect(1, 4, 17, 4);
    g.fillRect(5, 6, 4, 6);
    g.fillRect(11, 3, 5, 2);
    g.fillStyle(0x5b7183, 1);
    g.fillRect(2, 5, 15, 2);
  });

  make(scene, 'wpn-shotgun', 26, 12, (g) => {
    g.fillStyle(0x11151c, 1);
    g.fillRect(1, 4, 21, 5);
    g.fillRect(4, 7, 5, 5);
    g.fillStyle(0x6b4a33, 1);
    g.fillRect(1, 5, 7, 3);
    g.fillStyle(0x707a86, 1);
    g.fillRect(12, 5, 10, 3);
  });

  // muzzle flashes, one per weapon character
  make(scene, 'flash-pistol', 22, 18, (g) => {
    g.fillStyle(0xfff0c0, 0.95);
    g.fillTriangle(2, 9, 18, 3, 18, 15);
    g.fillStyle(0xffffff, 0.9);
    g.fillCircle(6, 9, 4);
  });

  make(scene, 'flash-auto', 18, 16, (g) => {
    g.fillStyle(0xcfe9ff, 0.95);
    g.fillTriangle(2, 8, 14, 4, 14, 12);
    g.fillStyle(0xffffff, 0.85);
    g.fillCircle(5, 8, 3);
  });

  make(scene, 'flash-shotgun', 30, 26, (g) => {
    g.fillStyle(0xffd08a, 0.9);
    g.fillTriangle(2, 13, 26, 2, 26, 24);
    g.fillStyle(0xfff2c4, 0.95);
    g.fillTriangle(2, 13, 16, 6, 16, 20);
    g.fillStyle(0xffffff, 0.9);
    g.fillCircle(7, 13, 5);
  });

  // combat + pickups
  make(scene, 'bullet', 12, 6, (g) => {
    g.fillStyle(0xffffff, 0.28);
    g.fillRoundedRect(0, 1, 12, 4, 2);
    g.fillStyle(0xffffff, 1);
    g.fillRoundedRect(4, 1.6, 8, 2.8, 1.4);
  });

  // Supply crates: flat on the ground, lid marked by category. Nothing spins,
  // nothing floats — you read the mark, not the motion.
  const crateBase = (g: Phaser.GameObjects.Graphics) => {
    g.fillStyle(0x000000, 0.32);
    g.fillRoundedRect(4, 8, 26, 22, 3);
    g.fillStyle(0x232833, 1);
    g.fillRoundedRect(3, 4, 26, 23, 3);
    g.fillStyle(0x2f3644, 1);
    g.fillRoundedRect(5, 6, 22, 19, 2);
  };
  const crateEdge = (g: Phaser.GameObjects.Graphics) => {
    g.lineStyle(1.5, 0xffffff, 0.55);
    g.strokeRoundedRect(3, 4, 26, 23, 3);
  };

  // weapon cache: three stacked bars
  make(scene, 'crate-weapon', 34, 34, (g) => {
    crateBase(g);
    g.fillStyle(0xffffff, 1);
    for (let i = 0; i < 3; i++) g.fillRect(8, 9 + i * 5, 16, 3);
    crateEdge(g);
  });

  // ammo: two short blocks
  make(scene, 'crate-ammo', 34, 34, (g) => {
    crateBase(g);
    g.fillStyle(0xffffff, 1);
    g.fillRect(8, 10, 6, 11);
    g.fillRect(18, 10, 6, 11);
    crateEdge(g);
  });

  // health: a plus
  make(scene, 'crate-health', 34, 34, (g) => {
    crateBase(g);
    g.fillStyle(0xffffff, 1);
    g.fillRect(14, 8, 5, 15);
    g.fillRect(9, 13, 15, 5);
    crateEdge(g);
  });

  // armour: a shield block
  make(scene, 'crate-armor', 34, 34, (g) => {
    crateBase(g);
    g.fillStyle(0xffffff, 1);
    g.fillRect(10, 8, 13, 8);
    g.fillTriangle(10, 16, 23, 16, 16.5, 24);
    crateEdge(g);
  });

  // job kiosk: a street terminal with a lit screen
  make(scene, 'kiosk', 34, 40, (g) => {
    g.fillStyle(0x000000, 0.34);
    g.fillRoundedRect(7, 12, 22, 26, 3);
    g.fillStyle(0x2a3140, 1);
    g.fillRoundedRect(5, 6, 22, 28, 3);
    g.fillStyle(0x121821, 1);
    g.fillRoundedRect(8, 9, 16, 14, 2);
    g.fillStyle(0x69d8ff, 0.9);
    g.fillRect(10, 12, 12, 2);
    g.fillRect(10, 16, 8, 2);
    g.fillStyle(0x69d8ff, 0.35);
    g.fillRoundedRect(8, 9, 16, 14, 2);
    g.fillStyle(0x4a5464, 1);
    g.fillRect(9, 26, 14, 4);
    g.lineStyle(1.5, 0x69d8ff, 0.55);
    g.strokeRoundedRect(5, 6, 22, 28, 3);
  });

  // soft ground light under a crate
  make(scene, 'beacon', 72, 72, (g) => {
    g.fillStyle(0xffffff, 0.1);
    g.fillCircle(36, 36, 34);
    g.fillStyle(0xffffff, 0.16);
    g.fillCircle(36, 36, 22);
    g.fillStyle(0xffffff, 0.3);
    g.fillCircle(36, 36, 11);
  });

  // edge-of-screen navigation wedge, distinct from the in-world arrow
  make(scene, 'wedge', 34, 34, (g) => {
    g.fillStyle(0xffffff, 1);
    g.beginPath();
    g.moveTo(31, 17);
    g.lineTo(7, 5);
    g.lineTo(13, 17);
    g.lineTo(7, 29);
    g.closePath();
    g.fillPath();
    g.fillStyle(0x0b0e14, 0.85);
    g.fillRect(3, 12, 4, 10);
  });

  // on-screen thumb stick
  make(scene, 'stick-base', 200, 200, (g) => {
    g.fillStyle(0x0b0e14, 0.34);
    g.fillCircle(100, 100, 96);
    g.lineStyle(4, 0x69d8ff, 0.5);
    g.strokeCircle(100, 100, 94);
    g.lineStyle(2, 0xffffff, 0.12);
    g.strokeCircle(100, 100, 62);
    // Four outward ticks: at a glance the ring reads as a direction control
    // rather than a decorative circle.
    g.fillStyle(0x69d8ff, 0.6);
    for (const [dx, dy] of [
      [0, -1],
      [1, 0],
      [0, 1],
      [-1, 0],
    ]) {
      const tipX = 100 + dx * 88;
      const tipY = 100 + dy * 88;
      const baseX = 100 + dx * 72;
      const baseY = 100 + dy * 72;
      g.fillTriangle(tipX, tipY, baseX - dy * 9, baseY + dx * 9, baseX + dy * 9, baseY - dx * 9);
    }
  });

  make(scene, 'stick-knob', 120, 120, (g) => {
    g.fillStyle(0x69d8ff, 0.24);
    g.fillCircle(60, 60, 56);
    g.fillStyle(0xeef2fb, 0.9);
    g.fillCircle(60, 60, 34);
    g.fillStyle(0x0b0e14, 0.85);
    g.fillCircle(60, 60, 26);
    g.fillStyle(0x69d8ff, 0.9);
    g.fillCircle(60, 60, 9);
  });

  // A soft corner darkening, drawn once and stretched. No scanlines, no
  // filters — just enough to stop the screen edges feeling like a browser page.
  // Six flat steps instead of twenty-six: the corners darken in visible bands,
  // the way a cheap overlay used to rather than the way a shader does.
  make(scene, 'vignette', 128, 128, (g) => {
    for (let i = 0; i < 6; i++) {
      const t = i / 5;
      g.fillStyle(0x05070b, 0.075 * t * t);
      const inset = 60 * (1 - t);
      g.fillRect(inset * 0.5, inset * 0.5, 128 - inset, 128 - inset);
    }
  });

  make(scene, 'shadow-soft', 64, 64, (g) => {
    g.fillStyle(0x000000, 0.2);
    g.fillCircle(32, 32, 26);
  });

  make(scene, 'px', 4, 4, (g) => {
    g.fillStyle(0xffffff, 1);
    g.fillRect(0, 0, 4, 4);
  });
}
