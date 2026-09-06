import Phaser from 'phaser';

export interface CarSkin {
  key: string;
  length: number;
  width: number;
  body: number;
  trim: number;
  glass: number;
}

/** Civilian car designs. All drawn nose-first along +X. */
export const CAR_SKINS: CarSkin[] = [
  { key: 'car-coupe', length: 50, width: 26, body: 0xcf4b3c, trim: 0x8f2e23, glass: 0x1d2733 },
  { key: 'car-sedan', length: 54, width: 27, body: 0x3f7fb5, trim: 0x2a5a83, glass: 0x1d2733 },
  { key: 'car-hatch', length: 46, width: 25, body: 0xd8bb4a, trim: 0x9c8329, glass: 0x1d2733 },
  { key: 'car-wagon', length: 56, width: 28, body: 0x4f9f6d, trim: 0x33714c, glass: 0x1d2733 },
  { key: 'car-van', length: 62, width: 30, body: 0xb9b6ae, trim: 0x86847e, glass: 0x1d2733 },
  { key: 'car-slate', length: 52, width: 26, body: 0x6b5f8a, trim: 0x4a4165, glass: 0x1d2733 },
];

export const POLICE_SKIN: CarSkin = {
  key: 'car-patrol',
  length: 56,
  width: 28,
  body: 0xe8ecf2,
  trim: 0x1e2a44,
  glass: 0x18202c,
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

  // chassis
  roundRect(g, x, y, L, W, 7, s.trim);
  roundRect(g, x + 1.5, y + 1.5, L - 3, W - 3, 6, s.body);

  // nose taper highlight
  g.fillStyle(0xffffff, 0.07);
  g.fillRoundedRect(x + L * 0.6, y + 2.5, L * 0.34, W - 5, 5);

  // cabin + glass
  roundRect(g, x + L * 0.24, y + 3, L * 0.44, W - 6, 4, s.trim);
  roundRect(g, x + L * 0.27, y + 4.5, L * 0.2, W - 9, 3, s.glass); // rear window
  roundRect(g, x + L * 0.5, y + 4.5, L * 0.16, W - 9, 3, s.glass); // windshield

  // roof strip
  g.fillStyle(0xffffff, 0.05);
  g.fillRect(x + L * 0.27, y + W * 0.42, L * 0.4, 2);

  if (police) {
    // original livery: dark shoulder bands + roof light bar
    g.fillStyle(s.trim, 1);
    g.fillRect(x + L * 0.1, y + 1.5, L * 0.62, 4);
    g.fillRect(x + L * 0.1, y + W - 5.5, L * 0.62, 4);
    g.fillStyle(0x2f6bd8, 1);
    g.fillRoundedRect(x + L * 0.36, y + 3.5, 6, W - 7, 2);
    g.fillStyle(0xd8402f, 1);
    g.fillRoundedRect(x + L * 0.36 + 6.5, y + 3.5, 6, W - 7, 2);
  }

  // headlights / tail lights
  g.fillStyle(0xfff2c4, 1);
  g.fillRoundedRect(x + L - 5, y + 3, 4, 5, 1.5);
  g.fillRoundedRect(x + L - 5, y + W - 8, 4, 5, 1.5);
  g.fillStyle(0xd6503f, 1);
  g.fillRoundedRect(x + 1.5, y + 3, 3, 5, 1.5);
  g.fillRoundedRect(x + 1.5, y + W - 8, 3, 5, 1.5);

  // outline
  g.lineStyle(1.5, 0x0d0f14, 0.55);
  g.strokeRoundedRect(x + 0.75, y + 0.75, L - 1.5, W - 1.5, 7);
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
  make(scene, POLICE_SKIN.key, POLICE_SKIN.length + PAD * 2, POLICE_SKIN.width + PAD * 2, (g) =>
    drawCar(g, POLICE_SKIN, true),
  );

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
