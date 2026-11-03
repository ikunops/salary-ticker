const { app, BrowserWindow, Menu, shell, dialog } = require('electron');
const path = require('path');

// Single instance: focus the existing window when launched again
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
      title: 'SalaryTicker',
      backgroundColor: '#070a10',
      autoHideMenuBar: false,
      titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        sandbox: true,
        spellcheck: false
      }
    });

    const template = [
      {
        label: 'View',
        submenu: [
          { role: 'reload', label: 'Reload' },
          { role: 'toggleDevTools', label: 'DevTools' },
          { type: 'separator' },
          { role: 'resetZoom', label: 'Actual Size' },
          { role: 'zoomIn', label: 'Zoom In' },
          { role: 'zoomOut', label: 'Zoom Out' },
          { type: 'separator' },
          { role: 'togglefullscreen', label: 'Fullscreen' }
        ]
      },
      {
        label: 'Help',
        submenu: [
          {
            label: 'Shortcuts',
            click: () => {
              dialog.showMessageBox(win, {
                type: 'info',
                title: 'Shortcuts',
                message: 'S  Open/close settings\nEsc  Close settings',
                buttons: ['OK']
              });
            }
          }
        ]
      }
    ];

    if (process.platform === 'darwin') {
      template.unshift({
        label: app.name,
        submenu: [
          { role: 'about', label: 'About' },
          { type: 'separator' },
          { role: 'hide', label: 'Hide' },
          { role: 'hideOthers', label: 'Hide Others' },
          { role: 'unhide', label: 'Show All' },
          { type: 'separator' },
          { role: 'quit', label: 'Quit' }
        ]
      });
    }
    Menu.setApplicationMenu(Menu.buildFromTemplate(template));

    win.loadFile(path.join(__dirname, 'index.html'));

    // Open external links in the system browser
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

  // Catch uncaught errors so the app does not silently crash
  process.on('uncaughtException', (err) => {
    try {
      dialog.showErrorBox('SalaryTicker - Error',
        'An error occurred:\n\n' + (err && err.message ? err.message : String(err)));
    } catch (_) {}
  });

  app.whenReady().then(() => {
    try {
      createWindow();
    } catch (e) {
      dialog.showErrorBox('SalaryTicker - Failed to start',
        'Could not create window:\n\n' + (e && e.message ? e.message : String(e)));
      app.quit();
      return;
    }
    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
  });

  // macOS: keep app running when all windows are closed
  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
  });
}
