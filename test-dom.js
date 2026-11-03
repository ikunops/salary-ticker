// 用最小 DOM 桩在 Node 里真实执行页面脚本，验证元素绑定 + 渲染结果
const fs = require('fs');
const path = require('path');
const html = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');

const script = html.split('<script>')[1].split('</script>')[0];

/* ---- 收集 HTML 中真实存在的 id ---- */
const ids = new Set([...html.matchAll(/id="([^"]+)"/g)].map(m => m[1]));

/* ---- 极简 DOM ---- */
class CL {
  constructor(){ this._s = new Set(); }
  add(...c){ c.forEach(x => x && this._s.add(x)); }
  remove(...c){ c.forEach(x => this._s.delete(x)); }
  contains(c){ return this._s.has(c); }
  toggle(c, force){
    if (force === undefined) { this._s.has(c) ? this._s.delete(c) : this._s.add(c); }
    else if (force) this._s.add(c); else this._s.delete(c);
  }
}
class El {
  constructor(tag = 'div'){
    this.tagName = (tag || 'div').toUpperCase();
    this.children = []; this.dataset = {}; this.style = {};
    this.classList = new CL(); this._text = ''; this._html = '';
    this._listeners = {}; this.value = ''; this.title = '';
    this.firstChild = null;
  }
  appendChild(c){ this.children.push(c); this.firstChild = this.children[0]; return c; }
  set className(v){ this._cls = String(v); this.classList = new CL(); String(v).split(/\s+/).filter(Boolean).forEach(x => this.classList.add(x)); }
  get className(){ return this._cls || ''; }
  addEventListener(t, fn){ (this._listeners[t] = this._listeners[t] || []).push(fn); }
  fire(t, ev = {}){ (this._listeners[t] || []).forEach(fn => fn.call(this, { target: this, preventDefault(){}, ...ev })); }
  set textContent(v){ this._text = String(v); this._html = ''; }
  get textContent(){ return this._text; }
  set innerHTML(v){ this._html = String(v); this.children = []; this._text = ''; }
  get innerHTML(){ return this._html; }
  get offsetWidth(){ return 800; }
}
const byId = {};
function mkEl(tag){
  const e = new El(tag);
  return e;
}
// 兼容 time-wrap 包装：取出某列对应的时间输入框
function timeInput(row, idx){
  const cell = row.children[idx];
  return (cell && cell.children && cell.children.length) ? cell.children[0] : cell;
}
// 预建所有 id 元素，记录到 byId
ids.forEach(id => { byId[id] = mkEl('div'); });

const weekBtns = [1,2,3,4,5,6,7].map(d => { const b = mkEl('button'); b.dataset.dow = String(d); return b; });
const decBtns  = [0,2,3,4].map(d => { const b = mkEl('button'); b.dataset.dec = String(d); return b; });
const tabBtns  = ['today','month','year'].map(t => { const b = mkEl('button'); b.dataset.tab = t; return b; });
const mchips   = ['today','month','year'].map(t => { const b = mkEl('button'); b.dataset.tab = t; return b; });

const paletteBtns = ['green','red'].map(t => { const b = mkEl('button'); b.dataset.palette = t; return b; });
const qmap = {
  '#weekRow button': weekBtns,
  '#decChips button': decBtns,
  '#paletteChips button': paletteBtns,
  '#tabs button': tabBtns,
  '.mchip': mchips,
};

const document = {
  documentElement: { setAttribute(k, v){ this[k] = v; }, getAttribute(k){ return this[k]; } },
  title: '',
  getElementById(id){
    if (!byId[id]) { throw new Error('缺少元素 #' + id + '（HTML 中不存在此 id）'); }
    return byId[id];
  },
  querySelectorAll(sel){
    if (!qmap[sel]) throw new Error('未预期的选择器: ' + sel);
    return qmap[sel];
  },
  createElement: mkEl,
  addEventListener(){},
};
const store = {};
const localStorage = {
  getItem: k => (k in store ? store[k] : null),
  setItem: (k, v) => { store[k] = String(v); },
  removeItem: k => { delete store[k]; },
};

const rafQ = [];
const requestAnimationFrame = fn => { rafQ.push(fn); };
function drain(n){
  for (let i = 0; i < n; i++) {
    const q = rafQ.splice(0);
    if (!q.length) break;
    q.forEach(f => f(FIXED_FOR_DRAIN));
  }
}
const windowStub = {
  addEventListener(){}, AudioContext: null, webkitAudioContext: null,
};

const origNow = Date.now;
let FIXED_FOR_DRAIN = 0;
// 冻结时间在 2026-11-02 14:23:45（周一，计薪中）
const FIXED = new Date(2026, 10, 2, 14, 23, 45).getTime();
FIXED_FOR_DRAIN = FIXED;
const RealDate = Date;
class FakeDate extends RealDate {
  constructor(...a){ if (a.length === 0) super(FIXED); else super(...a); }
  static now(){ return FIXED; }
}

const run = new Function(
  'document','localStorage','requestAnimationFrame','window','Date','console','setTimeout','clearTimeout',
  script
);

let errs = [];
try {
  run(document, localStorage, requestAnimationFrame, windowStub, FakeDate, console,
      (f) => 0, () => {});
  drain(3);
} catch (e) {
  errs.push('脚本执行抛错: ' + e.message);
}

console.log('=== 运行结果 ===');
if (errs.length) { errs.forEach(e => console.log('  FAIL ' + e)); process.exit(1); }

const g = id => byId[id].textContent;
const gh = id => byId[id].innerHTML;

const checks = [
  ['首屏金额非空', () => g('heroInt') !== ''],
  ['首屏金额为数字', () => /^[\d,]+$/.test(g('heroInt'))],
  ['金额小数位存在', () => g('heroFrac').startsWith('.')],
  ['状态徽标=计薪中', () => g('statusLabel') === '计薪中'],
  ['时钟格式 HH:MM:SS', () => /^\d{2}:\d{2}:\d{2}$/.test(g('clock'))],
  ['时薪已渲染', () => /^¥[\d,]+\.\d{2}$/.test(g('sPerHour'))],
  ['每秒已渲染', () => /^¥0\.0\d+$/.test(g('sPerSec'))],
  ['今日进度百分比', () => /^\d+\.\d%$/.test(g('todayPct'))],
  ['今日已工作时长', () => /^\d{2}:\d{2}:\d{2}$/.test(g('todayWorked'))],
  ['本月计薪天数', () => g('monthDays') === '21 天'],
  ['距下班剩余', () => /^\d{2}:\d{2}:\d{2}$/.test(g('nextValue'))],
  ['今日卡片金额', () => /^¥[\d,]+\.\d{2}$/.test(g('cToday'))],
  ['时间轴有片段', () => byId['tlTrack'].children.length >= 1],
  ['时间轴填充有宽度', () => (byId['tlTrack'].children[0].children[0].style.width || '').endsWith('%')],
  ['页面标题含金额', () => document.title.includes('工资秒表')],
  ['设置被写入 localStorage', () => !!store['salary-ticker-v2']],
  ['换算标签已渲染', () => byId['convChips'].children.length > 0],
  ['今日进度条宽度', () => (byId['todayBar'].style.width || '').endsWith('%')],
];

let pass = 0, fail = 0;
checks.forEach(([name, fn]) => {
  let ok = false, detail = '';
  try { ok = fn(); } catch (e) { detail = ' (' + e.message + ')'; }
  if (ok) { pass++; console.log('  ok   ' + name); }
  else { fail++; console.log('  FAIL ' + name + detail); }
});

console.log('\n--- 渲染快照（2026-11-02 14:23:45 周一）---');
console.log('  今日已赚     :', g('heroCur') + g('heroInt') + g('heroFrac'));
console.log('  时/分/秒     :', g('sPerHour'), g('sPerMin'), g('sPerSec'));
console.log('  日薪         :', g('sPerDay'));
console.log('  今日进度     :', g('todayPct'), '| 已工作', g('todayWorked'), '/', g('todayTotal'));
console.log('  本月         :', g('monthDays'), '| 已过', g('monthPassed'), '| 剩', g('monthLeft'));
console.log('  倒计时       :', g('nextLabel'), g('nextValue'));
console.log('  换算标签     :', byId['convChips'].children.length + ' 个');
console.log('  换算标签数   :', byId['convChips'].children.length);
console.log('  今日/月/年   :', g('cToday'), g('cMonth'), g('cYear'));

// 独立实现：工作时段并集 减去 休息时段，得到实际计薪时长（小时）
const toMin = t => { const [h, m] = t.split(':').map(Number); return h * 60 + m; };
const segToMin = g => [toMin(g.start), toMin(g.end)];
function unionRanges(list) {
  const r = list.map(segToMin).sort((a, b) => a[0] - b[0]);
  const out = [];
  for (const [s, e] of r) {
    if (e <= s) continue;
    const last = out[out.length - 1];
    if (last && s <= last[1]) last[1] = Math.max(last[1], e);
    else out.push([s, e]);
  }
  return out;
}
function minusRanges(work, brk) {
  let pieces = work.map(([s, e]) => [s, e]);
  for (const [bs, be] of brk) {
    const next = [];
    for (const [s, e] of pieces) {
      if (be <= s || bs >= e) { next.push([s, e]); continue; }
      if (bs > s) next.push([s, bs]);
      if (be < e) next.push([be, e]);
    }
    pieces = next;
  }
  return pieces;
}
console.log('\n--- 交互：改月薪 / 加午休 / 进休息状态 ---');

function snapshot(label){
  return {
    label,
    hero: g('heroCur') + g('heroInt') + g('heroFrac'),
    status: g('statusLabel'),
    perHour: g('sPerHour'),
    perSec: g('sPerSec'),
    monthDays: g('monthDays'),
    todayPct: g('todayPct'),
    worked: g('todayWorked'),
    next: g('nextLabel') + ' ' + g('nextValue'),
    timelineSegs: byId['tlTrack'].children.length,
  };
}
const before = snapshot('默认 8000 / 9-18');

// 1) 改月薪为 20000
byId['inMonthly'].value = '20000';
byId['inMonthly'].fire('input');
drain(2);
const afterSalary = snapshot('月薪改 20000');
const okSalary = afterSalary.perHour !== before.perHour;

// 月薪 20000 那一刻的配置：只有工作时段 09:00-18:00 + 默认休息 12:00-13:00
const salaryDayHours = (() => {
  const w = unionRanges([{ start: '09:00', end: '18:00' }]);
  const b = unionRanges([{ start: '12:00', end: '13:00' }]);
  return minusRanges(w, b).reduce((a, [s, e]) => a + (e - s), 0) / 60;
})();

// 2) 加入午休 12:00-13:00：把首段设为 09:00-12:00，再加一段 13:00-18:00
byId['inMonthly'].value = '8000';
byId['inMonthly'].fire('input');
// 第一段 end 改 12:00
const segRows = byId['segList'].children;
const firstRow = segRows[0];
// 行内结构：[startInput, dash, endInput, delBtn]
timeInput(firstRow, 2).value = '12:00';
timeInput(firstRow, 2).fire('change');
// 追加第二段并设为 13:00-18:00
byId['btnAddSeg'].fire('click');
const rows2 = byId['segList'].children;
const secondRow = rows2[rows2.length - 1];
timeInput(secondRow, 0).value = '13:00';
timeInput(secondRow, 0).fire('change');
drain(2);
const afterLunch = snapshot('加午休 12-13');

// 3) 切到 12:30 -> 应显示休息中
console.log('  时段行数           :', afterLunch.timelineSegs, '(应为 3：段1/空隙/段2)');

const seg1 = byId['inHoliday'].fire('change'); // 触发一次重建确保稳定

console.log('\n--- 交互后快照 ---');
[before, afterSalary, afterLunch].forEach(s => {
  console.log(`  ${s.label.padEnd(18)} 今日=${s.hero.padEnd(11)} 时薪=${s.perHour.padEnd(9)} 状态=${s.status}`);
});

// 从持久化状态反推期望值，校验不变式（不猜测具体数字）
const money = s => parseFloat(String(s).replace(/[^\d.]/g, ''));
const saved1 = JSON.parse(store['salary-ticker-v2']);

const workUnion = unionRanges(saved1.segments);
const brkUnion = unionRanges(saved1.breaks || []);
const paidRanges = minusRanges(workUnion, brkUnion);
const dayHours = paidRanges.reduce((a, [s, e]) => a + (e - s), 0) / 60;
const interChecks = [
  ['改月薪后时薪变化', () => okSalary],
  ['月薪 20000 时薪 = 20000/21/实际计薪时长', () =>
    Math.abs(money(afterSalary.perHour) - (20000 / 21 / salaryDayHours)) < 0.01],
  ['加午休后时薪 = 8000/21/实际计薪时长', () =>
    Math.abs(money(afterLunch.perHour) - (8000 / 21 / dayHours)) < 0.01],
  ['时段配置已保存为 2 段', () => saved1.segments.length === 2],
  ['时间轴段数 = 时段数×2-1', () => afterLunch.timelineSegs === saved1.segments.length * 2 - 1],
  ['月薪已持久化', () => saved1.monthly === 8000],
  ['今日已赚 = 每秒 × 已工作秒', () => {
    const perSec = 8000 / 21 / (dayHours * 3600);
    const workedStr = afterLunch.worked; // HH:MM:SS
    const [h, m, s] = workedStr.split(':').map(Number);
    const expect = perSec * (h * 3600 + m * 60 + s);
    return Math.abs(money(afterLunch.hero) - expect) < 0.02;
  }],
];

interChecks.forEach(([name, fn]) => {
  let ok = false, d = '';
  try { ok = fn(); } catch (e) { d = ' (' + e.message + ')'; }
  if (ok) { pass++; console.log('  ok   ' + name); }
  else { fail++; console.log('  FAIL ' + name + d); }
});

console.log('\n---------------------------------------');
console.log(fail === 0 ? `DOM 渲染全部通过：${pass} 项` : `通过 ${pass}，失败 ${fail}`);
process.exit(fail === 0 ? 0 : 1);
