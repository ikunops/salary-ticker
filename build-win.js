// Windows 打包脚本：固化缓存/临时目录到工作区，避免受系统目录权限限制
const { spawnSync } = require('child_process');
const path = require('path');
const fs = require('fs');

const root = __dirname;
const env = { ...process.env };

// Electron 若带 ELECTRON_RUN_AS_NODE 会退化成纯 Node，必须清掉
delete env.ELECTRON_RUN_AS_NODE;

// 缓存与临时目录都放到工作区内
const ebCache = path.join(root, '.eb-cache');
const eCache = path.join(root, '.electron-cache');
const tmp = path.join(root, '.tmp');
[ebCache, eCache, tmp].forEach(d => fs.mkdirSync(d, { recursive: true }));
env.ELECTRON_BUILDER_CACHE = ebCache;
env.electron_config_cache = eCache;
env.TMP = tmp;
env.TEMP = tmp;

// 确保图标存在
if (!fs.existsSync(path.join(root, 'build', 'icon.png'))) {
  console.log('[build-win] 图标缺失，先生成…');
  spawnSync(process.execPath, [path.join(root, 'make-icon.js')], { cwd: root, stdio: 'inherit', env });
}

// 直接用 electron-builder 的入口 js，避免 .cmd 包装在受限环境下的 spawn 问题
const ebCli = path.join(root, 'node_modules', 'electron-builder', 'out', 'cli', 'cli.js');
// 复用已安装的 electron 二进制，避免联网重新下载 113MB
const localElectronDist = path.join(root, 'node_modules', 'electron', 'dist');
const args = [ebCli, '--win', '--x64'];
if (fs.existsSync(localElectronDist)) {
  args.push('--config.electronDist=' + localElectronDist);
}
console.log('[build-win] node electron-builder --win --x64');

const r = spawnSync(process.execPath, args, { cwd: root, stdio: 'inherit', env });
if (r.error) {
  console.error('[build-win] 启动失败: ' + r.error.message);
  process.exit(1);
}
if (r.status !== 0) {
  console.error('[build-win] 构建失败，退出码 ' + r.status);
  process.exit(r.status || 1);
}

// 报告产物
const dist = path.join(root, 'dist');
if (fs.existsSync(dist)) {
  const files = fs.readdirSync(dist).filter(f => /\.(exe|zip)$/i.test(f));
  files.forEach(f => {
    const p = path.join(dist, f);
    const mb = (fs.statSync(p).size / 1024 / 1024).toFixed(2);
    console.log('[build-win] 产物: dist\\' + f + '  ' + mb + ' MB');
  });
}

// 额外产出一份「免安装目录版」zip：解压即用，完全不依赖 %TEMP%，最稳
const unpacked = path.join(dist, 'win-unpacked');
if (fs.existsSync(unpacked)) {
  const seven = path.join(root, 'node_modules', '7zip-bin', 'win', 'x64', '7za.exe');
  const zipOut = path.join(dist, 'SalaryTicker-1.0.0-win-x64-folder.zip');
  fs.rmSync(zipOut, { force: true });
  console.log('[build-win] 打包免安装目录版…');
  try {
    spawnSync(seven, ['a', '-tzip', '-mx=5', zipOut, '.'], { cwd: unpacked, stdio: 'ignore', env });
    if (fs.existsSync(zipOut)) {
      const mb = (fs.statSync(zipOut).size / 1024 / 1024).toFixed(2);
      console.log('[build-win] 产物: dist\\SalaryTicker-win-x64-免安装版.zip  ' + mb + ' MB');
    }
  } catch (e) {
    console.warn('[build-win] 免安装 zip 打包失败: ' + e.message);
  }
}
