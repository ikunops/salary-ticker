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

// 4) 应用图标
const iconSrc = path.join(root, 'build', 'icon.png');
if (fs.existsSync(iconSrc)) {
  fs.copyFileSync(iconSrc, path.join(resDir, 'icon.png'));
}

// 5) 改 Info.plist 里的可执行文件名与标识
const plistPath = path.join(outApp, 'Contents', 'Info.plist');
let plist = fs.readFileSync(plistPath, 'utf8');
plist = plist.replace(/<string>Electron<\/string>/g, '<string>SalaryTicker</string>');
plist = plist.replace(/com\.github\.Electron/g, 'com.salaryticker.app');
plist = plist.replace(/Electron/g, 'SalaryTicker');
// 显示名（中文）用 UTF-8 写入，避免编码问题
plist = plist.replace(
  /<key>CFBundleDisplayName<\/key>\s*<string>[^<]*<\/string>/,
  '<key>CFBundleDisplayName</key>\n\t<string>工资秒表</string>'
);
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
