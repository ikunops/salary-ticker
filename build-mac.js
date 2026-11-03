// 在非 macOS 上组装可运行的 macOS .app（未签名）。
// 产物：dist/mac-arm64/SalaryTicker.app + 同名 .zip，解压到 mac 后可直接运行。
// 说明：未做代码签名/公证，首次打开需右键「打开」或在系统设置中允许。
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const root = __dirname;
const ARCH = process.argv[2] || 'arm64';          // arm64 | x64
const here = path.join(root, '.electron-cache', 'darwin-' + ARCH);

if (!fs.existsSync(here)) {
  console.error('缺少 darwin 二进制目录: ' + here);
  console.error('请先运行 prepare-mac.js 下载并解压对应架构');
  process.exit(1);
}

const srcApp = path.join(here, 'Electron.app');
if (!fs.existsSync(srcApp)) {
  console.error('未找到 Electron.app: ' + srcApp);
  process.exit(1);
}

const outRoot = path.join(root, 'dist', 'mac-' + ARCH);
const appName = 'SalaryTicker.app';
const outApp = path.join(outRoot, appName);

// 1) 复制 Electron.app 模板
fs.rmSync(outRoot, { recursive: true, force: true });
fs.mkdirSync(outRoot, { recursive: true });
copyDir(srcApp, outApp);

// 2) 重命名可执行文件 Electron -> SalaryTicker
const macOsDir = path.join(outApp, 'Contents', 'MacOS');
const oldExe = path.join(macOsDir, 'Electron');
const newExe = path.join(macOsDir, 'SalaryTicker');
if (fs.existsSync(oldExe)) fs.renameSync(oldExe, newExe);

// 3) 写入 app 代码到 Resources/app
const resDir = path.join(outApp, 'Contents', 'Resources');
const appDir = path.join(resDir, 'app');
fs.mkdirSync(appDir, { recursive: true });
fs.copyFileSync(path.join(root, 'index.html'), path.join(appDir, 'index.html'));
fs.copyFileSync(path.join(root, 'main.js'), path.join(appDir, 'main.js'));

// 精简的 package.json（只保留运行必需字段）
fs.writeFileSync(path.join(appDir, 'package.json'), JSON.stringify({
  name: 'salary-ticker',
  productName: '工资秒表',
  version: '1.0.0',
  description: '把月薪拆到秒，实时看着工资增长',
  main: 'main.js',
  author: 'salary-ticker',
  license: 'MIT'
}, null, 2));

// 4) 应用图标（把 png 转成 icns 的最小可用形式，并让 plist 指向它）
const iconSrc = path.join(root, 'build', 'icon.png');
if (fs.existsSync(iconSrc)) {
  fs.copyFileSync(iconSrc, path.join(resDir, 'icon.png'));
  // Electron.app 自带 electron.icns，我们生成同名替换（见 make-mac-icns 逻辑）
  try {
    buildIcns(iconSrc, path.join(resDir, 'SalaryTicker.icns'));
  } catch (e) {
    console.warn('[build-mac] icns 生成失败，沿用默认图标: ' + e.message);
  }
}

