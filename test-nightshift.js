// 跨午夜班次（夜班）专项测试
const fs = require('fs');
const path = require('path');
const html = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');
const core = html.split('/* ==================== CORE-START ==================== */')[1]
                 .split('/* ==================== CORE-END ==================== */')[0];
const api = new Function(core + `
  return {normSegments,effectiveSegs,effectiveDaySeconds,monthData,computeAll,computeStatus,
          accruedSecondsInMonth,dayStatusOf,segsEndSec,segsStartSec,earnedSecsToday};
`)();

let pass = 0, fail = 0;
function eq(name, got, want, tol) {
  const ok = tol === undefined ? got === want : Math.abs(got - want) <= tol;
  if (ok) { pass++; console.log('  ok   ' + name + '  ->  ' + (typeof got === 'number' ? +got.toFixed(6) : got)); }
  else { fail++; console.log('  FAIL ' + name + '  got=' + got + ' want=' + want); }
}
const S = (o = {}) => Object.assign({
  monthly: 8000, currency: '¥',
  segments: [{ start: '09:00', end: '18:00' }], breaks: [],
  workdays: [1,2,3,4,5], holidayMode: 'cn', payBasis: 'actual',
  customOff: [], customWork: [], _hash: String(Math.random())
}, o);

console.log('\n=== 1. 归一化：跨午夜顺延到次日 ===');
eq('18:00-02:00 => 1080..1560',
   JSON.stringify(api.normSegments([{start:'18:00',end:'02:00'}])),
   JSON.stringify([{s:1080,e:1560}]));
eq('时长 8 小时', api.effectiveDaySeconds(S({segments:[{start:'18:00',end:'02:00'}]})), 8*3600);
eq('22:00-06:00 => 8 小时',
   api.effectiveDaySeconds(S({segments:[{start:'22:00',end:'06:00'}]})), 8*3600);
eq('23:30-00:30 => 1 小时',
   api.effectiveDaySeconds(S({segments:[{start:'23:30',end:'00:30'}]})), 3600);
eq('跨午夜的 segsEndSec > 86400', api.segsEndSec(api.effectiveSegs(S({segments:[{start:'18:00',end:'02:00'}]}))) > 86400, true);
eq('segsStartSec = 18:00', api.segsStartSec(api.effectiveSegs(S({segments:[{start:'18:00',end:'02:00'}]}))), 1080*60);

console.log('\n=== 2. 薪资率：月薪 ÷ 当月总工时 ===');
// 2026-11 有 21 个计薪日，每班 8h
const cfg = S({ segments: [{start:'18:00', end:'02:00'}] });
const md = api.monthData(2026, 10, cfg);
eq('计薪天数 21', md.workDays, 21);
eq('月总工时 = 21×8h', md.workDays * md.daySecs, 21*8*3600);
eq('每秒 = 8000 ÷ (21×8×3600)', md.perSecond, 8000/(21*8*3600), 1e-12);
eq('日薪 = 8000 ÷ 21', md.perDay, 8000/21, 1e-9);
eq('时薪 = 日薪 ÷ 8', md.perHour, 8000/21/8, 1e-9);
// 整月总工时不因跨午夜而丢或重复
eq('全月累计恰好 = 月薪',
   md.perSecond * (md.workDays * md.daySecs), 8000, 1e-9);

console.log('\n=== 3. 一班到底：周一18:00 → 周二02:00 ===');
const at = (d,h,m,s=0) => new Date(2026,10,d,h,m,s);
const pts = [
  [2,17,0,   0,      '周一上班前'],
  [2,18,0,   0,      '周一开工'],
  [2,22,0,   4*3600, '周一22:00'],
  [2,23,59,  6*3600-60,'周一23:59'],
  [3,0,30,   6.5*3600,'周二00:30(跨日)'],
  [3,2,0,    8*3600, '周二02:00下班'],
];
pts.forEach(([d,h,m,want,label]) => {
  const t = at(d,h,m);
  const r = api.computeAll(t, cfg, {});
  eq(label + ' 已计薪秒数', r.todayElapsed, want, 1);
});
eq('周二02:00 金额 = 整班日薪', api.computeAll(at(3,2,0), cfg, {}).todayEarned, 8000/21, 1e-9);

