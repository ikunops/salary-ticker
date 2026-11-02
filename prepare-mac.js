// 下载并解压 macOS 版 Electron（arm64 / x64），供 build-mac.js 组装使用
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const https = require('https');

const VERSION = '32.3.3';
const root = __dirname;
const cacheDir = path.join(root, '.electron-cache');
fs.mkdirSync(cacheDir, { recursive: true });

const seven = path.join(root, 'node_modules', '7zip-bin', 'win', 'x64', '7za.exe');

function download(url, dest, redirects = 0) {
  return new Promise((resolve, reject) => {
    if (redirects > 8) return reject(new Error('too many redirects'));
    https.get(url, { headers: { 'User-Agent': 'node' } }, res => {
      if ([301, 302, 303, 307, 308].includes(res.statusCode)) {
        res.resume();
        return download(res.headers.location, dest, redirects + 1).then(resolve, reject);
      }
      if (res.statusCode !== 200) {
        res.resume();
        return reject(new Error('HTTP ' + res.statusCode));
      }
      const f = fs.createWriteStream(dest);
      res.pipe(f);
      f.on('finish', () => f.close(() => resolve(dest)));
      f.on('error', reject);
    }).on('error', reject);
  });
}

async function ensure(arch) {
  const dir = path.join(cacheDir, 'darwin-' + arch);
  if (fs.existsSync(path.join(dir, 'Electron.app'))) {
    console.log('[prepare-mac] ' + arch + ' 已就绪');
    return;
  }
  const zip = path.join(cacheDir, 'electron-v' + VERSION + '-darwin-' + arch + '.zip');
  if (!fs.existsSync(zip) || fs.statSync(zip).size < 1000000) {
    const url = 'https://github.com/electron/electron/releases/download/v' +
      VERSION + '/electron-v' + VERSION + '-darwin-' + arch + '.zip';
    console.log('[prepare-mac] 下载 ' + arch + ' …');
    await download(url, zip);
  }
  console.log('[prepare-mac] 解压 ' + arch + ' …');
  fs.rmSync(dir, { recursive: true, force: true });
  // 7za 对 mac 包里的符号链接会报少量错误，但文件内容能正常解出
  try {
    execFileSync(seven, ['x', zip, '-o' + dir, '-y'], { stdio: 'ignore' });
  } catch (_) { /* 符号链接错误可忽略 */ }
  if (!fs.existsSync(path.join(dir, 'Electron.app'))) {
    throw new Error(arch + ' 解压后缺少 Electron.app');
  }
  console.log('[prepare-mac] ' + arch + ' 就绪');
}

(async () => {
  const archs = process.argv.slice(2);
  const list = archs.length ? archs : ['arm64', 'x64'];
  for (const a of list) await ensure(a);
  console.log('[prepare-mac] 全部完成');
})().catch(e => { console.error('[prepare-mac] 失败: ' + e.message); process.exit(1); });
