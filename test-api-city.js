// 补充测试：市级榜单 + 排行榜统一口径
const fs = require('fs');
const path = require('path');

const src = fs.readFileSync(path.join(__dirname, 'worker', 'index.js'), 'utf8');
const mod = { exports: {} };
new Function('module', 'exports', src.replace('export default {', 'module.exports = {') + '\n')
  .call({}, mod, mod.exports);
const worker = mod.exports;

class FakeD1 {
  constructor() { this.scores = new Map(); this.rate = new Map(); }
  prepare(sql) {
    const db = this; const s = sql.replace(/\s+/g, ' ').trim();
    let binds = [];
    const api = {
      bind(...a) { binds = a; return api; },
      async first() { return db._first(s, binds); },
      async all() { return db._all(s, binds); },
      async run() { return db._run(s, binds); },
    };
    return api;
  }
  _first(sql, b) {
    if (/FROM rate_limit WHERE device_id/.test(sql)) { const r = this.rate.get(b[0]); return r || null; }
    if (/SELECT per_hour FROM scores WHERE device_id/.test(sql)) { const r = this.scores.get(b[0]); return r ? { per_hour: r.per_hour } : null; }
    if (/COUNT\(\*\) AS c FROM scores WHERE per_hour >/.test(sql)) { let c = 0; for (const r of this.scores.values()) if (r.per_hour > b[0]) c++; return { c }; }
    if (/COUNT\(\*\) AS c FROM scores$/.test(sql)) return { c: this.scores.size };
    if (/COUNT\(\*\) AS c FROM scores WHERE updated_at >=/.test(sql)) { let c = 0; for (const r of this.scores.values()) if (r.updated_at >= b[0]) c++; return { c }; }
    throw new Error('first: ' + sql);
  }
  _all(sql, b) {
    if (/GROUP BY country/.test(sql)) {
      const m = new Map();
      for (const r of this.scores.values()) m.set(r.country, (m.get(r.country) || 0) + 1);
      return { results: [...m.entries()].map(([country, c]) => ({ country, c })).sort((a, z) => z.c - a.c).slice(0, 20) };
    }
    if (/FROM scores/.test(sql) && /ORDER BY/.test(sql)) {
      const col = sql.match(/ORDER BY (\w+) DESC/)[1];
      let rows = [...this.scores.values()];
      if (/WHERE country = \? AND city = \?/.test(sql)) rows = rows.filter(r => r.country === b[0] && r.city === b[1]);
      else if (/WHERE country = \?/.test(sql)) rows = rows.filter(r => r.country === b[0]);
      rows.sort((a, z) => (z[col] - a[col]) || (z.updated_at - a.updated_at));
      return { results: rows.slice(0, b[b.length - 1]) };
    }
    throw new Error('all: ' + sql);
  }
  _run(sql, b) {
    if (/INSERT INTO scores/.test(sql)) {
      const [device_id, nickname, country, city, per_hour, per_second, monthly, work_hours, earned, pay_basis, currency, updated_at, created_at] = b;
      const old = this.scores.get(device_id);
      this.scores.set(device_id, {
        device_id, nickname, country, city, per_hour, per_second, monthly,
        work_hours: old ? Math.max(old.work_hours, work_hours) : work_hours,
        earned: old ? Math.max(old.earned, earned) : earned,
        pay_basis, currency, updated_at, created_at: old ? old.created_at : created_at,
      });
      return { success: true };
    }
    if (/INSERT INTO rate_limit/.test(sql)) {
      const [device_id, last_post] = b;
      const old = this.rate.get(device_id);
      this.rate.set(device_id, { last_post, post_count: old ? old.post_count + 1 : 1 });
      return { success: true };
    }
    throw new Error('run: ' + sql);
  }
}

function makeReq(method, pathname, { body, cf } = {}) {
  return {
    method, url: 'https://x.com' + pathname, cf: cf || { country: 'CN', city: '' },
    async json() { return body; },
  };
}

let pass = 0, fail = 0;
function ok(name, cond, extra) {
  if (cond) { pass++; console.log('  ok   ' + name); }
  else { fail++; console.log('  FAIL ' + name + (extra !== undefined ? '  ' + JSON.stringify(extra) : '')); }
}

(async () => {
  console.log('\n=== 1. 市级榜单筛选 ===');
  const db = new FakeD1();
  const env = { DB: db };
  async function post(dev, country, city, perHour) {
    db.rate.delete(dev);
    return worker.fetch(makeReq('POST', '/api/score', {
      body: { deviceId: dev, nickname: city + '用户', perHour, perSecond: 0.01, workHours: 10, earned: 100 },
      cf: { country, city },
    }), env);
  }
  await post('aaaaaaaaaaaaaaaa', 'CN', 'Beijing', 80);
  await post('bbbbbbbbbbbbbbbb', 'CN', 'Beijing', 60);
  await post('cccccccccccccccc', 'CN', 'Shanghai', 90);
  await post('dddddddddddddddd', 'US', 'New York', 100);

  let r = await worker.fetch(makeReq('GET', '/api/rank?scope=city&country=CN&city=Beijing&board=per_hour'), env);
  let j = await r.json();
  ok('本市榜只含该城市', j.list.length === 2, j.list.length);
  ok('本市榜按时薪降序', j.list[0].perHour === 80 && j.list[1].perHour === 60);
  ok('返回 scope=city', j.scope === 'city');
  ok('返回 city 字段', j.city === 'Beijing', j.city);

  r = await worker.fetch(makeReq('GET', '/api/rank?scope=city&country=CN&city=Shanghai&board=per_hour'), env);
  j = await r.json();
  ok('切换城市结果不同', j.list.length === 1 && j.list[0].perHour === 90);

  r = await worker.fetch(makeReq('GET', '/api/rank?scope=global&board=per_hour'), env);
  j = await r.json();
  ok('全国榜包含所有城市', j.list.length === 4, j.list.length);
  ok('全国榜第一是最高时薪', j.list[0].perHour === 100);

  console.log('\n=== 2. 城市为空时退化为按国家 ===');
  r = await worker.fetch(makeReq('GET', '/api/rank?scope=city&country=CN&city=&board=per_hour'), env);
  j = await r.json();
  ok('空城市退化为全国范围', j.list.length === 3, j.list.length);

  console.log('\n=== 3. scope 兼容旧参数 country ===');
  r = await worker.fetch(makeReq('GET', '/api/rank?scope=country&country=CN&board=per_hour'), env);
  j = await r.json();
  ok('scope=country 仍可用', j.list.length === 3, j.list.length);

  console.log('\n=== 4. 非法 scope 回退 global ===');
  r = await worker.fetch(makeReq('GET', '/api/rank?scope=hack&board=per_hour'), env);
  j = await r.json();
  ok('非法 scope 回退为 global', j.scope === 'global');

  console.log('\n=== 5. 上报返回城市信息 ===');
  db.rate.delete('eeeeeeeeeeeeeeee');
  r = await worker.fetch(makeReq('POST', '/api/score', {
    body: { deviceId: 'eeeeeeeeeeeeeeee', nickname: 't', perHour: 50, perSecond: 0.01 },
    cf: { country: 'CN', city: 'Shenzhen' },
  }), env);
  j = await r.json();
  ok('上报响应含 city', j.city === 'Shenzhen', j.city);

  console.log('\n---------------------------------------');
  console.log(fail === 0 ? '全部通过：' + pass + ' 项' : '通过 ' + pass + '，失败 ' + fail);
  process.exit(fail === 0 ? 0 : 1);
})().catch(e => { console.error('异常:', e); process.exit(1); });
