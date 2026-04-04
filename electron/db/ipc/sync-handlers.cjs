const { ipcMain } = require('electron');
const { runSyncCycle, getSyncStatus } = require('../sync/sync-manager.cjs');

function registerSyncHandlers() {
  ipcMain.handle('local-sync:run', async () => runSyncCycle());
  ipcMain.handle('local-sync:status', async () => getSyncStatus());
}

module.exports = {
  registerSyncHandlers,
};

