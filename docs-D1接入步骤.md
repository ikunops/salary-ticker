# 排行榜接入 Cloudflare D1（分步操作）

> ⚠️ 注意：你之前发的是 **KV** 页面。排行榜必须用 **D1**，因为 KV 不支持排序查询。

## 为什么是 D1 不是 KV

| | KV | D1 |
|---|---|---|
| 类型 | 键值存储 | SQLite 数据库 |
| 排序查询 | ❌ 不支持 | ✅ `ORDER BY ... LIMIT` |
| 排行榜 | 需自己维护快照 | 一条 SQL 搞定 |

排行榜要按"时薪从高到低取前 50"，这是 SQL 的基本操作，KV 做不到。

---

## 第一步：创建 D1 数据库

1. 打开 https://dash.cloudflare.com/a2e737c4af851e2f0a205132f2e206c0/workers/d1
2. 点 **Create database**
3. 名字填：`salary-ticker-db`
4. 创建后，复制页面上的 **Database ID**（一串 UUID）

---

## 第二步：建表

在 D1 数据库页面，点 **Console** 标签，粘贴执行：

```sql
CREATE TABLE IF NOT EXISTS scores (
  device_id   TEXT PRIMARY KEY,
  nickname    TEXT NOT NULL,
  country     TEXT NOT NULL DEFAULT 'XX',
  city        TEXT NOT NULL DEFAULT '',
  per_hour    REAL NOT NULL DEFAULT 0,
  per_second  REAL NOT NULL DEFAULT 0,
  monthly     REAL NOT NULL DEFAULT 0,
  work_hours  REAL NOT NULL DEFAULT 0,
  earned      REAL NOT NULL DEFAULT 0,
  pay_basis   TEXT NOT NULL DEFAULT 'actual',
  currency    TEXT NOT NULL DEFAULT 'CNY',
  updated_at  INTEGER NOT NULL,
  created_at  INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_per_hour   ON scores(per_hour DESC);
CREATE INDEX IF NOT EXISTS idx_work_hours ON scores(work_hours DESC);
CREATE INDEX IF NOT EXISTS idx_earned     ON scores(earned DESC);
CREATE INDEX IF NOT EXISTS idx_city       ON scores(country, city, per_hour DESC);

CREATE TABLE IF NOT EXISTS rate_limit (
  device_id  TEXT PRIMARY KEY,
  last_post  INTEGER NOT NULL,
  post_count INTEGER NOT NULL DEFAULT 0
);
```

---

## 第三步：创建 Worker

1. 打开 https://dash.cloudflare.com/a2e737c4af851e2f0a205132f2e206c0/workers
2. **Create application** → **Create Worker**
3. 名字填：`salary-ticker-leaderboard`
4. 点 **Deploy**（先用默认代码）
5. 进入刚创建的 Worker → **Edit code**
6. 把仓库 `worker/index.js` 的**全部内容**粘贴进去，覆盖默认代码
7. 点 **Deploy**

---

## 第四步：绑定 D1

1. Worker 详情页 → **Settings** → **Bindings**
2. 点 **Add** → 选 **D1 Database**
3. Variable name 填：`DB`（必须是大写 DB）
4. D1 database 选：`salary-ticker-db`
5. 保存

---

## 第五步：拿到接口地址

Worker 的地址形如：

```
https://salary-ticker-leaderboard.你的子域.workers.dev
```

在浏览器打开这个地址，应该返回：

```json
{"ok":true,"service":"salary-ticker-leaderboard","boards":["per_hour","per_second","work_hours","earned"]}
```

看到这个就说明部署成功了。

---

## 第六步：把地址内置到应用

告诉我这个地址，我帮你写进代码的 `RANK_API_BUILTIN` 常量：

```javascript
var RANK_API_BUILTIN = 'https://salary-ticker-leaderboard.xxx.workers.dev';
```

这样所有用户用的都是同一个地址，界面上不显示接口配置项。

---

## 验证接口

部署后可以这样测试：

```bash
# 查看榜单
curl "https://你的地址/api/rank?board=per_hour&scope=global&limit=5"

# 测试上报（deviceId 需 16 位十六进制）
curl -X POST "https://你的地址/api/score" \
  -H "Content-Type: application/json" \
  -d '{"deviceId":"abcdef0123456789","nickname":"测试","perHour":50,"perSecond":0.0139,"workHours":100,"earned":5000}'
```

---

## 如果不想用命令行

上面的步骤**全部可以在网页上完成**，不需要装 wrangler，也不需要登录 CLI。

我这边无法代你操作，因为需要登录你的 Cloudflare 账号。你按上面六步做完，把 Worker 地址发我，我来完成最后一步接入。