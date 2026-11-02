// 从 build/icon.png(512x512) 派生 Tauri 所需的多尺寸图标 + ico
// 不依赖外部图像库：用最小 PNG 解码/缩放实现（box 采样）
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

/* ---------- PNG 解码（仅支持 8bit RGBA / RGB，非隔行） ---------- */
function decodePng(buf) {
  let pos = 8;
  let width = 0, height = 0, bitDepth = 0, colorType = 0;
  const idat = [];
  while (pos < buf.length) {
    const len = buf.readUInt32BE(pos); pos += 4;
    const type = buf.toString('ascii', pos, pos + 4); pos += 4;
    const data = buf.subarray(pos, pos + len); pos += len + 4; // skip crc
    if (type === 'IHDR') {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      bitDepth = data[8];
      colorType = data[9];
    } else if (type === 'IDAT') {
      idat.push(data);
    } else if (type === 'IEND') break;
  }
  if (bitDepth !== 8) throw new Error('仅支持 8bit PNG, got ' + bitDepth);
  const channels = colorType === 6 ? 4 : colorType === 2 ? 3 : 0;
  if (!channels) throw new Error('不支持的 colorType ' + colorType);

  const raw = zlib.inflateSync(Buffer.concat(idat));
  const stride = width * channels;
  const out = Buffer.alloc(width * height * 4);
  let prev = Buffer.alloc(stride, 0);

  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)];
    const line = raw.subarray(y * (stride + 1) + 1, y * (stride + 1) + 1 + stride);
    const cur = Buffer.alloc(stride);
    for (let i = 0; i < stride; i++) {
      const a = i >= channels ? cur[i - channels] : 0;
      const b = prev[i];
      const c = i >= channels ? prev[i - channels] : 0;
      let v = line[i];
      switch (filter) {
        case 0: break;
        case 1: v = (v + a) & 0xff; break;
        case 2: v = (v + b) & 0xff; break;
        case 3: v = (v + ((a + b) >> 1)) & 0xff; break;
        case 4: {
          const p = a + b - c;
          const pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
          const pr = pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
          v = (v + pr) & 0xff; break;
        }
        default: throw new Error('未知滤波 ' + filter);
      }
      cur[i] = v;
    }
    for (let x = 0; x < width; x++) {
      const si = x * channels;
      const di = (y * width + x) * 4;
      out[di] = cur[si];
      out[di + 1] = cur[si + 1];
      out[di + 2] = cur[si + 2];
      out[di + 3] = channels === 4 ? cur[si + 3] : 255;
    }
    prev = cur;
  }
  return { width, height, data: out };
}

/* ---------- PNG 编码 ---------- */
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
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(body), 0);
  return Buffer.concat([len, body, crc]);
}
function encodePng(img) {
  const { width, height, data } = img;
  const raw = Buffer.alloc(height * (width * 4 + 1));
  for (let y = 0; y < height; y++) {
    raw[y * (width * 4 + 1)] = 0;
    data.copy(raw, y * (width * 4 + 1) + 1, y * width * 4, (y + 1) * width * 4);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; ihdr[9] = 6;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0))
  ]);
}

/* ---------- 缩放（box 平均） ---------- */
function resize(src, size) {
  const { width, height, data } = src;
  const out = Buffer.alloc(size * size * 4);
  const sx = width / size, sy = height / size;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let r = 0, g = 0, b = 0, a = 0, n = 0;
      const x0 = Math.floor(x * sx), x1 = Math.max(x0 + 1, Math.floor((x + 1) * sx));
      const y0 = Math.floor(y * sy), y1 = Math.max(y0 + 1, Math.floor((y + 1) * sy));
      for (let yy = y0; yy < y1 && yy < height; yy++) {
        for (let xx = x0; xx < x1 && xx < width; xx++) {
          const i = (yy * width + xx) * 4;
          r += data[i]; g += data[i + 1]; b += data[i + 2]; a += data[i + 3]; n++;
        }
      }
      const di = (y * size + x) * 4;
      out[di] = Math.round(r / n);
      out[di + 1] = Math.round(g / n);
      out[di + 2] = Math.round(b / n);
      out[di + 3] = Math.round(a / n);
    }
  }
  return { width: size, height: size, data: out };
}

/* ---------- ICO 封装（PNG 子图） ---------- */
function encodeIco(pngSizes) {
  // pngSizes: [{size, png}]
  const count = pngSizes.length;
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);   // 1 = icon
  header.writeUInt16LE(count, 4);

  const dirs = [];
  let offset = 6 + 16 * count;
  pngSizes.forEach(({ size, png }) => {
    const d = Buffer.alloc(16);
    d[0] = size >= 256 ? 0 : size;
    d[1] = size >= 256 ? 0 : size;
    d[2] = 0; d[3] = 0;
    d.writeUInt16LE(1, 4);
    d.writeUInt16LE(32, 6);
    d.writeUInt32LE(png.length, 8);
    d.writeUInt32LE(offset, 12);
    offset += png.length;
    dirs.push(d);
  });
  return Buffer.concat([header, ...dirs, ...pngSizes.map(p => p.png)]);
}

/* ---------- 主流程 ---------- */
const buildDir = path.join(__dirname, 'build');
const iconsDir = path.join(__dirname, 'src-tauri', 'icons');
fs.mkdirSync(iconsDir, { recursive: true });

const srcBuf = fs.readFileSync(path.join(buildDir, 'icon.png'));
const src = decodePng(srcBuf);
console.log('源图: ' + src.width + 'x' + src.height);

const wanted = [32, 128, 256, 512];
const made = {};
for (const s of wanted) {
  const img = resize(src, s);
  made[s] = encodePng(img);
}

// Tauri 约定的文件名
fs.writeFileSync(path.join(iconsDir, '32x32.png'), made[32]);
fs.writeFileSync(path.join(iconsDir, '128x128.png'), made[128]);
fs.writeFileSync(path.join(iconsDir, '128x128@2x.png'), made[256]);
fs.writeFileSync(path.join(iconsDir, 'icon.png'), made[512]);

// Windows .ico（多尺寸）
const icoPngs = [32, 128, 256].map(s => ({ size: s, png: made[s] }));
fs.writeFileSync(path.join(iconsDir, 'icon.ico'), encodeIco(icoPngs));

// macOS .icns：用一个简化的 icns 容器（只含 512 png 的 ic09 类型）
// 说明：非 macOS 平台构建 mac 包时，Tauri 主要用 icns；这里给出最小可用版本
const icnsPng = made[512];
const icnsHeader = Buffer.alloc(8);
icnsHeader.write('icns', 0, 'ascii');
const icnsBody = Buffer.concat([
  (() => { const h = Buffer.alloc(8); h.write('ic09', 0, 'ascii'); h.writeUInt32BE(icnsPng.length + 8, 4); return h; })(),
  icnsPng
]);
icnsHeader.writeUInt32BE(8 + icnsBody.length, 4);
fs.writeFileSync(path.join(iconsDir, 'icon.icns'), Buffer.concat([icnsHeader, icnsBody]));

console.log('已生成 src-tauri/icons: 32x32.png, 128x128.png, 128x128@2x.png, icon.png, icon.ico, icon.icns');
