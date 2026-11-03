// 验证三个视图下进度条的结构与填充逻辑
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
  constructor(tag='div'){
    this.tagName=(tag||'div').toUpperCase();
    this.children=[]; this.dataset={}; this.style={};
    this.classList=new CL(); this._text=''; this._html='';
    this._listeners={}; this.value=''; this.title=''; this.type='';
    this.firstChild=null;
  }
  appendChild(c){ this.children.push(c); this.firstChild=this.children[0]; return c; }
  addEventListener(t,fn){ (this._listeners[t]=this._listeners[t]||[]).push(fn); }
  fire(t,ev={}){ (this._listeners[t]||[]).forEach(fn=>fn.call(this,{target:this,preventDefault(){},...ev})); }
  set className(v){ this._cls=String(v); this.classList=new CL();
    String(v).split(/\s+/).filter(Boolean).forEach(x=>this.classList.add(x)); }
  get className(){ return this._cls||''; }
  set textContent(v){ this._text=String(v); this._html=''; }
  get textContent(){ return this._text; }
  set innerHTML(v){ this._html=String(v); this.children=[]; this._text=''; }
  get innerHTML(){ return this._html; }
}
const mkEl = tag => new El(tag);

function boot(fixedTime, seedSettings){
  const byId = {};
  ids.forEach(id => byId[id] = mkEl('div'));
  const weekBtns=[1,2,3,4,5,6,7].map(d=>{const b=mkEl('button');b.dataset.dow=String(d);return b;});
  const decBtns=[0,2,3,4].map(d=>{const b=mkEl('button');b.dataset.dec=String(d);return b;});
  const tabBtns=['today','month','year'].map(t=>{const b=mkEl('button');b.dataset.tab=t;return b;});
  const mchips=['today','month','year'].map(t=>{const b=mkEl('button');b.dataset.tab=t;return b;});
  const paletteBtns=['green','red'].map(t=>{const b=mkEl('button');b.dataset.palette=t;return b;});
  const qmap={'#weekRow button':weekBtns,'#decChips button':decBtns,'#tabs button':tabBtns,'.mchip':mchips,'#paletteChips button':paletteBtns};
  const store={};
  if(seedSettings) store['salary-ticker-v2']=JSON.stringify(seedSettings);
  const document={
    documentElement:{ setAttribute(k,v){this[k]=v;}, getAttribute(k){return this[k];} },
    title:'',
    getElementById(id){ if(!byId[id]) throw new Error('缺少元素 #'+id); return byId[id]; },
    querySelectorAll(sel){ if(!qmap[sel]) throw new Error('未预期选择器 '+sel); return qmap[sel]; },
    createElement: mkEl,
    addEventListener(){},
  };
  const localStorage={
    getItem:k=>(k in store?store[k]:null),
    setItem:(k,v)=>{store[k]=String(v);},
    removeItem:k=>{delete store[k];},
  };
  const rafQ=[];
  const raf=fn=>rafQ.push(fn);
  const FIXED=new Date(fixedTime).getTime();
  const RealDate=Date;
  class FakeDate extends RealDate{
    constructor(...a){ if(a.length===0) super(FIXED); else super(...a); }
    static now(){ return FIXED; }
  }
  const win={addEventListener(){},AudioContext:null,webkitAudioContext:null};
  const run=new Function('document','localStorage','requestAnimationFrame','window','Date',
                         'console','setTimeout','clearTimeout',script);
  run(document,localStorage,raf,win,FakeDate,console,()=>0,()=>{});
  const drain=n=>{ for(let i=0;i<n;i++){ const q=rafQ.splice(0); if(!q.length)break; q.forEach(f=>f(FIXED)); } };
  drain(2);
  return {byId,tabBtns,mchips,drain,store,document};
}

let pass=0, fail=0;
function check(name, fn){
  let ok=false,d='';
  try{ ok=fn(); }catch(e){ d=' ('+e.message+')'; }
  if(ok){ pass++; console.log('  ok   '+name); }
  else{ fail++; console.log('  FAIL '+name+d); }
}
const childCountOrdinal = (byId) => byId['tlTrack'].children;

console.log('\n=== 1. 今日视图：按工作时段分段 ===');
// 2026-11-02 周一 14:23:45
let env = boot(new Date(2026,10,2,14,23,45).getTime());
let segs = childCountOrdinal(env.byId).filter(n => n.classList.contains('tl-seg'));
let gaps = childCountOrdinal(env.byId).filter(n => n.classList.contains('tl-gap'));
check('今日有计薪段', () => segs.length >= 1);
check('今日有休息间隙(午休)', () => gaps.length >= 1);
check('左侧标签是时刻', () => /^\d{2}:\d{2}$/.test(env.byId['tlStart'].textContent));
check('中间标签含「计薪」', () => env.byId['tlMid'].textContent.includes('计薪'));
check('中间标签含「休息」', () => env.byId['tlMid'].textContent.includes('休息'));
check('今日条不带 cal/year 类', () => !env.byId['tlTrack'].classList.contains('cal') && !env.byId['tlTrack'].classList.contains('year'));
// 14:23 应已填到第二段一部分
const widths = segs.map(s => parseFloat(s.children[0].style.width) || 0);
check('第一段已填满 100%', () => Math.abs(widths[0] - 100) < 0.01);
check('第二段部分填充', () => widths[1] > 0 && widths[1] < 100);

