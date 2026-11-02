// Tauri 统一打包脚本：win / mac
// 产物统一收集到 dist/，并打印体积报告
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const root = __dirname;
const target = process.argv[2] || 'win';   // win | mac

const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;

// 临时目录与 cargo 目标目录都放工作区，避免系统目录权限问题
const tmp = path.join(root, '.tmp');
fs.mkdirSync(tmp, { recursive: true });
env.TMP = tmp;
env.TEMP = tmp;
env.CARGO_TARGET_DIR = path.join(root, '.cargo-target');

function run(cmd, args, opts = {}) {
  console.log('> ' + cmd + ' ' + args.join(' '));
  const r = spawnSync(cmd, args, { cwd: root, stdio: 'inherit', env, ...opts });
  if (r.error) { console.error('启动失败: ' + r.error.message); process.exit(1); }
  if (r.status !== 0) { console.error('命令失败，退出码 ' + r.status); process.exit(r.status || 1); }
}

// 1) 同步页面到 src/（Tauri 的 frontendDist）
fs.mkdirSync(path.join(root, 'src'), { recursive: true });
fs.copyFileSync(path.join(root, 'index.html'), path.join(root, 'src', 'index.html'));

// 2) 确保图标存在
if (!fs.existsSync(path.join(root, 'src-tauri', 'icons', 'icon.ico'))) {
  console.log('[build] 生成图标…');
  run(process.execPath, [path.join(root, 'make-tauri-icons.js')]);
}

// 3) 调用 tauri cli
const cli = path.join(root, 'node_modules', '@tauri-apps', 'cli', 'tauri.js');
run(process.execPath, [cli, 'build']);

// 4) 收集产物到 dist/
const rel = path.join(root, '.cargo-target', 'release');
const outDir = path.join(root, 'dist');
fs.mkdirSync(outDir, { recursive: true });

const collected = [];

// 裸可执行文件
const exeName = process.platform === 'win32' ? 'salary-ticker.exe' : 'salary-ticker';
const binPath = path.join(rel, exeName);
if (fs.existsSync(binPath)) {
  const dst = path.join(outDir, 'SalaryTicker-' + target + (process.platform === 'win32' ? '.exe' : ''));
  fs.copyFileSync(binPath, dst);
  collected.push(dst);
}

// 安装包
const bundleDirs = [
  path.join(rel, 'bundle', 'nsis'),
  path.join(rel, 'bundle', 'msi'),
  path.join(rel, 'bundle', 'dmg'),
  path.join(rel, 'bundle', 'macos'),
];
for (const d of bundleDirs) {
  if (!fs.existsSync(d)) continue;
  for (const f of fs.readdirSync(d)) {
    const full = path.join(d, f);
    if (!fs.statSync(full).isFile()) continue;
    if (!/\.(exe|msi|dmg|app)$/i.test(f) && !f.includes('.app')) continue;
    const dst = path.join(outDir, f);
    fs.copyFileSync(full, dst);
    collected.push(dst);
  }
}

console.log('\n[build] 产物：');
collected.forEach(p => {
  console.log('  ' + path.relative(root, p) + '  ' + (fs.statSync(p).size / 1024 / 1024).toFixed(2) + ' MB');
});
if (!collected.length) console.log('  （未找到产物，请检查上方日志）');