// 5) 改 Info.plist 里的可执行文件名、标识、版本、图标
const plistPath = path.join(outApp, 'Contents', 'Info.plist');
let plist = fs.readFileSync(plistPath, 'utf8');
plist = plist.replace(/<string>Electron<\/string>/g, '<string>SalaryTicker</string>');
plist = plist.replace(/com\.github\.Electron/g, 'com.salaryticker.app');
plist = plist.replace(/Electron/g, 'SalaryTicker');
// 版本号：从 package.json 读，而不是 Electron 的版本
let appVer = '1.0.0';
try { appVer = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')).version || '1.0.0'; } catch (_) {}
plist = plist.replace(
  /<key>CFBundleShortVersionString<\/key>\s*<string>[^<]*<\/string>/,
  '<key>CFBundleShortVersionString</key>\n\t<string>' + appVer + '</string>'
);
plist = plist.replace(
  /<key>CFBundleVersion<\/key>\s*<string>[^<]*<\/string>/,
  '<key>CFBundleVersion</key>\n\t<string>' + appVer + '</string>'
);
// 显示名（中文）
plist = plist.replace(
  /<key>CFBundleDisplayName<\/key>\s*<string>[^<]*<\/string>/,
  '<key>CFBundleDisplayName</key>\n\t<string>工资秒表</string>'
);
// 图标指向自定义 icns
if (fs.existsSync(path.join(resDir, 'SalaryTicker.icns'))) {
  plist = plist.replace(
    /<key>CFBundleIconFile<\/key>\s*<string>[^<]*<\/string>/,
    '<key>CFBundleIconFile</key>\n\t<string>SalaryTicker</string>'
  );
}
fs.writeFileSync(plistPath, plist, 'utf8');

// 6) 删除默认的 default_app.asar（我们用自定义 app 目录）
const defAsar = path.join(resDir, 'default_app.asar');
if (fs.existsSync(defAsar)) fs.unlinkSync(defAsar);

// 7) 打包成 zip（mac 用户解压即用，保留可执行权限）
const seven = path.join(root, 'node_modules', '7zip-bin', 'win', 'x64', '7za.exe');
const zipOut = path.join(root, 'dist', 'SalaryTicker-1.0.0-mac-' + ARCH + '.zip');
fs.rmSync(zipOut, { force: true });
execFileSync(seven, ['a', '-tzip', '-mx=5', zipOut, appName], { cwd: outRoot, stdio: 'inherit' });

const zipMb = (fs.statSync(zipOut).size / 1024 / 1024).toFixed(2);
console.log('[build-mac] 目录: ' + path.relative(root, outApp));
console.log('[build-mac] 压缩包: ' + path.relative(root, zipOut) + '  ' + zipMb + ' MB');

// 递归复制（保留符号链接指向的文件内容）
function copyDir(src, dst) {
  fs.mkdirSync(dst, { recursive: true });
  for (const e of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, e.name);
    const d = path.join(dst, e.name);
    if (e.isDirectory()) copyDir(s, d);
    else if (e.isSymbolicLink()) {
      try {
        const real = fs.realpathSync(s);
        if (fs.existsSync(real) && fs.statSync(real).isFile()) fs.copyFileSync(real, d);
      } catch (_) { /* 忽略断链 */ }
    } else fs.copyFileSync(s, d);
  }
}

/* 生成 .icns：容器里塞入多个 PNG 尺寸（icp4/icp5/ic07/ic08/ic09）
   icns 格式：'icns' + 总长度(4B, 含头) + 若干块 [类型(4B) + 块长度(4B, 含头) + PNG数据] */
function buildIcns(pngPath, outPath) {
  const zlib = require('zlib');
  const src = fs.readFileSync(pngPath);

  // 解析 PNG 尺寸
  if (src.toString('ascii', 12, 16) !== 'IHDR') throw new Error('不是有效 PNG');
  const w = src.readUInt32BE(16);
  const h = src.readUInt32BE(20);

  // 这里只做“原样嵌入”，所以我们要求源图足够大；不同尺寸块用同一张图（macOS 会缩放）
  // 常用类型：ic07=128, ic08=256, ic09=512
  const entries = [];
  const add = (type) => {
    const head = Buffer.alloc(8);
    head.write(type, 0, 'ascii');
    head.writeUInt32BE(src.length + 8, 4);
    entries.push(Buffer.concat([head, src]));
  };
  if (w >= 128) { add('ic07'); }
  if (w >= 256) { add('ic08'); }
  if (w >= 512) { add('ic09'); }
  if (!entries.length) add('ic07');

  const body = Buffer.concat(entries);
  const header = Buffer.alloc(8);
  header.write('icns', 0, 'ascii');
  header.writeUInt32BE(body.length + 8, 4);
  fs.writeFileSync(outPath, Buffer.concat([header, body]));
}
