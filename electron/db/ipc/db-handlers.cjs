const { ipcMain } = require('electron');
const { listProducts, addProductLocal, updateProductLocal, softDeleteProductLocal } = require('../repositories/products.repo.cjs');
const { createInvoiceWithStockTx } = require('../repositories/invoices.repo.cjs');
const {
  listCollectionDocs,
  getDocument,
  upsertDocument,
  addDocument,
  softDeleteDocument,
  runAtomicOps,
} = require('../repositories/local-store.repo.cjs');
const {
  createSaleWithAccountingTx,
  updateSaleWithAccountingTx,
  createVoucherWithAccountingTx,
  createPurchaseWithAccountingTx,
  createSaleReturnTx,
  createPurchaseReturnTx,
  generateInvoiceNo,
} = require('../repositories/pos-usecases.repo.cjs');

function registerDbHandlers() {
  ipcMain.handle('local-db:meta', async () => ({ ok: true, driver: 'sqlite' }));

  ipcMain.handle('local-products:list', async () => listProducts());
  ipcMain.handle('local-products:add', async (_event, payload) => addProductLocal(payload));
  ipcMain.handle('local-products:update', async (_event, localId, patch) => updateProductLocal(localId, patch));
  ipcMain.handle('local-products:delete', async (_event, localId) => softDeleteProductLocal(localId));

  ipcMain.handle('local-invoices:create-tx', async (_event, payload) => createInvoiceWithStockTx(payload));

  ipcMain.handle('local-store:list', async (_event, collectionPath, constraints) => listCollectionDocs(collectionPath, constraints));
  ipcMain.handle('local-store:get', async (_event, docPath) => getDocument(docPath));
  ipcMain.handle('local-store:set', async (_event, docPath, data, options) => upsertDocument(docPath, data, options));
  ipcMain.handle('local-store:add', async (_event, collectionPath, data) => addDocument(collectionPath, data));
  ipcMain.handle('local-store:delete', async (_event, docPath) => softDeleteDocument(docPath));
  ipcMain.handle('local-store:atomic', async (_event, ops) => runAtomicOps(ops));

  ipcMain.handle('local-usecase:create-sale', async (_event, payload) => createSaleWithAccountingTx(payload));
  ipcMain.handle('local-usecase:update-sale', async (_event, payload) => updateSaleWithAccountingTx(payload));
  ipcMain.handle('local-usecase:create-voucher', async (_event, payload) => createVoucherWithAccountingTx(payload));
  ipcMain.handle('local-usecase:create-purchase', async (_event, payload) => createPurchaseWithAccountingTx(payload));
  ipcMain.handle('local-usecase:create-sale-return', async (_event, payload) => createSaleReturnTx(payload));
  ipcMain.handle('local-usecase:create-purchase-return', async (_event, payload) => createPurchaseReturnTx(payload));
  ipcMain.handle('local-usecase:next-no', async (_event, prefix) => generateInvoiceNo(prefix || 'INV'));
}

module.exports = {
  registerDbHandlers,
};
