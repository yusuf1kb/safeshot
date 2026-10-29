'use strict';

const { app, BrowserWindow, ipcMain, dialog, Menu, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const { pathToFileURL } = require('url');

const { exportImage, isImageFile } = require('./image/export');
const registry = require('./registry');

const APP_PATH = path.join(__dirname, '..');
const DEV = !app.isPackaged;
const ICON = path.join(APP_PATH, 'resources', 'icon.png');

const LOG_FILE = process.env.SAFESHOT_LOG || null;
function trace(...args) {
  if (!LOG_FILE) return;
  try {
    fs.appendFileSync(LOG_FILE, `${new Date().toISOString()} ${args.join(' ')}\n`);
  } catch (_) {
    /* yoksay */
  }
}

let win = null;
let pendingFiles = [];

function filesFromArgv(argv) {
  const i = argv.indexOf('--open');
  if (i === -1) return [];
  return argv
    .slice(i + 1)
    .filter((a) => a && !a.startsWith('--'))
    .filter((p) => {
      try {
        return fs.statSync(p).isFile();
      } catch (_) {
        return false;
      }
    });
}

function sendFiles(files) {
  if (!win || win.isDestroyed()) return;
  pendingFiles.push(...files);
  win.webContents.send('open-files', files);
  if (win.isMinimized()) win.restore();
  win.focus();
}

function createWindow() {
  win = new BrowserWindow({
    width: 1320,
    height: 880,
    minWidth: 940,
    minHeight: 620,
    backgroundColor: '#0b1220',
    title: 'Safeshot',
    icon: fs.existsSync(ICON) ? ICON : undefined,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      spellcheck: false,
    },
  });

  win.once('ready-to-show', () => win.show());
  win.loadFile(path.join(APP_PATH, 'renderer', 'index.html'));

  win.webContents.on('console-message', (...args) => {
    const d = args[1];
    if (d && typeof d === 'object' && 'message' in d) trace('renderer:', d.level, d.message);
    else trace('renderer:', args[2]);
  });
  win.webContents.on('did-fail-load', (_e, code, desc) => trace('did-fail-load', code, desc));

  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });

  win.on('closed', () => {
    win = null;
  });
}