console.log('\n=== 4. 状态与倒计时 ===');
const st = (d,h,m) => api.computeStatus(at(d,h,m), cfg, api.computeAll(at(d,h,m), cfg, {}));
eq('周一17:00 未上班', st(2,17,0).code, 'before');
eq('周一17:00 距上班 1h', st(2,17,0).nextSec, 3600);
eq('周一18:00 计薪中', st(2,18,0).code, 'working');
eq('周一18:00 距下班 8h', st(2,18,0).nextSec, 8*3600);
eq('周二00:30 仍计薪中', st(3,0,30).code, 'working');
eq('周二00:30 距下班 1.5h', st(3,0,30).nextSec, 1.5*3600);
eq('周二02:00 已下班', st(3,2,0).code, 'after');
eq('周二02:00 倒计时非负', st(3,2,0).nextSec >= 0, true);
eq('周二03:00 倒计时非负', st(3,3,0).nextSec >= 0, true);

console.log('\n=== 5. 夜班 + 夜宵休息 ===');
const nightBreak = S({
  segments:[{start:'20:00', end:'04:00'}],   // 8h
  breaks:  [{start:'00:00', end:'00:30'}]    // 夜宵 30min（落在跨日部分）
});
eq('扣掉夜宵 => 7.5h', api.effectiveDaySeconds(nightBreak), 7.5*3600);
const nb = api.monthData(2026,10,nightBreak);
eq('夜宵被正确扣除', nb.daySecs, 7.5*3600);
// 周二 00:15 落在夜宵里
eq('周二00:15 处于休息', api.dayStatusOf(at(3,0,15), nb.segs, 86400+15*60), 'break');
eq('周二01:00 已恢复计薪', api.dayStatusOf(at(3,1,0), nb.segs, 86400+3600), 'working');

console.log('\n=== 6. 不跨午夜时行为不变（回归）===');
const day = S({ segments:[{start:'09:00',end:'18:00'}], breaks:[{start:'12:00',end:'13:00'}] });
const dm = api.monthData(2026,10,day);
eq('白天班 8h', dm.daySecs, 8*3600);
eq('白天班日薪', dm.perDay, 8000/21, 1e-9);
eq('10:00 已工作 1h', api.computeAll(at(2,10,0), day, {}).todayElapsed, 3600);
eq('12:30 午休冻结', api.computeAll(at(2,12,30), day, {}).todayElapsed, 3*3600);
eq('18:00 满 8h', api.computeAll(at(2,18,0), day, {}).todayElapsed, 8*3600);

console.log('\n=== 7. 跨月边界：月末夜班跨到下月 ===');
// 2026-10-30 周五 22:00 - 10-31 06:00，属于 10 月
const monthEnd = S({ segments:[{start:'22:00',end:'06:00'}] });  // 8h
eq('跨月夜班时长 8h', api.effectiveDaySeconds(monthEnd), 8*3600);
const tEnd = new Date(2026,9,31,3,0,0); // 10-31 03:00，仍在 10-30 那班里
const rEnd = api.computeAll(tEnd, monthEnd, {});
eq('10-31 03:00 已计薪 5h', rEnd.todayElapsed, 5*3600, 1);

console.log('\n=== 8. 深夜单点：23:00-23:30（不跨日）===');
eq('23:00-23:30 正常 30min',
   api.effectiveDaySeconds(S({segments:[{start:'23:00',end:'23:30'}]})), 1800);

console.log('\n=== 9. 连续两天夜班不重复计薪 ===');
// 周一18:00-周二02:00 与 周二18:00-周三02:00 是两个独立班次
let total = 0;
const c2 = S({ segments:[{start:'18:00',end:'02:00'}] });
[2,3].forEach(d => {
  const r = api.computeAll(new Date(2026,10,d,23,0,0), c2, {});
  total += r.todayElapsed;
});
eq('两个晚上各 5h 共 10h', total, 10*3600, 1);

console.log('\n---------------------------------------');
console.log(fail === 0 ? `全部通过：${pass} 项` : `通过 ${pass}，失败 ${fail}`);
process.exit(fail === 0 ? 0 : 1);
