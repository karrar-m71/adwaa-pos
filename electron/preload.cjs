const { contextBridge, ipcRenderer } = require('electron');

const MAX_PATH_LENGTH = 240;
const MAX_HASH_LENGTH = 128;
const MAX_OPS_PER_ATOMIC = 250;

const ensureString = (value, fallback = '') => (typeof value === 'string' ? value : fallback);
const ensureObject = (value) => (value && typeof value === 'object' && !Array.isArray(value) ? value : {});
const ensureArray = (value, limit = 100) => (Array.isArray(value) ? value.slice(0, limit) : []);
const ensureBoolean = (value, fallback = false) => (typeof value === 'boolean' ? value : fallback);

const normalizePath = (value) => {
  const path = ensureString(value).split('/').filter(Boolean).join('/');
  if (path.length > MAX_PATH_LENGTH) {
    throw new Error('Invalid local path');
  }
  if (path && !/^[\w\-/.]+$/u.test(path)) {
    throw new Error('Invalid local path');
  }
  return path;
};

const normalizeHash = (value) => {
  const hash = ensureString(value).trim();
  if (!hash || hash.length > MAX_HASH_LENGTH || !/^[a-f0-9_-]+$/i.test(hash)) {
    throw new Error('Invalid cache hash');
  }
  return hash;
};

const normalizeAtomicOps = (ops) => ensureArray(ops, MAX_OPS_PER_ATOMIC).map((op) => ({
  type: ensureString(op?.type),
  path: normalizePath(op?.path),
  data: ensureObject(op?.data),
  options: ensureObject(op?.options),
}));

const invoke = (channel, ...args) => ipcRenderer.invoke(channel, ...args);
const send = (channel, ...args) => ipcRenderer.send(channel, ...args);
const freeze = (value) => Object.freeze(value);

contextBridge.exposeInMainWorld('adwaaDesktop', freeze({
  isDesktop: true,
  minimize: () => send('window:minimize'),
  hide: () => send('window:hide'),
  toggleMaximize: () => send('window:toggle-maximize'),
  close: () => send('window:close'),
  printHtml: (payload) => invoke('desktop:print-html', ensureObject(payload)),
}));

contextBridge.exposeInMainWorld('adwaaLocal', freeze({
  enabled: true,
  meta: () => invoke('local-db:meta'),
  products: freeze({
    list: () => invoke('local-products:list'),
    add: (payload) => invoke('local-products:add', ensureObject(payload)),
    update: (localId, patch) => invoke('local-products:update', ensureString(localId), ensureObject(patch)),
    remove: (localId) => invoke('local-products:delete', ensureString(localId)),
  }),
  invoices: freeze({
    createTx: (payload) => invoke('local-invoices:create-tx', ensureObject(payload)),
  }),
  store: freeze({
    list: (collectionPath, constraints) => invoke('local-store:list', normalizePath(collectionPath), ensureArray(constraints)),
    get: (docPath) => invoke('local-store:get', normalizePath(docPath)),
    set: (docPath, data, options) => invoke('local-store:set', normalizePath(docPath), ensureObject(data), ensureObject(options)),
    add: (collectionPath, data) => invoke('local-store:add', normalizePath(collectionPath), ensureObject(data)),
    delete: (docPath) => invoke('local-store:delete', normalizePath(docPath)),
    atomic: (ops) => invoke('local-store:atomic', normalizeAtomicOps(ops)),
  }),
  imageCache: freeze({
    get: (hash) => invoke('local-image-cache:get', normalizeHash(hash)),
    set: (hash, payload) => invoke('local-image-cache:set', normalizeHash(hash), ensureObject(payload)),
  }),
  usecases: freeze({
    createSale: (payload) => invoke('local-usecase:create-sale', ensureObject(payload)),
    updateSale: (payload) => invoke('local-usecase:update-sale', ensureObject(payload)),
    deleteSale: (payload) => invoke('local-usecase:delete-sale', ensureObject(payload)),
    createVoucher: (payload) => invoke('local-usecase:create-voucher', ensureObject(payload)),
    createPurchase: (payload) => invoke('local-usecase:create-purchase', ensureObject(payload)),
    createSaleReturn: (payload) => invoke('local-usecase:create-sale-return', ensureObject(payload)),
    createPurchaseReturn: (payload) => invoke('local-usecase:create-purchase-return', ensureObject(payload)),
    nextNo: (prefix) => invoke('local-usecase:next-no', ensureString(prefix, 'INV')),
  }),
  sync: freeze({
    run: () => invoke('local-sync:run'),
    status: () => invoke('local-sync:status'),
  }),
  backup: freeze({
    exportDb: () => invoke('local-backup:export'),
    restoreDb: () => invoke('local-backup:restore'),
  }),
  flags: freeze({
    usesValidatedBridge: true,
    syncIntervalMs: 600000,
    typedNamespaces: true,
  }),
}));
