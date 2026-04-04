const { getDb } = require('../sqlite.cjs');

const MAX_CACHE_ITEMS = 30;
const nowIso = () => new Date().toISOString();

function getImageProcessingCache(hash) {
  const key = String(hash || '').trim();
  if (!key) return null;
  const db = getDb();
  const row = db.prepare(`
    SELECT hash, data_url, file_name, mime_type, created_at, updated_at
    FROM image_processing_cache
    WHERE hash = ?
    LIMIT 1
  `).get(key);
  if (!row) return null;
  db.prepare(`
    UPDATE image_processing_cache
    SET updated_at = ?
    WHERE hash = ?
  `).run(nowIso(), key);
  return {
    hash: row.hash,
    dataUrl: row.data_url,
    fileName: row.file_name || '',
    mimeType: row.mime_type || 'image/jpeg',
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function setImageProcessingCache(hash, payload = {}) {
  const key = String(hash || '').trim();
  const dataUrl = String(payload.dataUrl || '').trim();
  if (!key || !dataUrl) return null;
  const db = getDb();
  const ts = nowIso();
  db.prepare(`
    INSERT INTO image_processing_cache (
      hash, data_url, file_name, mime_type, created_at, updated_at
    ) VALUES (
      @hash, @data_url, @file_name, @mime_type, @created_at, @updated_at
    )
    ON CONFLICT(hash) DO UPDATE SET
      data_url = excluded.data_url,
      file_name = excluded.file_name,
      mime_type = excluded.mime_type,
      updated_at = excluded.updated_at
  `).run({
    hash: key,
    data_url: dataUrl,
    file_name: String(payload.fileName || ''),
    mime_type: String(payload.mimeType || 'image/jpeg'),
    created_at: ts,
    updated_at: ts,
  });

  db.prepare(`
    DELETE FROM image_processing_cache
    WHERE hash NOT IN (
      SELECT hash FROM image_processing_cache
      ORDER BY updated_at DESC
      LIMIT ?
    )
  `).run(MAX_CACHE_ITEMS);

  return getImageProcessingCache(key);
}

module.exports = {
  getImageProcessingCache,
  setImageProcessingCache,
};
