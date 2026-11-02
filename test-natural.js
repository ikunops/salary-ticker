// 自然日口径（按当月天数 24h 连续等分）专项测试
const fs = require('fs');
const path = require('path');
const html = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');
const core = html.split('/* ==================== CORE-START ==================== */')[1]
                 .split('/* ==================== CORE-END ==================== */')[0];
const api = new Function(core + `
  return {monthData,computeAll,computeStatus,earnedSecsToday,accruedSecondsInMonth,yearEarnedOf};
`)();

let pass = 0, fail = 0;
function eq(name, got, want, tol) {
  const ok = tol === undefined ? got === want : Math.abs(got - want) <= tol;
  if (ok) { pass++; console.log('  ok   ' + name + '  ->  ' + (typeof got === 'number' ? +got.toFixed(8) : got)); }
  else { fail++; console.log('  FAIL ' + name + '  got=' + got + ' want=' + want); }
}
const S = (o = {}) => Object.assign({
  monthly: 6000, currency: '¥',
  segments: [{ start: '09:00', end: '18:00' }],
  breaks: [{ start: '12:00', end: '13:00' }],
  workdays: [1,2,3,4,5], holidayMode: 'cn', payBasis: 'natural',
  customOff: [], customWork: [], _hash: String(Math.random())
}, o);
const at = (d,h,m,s=0) => new Date(2026,10,d,h,m,s);

console.log('\n=== 1. 你给的例子：6000 元 / 30 天 ===');
const md = api.monthData(2026, 10, S());          // 2026-11 有 30 天
eq('当月天数 30', md.days, 30);
eq('日薪 = 6000/30 = 200', md.perDay, 200, 1e-12);
eq('时薪 = 200/24', md.perHour, 200/24, 1e-12);
eq('每分钟 = 200/24/60', md.perSecond*60, 200/24/60, 1e-12);
eq('每秒 = 200/24/3600', md.perSecond, 200/24/3600, 1e-15);
eq('计薪天数按设置工作日 = 21（非30）', md.workDays, 21);
eq('单日计薪秒数 = 86400', md.daySecs, 86400);

console.log('\n=== 2. 不看工作日/节假日：周日、国庆都照算 ===');
eq('11-01 周日不算工作日', api.monthData(2026,10,S()).list[0].info.work, false);
const oct = api.monthData(2026, 9, S());          // 2026-10 含国庆
eq('10 月计薪天数按工作日（含国庆调休）', oct.workDays, 18);
eq('10-01 国庆不算工作日', oct.list[0].info.work, false);
// 2026-02 含春节
const feb = api.monthData(2026, 1, S());
eq('2 月计薪天数按工作日', feb.workDays, 16);

console.log('\n=== 3. 不看每日工作时长：改时段不影响 ===');
const withSeg = api.monthData(2026, 10, S({ segments:[{start:'09:00',end:'18:00'}], breaks:[] }));
const noSeg   = api.monthData(2026, 10, S({ segments:[{start:'20:00',end:'23:00'}], breaks:[] }));
eq('不同时段 → 同一日薪', withSeg.perDay, noSeg.perDay);
eq('不同时段 → 同一每秒', withSeg.perSecond, noSeg.perSecond);
const emptySeg = api.monthData(2026, 10, S({ segments:[], breaks:[] }));
eq('甚至清空时段也一样', emptySeg.perDay, 200, 1e-12);

console.log('\n=== 4. 逐时刻累计（11-15 周日）===');
[[0,0,0,0],[6,0,0,50],[12,0,0,100],[18,0,0,150],[23,59,59,199.99768518518518]].forEach(([h,m,s,want])=>{
  const d = api.computeAll(at(15,h,m,s), S(), {});
  eq(`${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')} 已赚`, d.todayEarned, want, 1e-6);
});

console.log('\n=== 5. 全天连续计薪，永不停 ===');
[0,3,6,9,12,15,18,21,23].forEach(h => {
  const st = api.computeStatus(at(15,h,0), S(), api.computeAll(at(15,h,0), S(), {}));
  eq(`${String(h).padStart(2,'0')}:00 状态为计薪中`, st.code, 'working');
});
eq('午夜整点也在计薪', api.computeStatus(at(15,0,0), S(), api.computeAll(at(15,0,0), S(), {})).code, 'working');

console.log('\n=== 6. 月末/年初边界 ===');
const last = api.computeAll(at(30,23,59,59), S(), {});
eq('11-30 23:59:59 今日≈200(差1秒)', last.todayEarned, 200, 0.01);
eq('11-30 23:59:59 本月≈6000(差1秒)', last.monthEarned, 6000, 0.01);
const first = api.computeAll(at(1,0,0,0), S(), {});
eq('11-01 00:00 本月为 0', first.monthEarned, 0, 1e-9);

