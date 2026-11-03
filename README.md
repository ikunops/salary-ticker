# 工资秒表 · SalaryTicker

把月薪拆到**秒级**，在上班时段里看着金额随读秒持续增长；下班、午休、休息日自动暂停。

纯本地运行，不联网、不上传任何数据。

![Windows 安装包](https://img.shields.io/badge/Windows_安装包-1.07_MB-success) ![免安装 exe](https://img.shields.io/badge/免安装_exe-2.96_MB-success)

## 下载使用

| 平台 | 文件 | 大小 | 说明 |
|---|---|---|---|
| Windows | `SalaryTicker_1.0.0_x64-setup.exe` | 1.07 MB | 安装包，推荐 |
| Windows | `SalaryTicker-win.exe` | 2.96 MB | 免安装绿色版 |
| macOS | `SalaryTicker-1.0.0-mac-arm64.zip` | 90.8 MB | Apple Silicon（M 系列） |
| macOS | `SalaryTicker-1.0.0-mac-x64.zip` | 95.0 MB | Intel 芯片 |

> macOS 包较大是因为基于 Electron（自带 Chromium 内核）。
> Windows 版基于 Tauri，复用系统 WebView2，所以只有 1~3 MB。
> 安装细节见 [docs-mac安装说明.md](docs-mac安装说明.md) 和 [docs-安全提示说明.md](docs-安全提示说明.md)。

Windows 版基于 **Tauri + 系统 WebView2**，体积只有几 MB（Electron 方案同功能需 69 MB）。

> macOS 首次打开若提示「未验证开发者」，右键 → 打开 即可（未做代码签名）。

## 三种计薪口径

| 口径 | 算法 | 适用 |
|---|---|---|
| **当月实际工作日**（默认） | 月薪 ÷ 当月应出勤天数 ÷ 每日实际工时 | 正统算法，扣午休、认法定节假日 |
| **21.75 天平均** | 月薪 ÷ (21.75 × 8) 得时薪 | 国家月平均计薪天数口径 |
| **当月自然天数 24h** | 月薪 ÷ 当月天数 ÷ 24h | 不看节假日、不看工时 |

自然天数口径示例（6000 元 / 30 天的月份）：

| 项目 | 数值 |
|---|---|
| 日薪 | 6000 ÷ 30 = **200.00** |
| 时薪 | 200 ÷ 24 = **8.33** |
| 每分钟 | **0.1389** |
| 每秒 | **0.00231481** |

该口径下金额全天 24 小时连续增长。注意：**单价按自然天数算，但「本月进度」仍按设置的工作日统计**。

## 功能

- 大号实时金额，逐秒跳动（小数位可设 0/2/3/4）
- 今日 / 本月 / 本年 三个视角切换
- 状态徽标：计薪中 / 午休中 / 未上班 / 已下班 / 休息日
- 倒计时：距下班、距上班、距午休结束
- 进度条随视角变化：今日按工作时段、本月按整月日历、本年按 12 个月
- 换算显示：赚到的钱 ≈ 几杯奶茶 / 几份午饭 / 几张电影票（12 种预设，可勾选、改价、自定义）
- 三种主题：暗夜绿 / 浅色 / 人民币红
- 快捷键：`S` 打开设置，`Esc` 关闭

### 设置项

| 设置 | 说明 |
|---|---|
| 月薪 | 金额 + 货币符号 |
| 每天工作时段 | 可加多段 |
| 中午休息时间 | 独立配置，自动从工作时段扣除，不计薪 |
| 每周工作日 | 支持大小周、单休 |
| 法定节假日 | 是否按法定节假日放假计算 |
| 计薪口径 | 三种任选 |
| 小数位 | 0 / 2 / 3 / 4 |
| 外观与提醒 | 深浅主题、提示音、换算开关 |
| 换算物品 | 勾选显示、改单价、自定义添加 |
| 自定义休息/上班日 | 节假日数据未覆盖的年份手动补 |

## 跨午夜夜班

支持 `22:00–06:00` 这类跨日班次，结束时间早于开始时间时自动视为延续到次日：

- 一班到底：周一 22:00 开工，周二 01:00 仍属于周一这个班，显示「计薪中」「已累计 7 小时」
- 跨月夜班（10-31 22:00 → 11-01 06:00）计入开始日所在月份
- 时间轴显示为「22:00 → 次日 06:00」
- 夜宵休息同样支持（如 22:00–06:00 中间休息 00:00–00:30）

## 节假日

内置 2025、2026 年中国法定节假日与调休补班数据：

- 2026-10-01 ~ 10-07 国庆放假 → 不计薪
- 2026-10-10 周六调休补班 → **照常计薪**（同类工具常在此出错）

更晚年份可在设置里手动补日期。

## 构建

### 环境要求

- Node.js 18+
- Rust 1.77+（rustup.rs）
- Windows 还需 Visual Studio Build Tools（C++ 生成工具）
- macOS 需 Xcode Command Line Tools

### Windows

```bash
npm install
npm run build:win
```

产物在 `dist/`：`SalaryTicker-win.exe`（免安装）+ `SalaryTicker_1.0.0_x64-setup.exe`（安装包）。

### macOS

macOS 包必须在 macOS 上构建（Tauri 需要 Xcode 工具链）：

```bash
npm install
npm run icon
mkdir -p src && cp index.html src/index.html
npx tauri build --target aarch64-apple-darwin   # Apple Silicon
npx tauri build --target x86_64-apple-darwin    # Intel
```

产物在 `.cargo-target/*/release/bundle/dmg/`。

### GitHub Actions 自动构建双平台

推送 tag 即自动构建 Windows + macOS（Intel & Apple Silicon）：

```bash
git tag v1.0.0 && git push origin v1.0.0
```

工作流见 `.github/workflows/build.yml`，产物在 Actions 页面 Artifacts 下载。

## 测试

```bash
npm test
```

| 文件 | 项数 | 覆盖 |
|---|---|---|
| test-core.js | 54 | 计薪算法、节假日、调休、边界、格式化 |
| test-breaks.js | 48 | 午休扣除、区间相减、状态、单调性 |
| test-dom.js | 25 | DOM 渲染与交互 |
| test-settings.js | 34 | 旧版迁移、换算增删改、休息增删 |
| test-timeline.js | 36 | 三视图进度条结构 |
| test-nightshift.js | 41 | 跨午夜班次、夜宵、跨月边界 |
| test-natural.js | 60 | 自然日口径、24h 连续、月长差异 |
| test-structure.js | — | 元素引用、标签配对、语法、零外部依赖 |

合计 **298 项断言**。测试直接从 `index.html` 抽取核心代码块运行，测的就是页面上跑的同一份代码。

## 技术说明

- 页面是单文件 `index.html`（约 68 KB），零外部依赖，可直接双击用浏览器打开
- 桌面版两种方案：
  - **Tauri**（推荐）：复用系统 WebView2，Windows 安装包 1.07 MB
  - **Electron**：自带 Chromium 内核，约 69 MB，兼容未装 WebView2 的老系统
- 数据只存在本机 localStorage

## License

MIT