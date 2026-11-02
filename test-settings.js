// 验证：旧版 v1 设置迁移、换算标签渲染、休息时段增删
const fs = require('fs');
const path = require('path');
const html = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');
const script = html.split('<script>')[1].split('</script>')[0];

const ids = new Set([...html.matchAll(/id="([^"]+)"/g)].map(m => m[1]));

class CL {
  constructor(){ this._s = new Set(); }
  add(...c){ c.forEach(x => x && this._s.add(x)); }
  remove(...c){ c.forEach(x => this._s.delete(x)); }
  contains(c){ return this._s.has(c); }
  toggle(c, f){ if (f === undefined) { this._s.has(c) ? this._s.delete(c) : this._s.add(c); }
                else if (f) this._s.add(c); else this._s.delete(c); }
}
class El {
  constructor(tag = 'div'){
    this.tagName = (tag || 'div').toUpperCase();
    this.children = []; this.dataset = {}; this.style = {};
    this.classList = new CL(); this._text = ''; this._html = '';
    this._listeners = {}; this.value = ''; this.title = ''; this.disabled = false;
    this.firstChild = null; this.type = '';
  }
  appendChild(c){ this.children.push(c); this.firstChild = this.children[0]; return c; }
  addEventListener(t, fn){ (this._listeners[t] = this._listeners[t] || []).push(fn); }
  fire(t, ev = {}){ (this._listeners[t] || []).forEach(fn => fn.call(this, { target: this, preventDefault(){}, ...ev })); }
  set className(v){ this._cls = String(v); this.classList = new CL();
    String(v).split(/\s+/).filter(Boolean).forEach(x => this.classList.add(x)); }
  get className(){ return this._cls || ''; }
  set textContent(v){ this._text = String(v); this._html = ''; }
  get textContent(){ return this._text; }
  set innerHTML(v){ this._html = String(v); this.children = []; this._text = ''; }
  get innerHTML(){ return this._html; }
}
const mkEl = tag => new El(tag);
// 兼容 time-wrap 包装：取出某列对应的时间输入框
function timeInput(row, idx){
  const cell = row.children[idx];
  return (cell && cell.children && cell.children.length) ? cell.children[0] : cell;
}

function makeEnv(seed){
  const byId = {};
  ids.forEach(id => { byId[id] = mkEl('div'); });
  const weekBtns = [1,2,3,4,5,6,7].map(d => { const b = mkEl('button'); b.dataset.dow = String(d); return b; });
  const decBtns  = [0,2,3,4].map(d => { const b = mkEl('button'); b.dataset.dec = String(d); return b; });
  const tabBtns  = ['today','month','year'].map(t => { const b = mkEl('button'); b.dataset.tab = t; return b; });
  const mchips   = ['today','month','year'].map(t => { const b = mkEl('button'); b.dataset.tab = t; return b; });
  const themeBtns = ['dark','light','red'].map(t => { const b = mkEl('button'); b.dataset.theme = t; return b; });
  const qmap = { '#weekRow button': weekBtns, '#decChips button': decBtns, '#themeChips button': themeBtns,
                 '#tabs button': tabBtns, '.mchip': mchips };
  const store = {};
  if (seed) Object.assign(store, seed);
  const document = {
    documentElement: { setAttribute(k, v){ this[k] = v; }, getAttribute(k){ return this[k]; } },
    title: '',
    getElementById(id){ if (!byId[id]) throw new Error('缺少元素 #' + id); return byId[id]; },
    querySelectorAll(sel){ if (!qmap[sel]) throw new Error('未预期选择器 ' + sel); return qmap[sel]; },
    createElement: mkEl,
    addEventListener(){},
  };
  const localStorage = {
    getItem: k => (k in store ? store[k] : null),
    setItem: (k, v) => { store[k] = String(v); },
    removeItem: k => { delete store[k]; },
  };
  const rafQ = [];
  const requestAnimationFrame = fn => { rafQ.push(fn); };
  return { byId, document, localStorage, store, rafQ, requestAnimationFrame, weekBtns, decBtns, tabBtns, mchips };
}

const FIXED = new Date(2026, 10, 2, 14, 23, 45).getTime();
const RealDate = Date;
class FakeDate extends RealDate {
  constructor(...a){ if (a.length === 0) super(FIXED); else super(...a); }
  static now(){ return FIXED; }
}
const windowStub = { addEventListener(){}, AudioContext: null, webkitAudioContext: null };

function boot(seed){
  const env = makeEnv(seed);
  function drain(n){
    for (let i = 0; i < n; i++) {
      const q = env.rafQ.splice(0);
      if (!q.length) break;
      q.forEach(f => f(FIXED));
    }
  }
  const run = new Function('document','localStorage','requestAnimationFrame','window','Date',
                           'console','setTimeout','clearTimeout', script);
  run(env.document, env.localStorage, env.requestAnimationFrame, windowStub, FakeDate, console, () => 0, () => {});
  drain(3);
  return Object.assign(env, { drain });
}

let pass = 0, fail = 0;
function check(name, fn){
  let ok = false, d = '';
  try { ok = fn(); } catch (e) { d = ' (' + e.message + ')'; }
  if (ok) { pass++; console.log('  ok   ' + name); }
  else { fail++; console.log('  FAIL ' + name + d); }
}

console.log('=== 1. 全新安装（无历史数据）===');
let env = boot();
let saved = JSON.parse(env.store['salary-ticker-v2']);
check('默认含休息 12:00-13:00', () => saved.breaks.length === 1 &&
      saved.breaks[0].start === '12:00' && saved.breaks[0].end === '13:00');
check('默认工作时段 09:00-18:00', () => saved.segments[0].start === '09:00' && saved.segments[0].end === '18:00');
check('默认换算项有开启的', () => saved.conversions.filter(c => c.on).length >= 2);
check('换算项数量 ≥ 12', () => saved.conversions.length >= 12);
check('休息行已渲染到 UI', () => env.byId['breakList'].children.length === 1);
check('换算列表已渲染', () => env.byId['convList'].children.length >= 12);
check('主界面换算标签已显示', () => env.byId['convChips'].children.length >= 1);
check('状态=午休中(14:23应为计薪中)', () => env.byId['statusLabel'].textContent === '计薪中');
check('时薪按 8h 计 = 47.62', () =>
      Math.abs(parseFloat(env.byId['sPerHour'].textContent.replace(/[^\d.]/g,'')) - 8000/21/8) < 0.01);
check('休息时段已渲染', () => env.byId['breakList'].children.length === 1);

console.log('\n=== 2. 从 v1 旧设置迁移 ===');
const v1 = {
  monthly: 12345, currency: '¥',
  segments: [{ start: '08:30', end: '17:30' }],
  workdays: [1,2,3,4,5], holidayMode: 'cn', payBasis: 'actual',
  decimals: 2, theme: 'light', sound: false,
  showMilk: true, milkPrice: 22,
  customOff: [], customWork: [], heroTab: 'month'
};
env = boot({ 'salary-ticker-v1': JSON.stringify(v1) });
saved = JSON.parse(env.store['salary-ticker-v2']);
check('月薪迁移过来', () => saved.monthly === 12345);
check('工作时段迁移过来', () => saved.segments[0].start === '08:30');
check('旧 milkPrice 迁到奶茶单价', () => {
  const mt = saved.conversions.find(c => c.id === 'milktea');
  return mt && mt.price === 22 && mt.on === true;
});
check('theme 迁移为 light', () => saved.theme === 'light');
check('showConv 由旧 showMilk 推导', () => saved.showConv === true);
check('旧数据无 breaks → 补空数组', () => Array.isArray(saved.breaks) && saved.breaks.length === 0);
check('启动后主题已应用到 html', () => env.document.documentElement['data-theme'] === 'light');

console.log('\n=== 3. 添加 / 删除休息时段 ===');
env = boot();
const beforeCount = env.byId['breakList'].children.length;
env.byId['btnAddBreak'].fire('click');
env.drain(2);
check('添加休息后数量 +1', () => env.byId['breakList'].children.length === beforeCount + 1);
saved = JSON.parse(env.store['salary-ticker-v2']);
check('新增休息已持久化', () => saved.breaks.length === 2);

// 删除刚加的
const rows = env.byId['breakList'].children;
const lastRow = rows[rows.length - 1];
lastRow.children[3].fire('click');   // ✕
env.drain(2);
saved = JSON.parse(env.store['salary-ticker-v2']);
check('删除休息后回到 1 段', () => saved.breaks.length === 1);

// 休息可以删到 0 段
const rows2 = env.byId['breakList'].children;
rows2[0].children[3].fire('click');
env.drain(2);
saved = JSON.parse(env.store['salary-ticker-v2']);
check('休息允许删到 0 段', () => saved.breaks.length === 0);

console.log('\n=== 4. 工作时段至少保留一段 ===');
env = boot();
const segRows = env.byId['segList'].children;
segRows[0].children[3].fire('click');
env.drain(2);
saved = JSON.parse(env.store['salary-ticker-v2']);
check('最后一个工作时段不可删除', () => saved.segments.length === 1);

console.log('\n=== 5. 换算开关与自定义物品 ===');
env = boot();
saved = JSON.parse(env.store['salary-ticker-v2']);
const onBefore = saved.conversions.filter(c => c.on).length;
// 点击第一个未开启项的勾选框
const items = env.byId['convList'].children;
let target = -1;
saved.conversions.forEach((c, i) => { if (!c.on && target < 0) target = i; });
items[target].children[0].fire('click');   // tick
env.drain(2);
saved = JSON.parse(env.store['salary-ticker-v2']);
check('勾选后开启项 +1', () => saved.conversions.filter(c => c.on).length === onBefore + 1);
check('主界面标签随之增加', () => env.byId['convChips'].children.length === onBefore + 1);

// 新增自定义物品
env.byId['inConvName'].value = '珍珠奶茶';
env.byId['inConvPrice'].value = '18';
env.byId['btnAddConv'].fire('click');
env.drain(2);
saved = JSON.parse(env.store['salary-ticker-v2']);
check('自定义物品已添加', () => saved.conversions.some(c => c.name === '珍珠奶茶' && c.price === 18 && c.on));
check('自定义物品出现在列表', () => env.byId['convList'].children.length === saved.conversions.length);

// 改单价
const items2 = env.byId['convList'].children;
const priceInput = items2[0].children[3];
priceInput.value = '99';
priceInput.fire('input');
env.drain(2);
saved = JSON.parse(env.store['salary-ticker-v2']);
check('改单价已生效', () => saved.conversions[0].price === 99);

console.log('\n=== 5c. 底部汇总卡片 ===');
env = boot();
check('三个汇总卡片都渲染了金额', () => {
  const t = env.byId['cToday'].textContent;
  const m = env.byId['cMonth'].textContent;
  const y = env.byId['cYear'].textContent;
  return /^¥[\d,]+\.\d{2}$/.test(t) && /^¥[\d,]+\.\d{2}$/.test(m) && /^¥[\d,]+\.\d{2}$/.test(y);
});
check('本月 >= 今日', () => {
  const num = s => parseFloat(String(s).replace(/[^\d.]/g,''));
  return num(env.byId['cMonth'].textContent) >= num(env.byId['cToday'].textContent);
});
check('本年 >= 本月', () => {
  const num = s => parseFloat(String(s).replace(/[^\d.]/g,''));
  return num(env.byId['cYear'].textContent) >= num(env.byId['cMonth'].textContent);
});
// 点卡片应切换顶部视图：用「本年」验证，因为本年累计必然大于今日
const todayBtn = env.mchips.find(b => b.dataset.tab === 'today');
const yearBtn  = env.mchips.find(b => b.dataset.tab === 'year');
const num = s => parseFloat(String(s).replace(/[^\d.]/g,''));
todayBtn.fire('click'); env.drain(2);
const todayHero = num(env.byId['heroInt'].textContent);
yearBtn.fire('click'); env.drain(2);
const yearHero = num(env.byId['heroInt'].textContent);
check('点「本年」卡片后主金额切到本年累计(更大)', () => yearHero > todayHero);
check('切换后顶部 tab 高亮同步', () =>
  env.tabBtns.find(b => b.dataset.tab === 'year').classList.contains('active') === true);
console.log('\n=== 6. 关闭换算总开关 ===');
env.byId['tglConv'].fire('click');
env.drain(2);
check('关闭后主界面无换算标签', () => env.byId['convChips'].children.length === 0);
env.byId['tglConv'].fire('click');
env.drain(2);
check('重新开启后标签恢复', () => env.byId['convChips'].children.length > 0);

console.log('\n---------------------------------------');
console.log(fail === 0 ? `全部通过：${pass} 项` : `通过 ${pass}，失败 ${fail}`);
process.exit(fail === 0 ? 0 : 1);