console.log('\n=== 7. 不同月份天数不同，日薪随之变化 ===');
eq('2 月 28 天 → 214.29', api.monthData(2026,1,S()).perDay, 6000/28, 1e-9);
eq('4 月 30 天 → 200', api.monthData(2026,3,S()).perDay, 200, 1e-9);
eq('7 月 31 天 → 193.55', api.monthData(2026,6,S()).perDay, 6000/31, 1e-9);

console.log('\n=== 8. 年累计 ===');
const yEnd = new Date(2026,11,31,23,59,59);
const dy = api.computeAll(yEnd, S(), {});
eq('年末本年累计 ≈ 72000', api.yearEarnedOf(yEnd, S(), dy, {}), 72000, 1e-2);

console.log('\n=== 9. 其他口径未被影响（回归）===');
const actual = api.monthData(2026,10,S({payBasis:'actual'}));
eq('actual 口径 21 天', actual.workDays, 21);
eq('actual 日薪 8000 之外用 6000', actual.perDay, 6000/21, 1e-9);
eq('actual 单日 8h', actual.daySecs, 8*3600);
const fixed = api.monthData(2026,10,S({payBasis:'fixed'}));
eq('fixed 时薪 = 6000/(21.75*8)', fixed.perHour, 6000/(21.75*8), 1e-9);
eq('natural 不返回 8h', api.monthData(2026,10,S()).daySecs === 8*3600, false);

console.log('\n=== 10. 自然口径下 todayPct 按 24h 计算 ===');
const noon = api.computeAll(at(15,12,0,0), S(), {});
eq('12:00 今日进度 = 50%', noon.todayPct, 0.5, 1e-9);
const six = api.computeAll(at(15,6,0,0), S(), {});
eq('06:00 今日进度 = 25%', six.todayPct, 0.25, 1e-9);

console.log('\n=== 11. 本月进度按设置的工作日统计（不是自然天数）===');
// 2026-11：30 天自然，21 个工作日
eq('自然天数 30 / 工作日 21', api.monthData(2026,10,S()).days, 30);
eq('工作日数 21', api.monthData(2026,10,S()).workDays, 21);
// 11-01 是周日
const n1 = api.computeAll(at(1,12,0,0), S(), {});
eq('11-01(周日) 已过工作日 = 0', n1.passedWorkdays, 0);
eq('11-01 剩余工作日 = 21', n1.remainWorkdays, 21);
eq('11-01 进度 = 0%', n1.monthPct, 0, 1e-9);
// 11-02 周一
const n2 = api.computeAll(at(2,12,0,0), S(), {});
eq('11-02(周一) 已过工作日 = 1', n2.passedWorkdays, 1);
eq('11-02 剩余 = 20', n2.remainWorkdays, 20);
eq('11-02 12:00 进度 ≈ 2.38%', n2.monthPct, (12/24)/21, 1e-9);
// 11-30 周一（月末最后一个工作日）
const n30 = api.computeAll(at(30,12,0,0), S(), {});
eq('11-30 已过工作日 = 21', n30.passedWorkdays, 21);
eq('11-30 剩余 = 0', n30.remainWorkdays, 0);
eq('11-30 12:00 进度 ≈ 97.6%', n30.monthPct, 20.5/21, 1e-9);

console.log('\n=== 12. 单价仍按自然天数，与工作日无关 ===');
// 改成只有周六周日上班，单价不应变化
const weekend = api.monthData(2026,10,S({workdays:[6,7], holidayMode:'none'}));
eq('周末班工作日数不同', weekend.workDays !== 21, true);
eq('但日薪仍是 200', weekend.perDay, 200, 1e-12);
eq('每秒仍是 200/24/3600', weekend.perSecond, 200/24/3600, 1e-15);

console.log('\n=== 13. 钱的累计按日历连续（周末也涨）===');
// 周日 11-01 也在涨钱（单价口径），但工作日进度不动
eq('11-01 周日 今日已赚 > 0', api.computeAll(at(1,12,0,0), S(), {}).todayEarned > 0, true);
eq('11-01 周日 今日已赚 = 100', api.computeAll(at(1,12,0,0), S(), {}).todayEarned, 100, 1e-9);

console.log('\n=== 14. 年累计在自然口径下 = 月薪×已过月数 ===');
const midYear = new Date(2026,5,15,12,0,0);  // 6-15
const dmid = api.computeAll(midYear, S(), {});
const ymid = api.yearEarnedOf(midYear, S(), dmid, {});
// 1-5 月共 5 个月 + 6 月半个月
const expect = 5*6000 + 6000/30*14 + 6000/30/24*(12);
eq('6-15 年累计 ≈ 5个月 + 半月', ymid, 5*6000 + (14*200) + (12*(200/24)), 1);
console.log('\n---------------------------------------');
console.log(fail === 0 ? `全部通过：${pass} 项` : `通过 ${pass}，失败 ${fail}`);
process.exit(fail === 0 ? 0 : 1);
