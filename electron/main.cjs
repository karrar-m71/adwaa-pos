const path = require('path');
const fs = require('fs');
const { app, BrowserWindow, dialog, ipcMain } = require('electron');

// Load environment variables from an external file — never bundled inside the binary.
// In development : <project-root>/.env.local
// In production  : <userData>/.env  (e.g. %APPDATA%/Adwaa POS/.env on Windows)
//   → The file must be placed there by the installer or the administrator.
//   → Must be called inside app.whenReady() so that app.getPath('userData') is available.
function loadEnvFile() {
  const candidates = app.isPackaged
    ? [path.join(app.getPath('userData'), '.env')]
    : [
        path.join(__dirname, '..', '.env.local'),
        path.join(__dirname, '..', '.env'),
      ];

  for (const envPath of candidates) {
    try {
      const content = fs.readFileSync(envPath, 'utf8');
      for (const line of content.split('\n')) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) continue;
        const eqIdx = trimmed.indexOf('=');
        if (eqIdx < 1) continue;
        const key = trimmed.slice(0, eqIdx).trim();
        const val = trimmed.slice(eqIdx + 1).trim();
        if (key && !(key in process.env)) process.env[key] = val;
      }
      return;
    } catch {
      // file not found — try next candidate
    }
  }
}

const { initDb, getDb, getDbPath } = require('./db/sqlite.cjs');
const { registerDbHandlers } = require('./db/ipc/db-handlers.cjs');
const { registerSyncHandlers } = require('./db/ipc/sync-handlers.cjs');
const { registerBackupHandlers } = require('./db/ipc/backup-handlers.cjs');
const { runSyncCycle, startSyncScheduler, stopSyncScheduler } = require('./db/sync/sync-manager.cjs');

const isDev = !!process.env.ELECTRON_START_URL;
const logSyncError = (message, error) => {
  const details = error?.stack || error?.message || error || 'unknown_error';
  console.error(`[adwaa-sync] ${message}\n${details}`);
};
const logUpdater = (message, error = null) => {
  const details = error ? `\n${error?.stack || error?.message || error}` : '';
  console.log(`[adwaa-update] ${message}${details}`);
};

function resolveWindowIcon() {
  if (process.platform !== 'win32') return undefined;
  if (app.isPackaged) {
    return path.join(process.resourcesPath, 'icon.ico');
  }
  return path.join(__dirname, 'assets', 'icon.ico');
}

function setupAutoUpdater() {
  if (!app.isPackaged || process.platform !== 'win32') return;

  let autoUpdater;
  try {
    ({ autoUpdater } = require('electron-updater'));
  } catch (error) {
    logUpdater('electron-updater is not installed.', error);
    return;
  }

  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;

  autoUpdater.on('checking-for-update', () => {
    logUpdater('Checking for updates.');
  });

  autoUpdater.on('update-available', (info) => {
    logUpdater(`Update available: ${info?.version || 'unknown_version'}`);
  });

  autoUpdater.on('update-not-available', () => {
    logUpdater('No updates available.');
  });

  autoUpdater.on('download-progress', (progress) => {
    const percent = Number(progress?.percent || 0).toFixed(1);
    logUpdater(`Downloading update: ${percent}%`);
  });

  autoUpdater.on('update-downloaded', (info) => {
    logUpdater(`Update downloaded: ${info?.version || 'unknown_version'}. It will install on next app quit.`);
  });

  autoUpdater.on('error', (error) => {
    logUpdater('Auto-update failed.', error);
  });

  autoUpdater.checkForUpdatesAndNotify().catch((error) => {
    logUpdater('Unable to check for updates.', error);
  });
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1100,
    minHeight: 700,
    show: false,
    autoHideMenuBar: true,
    frame: false,
    titleBarStyle: 'hidden',
    backgroundColor: '#f8fbff',
    icon: resolveWindowIcon(),
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  if (isDev) {
    win.loadURL(process.env.ELECTRON_START_URL);
  } else {
    win.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
  }

  win.once('ready-to-show', () => {
    win.maximize();
    win.show();
  });

  win.on('close', async (event) => {
    if (win.__adwaaClosingConfirmed) return;
    event.preventDefault();
    try {
      const result = await dialog.showMessageBox(win, {
        type: 'question',
        buttons: ['نعم', 'لا'],
        defaultId: 0,
        cancelId: 1,
        title: 'نسخة احتياطية',
        message: 'هل تريد أخذ نسخة احتياطية؟',
        detail: 'يمكن حفظ نسخة من قاعدة البيانات قبل إغلاق البرنامج.',
      });
      if (result.response === 0) {
        const now = new Date();
        const pad = (value) => String(value).padStart(2, '0');
        const backupName = `backup-${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}-${pad(now.getHours())}-${pad(now.getMinutes())}.db`;
        const preferredDir = app.getPath('documents') || app.getPath('desktop');
        const outputPath = path.join(preferredDir, backupName);
        getDb().pragma('wal_checkpoint(TRUNCATE)');
        fs.copyFileSync(getDbPath(), outputPath);
      }
    } catch (error) {
      console.error(`[adwaa-backup] Close backup failed\n${error?.stack || error?.message || error}`);
    }
    win.__adwaaClosingConfirmed = true;
    win.close();
  });
}

async function printHtmlDocument({ html = '', title = 'Adwaa POS Print' } = {}) {
  if (!html || !String(html).trim()) throw new Error('Missing print HTML payload');
  const printWin = new BrowserWindow({
    show: false,
    autoHideMenuBar: true,
    webPreferences: {
      sandbox: true,
    },
  });
  try {
    await printWin.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(String(html))}`);
    return await new Promise((resolve, reject) => {
      printWin.webContents.print({ silent: false, printBackground: true, deviceName: '' }, (success, errorType) => {
        if (!success) {
          reject(new Error(errorType || 'print_failed'));
          return;
        }
        resolve({ ok: true, title });
      });
    });
  } finally {
    if (!printWin.isDestroyed()) {
      printWin.close();
    }
  }
}

app.whenReady().then(() => {
  loadEnvFile();
  initDb(app.getPath('userData'));
  registerDbHandlers();
  registerSyncHandlers();
  registerBackupHandlers();
  runSyncCycle().catch((error) => {
    logSyncError('Initial desktop sync failed during app startup.', error);
  });
  setupAutoUpdater();
  startSyncScheduler(600000);
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  stopSyncScheduler();
  if (process.platform !== 'darwin') app.quit();
});

ipcMain.handle('desktop:print-html', async (_event, payload) => {
  try {
    return await printHtmlDocument(payload);
  } catch (error) {
    console.error(`[adwaa-print] Unable to print document\n${error?.stack || error?.message || error}`);
    return { ok: false, error: error?.message || 'print_failed' };
  }
});

ipcMain.on('window:minimize', (event) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  if (win) win.minimize();
});

ipcMain.on('window:hide', (event) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  if (win) win.hide();
});

ipcMain.on('window:toggle-maximize', (event) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  if (!win) return;
  if (win.isMaximized()) win.unmaximize();
  else win.maximize();
});

ipcMain.on('window:close', (event) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  if (win) win.close();
});
