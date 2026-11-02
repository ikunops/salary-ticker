// 针对本轮新增功能的测试：休息时段扣除 + 换算系统
const fs = require('fs');
const path = require('path');
const html = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');
const core = html.split('/* ==================== CORE-START ==================== */')[1]
                 .split('/* ==================== CORE-END ==================== */')[0];
const api = new Function(core + `
  return {normSegments,subtractBreaks,effectiveSegs,effectiveDaySeconds,dayWorkSeconds,
          dayStatusOf,monthData,computeAll,computeStatus,elapsedSecondsInSegs,secOfDay,
          CONV_PRESETS};
`)();

let pass = 0, fail = 0;
function eq(name, got, want, tol) {
  const ok = tol === undefined ? got === want : Math.abs(got - want) <= tol;
  if (ok) { pass++; console.log('  ok   ' + name + '  ->  ' + (typeof got === 'number' ? +got.toFixed(6) : got)); }
  else { fail++; console.log('  FAIL ' + name + '  got=' + got + ' want=' + want); }
}
const J = o => JSON.stringify(o);
const S = (o = {}) => Object.assign({
  monthly: 8000, currency: '¥',
  segments: [{ start: '09:00', end: '18:00' }],
  breaks: [],
  workdays: [1,2,3,4,5], holidayMode: 'cn', payBasis: 'actual',
  customOff: [], customWork: [], _hash: String(Math.random())
}, o);

console.log('\n=== 1. subtractBreaks 区间相减 ===');
eq('无休息时原样返回',
   J(api.subtractBreaks([{start:'09:00',end:'18:00'}], [])),
   J([{s:540,e:1080}]));
eq('9-18 扣掉 12-13 → 两段',
   J(api.subtractBreaks([{start:'09:00',end:'18:00'}], [{start:'12:00',end:'13:00'}])),
   J([{s:540,e:720},{s:780,e:1080}]));
eq('休息在中间切出两段，总时长 8h',
   api.effectiveDaySeconds(S({breaks:[{start:'12:00',end:'13:00'}]})), 8*3600);
eq('休息贴开头 → 9:00 变成 10:00 起',
   J(api.subtractBreaks([{start:'09:00',end:'18:00'}], [{start:'09:00',end:'10:00'}])),
   J([{s:600,e:1080}]));
eq('休息贴结尾 → 到 17:00 结束',
   J(api.subtractBreaks([{start:'09:00',end:'18:00'}], [{start:'17:00',end:'18:00'}])),
   J([{s:540,e:1020}]));
eq('休息完全覆盖工作 → 空',
   api.subtractBreaks([{start:'09:00',end:'18:00'}], [{start:'08:00',end:'19:00'}]).length, 0);
eq('休息与工作无交集 → 不变',
   api.effectiveDaySeconds(S({breaks:[{start:'19:00',end:'20:00'}]})), 9*3600);
eq('两段休息分别扣除',
   api.effectiveDaySeconds(S({breaks:[{start:'10:00',end:'10:15'},{start:'15:00',end:'15:30'}]})),
   9*3600 - 45*60);

console.log('\n=== 2. 多段工作 + 多段休息 组合 ===');
const combo = S({
  segments: [{start:'09:00',end:'12:00'},{start:'13:00',end:'18:00'}],
  breaks:   [{start:'10:30',end:'10:45'}]
});
eq('两段工作(8h) 再扣 15 分钟休息', api.effectiveDaySeconds(combo), 8*3600 - 15*60);
eq('有效区间数', api.effectiveSegs(combo).length, 3);

// 工作时段本身已断开（午休留在 segments 里）时，不要再重复扣同一段休息
const legacyStyle = S({
  segments: [{start:'09:00',end:'12:00'},{start:'13:00',end:'18:00'}],
  breaks:   [{start:'12:00',end:'13:00'}]
});
eq('间隙与休息重合 → 不重复扣，仍 8h', api.effectiveDaySeconds(legacyStyle), 8*3600);

console.log('\n=== 3. 休息时段内的计薪行为 ===');
const withBreak = S({breaks:[{start:'12:00',end:'13:00'}]});
const at = (h,m,s=0) => new Date(2026,10,2,h,m,s);
const eff = api.effectiveSegs(withBreak);
eq('12:30 落在休息内 → break', api.dayStatusOf(at(12,30), eff), 'break');
eq('11:00 → working', api.dayStatusOf(at(11,0), eff), 'working');
eq('13:30 → working', api.dayStatusOf(at(13,30), eff), 'working');
eq('12:30 已计薪秒数 = 3h（11:00-12:00 部分不含）', api.elapsedSecondsInSegs(at(12,30), eff), 3*3600);
eq('13:30 已计薪秒数 = 3.5h', api.elapsedSecondsInSegs(at(13,30), eff), 3.5*3600);
eq('18:00 = 8h', api.elapsedSecondsInSegs(at(18,0), eff), 8*3600);