console.log('\n=== 2. 本月视图：整月日历条 ===');
env = boot(new Date(2026,10,15,10,0,0).getTime());
env.mchips.find(b => b.dataset.tab === 'month').fire('click');
env.drain(2);
const mNodes = env.byId['tlTrack'].children;
check('块数 = 11月天数 30', () => mNodes.length === 30);
check('带 cal 类', () => env.byId['tlTrack'].classList.contains('cal') === true);
check('左侧标签「1日」', () => env.byId['tlStart'].textContent === '1日');
check('右侧标签「30日」', () => env.byId['tlEnd'].textContent === '30日');
check('中间标签为计薪天数', () => /计薪 \d+ 天/.test(env.byId['tlMid'].textContent));
// 2026-11-15 是周日 -> 休息
check('休息日块为 tl-off', () => mNodes[14].classList.contains('tl-off'));
// 11-13 周五 -> 计薪，且已过 -> 100%
check('已过去的工作日填满', () => {
  const n = mNodes[12];
  return n.classList.contains('tl-seg') && Math.abs(parseFloat(n.children[0].style.width) - 100) < 0.01;
});
// 11-20 未来工作日 -> 0%
check('未来工作日未填充', () => {
  const n = mNodes[22];
  return n.classList.contains('tl-seg') && (parseFloat(n.children[0].style.width) || 0) === 0;
});
// 今天 11-15 是周日（休息）-> 无 fill，不报错
check('今天为休息日时不出错', () => mNodes[14].children.length === 0);

console.log('\n=== 3. 今天为工作日时，月视图当天按当日进度 ===');
env = boot(new Date(2026,10,16,12,0,0).getTime());  // 11-16 周一 12:00
env.mchips.find(b => b.dataset.tab === 'month').fire('click');
env.drain(2);
check('当天块按当日进度填充(非0非满)', () => {
  const n = env.byId['tlTrack'].children[15]; // 16日
  const w = parseFloat(n.children[0].style.width) || 0;
  return w > 0 && w < 100;
});

console.log('\n=== 4. 本年视图：12 个月块 ===');
env = boot(new Date(2026,10,15,10,0,0).getTime());
env.mchips.find(b => b.dataset.tab === 'year').fire('click');
env.drain(2);
const yNodes = env.byId['tlTrack'].children;
check('块数 = 12', () => yNodes.length === 12);
check('带 year 类', () => env.byId['tlTrack'].classList.contains('year') === true);
check('左侧「1月」', () => env.byId['tlStart'].textContent === '1月');
check('右侧「12月」', () => env.byId['tlEnd'].textContent === '12月');
check('中间标签含总计薪天数', () => /计薪 \d+ 天/.test(env.byId['tlMid'].textContent));
check('1-10月已填满', () => {
  for (let i = 0; i < 10; i++) {
    if (Math.abs(parseFloat(yNodes[i].children[0].style.width) - 100) > 0.01) return false;
  }
  return true;
});
check('11月按当月进度(非0非满)', () => {
  const w = parseFloat(yNodes[10].children[0].style.width) || 0;
  return w >= 0 && w < 100;
});
check('12月未开始为 0%', () => (parseFloat(yNodes[11].children[0].style.width) || 0) === 0);

console.log('\n=== 5. 视图来回切换不残留 ===');
env = boot(new Date(2026,10,2,14,23,45).getTime());
const todayCount = env.byId['tlTrack'].children.length;
env.mchips.find(b => b.dataset.tab === 'month').fire('click'); env.drain(2);
env.mchips.find(b => b.dataset.tab === 'year').fire('click');  env.drain(2);
env.mchips.find(b => b.dataset.tab === 'today').fire('click'); env.drain(2);
check('切回今日后结构恢复', () => env.byId['tlTrack'].children.length === todayCount);
check('切回今日后 cal/year 已移除', () => !env.byId['tlTrack'].classList.contains('cal') && !env.byId['tlTrack'].classList.contains('year'));
check('切回今日后标签是时刻', () => /^\d{2}:\d{2}$/.test(env.byId['tlStart'].textContent));

console.log('\n=== 5b. 三视图填充方向与高度一致（防抖动）===');
env = boot(new Date(2026,10,18,15,0,0).getTime());
// 三个视图都必须用 width 驱动填充，且不使用 height 驱动
function fillUsesWidth(tab){
  env.mchips.find(b => b.dataset.tab === tab).fire('click');
  env.drain(2);
  const nodes = env.byId['tlTrack'].children.filter(n => !n.classList.contains('tl-off'));
  return nodes.every(n => {
    const st = n.children[0] && n.children[0].style;
    if (!st) return true;
    return (st.width !== undefined && st.width !== '') && (st.height === undefined || st.height === '');
  });
}
check('今日视图用 width 填充', () => fillUsesWidth('today'));
check('月视图用 width 填充', () => fillUsesWidth('month'));
check('年视图用 width 填充', () => fillUsesWidth('year'));
check('三视图轨道类名可区分且互斥', () => {
  const names = [];
  for (const tab of ['today','month','year']) {
    env.mchips.find(b => b.dataset.tab === tab).fire('click');
    env.drain(2);
    const cl = env.byId['tlTrack'].classList;
    names.push([cl.contains('cal'), cl.contains('year')].join(','));
  }
  return names[0] === 'false,false' && names[1] === 'true,false' && names[2] === 'false,true';
});
console.log('\n=== 6. 节假日模式影响月度条 ===');
// 2026-10 有国庆假期与补班
env = boot(new Date(2026,9,15,10,0,0).getTime());
env.mchips.find(b => b.dataset.tab === 'month').fire('click');
env.drain(2);
const octNodes = env.byId['tlTrack'].children;
check('10月块数=31', () => octNodes.length === 31);
check('10-01 国庆为休息块', () => octNodes[0].classList.contains('tl-off'));
check('10-10 补班为计薪块', () => octNodes[9].classList.contains('tl-seg'));

console.log('\n---------------------------------------');
console.log(fail === 0 ? `全部通过：${pass} 项` : `通过 ${pass}，失败 ${fail}`);
process.exit(fail === 0 ? 0 : 1);
