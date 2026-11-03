# 如果打开闪退怎么办？

## 已知问题

Tauri 版本（**体积小的那个，约 3MB**）依赖系统自带的 **WebView2 运行时**。在部分电脑上会出现：

```
打开后瞬间消失，没有任何提示
```

以管理员身份运行就能正常打开。

## 原因

程序日志中的真实报错是：

```
Failed to create webview: WebView2 error: HRESULT(0x80010108)
被调用的对象已与其客户端断开连接
```

`0x80010108` = `RPC_E_DISCONNECTED`，表示 WebView2 的子进程被系统或安全软件中断。

常见诱因：
- Windows Defender 实时保护扫描并终止了未签名的子进程
- 企业组策略限制了 WebView2
- WebView2 运行时安装不完整

## 解决办法（按推荐顺序）

### 方案 1：直接打开 index.html（最简单，100% 可用）

下载 **Electron 版**或者直接下载仓库里的 `index.html`，用 Chrome / Edge 浏览器双击打开。

**功能完全一样**——这个工具本身就是单个 HTML 文件，不联网、不需要安装。

### 方案 2：用 Electron 版 exe

下载 `SalaryTicker-1.0.0-win-x64-electron.exe`（约 69MB）。

Electron **自带 Chromium 内核**，不依赖系统 WebView2，在任何 Windows 上都能直接运行。

体积大是因为打包了整个浏览器内核，但**最稳定**。

### 方案 3：修复 WebView2

1. 打开 [微软 WebView2 下载页](https://developer.microsoft.com/microsoft-edge/webview2/)
2. 下载 **Evergreen Standalone Installer**（常青版独立安装程序）
3. 安装后重新打开程序

### 方案 4：加入杀毒软件白名单

把 `SalaryTicker-win.exe` 所在文件夹加入 Windows Defender 排除项：

设置 → 隐私和安全性 → Windows 安全中心 → 病毒和威胁防护 → 管理设置 → 排除项

### 方案 5：以管理员身份运行

右键 exe → 以管理员身份运行。**这只是绕过，不推荐长期使用。**

## 我们已经做的改进

新版本已经在启动失败时**弹出提示框**，说明原因和解决办法，而不是静默闪退。

如果你还看到闪退无提示，说明用的是旧版本，请重新下载。

## 两个版本怎么选？

| | Tauri 版（3MB） | Electron 版（69MB） |
|---|---|---|
| 体积 | 极小 | 大 |
| 依赖 | 需要系统 WebView2 | 无依赖，自带内核 |
| 稳定性 | 部分环境有问题 | 最稳 |
| 推荐场景 | 自己电脑能跑 | 给别人用 / 老电脑 |

**给别人分发，建议用 Electron 版**，避免对方遇到同样问题。