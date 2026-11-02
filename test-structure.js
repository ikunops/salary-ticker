// 结构性校验：id 引用、选择器、标签配对、语法、CSS 括号
const fs = require('fs');
const html = fs.readFileSync('index.html', 'utf8');

const ids = new Set([...html.matchAll(/id="([^"]+)"/g)].map(m => m[1]));
const refs = [...html.matchAll(/\$\('([^']+)'\)/g)].map(m => m[1]);
const missing = [...new Set(refs)].filter(r => !ids.has(r));
console.log('JS 引用 id 数:', new Set(refs).size, '| 缺失:', missing.length ? missing.join(',') : '无');

const sels = [...new Set([...html.matchAll(/querySelectorAll\('([^']+)'\)/g)].map(m => m[1]))];
console.log('选择器:', sels.join(' | '));
for (const sel of sels) {
  const attr = sel.includes('weekRow') ? 'data-dow'
             : sel.includes('decChips') ? 'data-dec'
             : 'data-tab';
  const n = (html.match(new RegExp(attr + '="', 'g')) || []).length;
  console.log('  ' + sel + ' -> 含 ' + attr + ' 的元素数 ' + n);
}

const openDiv = (html.match(/<div\b/g) || []).length;
const closeDiv = (html.match(/<\/div>/g) || []).length;
console.log('div 开/闭:', openDiv, '/', closeDiv, openDiv === closeDiv ? 'OK' : 'MISMATCH');

const openSec = (html.match(/<section\b/g) || []).length;
const closeSec = (html.match(/<\/section>/g) || []).length;
console.log('section 开/闭:', openSec, '/', closeSec, openSec === closeSec ? 'OK' : 'MISMATCH');

const openAside = (html.match(/<aside\b/g) || []).length;
const closeAside = (html.match(/<\/aside>/g) || []).length;
console.log('aside 开/闭:', openAside, '/', closeAside, openAside === closeAside ? 'OK' : 'MISMATCH');

const script = html.split('<script>')[1].split('</script>')[0];
try { new Function(script); console.log('JS 语法: OK'); }
catch (e) { console.log('JS 语法错误:', e.message); }

const css = html.split('<style>')[1].split('</style>')[0];
const o = (css.match(/{/g) || []).length, c = (css.match(/}/g) || []).length;
console.log('CSS 花括号:', o, '/', c, o === c ? 'OK' : 'MISMATCH');

console.log('\n文件大小:', (Buffer.byteLength(html) / 1024).toFixed(1), 'KB');
console.log('外部依赖:', /<(script|link)[^>]+(src|href)="(https?:)?\/\//.test(html) ? '有(需联网)' : '无（完全离线）');
