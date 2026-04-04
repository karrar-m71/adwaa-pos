const { getDb } = require('../sqlite.cjs');
const { randomUUID } = require('crypto');
const { upsertDocPath, softDeleteDocPath, listCollectionDocs } = require('./firebase-adapter.cjs');

const MAX_RETRY = 10;
const BASE_RETRY_MS = 4000;
const PULL_COOLDOWN_MS = 60000;
const MAX_SYNCED_QUEUE_ROWS = 3000;
const nowIso = () => new Date().toISOString();
const logSyncError = (message, error) => {
  const details = error?.stack || error?.message || error || 'unknown_error';
  console.error(`[adwaa-sync] ${message}\n${details}`);
};
const toNum = (value) => {
  const n = Number(value || 0);
  return Number.isFinite(n) ? n : 0;
};

function toCollectionName(docPath = '') {
  const parts = String(docPath || '').split('/').filter(Boolean);
  if (parts.length < 2) return '';
  return parts.slice(0, -1).join('/');
}

function toDocId(docPath = '') {
  const parts = String(docPath || '').split('/').filter(Boolean);
  return parts[parts.length - 1] || '';
}

function normalizeProductForMobile(product = {}, productId = '') {
  const stockCount = Math.max(0, toNum(product.stock));
  return {
    source: 'adwaa-pos',
    sourceId: productId || product.id || '',
    syncVersion: 1,
    name: product.name || '',
    price: toNum(product.sellPrice),
    cat: product.cat || 'أخرى',
    brand: product.brand || '',
    unit: product.unit || 'قطعة',
    pts: toNum(product.pts),
    desc: product.desc || '',
    img: product.img || '📦',
    imageUrl: product.imgUrl || product.imageUrl || '',
    barcode: product.barcode || '',
    hasPackage: Boolean(product.hasPackage),
    packageName: product.packageName || '',
    packageQty: product.packageQty != null ? toNum(product.packageQty) : null,
    packagePrice: product.packagePrice != null ? toNum(product.packagePrice) : null,
    stock: stockCount > 0,
    stockCount,
    minStock: toNum(product.minStock),
    sellPrice: toNum(product.sellPrice),
    wholesalePrice: toNum(product.wholesalePrice),
    updatedAt: nowIso(),
  };
}

function normalizeMobileProductToPos(mobile = {}, id = '') {
  const stockCount = (() => {
    if (mobile.stockCount != null) return Math.max(0, toNum(mobile.stockCount));
    if (typeof mobile.stock === 'number') return Math.max(0, toNum(mobile.stock));
    if (typeof mobile.stock === 'boolean') return mobile.stock ? 1 : 0;
    return 0;
  })();
  const sellPrice = toNum(mobile.sellPrice ?? mobile.price ?? 0);
  return {
    id,
    name: mobile.name || '',
    cat: mobile.cat || 'أخرى',
    barcode: mobile.barcode || '',
    img: mobile.img || '📦',
    imgUrl: mobile.imageUrl || mobile.imgUrl || '',
    desc: mobile.desc || '',
    stock: stockCount,
    minStock: toNum(mobile.minStock),
    sellPrice,
    wholesalePrice: toNum(mobile.wholesalePrice),
    specialPrice: toNum(mobile.specialPrice),
    buyPrice: toNum(mobile.buyPrice),
    buyPriceInput: toNum(mobile.buyPriceInput),
    buyCurrency: mobile.buyCurrency || 'IQD',
    hasPackage: Boolean(mobile.hasPackage),
    packageName: mobile.packageName || '',
    packageQty: mobile.packageQty != null ? toNum(mobile.packageQty) : null,
    packagePrice: mobile.packagePrice != null ? toNum(mobile.packagePrice) : null,
    packageBarcode: mobile.packageBarcode || '',
    soldCount: toNum(mobile.soldCount),
    updatedAt: mobile.updatedAt || nowIso(),
    createdAt: mobile.createdAt || nowIso(),
  };
}

async function mirrorToMobileBridge(row, payload) {
  const collectionName = row.collection_name || toCollectionName(row.doc_path);
  if (collectionName !== 'pos_products') return;
  const id = toDocId(row.doc_path);
  if (!id) return;
  const targetPath = `products/${id}`;
  const mobilePayload = normalizeProductForMobile(payload, id);
  await upsertDocPath(targetPath, mobilePayload);
}

