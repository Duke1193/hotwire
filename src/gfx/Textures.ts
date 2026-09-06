import Phaser from 'phaser';

export type CarClass = 'compact' | 'sedan' | 'sport' | 'van' | 'delivery' | 'heavy' | 'patrol' | 'interceptor';

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
}

/**
 * Seven silhouettes, not seven palettes. Proportions carry the information:
 * a long bonnet and a small cabin set back reads fast before you have read
 * anything else, and a box on a short cab reads slow and heavy.
 */
export const CAR_SKINS: CarSkin[] = [
  { key: 'car-compact', cls: 'compact', length: 44, width: 25, body: 0xd8543f, trim: 0x8f2e23, glass: 0x1b2430,
    cabinAt: 0.26, cabinLen: 0.46, round: 8, speed: 0.95, accel: 1.1, grip: 1.04, durability: 0.85 },
  { key: 'car-sedan', cls: 'sedan', length: 54, width: 27, body: 0x3f86c4, trim: 0x27567f, glass: 0x1b2430,
    cabinAt: 0.28, cabinLen: 0.42, round: 7, speed: 1, accel: 1, grip: 1, durability: 1 },
  { key: 'car-sport', cls: 'sport', length: 57, width: 25, body: 0xf0c53c, trim: 0x9c7a12, glass: 0x141c26,
    cabinAt: 0.2, cabinLen: 0.32, round: 5, speed: 1.14, accel: 1.16, grip: 1.06, durability: 0.8 },
  { key: 'car-van', cls: 'van', length: 61, width: 31, body: 0xd4d0c6, trim: 0x8b887f, glass: 0x1b2430,
    cabinAt: 0.5, cabinLen: 0.3, round: 4, speed: 0.9, accel: 0.86, grip: 0.92, durability: 1.32 },
  { key: 'car-delivery', cls: 'delivery', length: 68, width: 30, body: 0x4f9f6d, trim: 0x2f6a46, glass: 0x1b2430,
    cabinAt: 0.6, cabinLen: 0.26, round: 3, speed: 0.84, accel: 0.8, grip: 0.86, durability: 1.5 },
  { key: 'car-heavy', cls: 'heavy', length: 58, width: 30, body: 0x6b5f9a, trim: 0x413a66, glass: 0x1b2430,
    cabinAt: 0.3, cabinLen: 0.36, round: 6, speed: 1.02, accel: 0.94, grip: 0.96, durability: 1.28 },
];

export const POLICE_SKIN: CarSkin = {
  key: 'car-patrol', cls: 'patrol', length: 56, width: 28, body: 0xe8ecf2, trim: 0x1e2a44, glass: 0x18202c,
  cabinAt: 0.28, cabinLen: 0.4, round: 6, speed: 1, accel: 1, grip: 1, durability: 1.1,
};

