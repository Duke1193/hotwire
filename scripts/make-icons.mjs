// Generates the home-screen icons from the same original mark as the favicon.
// No image libraries, no third-party art: shapes and a PNG encoder.
// Run with: node scripts/make-icons.mjs
import zlib from 'node:zlib';
import fs from 'node:fs';

function icon(size, maskable) {
  const px = Buffer.alloc(size * size * 3);
  const set = (x, y, c) => {
    if (x < 0 || y < 0 || x >= size || y >= size) return;
    const i = (y * size + x) * 3;
    px[i] = c[0];
    px[i + 1] = c[1];
    px[i + 2] = c[2];
  };
  const rect = (x, y, w, h, c) => {
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) set(Math.round(x + i), Math.round(y + j), c);
  };

  const u = size / 32;
  // A maskable icon needs its art inside the safe circle, so the mark shrinks.
  const pad = maskable ? size * 0.18 : 0;
  const inner = size - pad * 2;
  const s = inner / 32;

  rect(0, 0, size, size, [18, 21, 28]);
  // road bars
  rect(pad + 4 * s, pad + 7 * s, 24 * s, 3 * s, [58, 65, 82]);
  rect(pad + 4 * s, pad + 23 * s, 24 * s, 3 * s, [58, 65, 82]);
  // car body
  rect(pad + 5 * s, pad + 12 * s, 22 * s, 9 * s, [105, 216, 255]);
  // cabin
  rect(pad + 11 * s, pad + 14 * s, 8 * s, 5 * s, [18, 21, 28]);
  // headlight
  rect(pad + 22 * s, pad + 14.5 * s, 3 * s, 4 * s, [255, 242, 196]);
  void u;

  const raw = Buffer.alloc(size * (size * 3 + 1));
  for (let y = 0; y < size; y++) {
    raw[y * (size * 3 + 1)] = 0;
    px.copy(raw, y * (size * 3 + 1) + 1, y * size * 3, (y + 1) * size * 3);
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
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

fs.writeFileSync('public/icon-180.png', icon(180, false));
fs.writeFileSync('public/icon-192.png', icon(192, false));
fs.writeFileSync('public/icon-512.png', icon(512, false));
fs.writeFileSync('public/icon-512-maskable.png', icon(512, true));
console.log('icons written');
