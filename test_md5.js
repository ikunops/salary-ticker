// 验证页面内置 MD5 实现与 Node crypto 一致
const fs = require('fs');
const crypto = require('crypto');

const html = fs.readFileSync('index.html', 'utf8');
const core = html.split('/* ==================== CORE-START ==================== */')[1]
                 .split('/* ==================== CORE-END ==================== */')[0];

const start = core.indexOf('function md5(str){');
const end = core.indexOf('/* 采集设备特征');
if (start < 0 || end < 0) { console.error('未找到 md5 实现'); process.exit(1); }

const md5 = new Function(core.substring(start, end) + '; return md5;')();

const cases = [
  '',
  'a',
  'abc',
  'hello world',
  '工资秒表',
  'The quick brown fox jumps over the lazy dog',
  '123456789012345678901234567890',
  'ABCDEFGabcdefg0123456789',
  '中文测试🎉emoji',
];

let pass = 0, fail = 0;
for (const s of cases) {
  const mine = md5(s);
  const std = crypto.createHash('md5').update(s, 'utf8').digest('hex');
  const ok = mine === std;
  if (ok) pass++; else fail++;
  console.log((ok ? '  ok   ' : '  FAIL ') + JSON.stringify(s.slice(0, 28)) + ' -> ' + mine + (ok ? '' : '  期望 ' + std));
}
console.log('\n' + (fail === 0 ? 'MD5 全部正确：' + pass + ' 项' : '通过 ' + pass + '，失败 ' + fail));
process.exit(fail === 0 ? 0 : 1);
