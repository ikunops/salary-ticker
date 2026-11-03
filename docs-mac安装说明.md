# macOS 安装说明

## 选择版本

| 你的 Mac | 下载 |
|---|---|
| Apple Silicon（M1/M2/M3/M4） | `SalaryTicker-1.0.0-mac-arm64.zip` |
| Intel 芯片 | `SalaryTicker-1.0.0-mac-x64.zip` |

不确定的话：点左上角  → 关于本机，看「芯片」一栏。

## 安装步骤

### 1. 解压

双击 zip 解压，得到 `SalaryTicker.app`。

### 2. 如果双击打不开（重要）

**情况 A：提示"无法打开，因为无法验证开发者"**

这是 macOS 的 Gatekeeper 拦截（应用未做付费签名），不是病毒。

做法：**右键点击** `SalaryTicker.app` → 选 **「打开」** → 弹窗里再点 **「打开」**。

只需一次，之后正常双击即可。

**情况 B：提示"应用已损坏，移到废纸篓"**

这是因为 zip 打包时丢失了可执行权限。打开「终端」，执行：

```bash
xattr -cr /Applications/SalaryTicker.app
chmod +x /Applications/SalaryTicker.app/Contents/MacOS/SalaryTicker
```

（如果放在其他位置，把路径换成你的实际路径）

然后重新打开。

### 3. 拖到「应用程序」文件夹（可选）

把 `SalaryTicker.app` 拖进「应用程序」文件夹，之后可在启动台搜索「工资秒表」。

## 为什么会有安全提示？

因为应用没有购买 Apple 开发者证书（$99/年）做公证（notarization）。

- 这是本地小工具的常态，不影响功能
- 你的数据全部保存在本机，不联网、不上传

如果介意，可以从源码自行构建（见 README 的「构建」章节），自己编译的不会提示。