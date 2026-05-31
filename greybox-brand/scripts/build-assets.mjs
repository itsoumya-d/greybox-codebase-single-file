import { deflateSync } from 'node:zlib';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const logoDir = path.join(root, 'logo');

const palette = {
  graphite: '#1A1A1F',
  spark: '#FF6B35',
  ash: '#5C6166',
  paper: '#FAFAF7',
  ink: '#0A0A0D',
  greys: ['#D8D8DC', '#BFBFC4', '#A6A6AC', '#BFBFC4', '#8C8C92', '#5C5C62', '#A6A6AC', '#5C5C62', '#2F2F35'],
};

function hexToRgba(hex, alpha = 255) {
  const clean = hex.replace('#', '');
  return [
    Number.parseInt(clean.slice(0, 2), 16),
    Number.parseInt(clean.slice(2, 4), 16),
    Number.parseInt(clean.slice(4, 6), 16),
    alpha,
  ];
}

function crc32(buf) {
  let crc = 0xffffffff;
  for (const byte of buf) {
    crc ^= byte;
    for (let i = 0; i < 8; i++) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const typeBuf = Buffer.from(type);
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])));
  return Buffer.concat([len, typeBuf, data, crc]);
}

function png(width, height, pixels) {
  const raw = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y++) {
    const rowStart = y * (width * 4 + 1);
    raw[rowStart] = 0;
    pixels.copy(raw, rowStart + 1, y * width * 4, (y + 1) * width * 4);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

function canvas(width, height, background = '#000000', alpha = 0) {
  const pixels = Buffer.alloc(width * height * 4);
  const color = hexToRgba(background, alpha);
  for (let i = 0; i < pixels.length; i += 4) {
    pixels[i] = color[0];
    pixels[i + 1] = color[1];
    pixels[i + 2] = color[2];
    pixels[i + 3] = color[3];
  }
  return { width, height, pixels };
}

function setPixel(c, x, y, rgba) {
  if (x < 0 || y < 0 || x >= c.width || y >= c.height) return;
  const i = (Math.floor(y) * c.width + Math.floor(x)) * 4;
  c.pixels[i] = rgba[0];
  c.pixels[i + 1] = rgba[1];
  c.pixels[i + 2] = rgba[2];
  c.pixels[i + 3] = rgba[3];
}

function fillRect(c, x, y, w, h, hex) {
  const color = hexToRgba(hex);
  for (let py = Math.floor(y); py < Math.ceil(y + h); py++) {
    for (let px = Math.floor(x); px < Math.ceil(x + w); px++) setPixel(c, px, py, color);
  }
}

function fillTriangle(c, ax, ay, bx, by, cx, cy, hex) {
  const color = hexToRgba(hex);
  const minX = Math.floor(Math.min(ax, bx, cx));
  const maxX = Math.ceil(Math.max(ax, bx, cx));
  const minY = Math.floor(Math.min(ay, by, cy));
  const maxY = Math.ceil(Math.max(ay, by, cy));
  const area = (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);
  for (let y = minY; y <= maxY; y++) {
    for (let x = minX; x <= maxX; x++) {
      const w0 = (bx - ax) * (y - ay) - (by - ay) * (x - ax);
      const w1 = (cx - bx) * (y - by) - (cy - by) * (x - bx);
      const w2 = (ax - cx) * (y - cy) - (ay - cy) * (x - cx);
      if (area >= 0 ? w0 >= 0 && w1 >= 0 && w2 >= 0 : w0 <= 0 && w1 <= 0 && w2 <= 0) setPixel(c, x, y, color);
    }
  }
}

function drawMark(c, x, y, size) {
  const unit = size / 4;
  let idx = 0;
  for (let row = 0; row < 3; row++) {
    for (let col = 0; col < 3; col++) {
      fillRect(c, x + col * unit, y + row * unit, unit, unit, palette.greys[idx++]);
    }
  }
  fillTriangle(c, x + 3 * unit, y + 3 * unit, x + 4 * unit, y + 3.5 * unit, x + 3 * unit, y + 4 * unit, palette.spark);
}

const font = {
  a: ['01110', '10001', '11111', '10001', '10001', '00000', '00000'],
  b: ['11110', '10001', '11110', '10001', '11110', '00000', '00000'],
  c: ['01111', '10000', '10000', '10000', '01111', '00000', '00000'],
  d: ['11110', '10001', '10001', '10001', '11110', '00000', '00000'],
  e: ['11111', '10000', '11110', '10000', '11111', '00000', '00000'],
  f: ['11111', '10000', '11110', '10000', '10000', '00000', '00000'],
  g: ['01111', '10000', '10011', '10001', '01111', '00000', '00000'],
  h: ['10001', '10001', '11111', '10001', '10001', '00000', '00000'],
  i: ['11111', '00100', '00100', '00100', '11111', '00000', '00000'],
  k: ['10001', '10010', '11100', '10010', '10001', '00000', '00000'],
  l: ['10000', '10000', '10000', '10000', '11111', '00000', '00000'],
  m: ['10001', '11011', '10101', '10001', '10001', '00000', '00000'],
  n: ['10001', '11001', '10101', '10011', '10001', '00000', '00000'],
  o: ['01110', '10001', '10001', '10001', '01110', '00000', '00000'],
  p: ['11110', '10001', '11110', '10000', '10000', '00000', '00000'],
  r: ['11110', '10001', '11110', '10010', '10001', '00000', '00000'],
  s: ['01111', '10000', '01110', '00001', '11110', '00000', '00000'],
  t: ['11111', '00100', '00100', '00100', '00100', '00000', '00000'],
  y: ['10001', '10001', '01110', '00100', '00100', '00000', '00000'],
  x: ['10001', '01010', '00100', '01010', '10001', '00000', '00000'],
  ' ': ['000', '000', '000', '000', '000', '000', '000'],
};

function drawText(c, text, x, y, scale, hex) {
  const color = hexToRgba(hex);
  let cursor = x;
  for (const raw of text.toLowerCase()) {
    const glyph = font[raw] ?? font[' '];
    for (let gy = 0; gy < glyph.length; gy++) {
      for (let gx = 0; gx < glyph[gy].length; gx++) {
        if (glyph[gy][gx] === '1') {
          for (let sy = 0; sy < scale; sy++) for (let sx = 0; sx < scale; sx++) setPixel(c, cursor + gx * scale + sx, y + gy * scale + sy, color);
        }
      }
    }
    cursor += (glyph[0].length + 1) * scale;
  }
}

async function writePng(rel, c) {
  await mkdir(path.dirname(path.join(root, rel)), { recursive: true });
  await writeFile(path.join(root, rel), png(c.width, c.height, c.pixels));
}

function ico(images) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(images.length, 4);
  const entries = [];
  let offset = 6 + images.length * 16;
  for (const image of images) {
    const entry = Buffer.alloc(16);
    entry[0] = image.width;
    entry[1] = image.height;
    entry[2] = 0;
    entry[3] = 0;
    entry.writeUInt16LE(1, 4);
    entry.writeUInt16LE(32, 6);
    entry.writeUInt32LE(image.data.length, 8);
    entry.writeUInt32LE(offset, 12);
    entries.push(entry);
    offset += image.data.length;
  }
  return Buffer.concat([header, ...entries, ...images.map((image) => image.data)]);
}

