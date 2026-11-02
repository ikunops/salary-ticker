const fs = require('fs');
const path = require('path');

const html = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');
const core = html.split('/* ==================== CORE-START ==================== */')[1]
                 .split('/* ==================== CORE-END ==================== */')[0];

const api = new Function(core + `
  return {CN_HOLIDAYS,dateKey,isoDow,normSegments,dayWorkSeconds,elapsedSecondsInSegs,
          dayStatusOf,dayInfo,monthData,accruedSecondsInMonth,nextWorkStart,computeAll,
          computeStatus,yearEarnedOf,fmtDur,fmtMoney,pad2,minToHM,hmToMin};
`)();

const S = (o = {}) => Object.assign({
  monthly: 8000,
  currency: '¥',
  segments: [{start:'09:00', end:'18:00'}],
  workdays: [1,2,3,4,5],
  holidayMode: 'cn',
  payBasis: 'actual',
  decimals: 4,
  customOff: [], customWork: [],
}, o, { _hash: Math.random().toString(36) });

let pass = 0, fail = 0;
function eq(name, got, want, tol) {
  const ok = tol === undefined ? got === want : Math.abs(got - want) <= tol;
  if (ok) { pass++; console.log('  ok   ' + name + '  ->  ' + got); }
  else { fail++; console.log('  FAIL ' + name + '  got=' + got + ' want=' + want); }
}

console.log('\n=== 1. 基础时段解析 ===');
eq('9-18 时长(秒)', api.dayWorkSeconds([{start:'09:00',end:'18:00'}]), 9*3600);
eq('两段含午休', api.dayWorkSeconds([{start:'09:00',end:'12:00'},{start:'13:00',end:'18:00'}]), 8*3600);
eq('乱序自动排序', JSON.stringify(api.normSegments([{start:'13:00',end:'18:00'},{start:'09:00',end:'12:00'}])),
   JSON.stringify([{s:540,e:720},{s:780,e:1080}]));
eq('跨午夜段顺延到次日(18:00-09:00 => 1080-1980)', JSON.stringify(api.normSegments([{start:'18:00',end:'09:00'}])), JSON.stringify([{s:1080,e:1980}]));
eq('零长度段被忽略', api.normSegments([{start:'09:00',end:'09:00'}]).length, 0);

console.log('\n=== 1b. 重叠时段合并（防重复计薪）===');
eq('9-13 与 12-18 重叠合并为 1 段', api.normSegments([{start:'09:00',end:'13:00'},{start:'12:00',end:'18:00'}]).length, 1);
eq('重叠合并后时长 9h', api.dayWorkSeconds([{start:'09:00',end:'13:00'},{start:'12:00',end:'18:00'}]), 9*3600);
eq('相接 9-12/12-18 也合并', api.normSegments([{start:'09:00',end:'12:00'},{start:'12:00',end:'18:00'}]).length, 1);
eq('有间隔的两段不合并', api.normSegments([{start:'09:00',end:'12:00'},{start:'13:00',end:'18:00'}]).length, 2);
eq('包含关系 (9-18 + 10-11) 合并', api.dayWorkSeconds([{start:'09:00',end:'18:00'},{start:'10:00',end:'11:00'}]), 9*3600);

console.log('\n=== 2. 时刻状态判定 ===');
const seg = [{start:'09:00',end:'12:00'},{start:'13:00',end:'18:00'}];
const at = (h,m,s=0) => new Date(2026,10,2,h,m,s);
eq('08:30 before', api.dayStatusOf(at(8,30), seg), 'before');
eq('10:00 working', api.dayStatusOf(at(10,0), seg), 'working');
eq('12:30 break',   api.dayStatusOf(at(12,30), seg), 'break');
eq('18:30 after',   api.dayStatusOf(at(18,30), seg), 'after');

console.log('\n=== 3. 秒级累计精度 ===');
eq('10:00 已工作秒', api.elapsedSecondsInSegs(at(10,0), seg), 3600);
eq('12:30 已工作秒(午休不计)', api.elapsedSecondsInSegs(at(12,30), seg), 3*3600);
eq('18:00 已工作秒', api.elapsedSecondsInSegs(at(18,0), seg), 8*3600);
eq('09:00:01 已工作秒', api.elapsedSecondsInSegs(at(9,0,1), [{start:'09:00',end:'18:00'}]), 1);

console.log('\n=== 4. 月薪拆秒（2026-11，周三=2日） ===');
// 2026-11: 周一到周五共 21 个工作日，无法定节假日
let d = api.computeAll(at(10,0), S(), {});
eq('11月工作日数', d.md.workDays, 21);
eq('日薪', d.perDay, 8000/21, 1e-9);
eq('每秒', d.perSecond, (8000/21)/(9*3600), 1e-12);
eq('时薪', d.perHour, (8000/21)/9, 1e-9);
eq('10点今日已赚', d.todayEarned, (8000/21)*(3600/(9*3600)), 1e-9);

