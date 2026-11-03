/**
 * 工资秒表 · 排行榜 API（Cloudflare Workers + D1）
 *
 * 接口：
 *   POST /api/score      上报/更新自己的数据
 *   GET  /api/rank       获取榜单  ?board=per_hour|per_second|work_hours|earned&scope=global|country&limit=50
 *   GET  /api/stats      全站统计（总人数、今日上报数等）
 *
 * 设计取舍：
 *   - 设备指纹由客户端生成，这里只做格式校验与频率限制（玩具项目，不追求绝对防作弊）
 *   - 地区来自 CF 的 request.cf.country / city，不信任客户端传的值
 */

const BOARDS = ['per_hour', 'per_second', 'work_hours', 'earned'];

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Max-Age': '86400',
};

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', ...CORS },
  });
}

/** 简单的输入清洗：限制长度、去控制字符 */
function clean(v, max = 32) {
  if (typeof v !== 'string') return '';
  // eslint-disable-next-line no-control-regex
  return v.replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, max);
}

function num(v, max = 1e12) {
  const n = Number(v);
  if (!isFinite(n) || n < 0) return 0;
  return Math.min(n, max);
}

/** 国家代码 → 中文名（只收录常见地区，未命中的直接显示代码） */
const COUNTRY_NAME = {
  CN: '中国', HK: '中国香港', TW: '中国台湾', MO: '中国澳门',
  JP: '日本', KR: '韩国', SG: '新加坡', MY: '马来西亚', TH: '泰国',
  VN: '越南', ID: '印度尼西亚', PH: '菲律宾', IN: '印度',
  US: '美国', CA: '加拿大', GB: '英国', DE: '德国', FR: '法国',
  AU: '澳大利亚', NZ: '新西兰', RU: '俄罗斯', BR: '巴西',
};

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: CORS });
    }

    try {
      if (url.pathname === '/api/score' && request.method === 'POST') {
        return await postScore(request, env);
      }
      if (url.pathname === '/api/rank' && request.method === 'GET') {
        return await getRank(url, env);
      }
      if (url.pathname === '/api/stats' && request.method === 'GET') {
        return await getStats(env);
      }
      if (url.pathname === '/' || url.pathname === '') {
        return json({ ok: true, service: 'salary-ticker-leaderboard', boards: BOARDS });
      }
      return json({ error: 'not found' }, 404);
    } catch (e) {
      return json({ error: 'internal', message: String(e && e.message || e) }, 500);
    }
  },
};

async function postScore(request, env) {
  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'invalid json' }, 400);
  }

  const deviceId = clean(body.deviceId, 64);
  if (!/^[a-f0-9]{16,64}$/i.test(deviceId)) {
    return json({ error: 'invalid deviceId' }, 400);
  }

  const now = Math.floor(Date.now() / 1000);

  // ── 频率限制：同一设备 10 秒内最多 1 次 ──
  const rl = await env.DB.prepare(
    'SELECT last_post, post_count FROM rate_limit WHERE device_id = ?'
  ).bind(deviceId).first();
  if (rl && now - rl.last_post < 10) {
    return json({ error: 'too frequent', retryAfter: 10 - (now - rl.last_post) }, 429);
  }

  // ── 地区：只信 CF 提供的信息，不信客户端 ──
  const cf = request.cf || {};
  const country = clean(cf.country, 8) || 'XX';
  const city = clean(cf.city, 32) || '';

  const nickname = clean(body.nickname, 16) || '匿名用户';
  const perHour = num(body.perHour);
  const perSecond = num(body.perSecond);
  const monthly = num(body.monthly);
  const workHours = num(body.workHours, 1e7);
  const earned = num(body.earned);
  const payBasis = clean(body.payBasis, 16) || 'actual';
  const currency = clean(body.currency, 8) || 'CNY';

  // 合理性校验：
  //   1) 时薪上限 100 万
  //   2) 每秒薪资不可能超过 时薪/3600（否则数据自相矛盾，按上限截断）
  const safePerHour = Math.min(perHour, 1e6);
  const maxPerSecond = safePerHour / 3600;
  const safePerSecond = Math.min(perSecond, maxPerSecond);
  const safeWorkHours = Math.min(workHours, 1e7);
  const safeEarned = Math.min(earned, 1e12);

  await env.DB.prepare(
    `INSERT INTO scores
       (device_id, nickname, country, city, per_hour, per_second, monthly,
        work_hours, earned, pay_basis, currency, updated_at, created_at)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)
     ON CONFLICT(device_id) DO UPDATE SET
       nickname   = excluded.nickname,
       country    = excluded.country,
       city       = excluded.city,
       per_hour   = excluded.per_hour,
       per_second = excluded.per_second,
       monthly    = excluded.monthly,
       work_hours = MAX(scores.work_hours, excluded.work_hours),
       earned     = MAX(scores.earned, excluded.earned),
       pay_basis  = excluded.pay_basis,
       currency   = excluded.currency,
       updated_at = excluded.updated_at`
  ).bind(
    deviceId, nickname, country, city, safePerHour, safePerSecond, monthly,
    safeWorkHours, safeEarned, payBasis, currency, now, now
  ).run();

  await env.DB.prepare(
    `INSERT INTO rate_limit (device_id, last_post, post_count) VALUES (?,?,1)
     ON CONFLICT(device_id) DO UPDATE SET
       last_post = excluded.last_post,
       post_count = rate_limit.post_count + 1`
  ).bind(deviceId, now).run();

  // 返回我的排名（当前主榜：时薪）
  const rank = await getMyRank(env, deviceId);
  return json({ ok: true, rank, country, city });
}

