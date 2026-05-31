#!/usr/bin/env node
// Proprietary and confidential. Copyright (c) 2026 Greybox Studio.
import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { deflateSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';

const ASSETS = [
  { file: 'icon-1600.png', width: 1600, height: 1600, scene: drawIcon },
  { file: 'cover-1950x1300.png', width: 1950, height: 1300, scene: drawCover },
  { file: 'screenshot-importers.png', width: 1600, height: 900, scene: drawImporters },
  { file: 'screenshot-round-trip.png', width: 1600, height: 900, scene: drawRoundTrip },
  { file: 'screenshot-mcp-bridge.png', width: 1600, height: 900, scene: drawMcpBridge },
  { file: 'screenshot-samples.png', width: 1600, height: 900, scene: drawSamples },
];

const COLORS = {
  graphite: [26, 26, 31, 255],
  graphite2: [38, 39, 46, 255],
  ink: [10, 10, 13, 255],
  panel: [250, 250, 247, 255],
  line: [217, 217, 224, 255],
  muted: [92, 97, 102, 255],
  spark: [255, 107, 53, 255],
  cyan: [60, 194, 224, 255],
  green: [46, 204, 113, 255],
  yellow: [244, 201, 93, 255],
  red: [233, 75, 60, 255],
  unity: [34, 44, 55, 255],
  godot: [71, 140, 191, 255],
  unreal: [14, 17, 40, 255],
  white: [255, 255, 255, 255],
  grey1: [216, 216, 220, 255],
  grey2: [191, 191, 196, 255],
  grey3: [166, 166, 172, 255],
  grey4: [140, 140, 146, 255],
  grey5: [92, 92, 98, 255],
  grey6: [47, 47, 53, 255],
};

const FONT = {
  A: ['01110', '10001', '10001', '11111', '10001', '10001', '10001'],
  B: ['11110', '10001', '10001', '11110', '10001', '10001', '11110'],
  C: ['01111', '10000', '10000', '10000', '10000', '10000', '01111'],
  D: ['11110', '10001', '10001', '10001', '10001', '10001', '11110'],
  E: ['11111', '10000', '10000', '11110', '10000', '10000', '11111'],
  F: ['11111', '10000', '10000', '11110', '10000', '10000', '10000'],
  G: ['01111', '10000', '10000', '10111', '10001', '10001', '01111'],
  H: ['10001', '10001', '10001', '11111', '10001', '10001', '10001'],
  I: ['11111', '00100', '00100', '00100', '00100', '00100', '11111'],
  J: ['00111', '00010', '00010', '00010', '10010', '10010', '01100'],
  K: ['10001', '10010', '10100', '11000', '10100', '10010', '10001'],
  L: ['10000', '10000', '10000', '10000', '10000', '10000', '11111'],
  M: ['10001', '11011', '10101', '10101', '10001', '10001', '10001'],
  N: ['10001', '11001', '10101', '10011', '10001', '10001', '10001'],
  O: ['01110', '10001', '10001', '10001', '10001', '10001', '01110'],
  P: ['11110', '10001', '10001', '11110', '10000', '10000', '10000'],
  Q: ['01110', '10001', '10001', '10001', '10101', '10010', '01101'],
  R: ['11110', '10001', '10001', '11110', '10100', '10010', '10001'],
  S: ['01111', '10000', '10000', '01110', '00001', '00001', '11110'],
  T: ['11111', '00100', '00100', '00100', '00100', '00100', '00100'],
  U: ['10001', '10001', '10001', '10001', '10001', '10001', '01110'],
  V: ['10001', '10001', '10001', '10001', '10001', '01010', '00100'],
  W: ['10001', '10001', '10001', '10101', '10101', '10101', '01010'],
  X: ['10001', '10001', '01010', '00100', '01010', '10001', '10001'],
  Y: ['10001', '10001', '01010', '00100', '00100', '00100', '00100'],
  Z: ['11111', '00001', '00010', '00100', '01000', '10000', '11111'],
  0: ['01110', '10001', '10011', '10101', '11001', '10001', '01110'],
  1: ['00100', '01100', '00100', '00100', '00100', '00100', '01110'],
  2: ['01110', '10001', '00001', '00010', '00100', '01000', '11111'],
  3: ['11110', '00001', '00001', '01110', '00001', '00001', '11110'],
  4: ['00010', '00110', '01010', '10010', '11111', '00010', '00010'],
  5: ['11111', '10000', '10000', '11110', '00001', '00001', '11110'],
  6: ['01110', '10000', '10000', '11110', '10001', '10001', '01110'],
  7: ['11111', '00001', '00010', '00100', '01000', '01000', '01000'],
  8: ['01110', '10001', '10001', '01110', '10001', '10001', '01110'],
  9: ['01110', '10001', '10001', '01111', '00001', '00001', '01110'],
  ' ': ['00000', '00000', '00000', '00000', '00000', '00000', '00000'],
  '-': ['00000', '00000', '00000', '11111', '00000', '00000', '00000'],
  '.': ['00000', '00000', '00000', '00000', '00000', '01100', '01100'],
  '+': ['00000', '00100', '00100', '11111', '00100', '00100', '00000'],
  '/': ['00001', '00010', '00010', '00100', '01000', '01000', '10000'],
};

export function generateAssetStoreVisuals(root = resolve(dirname(fileURLToPath(import.meta.url)), '..')) {
  const outputDir = join(root, 'Documentation~/asset-store');
  mkdirSync(outputDir, { recursive: true });
  const results = [];
  for (const spec of ASSETS) {
    const canvas = createCanvas(spec.width, spec.height);
    spec.scene(canvas);
    const png = encodePng(canvas);
    const output = join(outputDir, spec.file);
    writeFileSync(output, png);
    results.push({
      file: `Documentation~/asset-store/${spec.file}`,
      width: spec.width,
      height: spec.height,
      bytes: png.length,
      sha256: createHash('sha256').update(png).digest('hex'),
    });
  }
  return results;
}

function drawIcon(canvas) {
  fillGradient(canvas, COLORS.panel, [235, 235, 232, 255]);
  drawGrid(canvas, 80, [229, 229, 224, 255]);
  drawGreyboxMark(canvas, 420, 350, 95);
  drawText(canvas, 'GREYBOX', 342, 1060, 28, COLORS.ink);
  drawText(canvas, 'UNITY', 604, 1240, 13, COLORS.muted);
}

function drawCover(canvas) {
  fillGradient(canvas, COLORS.graphite, COLORS.ink);
  drawGrid(canvas, 65, [45, 45, 54, 255]);
  drawGreyboxMark(canvas, 116, 150, 62);
  drawText(canvas, 'GREYBOX', 116, 500, 18, COLORS.white);
  drawText(canvas, 'STUDIO', 120, 640, 12, COLORS.grey1);
  drawText(canvas, 'AI DESIGN LAYER', 120, 780, 8, COLORS.grey1);
  drawText(canvas, 'FOR SHIPPED GAMES', 120, 860, 8, COLORS.grey1);
  drawUnityPanel(canvas, 1050, 160, 710, 850);
  drawArrow(canvas, 805, 540, 1010, 540, COLORS.spark, 20);
  drawArrow(canvas, 1010, 720, 805, 720, COLORS.cyan, 20);
  drawText(canvas, 'ROUND TRIP', 738, 610, 5, COLORS.white);
  drawVersionChips(canvas, 118, 1040);
}

function drawImporters(canvas) {
  drawAppBackground(canvas, '');
  drawWindow(canvas, 90, 80, 1420, 720, 'UNITY IMPORTERS');
  drawSidebar(canvas, 130, 170, ['GAMEVIEW', 'DESIGN', 'HUD', 'LEVEL']);
  drawPanel(canvas, 430, 170, 480, 520, COLORS.panel);
  drawText(canvas, 'ARTIFACT PREVIEW', 470, 220, 4, COLORS.muted);
  drawMiniLevel(canvas, 500, 300, 330, 220);
  drawPanel(canvas, 960, 170, 420, 520, [245, 246, 248, 255]);
  drawText(canvas, 'UNITY HIERARCHY', 1000, 220, 4, COLORS.muted);
  drawTree(canvas, 1010, 290);
  drawText(canvas, 'PREFABS + MATERIALS + ADDRESSABLES', 270, 830, 5, COLORS.white);
}

function drawRoundTrip(canvas) {
  drawAppBackground(canvas, '');
  drawWindow(canvas, 90, 100, 590, 610, 'GREYBOX WEB');
  drawWindow(canvas, 920, 100, 590, 610, 'UNITY EDITOR');
  drawPanel(canvas, 150, 210, 470, 350, COLORS.panel);
  drawText(canvas, 'HUD TWEAK', 205, 255, 8, COLORS.muted);
  fillRect(canvas, 205, 320, 210, 44, COLORS.spark);
  fillRect(canvas, 205, 390, 320, 34, COLORS.line);
  fillRect(canvas, 205, 460, 260, 34, COLORS.line);
  drawMiniLevel(canvas, 1000, 260, 350, 250);
  drawArrow(canvas, 700, 310, 900, 310, COLORS.spark, 18);
  drawArrow(canvas, 900, 500, 700, 500, COLORS.cyan, 18);
  drawText(canvas, '2 SEC SYNC', 705, 410, 3, COLORS.white);
  drawPanel(canvas, 550, 650, 500, 90, [255, 247, 232, 255]);
  drawText(canvas, 'CONFLICTS STAY REVIEWABLE', 585, 690, 3, COLORS.ink);
}

function drawMcpBridge(canvas) {
  drawAppBackground(canvas, '');
  drawWindow(canvas, 80, 80, 640, 690, 'MCP BRIDGE');
  drawTerminal(canvas, 130, 190, 540, 470);
  drawWindow(canvas, 850, 80, 670, 690, 'UNITY SCENE');
  drawTree(canvas, 920, 210);
  drawPanel(canvas, 1090, 430, 310, 180, COLORS.unity);
  drawText(canvas, 'BOSS HP 2', 1125, 505, 4, COLORS.white);
  drawArrow(canvas, 720, 405, 845, 405, COLORS.cyan, 16);
  drawText(canvas, 'TOOLS/CALL', 735, 465, 2, COLORS.white);
}

function drawSamples(canvas) {
  drawAppBackground(canvas, '');
  drawText(canvas, 'THREE SHIPPABLE STARTING POINTS', 150, 82, 7, COLORS.white);
  drawSampleCard(canvas, 120, 170, '2D PLATFORMER', COLORS.spark, 0);
  drawSampleCard(canvas, 590, 170, 'ROGUELIKE', COLORS.green, 1);
  drawSampleCard(canvas, 1060, 170, 'MOBILE IDLE', COLORS.godot, 2);
  drawText(canvas, 'AI-ASSISTED SAMPLE SETS', 360, 780, 7, COLORS.grey1);
}

function createCanvas(width, height) {
  return {
    width,
    height,
    pixels: new Uint8Array(width * height * 4),
  };
}

function fillGradient(canvas, top, bottom) {
  for (let y = 0; y < canvas.height; y += 1) {
    const t = y / Math.max(1, canvas.height - 1);
    const color = top.map((value, index) => Math.round(value * (1 - t) + bottom[index] * t));
    fillRect(canvas, 0, y, canvas.width, 1, color);
  }
}

function drawAppBackground(canvas, title = 'GREYBOX STUDIO') {
  fillGradient(canvas, COLORS.graphite, [17, 18, 24, 255]);
  drawGrid(canvas, 48, [43, 45, 52, 255]);
  drawGreyboxMark(canvas, 60, 40, 12);
  if (title) drawText(canvas, title, 230, 60, 8, COLORS.white);
}

function drawGrid(canvas, step, color) {
  for (let x = 0; x < canvas.width; x += step) fillRect(canvas, x, 0, 1, canvas.height, color);
  for (let y = 0; y < canvas.height; y += step) fillRect(canvas, 0, y, canvas.width, 1, color);
}

function drawGreyboxMark(canvas, x, y, cell) {
  const colors = [
    [COLORS.grey1, COLORS.grey2, COLORS.grey3],
    [COLORS.grey2, COLORS.grey4, COLORS.grey5],
    [COLORS.grey3, COLORS.grey5, COLORS.grey6],
  ];
  for (let row = 0; row < 3; row += 1) {
    for (let col = 0; col < 3; col += 1) {
      fillRect(canvas, x + col * cell, y + row * cell, cell, cell, colors[row][col]);
    }
  }
  fillTriangle(canvas, x + 3 * cell, y + 3 * cell, x + 4 * cell, y + 3.5 * cell, x + 3 * cell, y + 4 * cell, COLORS.spark);
}

function drawWindow(canvas, x, y, w, h, title) {
  drawPanel(canvas, x, y, w, h, [238, 239, 242, 255]);
  fillRect(canvas, x, y, w, 72, COLORS.unity);
  drawText(canvas, title, x + 36, y + 26, 7, COLORS.white);
  fillRect(canvas, x + w - 120, y + 24, 22, 22, COLORS.spark);
  fillRect(canvas, x + w - 82, y + 24, 22, 22, COLORS.yellow);
  fillRect(canvas, x + w - 44, y + 24, 22, 22, COLORS.green);
}

function drawPanel(canvas, x, y, w, h, color) {
  fillRect(canvas, x, y, w, h, [0, 0, 0, 35]);
  fillRect(canvas, x + 6, y + 6, w - 12, h - 12, color);
  strokeRect(canvas, x + 6, y + 6, w - 12, h - 12, COLORS.line, 3);
}

function drawSidebar(canvas, x, y, items) {
  drawPanel(canvas, x, y, 240, 520, COLORS.white);
  for (let index = 0; index < items.length; index += 1) {
    const yy = y + 54 + index * 96;
    fillRect(canvas, x + 34, yy, 174, 46, index === 0 ? COLORS.spark : COLORS.line);
    drawText(canvas, items[index], x + 52, yy + 16, 3, index === 0 ? COLORS.white : COLORS.ink);
  }
}

function drawUnityPanel(canvas, x, y, w, h) {
  drawWindow(canvas, x, y, w, h, 'UNITY EDITOR');
  drawTree(canvas, x + 52, y + 140);
  drawMiniLevel(canvas, x + 310, y + 260, 310, 220);
  drawText(canvas, 'PREFAB BUILDER', x + 340, y + 550, 5, COLORS.muted);
  fillRect(canvas, x + 340, y + 605, 220, 42, COLORS.green);
  fillRect(canvas, x + 340, y + 675, 170, 42, COLORS.spark);
}

function drawVersionChips(canvas, x, y) {
  const chips = ['2022.3 LTS', '2023.2', 'UNITY 6'];
  for (let index = 0; index < chips.length; index += 1) {
    const xx = x + index * 260;
    fillRect(canvas, xx, y, 240, 66, [245, 246, 248, 255]);
    drawText(canvas, chips[index], xx + 26, y + 24, 3, COLORS.ink);
  }
}

function drawTree(canvas, x, y) {
  const rows = [
    ['SCENE', COLORS.spark],
    ['PLAYER', COLORS.cyan],
    ['BOSS', COLORS.red],
    ['HUD', COLORS.green],
    ['SPAWNS', COLORS.yellow],
  ];
  for (let index = 0; index < rows.length; index += 1) {
    const yy = y + index * 64;
    fillRect(canvas, x + 24 * Math.min(index, 2), yy, 28, 28, rows[index][1]);
    drawText(canvas, rows[index][0], x + 62 + 24 * Math.min(index, 2), yy + 2, 5, COLORS.ink);
  }
}

function drawMiniLevel(canvas, x, y, w, h) {
  fillRect(canvas, x, y, w, h, [34, 44, 55, 255]);
  for (let i = 0; i < 8; i += 1) {
    fillRect(canvas, x + i * (w / 8), y + h - 42 - (i % 3) * 18, w / 8 - 8, 36 + (i % 3) * 18, COLORS.grey3);
  }
  fillRect(canvas, x + 44, y + h - 115, 42, 42, COLORS.cyan);
  fillRect(canvas, x + w - 105, y + h - 125, 58, 58, COLORS.red);
  fillTriangle(canvas, x + w - 158, y + h - 42, x + w - 130, y + h - 90, x + w - 102, y + h - 42, COLORS.spark);
  strokeRect(canvas, x, y, w, h, COLORS.line, 3);
}

function drawTerminal(canvas, x, y, w, h) {
  fillRect(canvas, x, y, w, h, COLORS.ink);
  strokeRect(canvas, x, y, w, h, COLORS.grey5, 3);
  const lines = [
    'GET SCENE',
    'SET BOSS HP 2',
    'CAPTURE GAMEVIEW',
    'RUN EDITMODE TEST',
  ];
  for (let index = 0; index < lines.length; index += 1) {
    drawText(canvas, lines[index], x + 36, y + 60 + index * 86, 4, index === 1 ? COLORS.spark : COLORS.green);
  }
}

function drawSampleCard(canvas, x, y, title, accent, variant) {
  drawPanel(canvas, x, y, 380, 520, COLORS.panel);
  fillRect(canvas, x + 6, y + 6, 368, 88, accent);
  drawText(canvas, title, x + 44, y + 42, 4, COLORS.white);
  if (variant === 0) drawMiniLevel(canvas, x + 44, y + 160, 292, 210);
  if (variant === 1) drawDungeon(canvas, x + 44, y + 150, 292, 220);
  if (variant === 2) drawMobile(canvas, x + 100, y + 135, 180, 280);
  drawText(canvas, 'UNITY IMPORT', x + 74, y + 438, 4, COLORS.muted);
}

function drawDungeon(canvas, x, y, w, h) {
  fillRect(canvas, x, y, w, h, COLORS.unreal);
  for (let row = 0; row < 4; row += 1) {
    for (let col = 0; col < 5; col += 1) {
      if ((row + col) % 2 === 0) fillRect(canvas, x + col * 58 + 8, y + row * 52 + 8, 44, 38, COLORS.grey5);
    }
  }
  fillRect(canvas, x + 116, y + 78, 48, 48, COLORS.green);
  fillRect(canvas, x + 210, y + 130, 44, 44, COLORS.red);
  strokeRect(canvas, x, y, w, h, COLORS.line, 3);
}

function drawMobile(canvas, x, y, w, h) {
  fillRect(canvas, x, y, w, h, COLORS.ink);
  fillRect(canvas, x + 14, y + 16, w - 28, h - 32, COLORS.panel);
  fillRect(canvas, x + 38, y + 60, w - 76, 52, COLORS.spark);
  fillRect(canvas, x + 38, y + 140, w - 76, 38, COLORS.line);
  fillRect(canvas, x + 38, y + 205, w - 76, 38, COLORS.green);
  strokeRect(canvas, x, y, w, h, COLORS.grey5, 8);
}

function drawArrow(canvas, x1, y1, x2, y2, color, size) {
  drawLine(canvas, x1, y1, x2, y2, color, Math.max(4, Math.floor(size / 3)));
  const angle = Math.atan2(y2 - y1, x2 - x1);
  const left = angle + Math.PI * 0.78;
  const right = angle - Math.PI * 0.78;
  fillTriangle(
    canvas,
    x2,
    y2,
    x2 + Math.cos(left) * size,
    y2 + Math.sin(left) * size,
    x2 + Math.cos(right) * size,
    y2 + Math.sin(right) * size,
    color,
  );
}

function drawText(canvas, text, x, y, scale, color) {
  let cursor = x;
  for (const char of String(text).toUpperCase()) {
    const glyph = FONT[char] ?? FONT[' '];
    for (let row = 0; row < glyph.length; row += 1) {
      for (let col = 0; col < glyph[row].length; col += 1) {
        if (glyph[row][col] === '1') fillRect(canvas, cursor + col * scale, y + row * scale, scale, scale, color);
      }
    }
    cursor += 6 * scale;
  }
}

function fillRect(canvas, x, y, w, h, color) {
  const left = Math.max(0, Math.floor(x));
  const top = Math.max(0, Math.floor(y));
  const right = Math.min(canvas.width, Math.ceil(x + w));
  const bottom = Math.min(canvas.height, Math.ceil(y + h));
  for (let yy = top; yy < bottom; yy += 1) {
    for (let xx = left; xx < right; xx += 1) {
      setPixel(canvas, xx, yy, color);
    }
  }
}

function strokeRect(canvas, x, y, w, h, color, thickness) {
  fillRect(canvas, x, y, w, thickness, color);
  fillRect(canvas, x, y + h - thickness, w, thickness, color);
  fillRect(canvas, x, y, thickness, h, color);
  fillRect(canvas, x + w - thickness, y, thickness, h, color);
}

function drawLine(canvas, x1, y1, x2, y2, color, thickness = 1) {
  const steps = Math.max(Math.abs(x2 - x1), Math.abs(y2 - y1));
  for (let step = 0; step <= steps; step += 1) {
    const t = steps === 0 ? 0 : step / steps;
    const x = x1 + (x2 - x1) * t;
    const y = y1 + (y2 - y1) * t;
    fillRect(canvas, x - thickness / 2, y - thickness / 2, thickness, thickness, color);
  }
}

function fillTriangle(canvas, ax, ay, bx, by, cx, cy, color) {
  const minX = Math.floor(Math.min(ax, bx, cx));
  const maxX = Math.ceil(Math.max(ax, bx, cx));
  const minY = Math.floor(Math.min(ay, by, cy));
  const maxY = Math.ceil(Math.max(ay, by, cy));
  const area = edge(ax, ay, bx, by, cx, cy);
  for (let y = minY; y <= maxY; y += 1) {
    for (let x = minX; x <= maxX; x += 1) {
      const w0 = edge(bx, by, cx, cy, x, y);
      const w1 = edge(cx, cy, ax, ay, x, y);
      const w2 = edge(ax, ay, bx, by, x, y);
      if ((w0 >= 0 && w1 >= 0 && w2 >= 0 && area >= 0) || (w0 <= 0 && w1 <= 0 && w2 <= 0 && area <= 0)) {
        setPixel(canvas, x, y, color);
      }
    }
  }
}

function edge(ax, ay, bx, by, cx, cy) {
  return (cx - ax) * (by - ay) - (cy - ay) * (bx - ax);
}

function setPixel(canvas, x, y, color) {
  if (x < 0 || y < 0 || x >= canvas.width || y >= canvas.height) return;
  const offset = (y * canvas.width + x) * 4;
  const alpha = color[3] / 255;
  if (alpha >= 1) {
    canvas.pixels[offset] = color[0];
    canvas.pixels[offset + 1] = color[1];
    canvas.pixels[offset + 2] = color[2];
    canvas.pixels[offset + 3] = 255;
    return;
  }
  canvas.pixels[offset] = Math.round(color[0] * alpha + canvas.pixels[offset] * (1 - alpha));
  canvas.pixels[offset + 1] = Math.round(color[1] * alpha + canvas.pixels[offset + 1] * (1 - alpha));
  canvas.pixels[offset + 2] = Math.round(color[2] * alpha + canvas.pixels[offset + 2] * (1 - alpha));
  canvas.pixels[offset + 3] = 255;
}

function encodePng(canvas) {
  const stride = canvas.width * 4 + 1;
  const raw = Buffer.alloc(stride * canvas.height);
  for (let y = 0; y < canvas.height; y += 1) {
    raw[y * stride] = 0;
    Buffer.from(canvas.pixels.buffer, y * canvas.width * 4, canvas.width * 4).copy(raw, y * stride + 1);
  }
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    pngChunk('IHDR', Buffer.concat([
      uint32(canvas.width),
      uint32(canvas.height),
      Buffer.from([8, 6, 0, 0, 0]),
    ])),
    pngChunk('IDAT', deflateSync(raw, { level: 9 })),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
}

function pngChunk(type, data) {
  const typeBytes = Buffer.from(type, 'ascii');
  return Buffer.concat([
    uint32(data.length),
    typeBytes,
    data,
    uint32(crc32(Buffer.concat([typeBytes, data]))),
  ]);
}

function uint32(value) {
  const buffer = Buffer.alloc(4);
  buffer.writeUInt32BE(value >>> 0);
  return buffer;
}

const CRC_TABLE = new Uint32Array(256).map((_, index) => {
  let c = index;
  for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const root = process.argv[2] ? resolve(process.argv[2]) : undefined;
  const results = generateAssetStoreVisuals(root);
  process.stdout.write(`${JSON.stringify({ assets: results }, null, 2)}\n`);
}