async function mirrorDeleteToMobileBridge(row) {
  const collectionName = row.collection_name || toCollectionName(row.doc_path);
  if (collectionName !== 'pos_products') return;
  const id = toDocId(row.doc_path);
  if (!id) return;
  await softDeleteDocPath(`products/${id}`);
}

function hasPendingLocalSync(syncStatus = '') {
  return ['pending_create', 'pending_update', 'pending_delete', 'failed'].includes(String(syncStatus || ''));
}

function upsertPosProductFromMobileLocal(docId, mobileData) {
  const db = getDb();
  const ts = nowIso();
  const docPath = `pos_products/${docId}`;
  const row = db.prepare(`SELECT * FROM documents WHERE doc_path = ? LIMIT 1`).get(docPath);
  const normalized = normalizeMobileProductToPos(mobileData, docId);

  if (!row) {
    db.prepare(`
      INSERT INTO documents (
        local_id, collection_name, doc_id, doc_path, firebase_id, data_json,
        searchable_name, searchable_barcode, sync_status, retry_count, last_error,
        created_at, updated_at, is_deleted
      ) VALUES (
        @local_id, 'pos_products', @doc_id, @doc_path, @firebase_id, @data_json,
        @searchable_name, @searchable_barcode, 'synced', 0, NULL,
        @created_at, @updated_at, 0
      )
    `).run({
      local_id: randomUUID(),
      doc_id: docId,
      doc_path: docPath,
      firebase_id: docId,
      data_json: JSON.stringify(normalized),
      searchable_name: String(normalized.name || ''),
      searchable_barcode: String(normalized.barcode || ''),
      created_at: ts,
      updated_at: ts,
    });
    return;
  }

  if (hasPendingLocalSync(row.sync_status)) return;

  const prev = row.data_json ? JSON.parse(row.data_json) : {};
  const merged = {
    ...prev,
    ...normalized,
    id: docId,
  };
  db.prepare(`
    UPDATE documents
    SET data_json = @data_json,
        searchable_name = @searchable_name,
        searchable_barcode = @searchable_barcode,
        firebase_id = COALESCE(firebase_id, @firebase_id),
        sync_status = 'synced',
        retry_count = 0,
        last_error = NULL,
        updated_at = @updated_at,
        is_deleted = @is_deleted
    WHERE doc_path = @doc_path
  `).run({
    doc_path: docPath,
    data_json: JSON.stringify(merged),
    searchable_name: String(merged.name || ''),
    searchable_barcode: String(merged.barcode || ''),
    firebase_id: docId,
    updated_at: ts,
    is_deleted: Number(mobileData?.is_deleted ? 1 : 0),
  });
}

function upsertCloudDocToLocal(collectionName, docId, data = {}) {
  const db = getDb();
  const ts = nowIso();
  const path = `${collectionName}/${docId}`;
  const row = db.prepare(`SELECT * FROM documents WHERE doc_path = ? LIMIT 1`).get(path);
  const payload = { ...(data || {}), id: docId };

  if (!row) {
    db.prepare(`
      INSERT INTO documents (
        local_id, collection_name, doc_id, doc_path, firebase_id, data_json,
        searchable_name, searchable_barcode, sync_status, retry_count, last_error,
        created_at, updated_at, is_deleted
      ) VALUES (
        @local_id, @collection_name, @doc_id, @doc_path, @firebase_id, @data_json,
        @searchable_name, @searchable_barcode, 'synced', 0, NULL,
        @created_at, @updated_at, @is_deleted
      )
    `).run({
      local_id: randomUUID(),
      collection_name: collectionName,
      doc_id: docId,
      doc_path: path,
      firebase_id: docId,
      data_json: JSON.stringify(payload),
      searchable_name: String(payload.name || payload.title || payload.userName || payload.fromTo || ''),
      searchable_barcode: String(payload.barcode || ''),
      created_at: ts,
      updated_at: ts,
      is_deleted: Number(payload?.is_deleted ? 1 : 0),
    });
    return;
  }

  if (hasPendingLocalSync(row.sync_status)) return;

  const prev = row.data_json ? JSON.parse(row.data_json) : {};
  const merged = { ...prev, ...payload, id: docId };
  db.prepare(`
    UPDATE documents
    SET data_json = @data_json,
        searchable_name = @searchable_name,
        searchable_barcode = @searchable_barcode,
        firebase_id = COALESCE(firebase_id, @firebase_id),
        sync_status = 'synced',
        retry_count = 0,
        last_error = NULL,
        updated_at = @updated_at,
        is_deleted = @is_deleted
    WHERE doc_path = @doc_path
  `).run({
    doc_path: path,
    data_json: JSON.stringify(merged),
    searchable_name: String(merged.name || merged.title || merged.userName || merged.fromTo || ''),
    searchable_barcode: String(merged.barcode || ''),
    firebase_id: docId,
    updated_at: ts,
    is_deleted: Number(merged?.is_deleted ? 1 : 0),
  });
}

