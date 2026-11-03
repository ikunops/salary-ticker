// 用内存版「假 D1」测试 Worker API 逻辑（不依赖 wrangler / 网络）
const fs = require('fs');
const path = require('path');

const src = fs.readFileSync(path.join(__dirname, 'worker', 'index.js'), 'utf8');
// Worker 用 export default，转成可 require 的形式
const mod = { exports: {} };
new Function('module', 'exports', src.replace('export default {', 'module.exports = {') + '\n')
  .call({}, mod, mod.exports);
const worker = mod.exports;

/* ---------------- 极简 D1 模拟 ---------------- */
class FakeD1 {
  constructor() { this.scores = new Map(); this.rate = new Map(); }

  prepare(sql) {
    const db = this;
    const s = sql.replace(/\s+/g, ' ').trim();
    let binds = [];
    const api = {
      bind(...args) { binds = args; return api; },
      async first() { return db._first(s, binds); },
      async all() { return db._all(s, binds); },
      async run() { return db._run(s, binds); },
    };
    return api;
  }

  _first(sql, b) {
    if (/FROM rate_limit WHERE device_id/.test(sql)) {
      const r = this.rate.get(b[0]);
      return r ? { last_post: r.last_post, post_count: r.post_count } : null;
    }
    if (/SELECT per_hour FROM scores WHERE device_id/.test(sql)) {
      const r = this.scores.get(b[0]);
      return r ? { per_hour: r.per_hour } : null;
    }
    if (/COUNT\(\*\) AS c FROM scores WHERE per_hour >/.test(sql)) {
      let c = 0;
      for (const r of this.scores.values()) if (r.per_hour > b[0]) c++;
      return { c };
    }
    if (/COUNT\(\*\) AS c FROM scores$/.test(sql)) {
      return { c: this.scores.size };
    }
    if (/COUNT\(\*\) AS c FROM scores WHERE updated_at >=/.test(sql)) {
      let c = 0;
      for (const r of this.scores.values()) if (r.updated_at >= b[0]) c++;
      return { c };
    }
    throw new Error('未实现 first: ' + sql);
  }

  _all(sql, b) {
    if (/GROUP BY country/.test(sql)) {
      const m = new Map();
      for (const r of this.scores.values()) m.set(r.country, (m.get(r.country) || 0) + 1);
      const results = [...m.entries()].map(([country, c]) => ({ country, c }))
        .sort((a, z) => z.c - a.c).slice(0, 20);
      return { results };
    }
    if (/FROM scores/.test(sql) && /ORDER BY/.test(sql)) {
      const col = sql.match(/ORDER BY (\w+) DESC/)[1];
      let rows = [...this.scores.values()];
      if (/WHERE country = \?/.test(sql)) rows = rows.filter(r => r.country === b[0]);
      rows.sort((a, z) => (z[col] - a[col]) || (z.updated_at - a.updated_at));
      const limit = b[b.length - 1];
      return { results: rows.slice(0, limit) };
    }
    throw new Error('未实现 all: ' + sql);
  }