console.log('\n=== 4. 休息扣除后的时薪变化 ===');
const noBrk = api.monthData(2026,10,S({breaks:[]}));
const hasBrk = api.monthData(2026,10,S({breaks:[{start:'12:00',end:'13:00'}]}));
eq('无休息 daySecs=9h', noBrk.daySecs, 9*3600);
eq('有休息 daySecs=8h', hasBrk.daySecs, 8*3600);
eq('breakSecs 记录被扣掉的 1h', hasBrk.breakSecs, 3600);
eq('grossSecs 仍为 9h', hasBrk.grossSecs, 9*3600);
eq('日薪相同（同为 8000/21）', hasBrk.perDay, noBrk.perDay, 1e-9);
eq('有休息时薪更高 = 8000/21/8', hasBrk.perHour, 8000/21/8, 1e-9);
eq('无休息时薪 = 8000/21/9', noBrk.perHour, 8000/21/9, 1e-9);
eq('每秒更快', hasBrk.perSecond, (8000/21)/(8*3600), 1e-12);

console.log('\n=== 5. 状态文案含休息信息 ===');
const d = api.computeAll(at(12,30), withBreak, {});
const st = api.computeStatus(at(12,30), withBreak, d);
eq('状态=break', st.code, 'break');
eq('标签=午休中', st.label, '午休中');
eq('状态对象不再带冗余 hint 文案', st.hint === undefined, true);
eq('距继续计薪 = 30min', st.nextSec, 1800);

console.log('\n=== 5b. 整点边界状态归属 ===');
const bSeg = api.effectiveSegs(S({breaks:[{start:'12:00',end:'13:00'}]}));
const st2 = (h,m,s=0) => api.dayStatusOf(at(h,m,s), bSeg);
eq('08:59:59 → before', st2(8,59,59), 'before');
eq('09:00:00 → working(上班整点开始计薪)', st2(9,0,0), 'working');
eq('11:59:59 → working', st2(11,59,59), 'working');
eq('12:00:00 → break(整点归入午休)', st2(12,0,0), 'break');
eq('12:59:59 → break', st2(12,59,59), 'break');
eq('13:00:00 → working(整点恢复计薪)', st2(13,0,0), 'working');
eq('17:59:59 → working', st2(17,59,59), 'working');
eq('18:00:00 → after(下班整点算已下班)', st2(18,0,0), 'after');
console.log('\n=== 6. 收入随时间单调不减（含休息）===');
let prev = -1, mono = true;
for (let sec = 9*3600; sec <= 18*3600; sec += 300) {
  const h = Math.floor(sec/3600), m = Math.floor(sec%3600/60);
  const dd = api.computeAll(at(h,m,0), withBreak, {});
  if (dd.todayEarned < prev - 1e-9) mono = false;
  prev = dd.todayEarned;
}
eq('全天今日已赚单调递增', mono, true);
eq('18:00 收盘 = 日薪', prev, 8000/21, 1e-6);

console.log('\n=== 7. 换算预设 ===');
eq('预设数量 ≥ 12', api.CONV_PRESETS.length >= 12, true);
eq('含奶茶', api.CONV_PRESETS.some(p => p.id === 'milktea'), true);
eq('含咖啡', api.CONV_PRESETS.some(p => p.id === 'coffee'), true);
eq('每项都有单价', api.CONV_PRESETS.every(p => p.price > 0), true);
eq('每项都有单位', api.CONV_PRESETS.every(p => p.unit.length > 0), true);

console.log('\n=== 13. 跨午夜班次支持 ===');
const midnight=S({segments:[{start:'18:00',end:'02:00'}],breaks:[]});
eq('跨午夜班次正常计入(8h)', api.effectiveDaySeconds(midnight), 8*3600);
eq('零长度时段被忽略',
   api.normSegments([{start:'09:00',end:'09:00'}]).length, 0);
eq('正常时段不受影响',
   api.effectiveDaySeconds(S({segments:[{start:'09:00',end:'18:00'}],breaks:[]})), 9*3600);
// 混合：一个正常 + 一个跨午夜，正常那个应仍然生效
const mixed=S({segments:[{start:'09:00',end:'12:00'},{start:'22:00',end:'02:00'}],breaks:[]});
eq('混合配置(白天3h+夜班4h)', api.effectiveDaySeconds(mixed), 7*3600);
console.log('\n---------------------------------------');
console.log(fail === 0 ? `全部通过：${pass} 项` : `通过 ${pass}，失败 ${fail}`);
process.exit(fail === 0 ? 0 : 1);