function pruneMirroredMobileUsersFromPosLocal() {
  const db = getDb();
  const rows = db.prepare(`
    SELECT doc_path, data_json
    FROM documents
    WHERE collection_name = 'pos_users'
      AND is_deleted = 0
  `).all();

  let removed = 0;
  for (const row of rows) {
    try {
      const payload = row.data_json ? JSON.parse(row.data_json) : {};
      const hasDesktopIdentity = Boolean(String(payload.username || '').trim()) && Boolean(String(payload.role || '').trim());
      if (hasDesktopIdentity) continue;

      db.prepare(`
        DELETE FROM documents
        WHERE doc_path = ?
      `).run(row.doc_path);
      removed += 1;
    } catch (error) {
      logSyncError(`Failed to inspect desktop user record ${row.doc_path} during cleanup.`, error);
    }
  }

  return removed;
}

async function pullMobileProductsToPos() {
  const pullCollections = [
    // Mobile collections
    'products',
    'users',
    'gifts',
    'offers',
    'technicians',
    'gift_requests',
    'orders',
    'points_history',
    'notifications',
    'settings',
    // POS collections (Desktop source of truth for accounting flows)
    'pos_products',
    'pos_customers',
    'pos_suppliers',
    'pos_sales',
    'pos_purchases',
    'pos_returns',
    'pos_purchase_returns',
    'pos_vouchers',
    'pos_expenses',
  ];
  let imported = 0;
  let scanned = 0;
  const details = [];

  for (const collectionName of pullCollections) {
    try {
      // eslint-disable-next-line no-await-in-loop
      const docs = await listCollectionDocs(collectionName);
      scanned += docs.length;
      let importedInCollection = 0;
      for (const item of docs) {
        try {
          upsertCloudDocToLocal(collectionName, item.id, item.data || {});
          if (collectionName === 'products') {
            upsertPosProductFromMobileLocal(item.id, item.data || {});
          }
          imported += 1;
          importedInCollection += 1;
        } catch (error) {
          logSyncError(`Skipping broken document while importing ${collectionName}/${item?.id || 'unknown'}.`, error);
        }
      }
      details.push({ collection: collectionName, scanned: docs.length, imported: importedInCollection });
    } catch (error) {
      logSyncError(`Failed to pull Firebase collection "${collectionName}".`, error);
      details.push({ collection: collectionName, scanned: 0, imported: 0, error: true, message: error?.message || 'pull_failed' });
    }
  }

  const prunedDesktopUsers = pruneMirroredMobileUsersFromPosLocal();
  if (prunedDesktopUsers > 0) {
    details.push({ collection: 'pos_users', scanned: prunedDesktopUsers, imported: 0, cleaned: prunedDesktopUsers });
  }

  return { imported, scanned, details };
}

function backoffMs(retryCount) {
  return Math.min(10 * 60 * 1000, BASE_RETRY_MS * (2 ** Math.max(0, Number(retryCount || 0))));
}

function pruneSyncedQueue() {
  const db = getDb();
  const row = db.prepare(`SELECT COUNT(*) AS c FROM sync_queue WHERE status = 'synced'`).get();
  const totalSynced = Number(row?.c || 0);
  const overflow = totalSynced - MAX_SYNCED_QUEUE_ROWS;
  if (overflow <= 0) return 0;
  const result = db.prepare(`
    DELETE FROM sync_queue
    WHERE id IN (
      SELECT id
      FROM sync_queue
      WHERE status = 'synced'
      ORDER BY updated_at ASC
      LIMIT ?
    )
  `).run(overflow);
  return Number(result?.changes || 0);
}

