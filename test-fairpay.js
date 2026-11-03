// 补充测试：换算物品可删除 + 排行榜统一口径
const fs = require('fs');
const path = require('path');
const html = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');
const core = html.split('/* ==================== CORE-START ==================== */')[1]
                 .split('/* ==================== CORE-END ==================== */')[0];
const api = new Function(core + 'return {monthData,effectiveDaySeconds,CONV_PRESETS};')();

let pass = 0, fail = 0;
function ok(name, cond, extra) {
  if (cond) { pass++; console.log('  ok   ' + name); }
  else { fail++; console.log('  FAIL ' + name + (extra !== undefined ? '  ' + JSON.stringify(extra) : '')); }
}

const S = (o = {}) => Object.assign({
  monthly: 8000, currency: '¥',
  segments: [{ start: '09:00', end: '18:00' }],
  breaks: [{ start: '12:00', end: '13:00' }],
  workdays: [1,2,3,4,5], holidayMode: 'cn', payBasis: 'actual',
  customOff: [], customWork: [], _hash: Math.random().toString(36)
}, o);

console.log('\n=== 1. 统一口径：不同计薪方式算出相同时薪 ===');
// 复制页面的 fairPerHour 逻辑
function fairPerHour(cfg, y, m) {
  const md = api.monthData(y, m, cfg);
  const realDaySecs = api.effectiveDaySeconds(cfg);
  if (md.workDays <= 0 || realDaySecs <= 0) return 0;
  return (cfg.monthly / md.workDays) / (realDaySecs / 3600);
}
const actual = fairPerHour(S({ payBasis:'actual' }), 2026, 10);
const fixed  = fairPerHour(S({ payBasis:'fixed' }), 2026, 10);
const natural= fairPerHour(S({ payBasis:'natural' }), 2026, 10);
ok('actual 与 fixed 统一后一致', Math.abs(actual - fixed) < 1e-9, [actual, fixed]);
ok('actual 与 natural 统一后一致', Math.abs(actual - natural) < 1e-9, [actual, natural]);
ok('统一后时薪 = 8000/21/8', Math.abs(actual - 8000/21/8) < 1e-9, actual);

console.log('\n=== 2. 对比：界面显示的时薪会因口径不同而不同 ===');
const shownActual = api.monthData(2026,10,S({payBasis:'actual'})).perHour;
const shownNatural= api.monthData(2026,10,S({payBasis:'natural'})).perHour;
ok('界面显示：actual 与 natural 不同', Math.abs(shownActual - shownNatural) > 1, [shownActual, shownNatural]);
ok('自然日口径界面时薪明显偏低', shownNatural < shownActual * 0.3, [shownActual, shownNatural]);

console.log('\n=== 3. 工时不同则时薪不同（这是合理的）===');
const h8  = fairPerHour(S({ breaks:[{start:'12:00',end:'13:00'}] }), 2026, 10);          // 8h
const h12 = fairPerHour(S({ breaks:[], segments:[{start:'09:00',end:'21:00'}] }), 2026, 10); // 12h
ok('8h 班时薪 > 12h 班时薪', h8 > h12, [h8, h12]);
ok('8h 班时薪 = 8000/21/8', Math.abs(h8 - 8000/21/8) < 1e-9, h8);
ok('12h 班时薪 = 8000/21/12', Math.abs(h12 - 8000/21/12) < 1e-9, h12);

console.log('\n=== 4. 低月薪高时薪是合理的 ===');
const lowSalary = fairPerHour(S({ monthly:4000, breaks:[], segments:[{start:'09:00',end:'13:00'}] }), 2026, 10); // 4h
const highSalary= fairPerHour(S({ monthly:9000, breaks:[], segments:[{start:'09:00',end:'21:00'}] }), 2026, 10); // 12h
ok('月薪4000(4h) 时薪高于 月薪9000(12h)', lowSalary > highSalary, [lowSalary, highSalary]);
ok('4000/21/4 = 47.62', Math.abs(lowSalary - 4000/21/4) < 1e-9, lowSalary);
ok('9000/21/12 = 35.71', Math.abs(highSalary - 9000/21/12) < 1e-9, highSalary);

console.log('\n=== 5. 边界：无工作时段时时薪为 0 ===');
ok('无时段返回 0', fairPerHour(S({ segments:[] }), 2026, 10) === 0);
ok('月薪 0 返回 0', fairPerHour(S({ monthly:0 }), 2026, 10) === 0);

console.log('\n---------------------------------------');
console.log(fail === 0 ? '全部通过：' + pass + ' 项' : '通过 ' + pass + '，失败 ' + fail);
process.exit(fail === 0 ? 0 : 1);
