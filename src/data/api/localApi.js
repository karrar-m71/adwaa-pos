export const hasLocalApi = () => Boolean(window?.adwaaLocal?.enabled);
const normalizeLocalDoc = (doc) => {
  if (!doc) return doc;
  if (doc.data && typeof doc.data === 'object') {
    return { ...doc.data, id: doc.id };
  }
  return doc;
};

export async function localMeta() {
  if (!hasLocalApi()) return { ok: false, driver: 'none' };
  return window.adwaaLocal.meta();
}

export async function localListProducts() {
  if (!hasLocalApi()) return [];
  return window.adwaaLocal.products.list();
}

export async function localAddProduct(payload) {
  if (!hasLocalApi()) throw new Error('Local API unavailable');
  return window.adwaaLocal.products.add(payload);
}

export async function localUpdateProduct(localId, patch) {
  if (!hasLocalApi()) throw new Error('Local API unavailable');
  return window.adwaaLocal.products.update(localId, patch);
}

export async function localDeleteProduct(localId) {
  if (!hasLocalApi()) throw new Error('Local API unavailable');
  return window.adwaaLocal.products.remove(localId);
}

export async function localCreateInvoiceTx(payload) {
  if (!hasLocalApi()) throw new Error('Local API unavailable');
  return window.adwaaLocal.invoices.createTx(payload);
}

export async function localStoreList(collectionPath, constraints = []) {
  if (!hasLocalApi()) return [];
  const docs = await window.adwaaLocal.store.list(collectionPath, constraints);
  if (!Array.isArray(docs)) return [];
  return docs.map(normalizeLocalDoc);
}

export async function localStoreGet(docPath) {
  if (!hasLocalApi()) return null;
  const doc = await window.adwaaLocal.store.get(docPath);
  return normalizeLocalDoc(doc);
}

export async function localStoreSet(docPath, data, options = { merge: false }) {
  if (!hasLocalApi()) throw new Error('Local API unavailable');
  const doc = await window.adwaaLocal.store.set(docPath, data, options);
  return normalizeLocalDoc(doc);
}

export async function localStoreAdd(collectionPath, data) {
  if (!hasLocalApi()) throw new Error('Local API unavailable');
  const doc = await window.adwaaLocal.store.add(collectionPath, data);
  return normalizeLocalDoc(doc);
}

export async function localStoreDelete(docPath) {
  if (!hasLocalApi()) throw new Error('Local API unavailable');
  return window.adwaaLocal.store.delete(docPath);
}

export async function localStoreAtomic(ops = []) {
  if (!hasLocalApi()) throw new Error('Local API unavailable');
  return window.adwaaLocal.store.atomic(ops);
}

export async function localCreateSale(payload) {
  if (!hasLocalApi()) throw new Error('Local API unavailable');
  return window.adwaaLocal.usecases.createSale(payload);
}

export async function localUpdateSale(payload) {
  if (!hasLocalApi()) throw new Error('Local API unavailable');
  return window.adwaaLocal.usecases.updateSale(payload);
}

export async function localCreateVoucher(payload) {
  if (!hasLocalApi()) throw new Error('Local API unavailable');
  return window.adwaaLocal.usecases.createVoucher(payload);
}

export async function localCreatePurchase(payload) {
  if (!hasLocalApi()) throw new Error('Local API unavailable');
  return window.adwaaLocal.usecases.createPurchase(payload);
}

export async function localCreateSaleReturn(payload) {
  if (!hasLocalApi()) throw new Error('Local API unavailable');
  return window.adwaaLocal.usecases.createSaleReturn(payload);
}

export async function localCreatePurchaseReturn(payload) {
  if (!hasLocalApi()) throw new Error('Local API unavailable');
  return window.adwaaLocal.usecases.createPurchaseReturn(payload);
}

export async function localNextNo(prefix = 'INV') {
  if (!hasLocalApi()) throw new Error('Local API unavailable');
  return window.adwaaLocal.usecases.nextNo(prefix);
}

export async function runLocalSync() {
  if (!hasLocalApi()) return { ok: false, reason: 'local_api_unavailable' };
  return window.adwaaLocal.sync.run();
}

export async function getLocalSyncStatus() {
  if (!hasLocalApi()) return { running: false, lastResult: null };
  return window.adwaaLocal.sync.status();
}

export async function localExportBackup() {
  if (!hasLocalApi()) throw new Error('Local API unavailable');
  return window.adwaaLocal.backup.exportDb();
}

export async function localRestoreBackup() {
  if (!hasLocalApi()) throw new Error('Local API unavailable');
  return window.adwaaLocal.backup.restoreDb();
}