function pickQueueBatch(limit = 200) {
  const db = getDb();
  return db.prepare(`
    SELECT *
    FROM sync_queue
    WHERE status IN ('pending', 'failed')
      AND retry_count < ?
    ORDER BY created_at ASC
    LIMIT ?
  `).all(MAX_RETRY, limit);
}

function markQueueSynced(rowId) {
  const db = getDb();
  db.prepare(`
    UPDATE sync_queue
    SET status = 'synced',
        last_error = NULL,
        updated_at = @updated_at,
        last_attempt_at = @last_attempt_at
    WHERE id = @id
  `).run({
    id: rowId,
    updated_at: nowIso(),
    last_attempt_at: nowIso(),
  });
}

function markQueueFailed(row, errorMessage) {
  const db = getDb();
  db.prepare(`
    UPDATE sync_queue
    SET status = 'failed',
        retry_count = retry_count + 1,
        last_error = @last_error,
        updated_at = @updated_at,
        last_attempt_at = @last_attempt_at
    WHERE id = @id
  `).run({
    id: row.id,
    last_error: String(errorMessage || 'sync_failed'),
    updated_at: nowIso(),
    last_attempt_at: nowIso(),
  });
}

function markDocumentSyncStatus(docPath, status, errorMessage = null) {
  const db = getDb();
  db.prepare(`
    UPDATE documents
    SET sync_status = @sync_status,
        last_error = @last_error,
        retry_count = CASE WHEN @sync_status = 'synced' THEN 0 ELSE retry_count + 1 END,
        updated_at = @updated_at
    WHERE doc_path = @doc_path
  `).run({
    doc_path: docPath,
    sync_status: status,
    last_error: errorMessage,
    updated_at: nowIso(),
  });
}

async function runSyncCycle() {
  const rows = pickQueueBatch(250);
  let synced = 0;
  let failed = 0;
  let skipped = 0;

  for (const row of rows) {
    try {
      if (row.status === 'failed' && Number(row.retry_count || 0) > 0) {
        const elapsed = Date.now() - new Date(row.last_attempt_at || row.updated_at || row.created_at).getTime();
        if (elapsed < backoffMs(row.retry_count)) {
          skipped += 1;
          continue;
        }
      }

      if (row.operation_type === 'delete') {
        await softDeleteDocPath(row.doc_path);
        await mirrorDeleteToMobileBridge(row);
      } else {
        const payload = row.payload_json ? JSON.parse(row.payload_json) : {};
        await upsertDocPath(row.doc_path, payload);
        await mirrorToMobileBridge(row, payload);
      }

      markQueueSynced(row.id);
      markDocumentSyncStatus(row.doc_path, 'synced', null);
      synced += 1;
    } catch (error) {
      const msg = error?.message || 'sync_error';
      markQueueFailed(row, msg);
      markDocumentSyncStatus(row.doc_path, 'failed', msg);
      failed += 1;
    }
  }

  let pullResult = { imported: 0, scanned: 0, skipped: true };
  const nowMs = Date.now();
  if ((nowMs - _lastPullAt) >= PULL_COOLDOWN_MS) {
    try {
      pullResult = await pullMobileProductsToPos();
      _lastPullAt = nowMs;
    } catch (error) {
      logSyncError('Desktop Firebase pull failed during sync cycle.', error);
      pullResult = { imported: 0, scanned: 0, skipped: false, error: error?.message || 'pull_failed' };
    }
  }
  const pruned = pruneSyncedQueue();

  return {
    ok: true,
    at: nowIso(),
    scanned: rows.length,
    synced,
    failed,
    skipped,
    pruned,
    mobilePull: pullResult,
  };
}

let _timer = null;
let _running = false;
let _lastResult = null;
let _lastPullAt = 0;

function startSyncScheduler(intervalMs = 10000) {
  if (_timer) return;
  _timer = setInterval(async () => {
    if (_running) return;
    _running = true;
    try {
      _lastResult = await runSyncCycle();
    } catch (error) {
      logSyncError('Unhandled error in sync scheduler.', error);
    } finally {
      _running = false;
    }
  }, intervalMs);
}

function stopSyncScheduler() {
  if (_timer) {
    clearInterval(_timer);
    _timer = null;
  }
}

function getSyncStatus() {
  return {
    running: _running,
    lastResult: _lastResult,
  };
}

module.exports = {
  runSyncCycle,
  startSyncScheduler,
  stopSyncScheduler,
  getSyncStatus,
};
