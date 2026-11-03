-- 工资秒表排行榜 · D1 表结构
-- 执行：wrangler d1 execute salary-ticker-db --remote --file=./schema.sql

CREATE TABLE IF NOT EXISTS scores (
  device_id   TEXT PRIMARY KEY,        -- 设备指纹 MD5（客户端生成）
  nickname    TEXT NOT NULL,           -- 显示名（用户可改，默认「匿名用户」）
  country     TEXT NOT NULL DEFAULT 'XX',  -- 国家代码（CF request.cf.country）
  city        TEXT NOT NULL DEFAULT '',    -- 城市（CF request.cf.city，可能为空）
  -- 三个榜单维度
  per_hour    REAL NOT NULL DEFAULT 0,     -- 时薪
  per_second  REAL NOT NULL DEFAULT 0,     -- 每秒薪资
  monthly     REAL NOT NULL DEFAULT 0,     -- 月薪
  work_hours  REAL NOT NULL DEFAULT 0,     -- 累计工作时长（小时）
  earned      REAL NOT NULL DEFAULT 0,     -- 累计已赚（用于金额榜）
  -- 元信息
  pay_basis   TEXT NOT NULL DEFAULT 'actual',  -- 计薪口径，便于展示
  currency    TEXT NOT NULL DEFAULT 'CNY',
  updated_at  INTEGER NOT NULL,            -- unix 秒
  created_at  INTEGER NOT NULL
);

-- 各榜单排序索引
CREATE INDEX IF NOT EXISTS idx_per_hour   ON scores(per_hour DESC);
CREATE INDEX IF NOT EXISTS idx_per_second ON scores(per_second DESC);
CREATE INDEX IF NOT EXISTS idx_work_hours ON scores(work_hours DESC);
CREATE INDEX IF NOT EXISTS idx_earned     ON scores(earned DESC);
CREATE INDEX IF NOT EXISTS idx_country    ON scores(country, per_hour DESC);
CREATE INDEX IF NOT EXISTS idx_updated    ON scores(updated_at DESC);

-- 上报频率限制表（防止同一设备狂刷）
CREATE TABLE IF NOT EXISTS rate_limit (
  device_id  TEXT PRIMARY KEY,
  last_post  INTEGER NOT NULL,
  post_count INTEGER NOT NULL DEFAULT 0
);
