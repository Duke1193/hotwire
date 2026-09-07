// Generates the social preview PNG from scratch (no libraries, no stock art).
// Run with: node scripts/make-og.mjs
import zlib from 'node:zlib';
import fs from 'node:fs';

const W = 1200;
const H = 630;
const px = Buffer.alloc(W * H * 3);

const set = (x, y, r, g, b) => {
  if (x < 0 || y < 0 || x >= W || y >= H) return;
  const i = (y * W + x) * 3;
  px[i] = r;
  px[i + 1] = g;
  px[i + 2] = b;
};
const rect = (x, y, w, h, c) => {
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) set(x + i, y + j, c[0], c[1], c[2]);
};

// backdrop: asphalt with a soft vignette
for (let y = 0; y < H; y++) {
  for (let x = 0; x < W; x++) {
    const dx = (x - W / 2) / (W / 2);
    const dy = (y - H / 2) / (H / 2);
    const v = 1 - Math.min(1, (dx * dx + dy * dy) * 0.55);
    set(x, y, Math.round(26 + 20 * v), Math.round(28 + 22 * v), Math.round(34 + 26 * v));
  }
}

// two roads crossing, with lane dashes
rect(0, 300, W, 150, [58, 62, 72]);
rect(760, 0, 150, H, [58, 62, 72]);
for (let x = 0; x < W; x += 74) if (x < 745 || x > 925) rect(x, 372, 40, 6, [214, 208, 180]);
for (let y = 0; y < H; y += 74) if (y < 292 || y > 458) rect(832, y, 6, 40, [214, 208, 180]);
rect(0, 452, W, 26, [138, 142, 153]);
rect(0, 274, W, 26, [138, 142, 153]);

// a car, mid-corner
const car = (cx, cy, body, trim) => {
  rect(cx - 34, cy - 17, 68, 34, trim);
  rect(cx - 31, cy - 14, 62, 28, body);
  rect(cx - 10, cy - 11, 24, 22, trim);
  rect(cx - 6, cy - 8, 8, 16, [29, 39, 51]);
  rect(cx + 4, cy - 8, 6, 16, [29, 39, 51]);
  rect(cx + 27, cy - 12, 5, 7, [255, 242, 196]);
  rect(cx + 27, cy + 5, 5, 7, [255, 242, 196]);
};
car(420, 390, [207, 75, 60], [143, 46, 35]);
car(980, 350, [232, 236, 242], [30, 42, 68]);
rect(966, 338, 9, 24, [47, 107, 216]);
rect(977, 338, 9, 24, [216, 64, 47]);

const FONT = {
  G: ['01110', '10001', '10000', '10111', '10001', '10001', '01110'],
  E: ['11111', '10000', '10000', '11110', '10000', '10000', '11111'],
  T: ['11111', '00100', '00100', '00100', '00100', '00100', '00100'],
  A: ['01110', '10001', '10001', '11111', '10001', '10001', '10001'],
  W: ['10001', '10001', '10001', '10101', '10101', '11011', '10001'],
  Y: ['10001', '10001', '01010', '00100', '00100', '00100', '00100'],
  C: ['01110', '10001', '10000', '10000', '10000', '10001', '01110'],
  I: ['11111', '00100', '00100', '00100', '00100', '00100', '11111'],
};

// Two stacked lines of block capitals: the name reads at thumbnail size and
// the letterforms are drawn here, not set in anybody's typeface.
const line = (word, scale, cy, colour) => {
  const gap = Math.round(scale * 2);
  const textW = word.length * 5 * scale + (word.length - 1) * gap;
  let cx = Math.round((W - textW) / 2);
  for (const ch of word) {
    const glyph = FONT[ch];
    for (let r = 0; r < 7; r++) {
      for (let c = 0; c < 5; c++) {
        if (glyph[r][c] === '1') rect(cx + c * scale, cy + r * scale, scale, scale, colour);
      }
    }
    cx += 5 * scale + gap;
  }
  return textW;
};

const topScale = 17;
const topW = line('GETAWAY', topScale, 66, [238, 242, 251]);
const cityScale = 15;
const cityW = line('CITY', cityScale, 66 + 7 * topScale + 30, [105, 216, 255]);
void cityW;

// underline in the UI accent
rect(Math.round((W - topW) / 2), 66 + 7 * topScale + 30 + 7 * cityScale + 24, topW, 7, [105, 216, 255]);

const raw = Buffer.alloc(H * (W * 3 + 1));
for (let y = 0; y < H; y++) {
  raw[y * (W * 3 + 1)] = 0;
  px.copy(raw, y * (W * 3 + 1) + 1, y * W * 3, (y + 1) * W * 3);
}

const table = [];
for (let n = 0; n < 256; n++) {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  table[n] = c >>> 0;
}
const crc = (buf) => {
  let c = 0xffffffff;
  for (const b of buf) c = table[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
const chunk = (type, data) => {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const cc = Buffer.alloc(4);
  cc.writeUInt32BE(crc(body));
  return Buffer.concat([len, body, cc]);
};

const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(W, 0);
ihdr.writeUInt32BE(H, 4);
ihdr[8] = 8;
ihdr[9] = 2;

fs.writeFileSync(
  'public/og.png',
  Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]),
);
console.log('public/og.png written');
