# 排行榜部署指南（Cloudflare Workers + D1）

## 它是怎么工作的

```
用户电脑                           Cloudflare
┌─────────────┐   上报/查询     ┌──────────────────┐
│ 工资秒表页面 │ ──────────────> │ Worker (API)      │
│             │                 │   ├─ 静态页面      │
│ 设备指纹 MD5 │ <────────────── │   └─ D1 数据库    │
└─────────────┘                 └──────────────────┘
```

- **不需要账号**，用设备指纹当身份
- **地区**由 Cloudflare 根据访问者 IP 自动识别（`request.cf.country`）
- 页面和 API 同域部署，一份代码搞定

## 免费额度够不够

根据 [Cloudflare Workers 限制文档](https://developers.cloudflare.com/workers/platform/limits/)：

| 项目 | 免费额度 | 说明 |
|---|---|---|
| 请求数 | 100,000 次/天 | 按每次打开榜单、每次上报算一次 |
| CPU 时间 | 10ms/请求 | 简单查询足够 |
| D1 存储 | 5 GB | 每条约 200 字节，能存 2500 万条 |

个人项目、小圈子完全够用。

## 部署步骤（约 5 分钟）

### 1. 安装 wrangler

```bash
npm install -g wrangler
wrangler login
```

### 2. 创建数据库

```bash
cd worker
wrangler d1 create salary-ticker-db
```

会输出一段 `database_id`，复制它。

### 3. 填入配置

编辑 `worker/wrangler.toml`，把 `database_id` 换成刚拿到的：

```toml
database_id = "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
```

### 4. 建表

```bash
wrangler d1 execute salary-ticker-db --remote --file=./schema.sql
```

### 5. 部署

```bash
wrangler deploy
```

成功后得到地址，形如：

```
https://salary-ticker-leaderboard.你的子域.workers.dev
```

### 6. 在应用里填地址

打开工资秒表 → 设置 → 排行榜：

1. 接口地址填上一步的 URL（**不要带末尾斜杠**）
2. 打开「参与排行榜」开关
3. 填个昵称（可选，默认「匿名用户」）
4. 点「立即上报一次」测试

## 接口说明

| 方法 | 路径 | 说明 |
|---|---|---|
| POST | `/api/score` | 上报数据 |
| GET | `/api/rank` | 获取榜单 |
| GET | `/api/stats` | 全站统计 |

### GET /api/rank

参数：
- `board`：`per_hour`（时薪）｜`work_hours`（工时）｜`earned`（已赚）
- `scope`：`global`（全球）｜`country`（本地区）
- `country`：当 scope=country 时使用，如 `CN`
- `limit`：条数，最大 100

返回：

```json
{
  "board": "per_hour",
  "scope": "global",
  "list": [
    {
      "rank": 1,
      "nickname": "大厂卷王",
      "country": "CN",
      "countryName": "中国",
      "city": "深圳",
      "perHour": 286.5,
      "perSecond": 0.0796,
      "monthly": 50000,
      "workHours": 2100,
      "earned": 120000
    }
  ]
}
```

## 关于设备指纹

设备码 = `MD5(本地随机盐 + 设备特征)[0:16]`

采集的特征包括：
- CPU 核心数
- 屏幕分辨率 + 色深
- 时区、语言、平台
- WebGL 渲染器（GPU 型号）
- 字体列表探测
- 触摸支持

**注意**：
- 清浏览器缓存会变成新身份（本地随机盐丢了）
- 数据由客户端上报，理论上可以伪造 —— 这是"玩具项目"的合理取舍，服务端做了数值上限和频率限制来抬高门槛

## 防刷措施

| 措施 | 说明 |
|---|---|
| 设备码格式校验 | 必须是 16-64 位十六进制 |
| 频率限制 | 同设备 10 秒内只能上报 1 次 |
| 数值上限 | 时薪 ≤ 100 万，每秒薪资 ≤ 时薪/3600 |
| 工时/金额只增不减 | 防止覆盖变小 |
| 昵称清洗 | 去掉控制字符，最多 16 字 |
| 榜单字段白名单 | 防止 SQL 注入 |

## 本地调试

```bash
cd worker
wrangler dev
```

然后在应用的设置里把接口地址填成 `http://localhost:8787`。

## 费用

免费额度用完后，Workers 付费版 $5/月起。日常使用基本碰不到。

如果担心被恶意刷爆额度：可以在 Cloudflare 后台给 Worker 加 Rate Limiting 规则。