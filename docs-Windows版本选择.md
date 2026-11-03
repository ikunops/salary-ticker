# Windows 版本选择

## 六个版本，按需选择

| 版本 | 文件 | 大小 | 说明 |
|---|---|---|---|
| **Electron 单文件**（首版同款） | `SalaryTicker-1.0.0-win-x64-免安装单文件.exe` | 69 MB | 双击即用，自带内核 |
| Electron 安装版 | `SalaryTicker-1.0.0-win-x64-electron-setup.exe` | 70 MB | 可装到系统，带快捷方式 |
| **Electron 目录版**（最稳） | `SalaryTicker-win-x64-免安装版.zip` | 105 MB | 解压即用，不碰临时目录 |
| Electron zip | `SalaryTicker-1.0.0-win-x64-electron.zip` | 104 MB | 同上，官方 zip |
| Tauri 单文件 | `SalaryTicker-win.exe` | 3 MB | 极小，依赖系统 WebView2 |
| Tauri 安装包 | `SalaryTicker_1.0.0_x64-setup.exe` | 2.8 MB | 同上 |

---

## 推荐顺序

**1. 先试 `免安装单文件.exe`（69 MB）**

这就是你说"第一次很好用"的那个版本，直接双击运行，自带浏览器内核，不依赖系统组件。

**2. 如果报 `Error writing temporary file`**

说明临时目录有问题。改用 **`免安装版.zip`**：解压后进文件夹双击 `SalaryTicker.exe`。

这个版本完全不写临时目录，绕开了那个错误。

**3. Tauri 版（3 MB）**

只有系统 WebView2 正常时才用。如果报 `WebView2 error`，直接放弃它，用上面两个。

---

## 之前遇到的三个错误

| 错误 | 原因 | 解决 |
|---|---|---|
| `Error writing temporary file` | portable 自解压要写 `%TEMP%` | 用免安装目录版 zip |
| `WebView2 error 0x800700AA` | 资源被占用 | 结束残留进程，或用 Electron 版 |
| `WebView2 error 0x80010108` | WebView2 子进程被终止 | 用 Electron 版 |

---

## 最保险：直接用浏览器

`index.html` 是单个文件，双击用 Chrome / Edge 打开，功能**完全一样**，排行榜也能用。

没有任何打包层，不会有兼容问题。