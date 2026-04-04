const path = require('path');
const { app, BrowserWindow, ipcMain } = require('electron');
const { initDb } = require('./db/sqlite.cjs');
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
  return path.join(__dirname, '..', 'build', 'icon.ico');
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
      sandbox: false,
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
}

app.whenReady().then(() => {
  initDb(app.getPath('userData'));
  registerDbHandlers();
  registerSyncHandlers();
  registerBackupHandlers();
  runSyncCycle().catch((error) => {
    logSyncError('Initial desktop sync failed during app startup.', error);
  });
  setupAutoUpdater();
  startSyncScheduler(10000);
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  stopSyncScheduler();
  if (process.platform !== 'darwin') app.quit();
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