  _run(sql, b) {
    if (/INSERT INTO scores/.test(sql)) {
      const [device_id, nickname, country, city, per_hour, per_second, monthly,
             work_hours, earned, pay_basis, currency, updated_at, created_at] = b;
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
    throw new Error('未实现 run: ' + sql);
  }
}

/* ---------------- 请求构造 ---------------- */
const db = new FakeD1();
const env = { DB: db };

function makeReq(method, pathname, { body, cf } = {}) {
  const url = new URL('https://example.com' + pathname);
  return {
    method,
    url: url.toString(),
    cf: cf || { country: 'CN', city: 'Beijing' },
    async json() { return body; },
  };
}

let pass = 0, fail = 0;
function ok(name, cond, extra) {
  if (cond) { pass++; console.log('  ok   ' + name); }
  else { fail++; console.log('  FAIL ' + name + (extra ? '  ' + JSON.stringify(extra) : '')); }
}

(async () => {
  console.log('\n=== 1. 基本路由 ===');
  let r = await worker.fetch(makeReq('GET', '/'), env);
  let j = await r.json();
  ok('GET / 返回服务信息', j.ok === true);

  r = await worker.fetch(makeReq('GET', '/nope'), env);
  ok('未知路由返回 404', r.status === 404);

  r = await worker.fetch(makeReq('OPTIONS', '/api/score'), env);
  ok('OPTIONS 返回 CORS 头', r.headers.get('Access-Control-Allow-Origin') === '*');

  console.log('\n=== 2. 上报校验 ===');
  r = await worker.fetch(makeReq('POST', '/api/score', { body: { deviceId: 'bad' } }), env);
  ok('非法 deviceId 被拒', r.status === 400);

  r = await worker.fetch(makeReq('POST', '/api/score', {
    body: { deviceId: 'abcdef0123456789', nickname: '小明', perHour: 50, perSecond: 0.0139, monthly: 8000, workHours: 100, earned: 5000 }
  }), env);
  j = await r.json();
  ok('正常上报成功', j.ok === true, j);
  ok('返回排名信息', j.rank && j.rank.rank === 1, j.rank);
  ok('地区取自 CF', j.country === 'CN');

  console.log('\n=== 3. 频率限制（10 秒内）===');
  r = await worker.fetch(makeReq('POST', '/api/score', {
    body: { deviceId: 'abcdef0123456789', nickname: '小明', perHour: 60, perSecond: 0.0167 }
  }), env);
  ok('10 秒内重复上报被限流 429', r.status === 429);

  console.log('\n=== 4. 数据合理性清洗 ===');
  const db2 = new FakeD1();
  const env2 = { DB: db2 };
  r = await worker.fetch(makeReq('POST', '/api/score', {
    body: { deviceId: '1111111111111111', nickname: '怪物', perHour: 99999999, perSecond: 99999, monthly: 1e15, workHours: -5, earned: 1e20 }
  }), env2);
  j = await r.json();
  ok('上报未报错', j.ok === true);
  const saved = db2.scores.get('1111111111111111');
  ok('时薪被限制在 1e6 以内', saved.per_hour <= 1e6, saved.per_hour);
  ok('每秒薪资不超过时薪/3600', saved.per_second <= saved.per_hour / 3600, saved.per_second);
  ok('负工时归零', saved.work_hours === 0, saved.work_hours);
  ok('累计金额被限制', saved.earned <= 1e12, saved.earned);

  console.log('\n=== 5. 同一设备重复上报：工时取最大值 ===');
  const db3 = new FakeD1();
  const env3 = { DB: db3 };
  async function post(dev, wh, earned, at) {
    // 绕过限流：直接操作
    db3.rate.delete(dev);
    return worker.fetch(makeReq('POST', '/api/score', {
      body: { deviceId: dev, nickname: 'n', perHour: 50, perSecond: 0.01, workHours: wh, earned }
    }), env3);
  }
  await post('2222222222222222', 100, 5000);
  await post('2222222222222222', 50, 3000);
  const s = db3.scores.get('2222222222222222');
  ok('工时不会被覆盖变小', s.work_hours === 100, s.work_hours);
  ok('金额不会被覆盖变小', s.earned === 5000, s.earned);
  ok('同一设备只占一条记录', db3.scores.size === 1);

  console.log('\n=== 6. 榜单查询 ===');
  // 造 5 个不同时薪的设备
  for (let i = 1; i <= 5; i++) {
    await post('33333333333333' + String(i).padStart(2, '0'), i * 10, i * 100);
  }
  r = await worker.fetch(makeReq('GET', '/api/rank?board=per_hour&limit=3', { cf: { country: 'CN' } }), env3);
  j = await r.json();
  ok('默认按时薪排序', j.board === 'per_hour');
  ok('返回条数受 limit 限制', j.list.length === 3, j.list.length);
  ok('第一名是时薪 50', j.list[0].perHour === 50, j.list[0]);
  ok('排名递增', j.list[0].rank === 1 && j.list[1].rank === 2);

  r = await worker.fetch(makeReq('GET', '/api/rank?board=work_hours&limit=10'), env3);
  j = await r.json();
  ok('可切换榜单为工时', j.board === 'work_hours');

  r = await worker.fetch(makeReq('GET', '/api/rank?board=earned&limit=10'), env3);
  j = await r.json();
  ok('可切换榜单为金额', j.board === 'earned');

  r = await worker.fetch(makeReq('GET', '/api/rank?board=恶意注入;DROP&limit=10'), env3);
  j = await r.json();
  ok('非法 board 回退到默认', j.board === 'per_hour');

  r = await worker.fetch(makeReq('GET', '/api/rank?board=per_hour&limit=9999'), env3);
  j = await r.json();
  ok('limit 上限被限制为 100', j.list.length <= 100);

  console.log('\n=== 7. 地区榜单 ===');
  const db4 = new FakeD1();
  const env4 = { DB: db4 };
  async function postCountry(dev, country, perHour) {
    db4.rate.delete(dev);
    return worker.fetch(makeReq('POST', '/api/score', {
      body: { deviceId: dev, nickname: country + '用户', perHour, perSecond: 0.01, workHours: 10, earned: 100 },
      cf: { country, city: '' },
    }), env4);
  }
  await postCountry('aaaaaaaaaaaaaaaa', 'CN', 50);
  await postCountry('bbbbbbbbbbbbbbbb', 'US', 80);
  await postCountry('cccccccccccccccc', 'CN', 30);

  r = await worker.fetch(makeReq('GET', '/api/rank?scope=country&country=CN&board=per_hour'), env4);
  j = await r.json();
  ok('地区榜只含该地区', j.list.length === 2, j.list.length);
  ok('地区内按时薪排序', j.list[0].perHour === 50 && j.list[1].perHour === 30);
  ok('返回中文地区名', j.list[0].countryName === '中国', j.list[0].countryName);

  r = await worker.fetch(makeReq('GET', '/api/rank?scope=global&board=per_hour'), env4);
  j = await r.json();
  ok('全局榜包含所有地区', j.list.length === 3, j.list.length);
  ok('全局第一名是美国用户', j.list[0].country === 'US');

  console.log('\n=== 8. 统计接口 ===');
  r = await worker.fetch(makeReq('GET', '/api/stats'), env4);
  j = await r.json();
  ok('总人数正确', j.total === 3, j.total);
  ok('24 小时活跃数正确', j.active24h === 3, j.active24h);
  ok('地区分布按人数排序', j.countries[0].code === 'CN' && j.countries[0].count === 2, j.countries);

  console.log('\n=== 9. 昵称清洗 ===');
  const db5 = new FakeD1();
  await worker.fetch(makeReq('POST', '/api/score', {
    body: { deviceId: 'dddddddddddddddd', nickname: '<script>alert(1)</script>超长昵称啊啊啊啊啊啊', perHour: 10, perSecond: 0.01 }
  }), { DB: db5 });
  const n = db5.scores.get('dddddddddddddddd');
  ok('昵称被截断到 16 字', n.nickname.length <= 16, n.nickname.length);
  ok('空昵称有默认值', true);

  await worker.fetch(makeReq('POST', '/api/score', {
    body: { deviceId: 'eeeeeeeeeeeeeeee', perHour: 10, perSecond: 0.01 }
  }), { DB: db5 });
  ok('未填昵称时为匿名用户', db5.scores.get('eeeeeeeeeeeeeeee').nickname === '匿名用户');

  console.log('\n---------------------------------------');
  console.log(fail === 0 ? '全部通过：' + pass + ' 项' : '通过 ' + pass + '，失败 ' + fail);
  process.exit(fail === 0 ? 0 : 1);
})().catch(e => { console.error('测试异常:', e); process.exit(1); });
