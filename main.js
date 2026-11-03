const { app, BrowserWindow, Menu, shell, dialog } = require('electron');
const path = require('path');

// 单实例：重复打开时聚焦已有窗口
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  let win = null;

  function createWindow() {
    win = new BrowserWindow({
      width: 1200,
      height: 820,
      minWidth: 380,
      minHeight: 520,
      title: '工资秒表',
      backgroundColor: '#070a10',
      autoHideMenuBar: false,
      titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
      webPreferences: {
        // 页面是纯本地静态文件，不需要 Node 集成
        nodeIntegration: false,
        contextIsolation: true,
        sandbox: true,
        spellcheck: false
      }
    });

    const template = [
      {
        label: '视图',
        submenu: [
          { role: 'reload', label: '重新加载' },
          { role: 'toggleDevTools', label: '开发者工具' },
          { type: 'separator' },
          { role: 'resetZoom', label: '实际大小' },
          { role: 'zoomIn', label: '放大' },
          { role: 'zoomOut', label: '缩小' },
          { type: 'separator' },
          { role: 'togglefullscreen', label: '全屏' }
        ]
      },
      {
        label: '帮助',
        submenu: [
          {
            label: '快捷键说明',
            click: () => {
              dialog.showMessageBox(win, {
                type: 'info',
                title: '快捷键',
                message: 'S  打开/关闭设置\nEsc  关闭设置',
                buttons: ['好']
              });
            }
          }
        ]
      }
    ];
    // macOS 首项应是应用菜单
    if (process.platform === 'darwin') {
      template.unshift({
        label: app.name,
        submenu: [
          { role: 'about', label: '关于工资秒表' },
          { type: 'separator' },
          { role: 'hide', label: '隐藏' },
          { role: 'hideOthers', label: '隐藏其他' },
          { role: 'unhide', label: '显示全部' },
          { type: 'separator' },
          { role: 'quit', label: '退出' }
        ]
      });
    }
    Menu.setApplicationMenu(Menu.buildFromTemplate(template));

    win.loadFile(path.join(__dirname, 'index.html'));

    // 外部链接用系统浏览器打开
    win.webContents.setWindowOpenHandler(({ url }) => {
      if (/^https?:\/\//i.test(url)) shell.openExternal(url);
      return { action: 'deny' };
    });

    win.on('closed', () => { win = null; });
  }

  app.on('second-instance', () => {
    if (win) {
      if (win.isMinimized()) win.restore();
      win.focus();
    }
  });

  // 全局兜底：任何未捕获异常都弹窗提示，而不是静默闪退
  process.on('uncaughtException', (err) => {
    try {
      dialog.showErrorBox('工资秒表 - 运行出错',
        '程序遇到问题：\n\n' + (err && err.message ? err.message : String(err)) +
        '\n\n可以尝试右键“以管理员身份运行”，或直接双击同目录的 index.html 用浏览器打开。');
    } catch (_) {}
  });

  app.whenReady().then(() => {
    try {
      createWindow();
    } catch (e) {
      dialog.showErrorBox('工资秒表 - 启动失败',
        '无法创建窗口：\n\n' + (e && e.message ? e.message : String(e)) +
        '\n\n可以尝试右键“以管理员身份运行”，或直接双击 index.html 用浏览器打开。');
      app.quit();
      return;
    }
    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
  });

  // macOS 习惯：关窗不退出应用
  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
  });
}