async function markPng(size) {
  const c = canvas(size, size, '#000000', 0);
  drawMark(c, 0, 0, size);
  return { width: size, height: size, data: png(size, size, c.pixels), canvas: c };
}

const apple = canvas(180, 180, palette.paper, 255);
drawMark(apple, 26, 26, 128);
await writePng('logo/apple-touch-icon.png', apple);

const iconImages = [];
for (const size of [16, 32, 48]) iconImages.push(await markPng(size));
await writeFile(path.join(logoDir, 'favicon.ico'), ico(iconImages));

const og = canvas(1200, 630, palette.paper, 255);
fillRect(og, 0, 0, 1200, 630, palette.paper);
drawMark(og, 96, 126, 224);
drawText(og, 'greybox', 380, 172, 18, palette.graphite);
drawText(og, 'ai design layer for shipped games', 384, 344, 7, palette.ash);
fillRect(og, 96, 428, 332, 12, palette.spark);
await writePng('logo/og-image.png', og);

const social = canvas(1080, 1080, palette.graphite, 255);
drawMark(social, 332, 208, 416);
drawText(social, 'greybox', 216, 724, 18, palette.paper);
fillRect(social, 216, 884, 648, 16, palette.spark);
await writePng('logo/social-square.png', social);

console.log('built Greybox logo raster assets');
