const path = require('path');
const { ipcMain, BrowserWindow, dialog } = require('electron');
const { getDb, getDbPath } = require('../sqlite.cjs');
const { exportBackupToFile, restoreBackupFromFile } = require('../backup/backup-manager.cjs');

function buildDefaultBackupPath() {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  return path.join(path.dirname(getDbPath()), `adwaa-local-backup-${stamp}.json`);
}

async function openSaveDialog(event) {
  const win = BrowserWindow.fromWebContents(event.sender) || null;
  return dialog.showSaveDialog(win, {
    title: 'حفظ نسخة احتياطية محلية',
    defaultPath: buildDefaultBackupPath(),
    filters: [{ name: 'JSON Backup', extensions: ['json'] }],
  });
}

async function openRestoreDialog(event) {
  const win = BrowserWindow.fromWebContents(event.sender) || null;
  return dialog.showOpenDialog(win, {
    title: 'استعادة نسخة احتياطية محلية',
    properties: ['openFile'],
    filters: [{ name: 'JSON Backup', extensions: ['json'] }],
  });
}

function registerBackupHandlers() {
  ipcMain.handle('local-backup:export', async (event) => {
    const { canceled, filePath } = await openSaveDialog(event);
    if (canceled || !filePath) return { ok: false, canceled: true };
    const db = getDb();
    return exportBackupToFile({ db, dbPath: getDbPath(), outputPath: filePath });
  });

  ipcMain.handle('local-backup:restore', async (event) => {
    const { canceled, filePaths } = await openRestoreDialog(event);
    if (canceled || !filePaths?.length) return { ok: false, canceled: true };
    const db = getDb();
    return restoreBackupFromFile({ db, inputPath: filePaths[0], mode: 'replace' });
  });
}

module.exports = {
  registerBackupHandlers,
};