console.log('\n=== 5. 货币格式 ===');
eq('千分位整数', api.fmtMoney(12345.6789, 2), '12,345.68');
eq('四位小数', api.fmtMoney(0.00211, 4), '0.0021');
eq('零位小数', api.fmtMoney(9.9, 0), '10');
eq('负值', api.fmtMoney(-1234.5, 2), '-1,234.50');

console.log('\n=== 6. 时长格式 ===');
eq('1小时1分1秒', api.fmtDur(3661), '01:01:01');
eq('跨天统一用 HH:MM:SS', api.fmtDur(90000), '25:00:00');

console.log('\n=== 7. 法定节假日 / 调休 ===');
const hol = [{start:'09:00',end:'18:00'}];
const info = (y,m,dd) => api.dayInfo(new Date(y,m-1,dd), S({segments:hol}));
eq('2026-10-01 国庆 不上班', info(2026,10,1).work, false);
eq('2026-10-01 名称', info(2026,10,1).name, '国庆节');
eq('2026-10-10 周六补班 上班', info(2026,10,10).work, true);
eq('2026-10-11 周日 不上班', info(2026,10,11).work, false);
eq('2026-02-16 除夕 不上班', info(2026,2,16).work, false);
eq('2026-02-28 周六补班 上班', info(2026,2,28).work, true);
// 2026-02 工作日：2/2-2/6,2/9-2/13,2/24-2/27,2/28补班 = 15
const feb = api.monthData(2026, 1, S({segments:hol}));
eq('2026年2月计薪天数', feb.workDays, 16);
// 2026-10：10/1~10/7休，10/10补班；工作日=10/8,9,10,12~16,19~23,26~30 = 19
const oct = api.monthData(2026, 9, S({segments:hol}));
eq('2026年10月计薪天数', oct.workDays, 18);

console.log('\n=== 8. 关闭节假日模式 ===');
const noHol = api.monthData(2026, 9, S({segments:hol, holidayMode:'none'}));
eq('10月按纯周末算', noHol.workDays, 22);

console.log('\n=== 9. 21.75 固定口径 ===');
const fx = api.monthData(2026, 10, S({segments:hol, payBasis:'fixed'}));
eq('固定口径时薪', fx.perHour, 8000/(21.75*8), 1e-9);
eq('固定口径日薪(9h班)', fx.perDay, (8000/21.75/8)*9, 1e-9);

console.log('\n=== 10. 状态与倒计时 ===');
const st = api.computeStatus(at(10,0), S({segments:seg}), api.computeAll(at(10,0), S({segments:seg}), {}));
eq('计薪中', st.code, 'working');
eq('距下班(18:00) = 8h', st.nextSec, 8*3600);
const st2 = api.computeStatus(at(12,30), S({segments:seg}), api.computeAll(at(12,30), S({segments:seg}), {}));
eq('午休中', st2.code, 'break');
eq('距继续 30min', st2.nextSec, 1800);
// 周六 2026-10-31 休息日，下次上班应为 2026-11-02 09:00
const sat = new Date(2026,9,31,15,0,0);
const st3 = api.computeStatus(sat, S({segments:hol}), api.computeAll(sat, S({segments:hol}), {}));
eq('周六休息', st3.code, 'rest');
const nw = api.nextWorkStart(sat, S({segments:hol}));
eq('下次上班日期', api.dateKey(nw), '2026-11-02');
eq('下次上班时间', nw.getHours()+':'+nw.getMinutes(), '9:0');

console.log('\n=== 11. 月末/年累计一致性 ===');
const nov30 = new Date(2026,10,30,23,0,0);
const d30 = api.computeAll(nov30, S(), {});
eq('11月末今日已赚=整日薪', d30.todayEarned, d30.perDay, 1e-9);
eq('11月末本月已赚=月薪', d30.monthEarned, 8000, 1e-6);
// 12月15日看全年
const dec = new Date(2026,11,15,10,0,0);
const Sc = S(), cacheC = {};
const ddec = api.computeAll(dec, Sc, cacheC);
const yr = api.yearEarnedOf(dec, Sc, ddec, cacheC);
// 独立逐月累计校验（不依赖被缓存的实现）
let naive = 0;
for (let mm = 0; mm < 12; mm++) {
  const md = api.monthData(2026, mm, Sc);
  naive += md.perSecond * api.accruedSecondsInMonth(2026, mm, dec, Sc, md);
}
eq('年累计与逐月累加一致', yr, naive, 1e-6);
eq('12月15日年累计 > 11个月月薪', yr > 8000*11, true);
eq('年累计 < 12个月月薪', yr < 8000*12, true);

console.log('\n=== 12. 自定义休息/上班 ===');
const c1 = api.dayInfo(new Date(2026,10,3), S({segments:hol, customOff:['2026-11-03']}));
eq('自定义休息', c1.work, false);
const c2 = api.dayInfo(new Date(2026,10,7), S({segments:hol, customWork:['2026-11-07']}));
eq('自定义周六上班', c2.work, true);

console.log('\n---------------------------------------');
console.log(fail === 0 ? `全部通过：${pass} 项` : `通过 ${pass}，失败 ${fail}`);
process.exit(fail === 0 ? 0 : 1);
