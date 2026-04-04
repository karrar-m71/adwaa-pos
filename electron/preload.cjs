const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('adwaaDesktop', {
  isDesktop: true,
  minimize: () => ipcRenderer.send('window:minimize'),
  hide: () => ipcRenderer.send('window:hide'),
  toggleMaximize: () => ipcRenderer.send('window:toggle-maximize'),
  close: () => ipcRenderer.send('window:close'),
  printHtml: (payload) => ipcRenderer.invoke('desktop:print-html', payload),
});

contextBridge.exposeInMainWorld('adwaaLocal', {
  enabled: true,
  meta: () => ipcRenderer.invoke('local-db:meta'),
  products: {
    list: () => ipcRenderer.invoke('local-products:list'),
    add: (payload) => ipcRenderer.invoke('local-products:add', payload),
    update: (localId, patch) => ipcRenderer.invoke('local-products:update', localId, patch),
    remove: (localId) => ipcRenderer.invoke('local-products:delete', localId),
  },
  invoices: {
    createTx: (payload) => ipcRenderer.invoke('local-invoices:create-tx', payload),
  },
  store: {
    list: (collectionPath, constraints) => ipcRenderer.invoke('local-store:list', collectionPath, constraints),
    get: (docPath) => ipcRenderer.invoke('local-store:get', docPath),
    set: (docPath, data, options) => ipcRenderer.invoke('local-store:set', docPath, data, options),
    add: (collectionPath, data) => ipcRenderer.invoke('local-store:add', collectionPath, data),
    delete: (docPath) => ipcRenderer.invoke('local-store:delete', docPath),
    atomic: (ops) => ipcRenderer.invoke('local-store:atomic', ops),
  },
  usecases: {
    createSale: (payload) => ipcRenderer.invoke('local-usecase:create-sale', payload),
    createVoucher: (payload) => ipcRenderer.invoke('local-usecase:create-voucher', payload),
    createPurchase: (payload) => ipcRenderer.invoke('local-usecase:create-purchase', payload),
    createSaleReturn: (payload) => ipcRenderer.invoke('local-usecase:create-sale-return', payload),
    createPurchaseReturn: (payload) => ipcRenderer.invoke('local-usecase:create-purchase-return', payload),
    nextNo: (prefix) => ipcRenderer.invoke('local-usecase:next-no', prefix),
  },
  sync: {
    run: () => ipcRenderer.invoke('local-sync:run'),
    status: () => ipcRenderer.invoke('local-sync:status'),
  },
  backup: {
    exportDb: () => ipcRenderer.invoke('local-backup:export'),
    restoreDb: () => ipcRenderer.invoke('local-backup:restore'),
  },
});