async function getMyRank(env, deviceId) {
  const row = await env.DB.prepare(
    'SELECT per_hour FROM scores WHERE device_id = ?'
  ).bind(deviceId).first();
  if (!row) return null;
  const better = await env.DB.prepare(
    'SELECT COUNT(*) AS c FROM scores WHERE per_hour > ?'
  ).bind(row.per_hour).first();
  const total = await env.DB.prepare('SELECT COUNT(*) AS c FROM scores').first();
  return { rank: (better?.c || 0) + 1, total: total?.c || 0 };
}

async function getRank(url, env) {
  const board = BOARDS.includes(url.searchParams.get('board'))
    ? url.searchParams.get('board')
    : 'per_hour';
  // scope: global(全国) | city(本市)
  const rawScope = url.searchParams.get('scope');
  const scope = rawScope === 'city' ? 'city' : (rawScope === 'country' ? 'country' : 'global');
  const country = clean(url.searchParams.get('country'), 8) || 'CN';
  const city = clean(url.searchParams.get('city'), 32) || '';
  const limit = Math.min(Math.max(parseInt(url.searchParams.get('limit') || '50', 10) || 50, 1), 100);

  // board 已白名单校验，可直接拼接（不能作为参数绑定列名）
  let sql = `SELECT nickname, country, city, per_hour, per_second, monthly,
                    work_hours, earned, pay_basis, updated_at
             FROM scores`;
  const binds = [];
  if (scope === 'city') {
    // 按城市筛选；没传城市时退化为按国家，避免查出空列表
    if (city) {
      sql += ' WHERE country = ? AND city = ?';
      binds.push(country, city);
    } else {
      sql += ' WHERE country = ?';
      binds.push(country);
    }
  } else if (scope === 'country') {
    sql += ' WHERE country = ?';
    binds.push(country);
  }
  sql += ` ORDER BY ${board} DESC, updated_at DESC LIMIT ?`;
  binds.push(limit);

  const stmt = env.DB.prepare(sql);
  const { results } = await (binds.length ? stmt.bind(...binds) : stmt).all();

  const list = (results || []).map((r, i) => ({
    rank: i + 1,
    nickname: r.nickname,
    country: r.country,
    countryName: COUNTRY_NAME[r.country] || r.country,
    city: r.city,
    perHour: r.per_hour,
    perSecond: r.per_second,
    monthly: r.monthly,
    workHours: r.work_hours,
    earned: r.earned,
    payBasis: r.pay_basis,
    updatedAt: r.updated_at,
  }));

  return json({
    board,
    scope,
    country: scope === 'global' ? null : country,
    city: scope === 'city' ? city : null,
    list,
  });
}

async function getStats(env) {
  const total = await env.DB.prepare('SELECT COUNT(*) AS c FROM scores').first();
  const dayAgo = Math.floor(Date.now() / 1000) - 86400;
  const active = await env.DB.prepare(
    'SELECT COUNT(*) AS c FROM scores WHERE updated_at >= ?'
  ).bind(dayAgo).first();

  const { results } = await env.DB.prepare(
    'SELECT country, COUNT(*) AS c FROM scores GROUP BY country ORDER BY c DESC LIMIT 20'
  ).all();

  return json({
    total: total?.c || 0,
    active24h: active?.c || 0,
    countries: (results || []).map(r => ({
      code: r.country,
      name: COUNTRY_NAME[r.country] || r.country,
      count: r.c,
    })),
  });
}