/** Turns up only when the heat is serious. */
export const INTERCEPTOR_SKIN: CarSkin = {
  key: 'car-interceptor', cls: 'interceptor', length: 60, width: 29, body: 0x2b3242, trim: 0x0f1420, glass: 0x121824,
  cabinAt: 0.24, cabinLen: 0.34, round: 5, speed: 1.08, accel: 1.08, grip: 1.04, durability: 1.25,
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

function drawPed(g: Phaser.GameObjects.Graphics, coat: number, shade: number, hair: number) {
  g.fillStyle(0x14161b, 1);
  g.fillRoundedRect(6, 7, 18, 16, 7);
  g.fillStyle(coat, 1);
  g.fillRoundedRect(7.2, 8.2, 15.6, 13.6, 6);
  g.fillStyle(shade, 1);
  g.fillRect(7.2, 14, 15.6, 2.4);
  g.fillStyle(0x14161b, 1);
  g.fillCircle(16.5, 15, 6.2);
  g.fillStyle(0xe8bb92, 1);
  g.fillCircle(16.5, 15, 5);
  g.fillStyle(hair, 1);
  g.fillCircle(14.6, 15, 4.2);
  g.fillStyle(0xfff3d4, 0.95);
  g.fillCircle(20.2, 15, 1.7);
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
  const boxy = s.cls === 'van' || s.cls === 'delivery';

  // chassis
  roundRect(g, x, y, L, W, r, s.trim);
  roundRect(g, x + 1.5, y + 1.5, L - 3, W - 3, Math.max(2, r - 1), s.body);

  // nose highlight: long on a sports car, barely there on a box
  g.fillStyle(0xffffff, boxy ? 0.05 : 0.09);
  g.fillRoundedRect(x + L * (s.cabinAt + s.cabinLen), y + 2.5, L * (0.9 - s.cabinAt - s.cabinLen), W - 5, r * 0.6);

  // cabin and glass
  const cx = x + L * s.cabinAt;
  const cw = L * s.cabinLen;
  roundRect(g, cx, y + 3, cw, W - 6, Math.max(2, r - 2), s.trim);
  roundRect(g, cx + 2, y + 4.5, cw * 0.42, W - 9, 2.5, s.glass);
  roundRect(g, cx + cw * 0.54, y + 4.5, cw * 0.4, W - 9, 2.5, s.glass);
  g.fillStyle(0xffffff, 0.06);
  g.fillRect(cx + 2, y + W * 0.44, cw - 4, 1.8);

  if (s.cls === 'delivery') {
    // cargo box behind the cab, with a seam and a shutter
    g.fillStyle(0x000000, 0.16);
    g.fillRect(x + 3, y + 2.5, L * 0.5, W - 5);
    g.fillStyle(0xffffff, 0.1);
    g.fillRect(x + L * 0.5, y + 2.5, 2, W - 5);
    g.fillStyle(0x000000, 0.22);
    for (let i = 0; i < 4; i++) g.fillRect(x + 6 + i * 6, y + 4, 2, W - 8);
  }

  if (s.cls === 'van') {
    // roof rails
    g.fillStyle(0x000000, 0.2);
    g.fillRect(x + 6, y + 3.5, L * 0.42, 2);
    g.fillRect(x + 6, y + W - 5.5, L * 0.42, 2);
  }

  if (s.cls === 'sport') {
    // twin bonnet stripes and a low tail spoiler
    g.fillStyle(0x000000, 0.2);
    g.fillRect(x + L * 0.58, y + W * 0.3, L * 0.34, 2.5);
    g.fillRect(x + L * 0.58, y + W * 0.6, L * 0.34, 2.5);
    g.fillStyle(s.trim, 1);
    g.fillRoundedRect(x + 1, y + 2, 4, W - 4, 1.5);
  }

  if (s.cls === 'heavy') {
    // broad shoulders
    g.fillStyle(0x000000, 0.16);
    g.fillRect(x + 4, y + 2.5, L - 8, 2.5);
    g.fillRect(x + 4, y + W - 5, L - 8, 2.5);
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

  // lights
  g.fillStyle(0xfff2c4, 1);
  g.fillRoundedRect(x + L - 5, y + 3, 4, 5, 1.5);
  g.fillRoundedRect(x + L - 5, y + W - 8, 4, 5, 1.5);
  g.fillStyle(0xd6503f, 1);
  g.fillRoundedRect(x + 1.5, y + 3, 3, 5, 1.5);
  g.fillRoundedRect(x + 1.5, y + W - 8, 3, 5, 1.5);

  // outline
  g.lineStyle(1.5, 0x0d0f14, 0.6);
  g.strokeRoundedRect(x + 0.75, y + 0.75, L - 1.5, W - 1.5, r);
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

  // pedestrians, nose along +X. One texture per jacket so NPCs read apart.
  PED_JACKETS.forEach((jacket, i) => {
    make(scene, i === 0 ? 'ped' : `ped-${i}`, 30, 30, (g) => drawPed(g, jacket.coat, jacket.shade, jacket.hair));
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

  // soft round particle
  make(scene, 'puff', 16, 16, (g) => {
    g.fillStyle(0xffffff, 0.16);
    g.fillCircle(8, 8, 8);
    g.fillStyle(0xffffff, 0.34);
    g.fillCircle(8, 8, 5);
    g.fillStyle(0xffffff, 0.9);
    g.fillCircle(8, 8, 2.4);
  });

  make(scene, 'spark', 6, 6, (g) => {
    g.fillStyle(0xffffff, 1);
    g.fillCircle(3, 3, 2.2);
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
  make(scene, 'vignette', 128, 128, (g) => {
    for (let i = 0; i < 26; i++) {
      const t = i / 25;
      g.fillStyle(0x05070b, 0.055 * t * t);
      const inset = 64 * (1 - t);
      g.fillRect(inset * 0.5, inset * 0.5, 128 - inset, 128 - inset);
    }
  });

  make(scene, 'shadow-soft', 64, 64, (g) => {
    g.fillStyle(0x000000, 0.16);
    g.fillCircle(32, 32, 30);
    g.fillStyle(0x000000, 0.2);
    g.fillCircle(32, 32, 20);
  });

  make(scene, 'px', 4, 4, (g) => {
    g.fillStyle(0xffffff, 1);
    g.fillRect(0, 0, 4, 4);
  });
}
