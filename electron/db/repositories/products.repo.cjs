const { randomUUID } = require('crypto');
const { getDb } = require('../sqlite.cjs');

const nowIso = () => new Date().toISOString();

function mapProductOut(row) {
  const raw = row.raw_json ? JSON.parse(row.raw_json) : {};
  return {
    ...raw,
    local_id: row.local_id,
    firebase_id: row.firebase_id || '',
    name: row.name,
    barcode: row.barcode || '',
    sellPrice: Number(row.sell_price || 0),
    buyPrice: Number(row.buy_price || 0),
    stock: Number(row.stock || 0),
    sync_status: row.sync_status,
    created_at: row.created_at,
    updated_at: row.updated_at,
    is_deleted: Number(row.is_deleted || 0) === 1,
  };
}

function listProducts() {
  const db = getDb();
  const rows = db.prepare(`
    SELECT * FROM products
    WHERE is_deleted = 0
    ORDER BY updated_at DESC
  `).all();
  return rows.map(mapProductOut);
}

function addProductLocal(payload = {}) {
  const db = getDb();
  const local_id = randomUUID();
  const ts = nowIso();
  db.prepare(`
    INSERT INTO products (
      local_id, firebase_id, name, barcode, sell_price, buy_price, stock,
      raw_json, sync_status, retry_count, last_error, created_at, updated_at, is_deleted
    ) VALUES (
      @local_id, NULL, @name, @barcode, @sell_price, @buy_price, @stock,
      @raw_json, 'pending_create', 0, NULL, @created_at, @updated_at, 0
    )
  `).run({
    local_id,
    name: String(payload.name || '').trim(),
    barcode: String(payload.barcode || '').trim() || null,
    sell_price: Number(payload.sellPrice ?? payload.sell_price ?? 0),
    buy_price: Number(payload.buyPrice ?? payload.buy_price ?? 0),
    stock: Number(payload.stock ?? 0),
    raw_json: JSON.stringify(payload),
    created_at: ts,
    updated_at: ts,
  });
  const row = db.prepare(`SELECT * FROM products WHERE local_id = ?`).get(local_id);
  return mapProductOut(row);
}

function updateProductLocal(local_id, patch = {}) {
  const db = getDb();
  const prev = db.prepare(`SELECT * FROM products WHERE local_id = ?`).get(local_id);
  if (!prev) throw new Error('Product not found');
  const prevRaw = prev.raw_json ? JSON.parse(prev.raw_json) : {};
  const mergedRaw = { ...prevRaw, ...patch };
  const ts = nowIso();

  db.prepare(`
    UPDATE products SET
      name = COALESCE(@name, name),
      barcode = COALESCE(@barcode, barcode),
      sell_price = COALESCE(@sell_price, sell_price),
      buy_price = COALESCE(@buy_price, buy_price),
      stock = COALESCE(@stock, stock),
      raw_json = @raw_json,
      sync_status = CASE WHEN sync_status = 'pending_create' THEN 'pending_create' ELSE 'pending_update' END,
      retry_count = 0,
      last_error = NULL,
      updated_at = @updated_at
    WHERE local_id = @local_id
  `).run({
    local_id,
    name: patch.name != null ? String(patch.name) : null,
    barcode: patch.barcode != null ? String(patch.barcode || '') : null,
    sell_price: patch.sellPrice != null ? Number(patch.sellPrice) : (patch.sell_price != null ? Number(patch.sell_price) : null),
    buy_price: patch.buyPrice != null ? Number(patch.buyPrice) : (patch.buy_price != null ? Number(patch.buy_price) : null),
    stock: patch.stock != null ? Number(patch.stock) : null,
    raw_json: JSON.stringify(mergedRaw),
    updated_at: ts,
  });

  const row = db.prepare(`SELECT * FROM products WHERE local_id = ?`).get(local_id);
  return mapProductOut(row);
}

function softDeleteProductLocal(local_id) {
  const db = getDb();
  const ts = nowIso();
  db.prepare(`
    UPDATE products SET
      is_deleted = 1,
      sync_status = CASE WHEN sync_status = 'pending_create' THEN 'pending_delete' ELSE 'pending_delete' END,
      retry_count = 0,
      last_error = NULL,
      updated_at = ?
    WHERE local_id = ?
  `).run(ts, local_id);
  return { ok: true };
}

module.exports = {
  listProducts,
  addProductLocal,
  updateProductLocal,
  softDeleteProductLocal,
};

