// 测试：换算物品删除后不再复活（convRemoved 机制）
const fs = require('fs');
const path = require('path');
const html = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');
const script = html.split('<script>')[1].split('</script>')[0];
const ids = new Set([...html.matchAll(/id="([^"]+)"/g)].map(m => m[1]));

class CL {
  constructor() { this._s = new Set(); }
  add(...c) { c.forEach(x => x && this._s.add(x)); }
  remove(...c) { c.forEach(x => this._s.delete(x)); }
  contains(c) { return this._s.has(c); }
  toggle(c, f) { if (f === undefined) { this._s.has(c) ? this._s.delete(c) : this._s.add(c); }
                 else if (f) this._s.add(c); else this._s.delete(c); }
}
class El {
  constructor(tag = 'div') {
    this.tagName = (tag || 'div').toUpperCase();
    this.children = []; this.dataset = {}; this.style = {};
    this.classList = new CL(); this._text = ''; this._html = '';
    this._listeners = {}; this.value = ''; this.title = ''; this.type = '';
    this.firstChild = null;
  }
  appendChild(c) { this.children.push(c); this.firstChild = this.children[0]; return c; }
  addEventListener(t, fn) { (this._listeners[t] = this._listeners[t] || []).push(fn); }
  fire(t, ev = {}) { (this._listeners[t] || []).forEach(fn => fn.call(this, { target: this, preventDefault() {}, ...ev })); }
  set className(v) { this._cls = String(v); this.classList = new CL();
    String(v).split(/\s+/).filter(Boolean).forEach(x => this.classList.add(x)); }
  get className() { return this._cls || ''; }
  set textContent(v) { this._text = String(v); this._html = ''; }
  get textContent() { return this._text; }
  set innerHTML(v) { this._html = String(v); this.children = []; this._text = ''; }
  get innerHTML() { return this._html; }
}
const mkEl = tag => new El(tag);

function boot(seed) {
  const byId = {};
  ids.forEach(id => { byId[id] = mkEl('div'); });
  const weekBtns = [1,2,3,4,5,6,7].map(d => { const b = mkEl('button'); b.dataset.dow = String(d); return b; });
  const decBtns  = [0,2,3,4].map(d => { const b = mkEl('button'); b.dataset.dec = String(d); return b; });
  const tabBtns  = ['today','month','year'].map(t => { const b = mkEl('button'); b.dataset.tab = t; return b; });
  const mchips   = ['today','month','year'].map(t => { const b = mkEl('button'); b.dataset.tab = t; return b; });
  const paletteBtns = ['green','red'].map(t => { const b = mkEl('button'); b.dataset.palette = t; return b; });
  const rankTabs = ['per_hour','work_hours','earned'].map(t => { const b = mkEl('button'); b.dataset.board = t; return b; });
  const rankScopes = ['global','city'].map(t => { const b = mkEl('button'); b.dataset.scope = t; return b; });
  const qmap = {
    '#weekRow button': weekBtns, '#decChips button': decBtns, '#tabs button': tabBtns,
    '.mchip': mchips, '#paletteChips button': paletteBtns,
    '.rank-tab': rankTabs, '.rank-scopebtn': rankScopes,
  };
  const store = {};
  if (seed) Object.assign(store, seed);
  const document = {
    documentElement: { setAttribute(k, v) { this[k] = v; }, getAttribute(k) { return this[k]; } },
    title: '',
    getElementById(id) { if (!byId[id]) throw new Error('缺少元素 #' + id); return byId[id]; },
    querySelectorAll(sel) { if (!qmap[sel]) throw new Error('未预期选择器 ' + sel); return qmap[sel]; },
    createElement: mkEl,
    addEventListener() {},
  };
  const localStorage = {
    getItem: k => (k in store ? store[k] : null),
    setItem: (k, v) => { store[k] = String(v); },
    removeItem: k => { delete store[k]; },
  };
  const rafQ = [];
  const raf = fn => rafQ.push(fn);
  const FIXED = new Date(2026, 10, 2, 14, 23, 45).getTime();
  const RealDate = Date;
  class FakeDate extends RealDate {
    constructor(...a) { if (a.length === 0) super(FIXED); else super(...a); }
    static now() { return FIXED; }
  }
  const win = { addEventListener() {}, AudioContext: null, webkitAudioContext: null };
  const run = new Function('document','localStorage','requestAnimationFrame','window','Date',
                           'console','setTimeout','clearTimeout','fetch', script);
  run(document, localStorage, raf, win, FakeDate, console, () => 0, () => {},
      () => Promise.reject(new Error('no network in test')));
  const drain = n => { for (let i = 0; i < n; i++) { const q = rafQ.splice(0); if (!q.length) break; q.forEach(f => f(FIXED)); } };
  drain(2);
  return { byId, drain, store, paletteBtns, rankTabs, rankScopes };
}

let pass = 0, fail = 0;
function ok(name, cond, extra) {
  if (cond) { pass++; console.log('  ok   ' + name); }
  else { fail++; console.log('  FAIL ' + name + (extra !== undefined ? '  ' + JSON.stringify(extra) : '')); }
}

console.log('\n=== 1. 初始状态：预设齐全 ===');
let env = boot();
let saved = JSON.parse(env.store['salary-ticker-v2']);
const initialCount = saved.conversions.length;
ok('默认有 12 个换算物品', initialCount === 12, initialCount);
ok('convRemoved 初始为空', !saved.convRemoved || saved.convRemoved.length === 0);

console.log('\n=== 2. 删除一个预设物品 ===');
// 找到第一个物品的删除按钮
let items = env.byId['convList'].children;
ok('渲染出物品列表', items.length === initialCount, items.length);
const firstId = saved.conversions[0].id;
const delBtn = items[0].children[5];   // tick, emo, name, price, unit, del
delBtn.fire('click');
env.drain(2);
saved = JSON.parse(env.store['salary-ticker-v2']);
ok('删除后数量 -1', saved.conversions.length === initialCount - 1, saved.conversions.length);
ok('被删的 id 记入 convRemoved', saved.convRemoved && saved.convRemoved.indexOf(firstId) >= 0, saved.convRemoved);
ok('列表里已不含该 id', !saved.conversions.some(c => c.id === firstId));

console.log('\n=== 3. 关键：重新加载后不复活 ===');
env = boot({ 'salary-ticker-v2': env.store['salary-ticker-v2'] });
saved = JSON.parse(env.store['salary-ticker-v2']);
ok('刷新后仍是 11 个', saved.conversions.length === initialCount - 1, saved.conversions.length);
ok('被删的物品没有复活', !saved.conversions.some(c => c.id === firstId), saved.conversions.map(c => c.id));

console.log('\n=== 4. 连续删多个 ===');
items = env.byId['convList'].children;
items[0].children[5].fire('click'); env.drain(2);
items = env.byId['convList'].children;
items[0].children[5].fire('click'); env.drain(2);
saved = JSON.parse(env.store['salary-ticker-v2']);
ok('删了 3 个剩 9 个', saved.conversions.length === initialCount - 3, saved.conversions.length);
ok('convRemoved 有 3 条', saved.convRemoved.length === 3, saved.convRemoved);

console.log('\n=== 5. 刷新后仍保持 ===');
env = boot({ 'salary-ticker-v2': env.store['salary-ticker-v2'] });
saved = JSON.parse(env.store['salary-ticker-v2']);
ok('两次刷新后仍是 9 个', saved.conversions.length === initialCount - 3, saved.conversions.length);

console.log('\n=== 6. 自定义物品也能删 ===');
env = boot();
env.byId['inConvName'].value = '珍珠奶茶';
env.byId['inConvPrice'].value = '18';
env.byId['btnAddConv'].fire('click');
env.drain(2);
saved = JSON.parse(env.store['salary-ticker-v2']);
const customIdx = saved.conversions.findIndex(c => c.name === '珍珠奶茶');
ok('自定义物品已添加', customIdx >= 0);
items = env.byId['convList'].children;
items[customIdx].children[5].fire('click');
env.drain(2);
saved = JSON.parse(env.store['salary-ticker-v2']);
ok('自定义物品已删除', !saved.conversions.some(c => c.name === '珍珠奶茶'));
ok('自定义删除不写入 convRemoved', saved.convRemoved.length === 0, saved.convRemoved);

console.log('\n---------------------------------------');
console.log(fail === 0 ? '全部通过：' + pass + ' 项' : '通过 ' + pass + '，失败 ' + fail);
process.exit(fail === 0 ? 0 : 1);