const gotLock = app.requestSingleInstanceLock({ files: filesFromArgv(process.argv) });
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', (_e, argv) => {
    const files = filesFromArgv(argv);
    if (files.length) sendFiles(files);
    else if (win) {
      if (win.isMinimized()) win.restore();
      win.focus();
    }
  });

  app.whenReady().then(async () => {
    Menu.setApplicationMenu(null);

    if (process.env.SAFESHOT_REG === 'register' || process.env.SAFESHOT_REG === 'unregister') {
      const r =
        process.env.SAFESHOT_REG === 'register'
          ? await registry.register({ appPath: APP_PATH, dev: DEV })
          : await registry.unregister();
      trace('reg', JSON.stringify(r));
      app.quit();
      return;
    }

    createWindow();

    // Sağ tık menüsü her zaman kayıtlı kalsın (yol değiştiyse sessizce düzeltir).
    registry.ensure({ appPath: APP_PATH, dev: DEV }).then((r) => trace('reg', JSON.stringify(r)));

    const initial = filesFromArgv(process.argv);
    if (initial.length) {
      win.webContents.once('did-finish-load', () => setTimeout(() => sendFiles(initial), 300));
    }

    // Gelistirme: arayuzun ekran goruntusunu alip cikar (SAFESHOT_SHOT=yol.png)
    if (process.env.SAFESHOT_SHOT) {
      trace('shot modu aktif');
      win.webContents.once('did-finish-load', () => {
        trace('did-finish-load');
        const open = process.env.SAFESHOT_OPEN;
        if (open) setTimeout(() => sendFiles([open]), 250);
        setTimeout(async () => {
          try {
            const info = await win.webContents.executeJavaScript(
              "typeof state !== 'undefined' ? JSON.stringify({alan: state.regions.length, yontem: state.defaults.method, guc: state.defaults.strength[state.defaults.method], arac: state.tool}) : 'state yok'",
            );
            trace('durum', info);
          } catch (err) {
            trace('durum okunamadi', err && err.message);
          }
          if (DEV && process.env.SAFESHOT_EVAL) {
            try {
              const out = await win.webContents.executeJavaScript(process.env.SAFESHOT_EVAL);
              trace('eval', JSON.stringify(out));
              await new Promise((r) => setTimeout(r, 4000));
              const after = await win.webContents.executeJavaScript(
                "typeof state !== 'undefined' ? JSON.stringify({alan: state.regions.length, pill: document.querySelector('#countPill').textContent}) : 'yok'",
              );
              trace('eval sonrasi', after);
            } catch (err) {
              trace('eval hata', err && err.message);
            }
          }
          try {
            win.show();
            win.focus();
            await new Promise((r) => setTimeout(r, 350));
            win.webContents.invalidate();
            await new Promise((r) => setTimeout(r, 350));
            const img = await win.webContents.capturePage();
            fs.writeFileSync(process.env.SAFESHOT_SHOT, img.toPNG());
            trace('kaydedildi', process.env.SAFESHOT_SHOT);

            if (process.env.SAFESHOT_SHOT2) {
              await win.webContents.executeJavaScript(
                "(() => { const r = document.querySelector('.row'); if (r) r.click(); return true; })()",
              );
              await new Promise((r) => setTimeout(r, 700));
              const img2 = await win.webContents.capturePage();
              fs.writeFileSync(process.env.SAFESHOT_SHOT2, img2.toPNG());
              trace('kaydedildi', process.env.SAFESHOT_SHOT2);
            }
          } catch (err) {
            trace('hata', err && err.message);
          }
          app.quit();
        }, 9000);
      });
    }

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
  });
}

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

// ---------------- IPC ----------------

ipcMain.handle('app:info', async () => {
  const st = await registry.status();
  return { version: app.getVersion(), dev: DEV, registered: st.registered };
});

ipcMain.handle('files:take', async () => {
  const files = pendingFiles;
  pendingFiles = [];
  return files;
});

ipcMain.handle('file:pick', async () => {
  const res = await dialog.showOpenDialog(win, {
    title: 'Fotoğraf seç',
    properties: ['openFile', 'multiSelections'],
    filters: [
      { name: 'Görseller', extensions: registry.EXTS },
      { name: 'Tüm dosyalar', extensions: ['*'] },
    ],
  });
  if (res.canceled) return [];
  return res.filePaths.filter(isImageFile);
});

ipcMain.handle('file:info', async (_event, file) => {
  if (!isImageFile(file)) throw new Error('Desteklenmeyen dosya türü');
  const stat = fs.statSync(file);
  return {
    file,
    name: path.basename(file),
    url: pathToFileURL(file).href,
    bytes: stat.size,
  };
});

ipcMain.handle('export', async (_event, job) => {
  return exportImage(job);
});

ipcMain.handle('export:pick', async (_event, file, format) => {
  const base = path.basename(file, path.extname(file));
  const extMap = { pdf: 'pdf', png: 'png', jpeg: 'jpg', webp: 'webp', orijinal: path.extname(file).slice(1) || 'jpg' };
  const res = await dialog.showSaveDialog(win, {
    title: 'Farklı kaydet',
    defaultPath: path.join(path.dirname(file), `${base}-gizli.${extMap[format] || 'jpg'}`),
  });
  return res.canceled ? null : res.filePath;
});

ipcMain.handle('shell:register', async () => {
  return registry.register({ appPath: APP_PATH, dev: DEV });
});

ipcMain.handle('shell:unregister', async () => {
  return registry.unregister();
});

ipcMain.handle('shell:status', async () => registry.status());

ipcMain.handle('folder:open', async (_event, file) => {
  shell.showItemInFolder(file);
});
