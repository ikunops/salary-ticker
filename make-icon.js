// 生成应用图标 build/icon.png（512x512），用纯 Node 手写 PNG，避免额外依赖
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const S = 512;
const buf = Buffer.alloc(S * S * 4, 0);

function setPx(x, y, r, g, b, a) {
  if (x < 0 || y < 0 || x >= S || y >= S) return;
  const i = (y * S + x) * 4;
  buf[i] = r; buf[i + 1] = g; buf[i + 2] = b; buf[i + 3] = a;
}
function blend(x, y, r, g, b, a) {
  if (x < 0 || y < 0 || x >= S || y >= S) return;
  const i = (y * S + x) * 4;
  const sa = a / 255;
  const da = buf[i + 3] / 255;
  const oa = sa + da * (1 - sa);
  if (oa <= 0) return;
  buf[i]     = Math.round((r * sa + buf[i]     * da * (1 - sa)) / oa);
  buf[i + 1] = Math.round((g * sa + buf[i + 1] * da * (1 - sa)) / oa);
  buf[i + 2] = Math.round((b * sa + buf[i + 2] * da * (1 - sa)) / oa);
  buf[i + 3] = Math.round(oa * 255);
}

// 圆角矩形遮罩 + 背景渐变（深色底 + 绿色强调）
const R = 110;                 // 圆角半径
const pad = 8;
const w = S - pad * 2;

function inRoundedRect(x, y, x0, y0, ww, hh, rr) {
  const rx = x - x0, ry = y - y0;
  if (rx < 0 || ry < 0 || rx > ww || ry > hh) return false;
  const cx = Math.min(Math.max(rx, rr), ww - rr);
  const cy = Math.min(Math.max(ry, rr), hh - rr);
  const dx = rx - cx, dy = ry - cy;
  return dx * dx + dy * dy <= rr * rr;
}

for (let y = 0; y < S; y++) {
  for (let x = 0; x < S; x++) {
    if (!inRoundedRect(x, y, pad, pad, w, w, R)) continue;
    // 纵向渐变：#0f1720 -> #070a10
    const t = y / S;
    const r = Math.round(15 + (7 - 15) * t);
    const g = Math.round(23 + (10 - 23) * t);
    const b = Math.round(32 + (16 - 32) * t);
    setPx(x, y, r, g, b, 255);
  }
}

// 顶部绿色光晕
for (let y = 0; y < S * 0.55; y++) {
  for (let x = 0; x < S; x++) {
    if (!inRoundedRect(x, y, pad, pad, w, w, R)) continue;
    const dx = (x - S * 0.5) / (S * 0.55);
    const dy = (y - S * 0.05) / (S * 0.5);
    const d = Math.sqrt(dx * dx + dy * dy);
    const a = Math.max(0, 1 - d) * 0.20;
    if (a > 0) blend(x, y, 61, 220, 151, Math.round(a * 255));
  }
}

// 画 ¥ 符号（用笔画矩形近似，粗体几何风格）
const accent = [61, 220, 151];
function thickLine(x0, y0, x1, y1, th) {
  const steps = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0)) * 2 + 1;
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const cx = x0 + (x1 - x0) * t;
    const cy = y0 + (y1 - y0) * t;
    for (let oy = -th; oy <= th; oy++) {
      for (let ox = -th; ox <= th; ox++) {
        if (ox * ox + oy * oy <= th * th) {
          blend(Math.round(cx + ox), Math.round(cy + oy), accent[0], accent[1], accent[2], 255);
        }
      }
    }
  }
}

const cx = S / 2;
const top = 150, bottom = 372, barY1 = 292, barY2 = 330;
const th = 15;
// Y 的两条斜臂
thickLine(cx - 95, top, cx, 262, th);
thickLine(cx + 95, top, cx, 262, th);
// Y 的竖干
thickLine(cx, 262, cx, bottom, th);
// ¥ 的两条横杠
thickLine(cx - 78, barY1, cx + 78, barY1, th);
thickLine(cx - 62, barY2, cx + 62, barY2, th);

// 编码 PNG
function crc32(buf) {
  let c, crc = 0xffffffff;
  for (let n = 0; n < buf.length; n++) {
    c = (crc ^ buf[n]) & 0xff;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    crc = c ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length, 0);
  const t = Buffer.from(type, 'ascii');
  const body = Buffer.concat([t, data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(body), 0);
  return Buffer.concat([len, body, crc]);
}

const raw = Buffer.alloc(S * (S * 4 + 1));
for (let y = 0; y < S; y++) {
  raw[y * (S * 4 + 1)] = 0;
  buf.copy(raw, y * (S * 4 + 1) + 1, y * S * 4, (y + 1) * S * 4);
}

const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(S, 0);
ihdr.writeUInt32BE(S, 4);
ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;

const png = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  chunk('IHDR', ihdr),
  chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
  chunk('IEND', Buffer.alloc(0))
]);

const outDir = path.join(__dirname, 'build');
fs.mkdirSync(outDir, { recursive: true });
const outFile = path.join(outDir, 'icon.png');
fs.writeFileSync(outFile, png);
console.log('wrote ' + outFile + ' ' + png.length + ' bytes (' + S + 'x' + S + ')');
