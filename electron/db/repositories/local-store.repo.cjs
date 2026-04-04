const { randomUUID } = require('crypto');
const { getDb } = require('../sqlite.cjs');

const nowIso = () => new Date().toISOString();

function genDocId() {
  const s = randomUUID().replace(/-/g, '');
  return s.slice(0, 20);
}

function normalizePath(path = '') {
  return String(path || '').split('/').filter(Boolean).join('/');
}

function splitPath(path = '') {
  const parts = normalizePath(path).split('/').filter(Boolean);
  return { parts, isDocPath: parts.length % 2 === 0 };
}

function getCollectionNameFromDocPath(docPath) {
  const parts = normalizePath(docPath).split('/').filter(Boolean);
  if (parts.length < 2) throw new Error(`Invalid doc path: ${docPath}`);
  return parts.slice(0, -1).join('/');
}

function getDocIdFromPath(docPath) {
  const parts = normalizePath(docPath).split('/').filter(Boolean);
  if (!parts.length) throw new Error(`Invalid doc path: ${docPath}`);
  return parts[parts.length - 1];
}

function queueSyncTx(db, payload) {
  const ts = nowIso();
  db.prepare(`
    INSERT INTO sync_queue (
      id, entity_type, local_id, collection_name, doc_path,
      operation_type, payload_json, status, retry_count, last_error,
      created_at, updated_at, last_attempt_at
    ) VALUES (
      @id, 'document', @local_id, @collection_name, @doc_path,
      @operation_type, @payload_json, 'pending', 0, NULL,
      @created_at, @updated_at, NULL
    )
  `).run({
    id: randomUUID(),
    local_id: payload.local_id,
    collection_name: payload.collection_name,
    doc_path: payload.doc_path,
    operation_type: payload.operation_type,
    payload_json: payload.payload_json,
    created_at: ts,
    updated_at: ts,
  });
}

function rowToDoc(row) {
  const data = row?.data_json ? JSON.parse(row.data_json) : {};
  return {
    id: row.doc_id,
    path: row.doc_path,
    collection: row.collection_name,
    local_id: row.local_id,
    firebase_id: row.firebase_id || '',
    sync_status: row.sync_status,
    is_deleted: Number(row.is_deleted || 0) === 1,
    created_at: row.created_at,
    updated_at: row.updated_at,
    data,
  };
}

function buildConstraintsFn(constraints = []) {
  return (docs) => {
    let rows = docs;
    for (const c of constraints) {
      if (!c || !c.type) continue;
      if (c.type === 'where' && c.op === '==') {
        rows = rows.filter((d) => (d.data || {})[c.field] === c.value);
      }
      if (c.type === 'orderBy') {
        rows = [...rows].sort((a, b) => {
          const av = (a.data || {})[c.field];
          const bv = (b.data || {})[c.field];
          if (av === bv) return 0;
          if (c.direction === 'desc') return av > bv ? -1 : 1;
          return av > bv ? 1 : -1;
        });
      }
      if (c.type === 'limit') {
        rows = rows.slice(0, Number(c.value || 0));
      }
    }
    return rows;
  };
}

function isSimpleFieldName(field = '') {
  return /^[A-Za-z0-9_]+$/.test(String(field || ''));
}

function buildFieldExpr(field = '') {
  const normalized = String(field || '').trim();
  if (!normalized || !isSimpleFieldName(normalized)) return null;
  if (normalized === 'id' || normalized === 'doc_id') return 'doc_id';
  if (normalized === 'name' || normalized === 'fromTo') return 'searchable_name';
  if (normalized === 'barcode') return 'searchable_barcode';
  if (normalized === 'createdAt') return `json_extract(data_json, '$.createdAt')`;
  if (normalized === 'updatedAt') return `json_extract(data_json, '$.updatedAt')`;
  return `json_extract(data_json, '$.${normalized}')`;
}

function buildSqlConstraints(constraints = []) {
  const supported = [];
  const unsupported = [];
  const whereClauses = [];
  const params = [];
  const orderClauses = [];
  let limitClause = '';

  for (const constraint of Array.isArray(constraints) ? constraints : []) {
    if (!constraint || !constraint.type) continue;

    if (constraint.type === 'where' && constraint.op === '==') {
      const fieldExpr = buildFieldExpr(constraint.field);
      if (!fieldExpr) {
        unsupported.push(constraint);
        continue;
      }
      if (constraint.value == null) {
        whereClauses.push(`${fieldExpr} IS NULL`);
      } else {
        whereClauses.push(`${fieldExpr} = ?`);
        params.push(constraint.value);
      }
      supported.push(constraint);
      continue;
    }

    if (constraint.type === 'orderBy') {
      const fieldExpr = buildFieldExpr(constraint.field);
      if (!fieldExpr) {
        unsupported.push(constraint);
        continue;
      }
      const direction = String(constraint.direction || 'asc').toLowerCase() === 'desc' ? 'DESC' : 'ASC';
      orderClauses.push(`${fieldExpr} ${direction}`);
      supported.push(constraint);
      continue;
    }

    if (constraint.type === 'limit') {
      const limitValue = Number(constraint.value || 0);
      if (!Number.isFinite(limitValue) || limitValue <= 0) {
        unsupported.push(constraint);
        continue;
      }
      limitClause = ` LIMIT ${Math.floor(limitValue)} `;
      supported.push(constraint);
      continue;
    }

    unsupported.push(constraint);
  }

  return {
    supported,
    unsupported,
    whereSql: whereClauses.length ? ` AND ${whereClauses.join(' AND ')} ` : '',
    orderSql: orderClauses.length ? ` ORDER BY ${orderClauses.join(', ')} ` : ' ORDER BY updated_at DESC ',
    limitSql: limitClause,
    params,
  };
}

function listCollectionDocs(collectionPath, constraints = []) {
  const db = getDb();
  const normalizedCollection = normalizePath(collectionPath);
  const sqlConstraints = buildSqlConstraints(constraints);

  try {
    const rows = db.prepare(`
      SELECT * FROM documents
      WHERE collection_name = ?
        AND is_deleted = 0
        ${sqlConstraints.whereSql}
      ${sqlConstraints.orderSql}
      ${sqlConstraints.limitSql}
    `).all(normalizedCollection, ...sqlConstraints.params);
    const docs = rows.map(rowToDoc).map((d) => ({ id: d.id, data: d.data, path: d.path }));
    return sqlConstraints.unsupported.length
      ? buildConstraintsFn(sqlConstraints.unsupported)(docs)
      : docs;
  } catch (error) {
    console.warn('[adwaa-local-store] SQL constraint fallback:', error?.message || error);
    const rows = db.prepare(`
      SELECT * FROM documents
      WHERE collection_name = ?
        AND is_deleted = 0
      ORDER BY updated_at DESC
    `).all(normalizedCollection);
    const docs = rows.map(rowToDoc).map((d) => ({ id: d.id, data: d.data, path: d.path }));
    return buildConstraintsFn(constraints)(docs);
  }
}

function getDocument(docPath) {
  const db = getDb();
  const row = db.prepare(`
    SELECT * FROM documents
    WHERE doc_path = @doc_path
      AND is_deleted = 0
    LIMIT 1
  `).get({ doc_path: normalizePath(docPath) });
  if (!row) return null;
  const doc = rowToDoc(row);
  return { id: doc.id, data: doc.data, path: doc.path };
}

function upsertDocument(docPath, data = {}, options = { merge: false }) {
  const db = getDb();
  const ts = nowIso();
  const path = normalizePath(docPath);
  const collectionName = getCollectionNameFromDocPath(path);
  const docId = getDocIdFromPath(path);
  const prev = db.prepare(`SELECT * FROM documents WHERE doc_path = ?`).get(path);

  const prevData = prev?.data_json ? JSON.parse(prev.data_json) : {};
  const nextData = options?.merge ? { ...prevData, ...data } : { ...data };
  const nextSyncStatus = prev
    ? (prev.sync_status === 'pending_create' ? 'pending_create' : 'pending_update')
    : 'pending_create';

  const tx = db.transaction(() => {
    if (!prev) {
      const localId = randomUUID();
      db.prepare(`
        INSERT INTO documents (
          local_id, collection_name, doc_id, doc_path, firebase_id, data_json,
          searchable_name, searchable_barcode, sync_status, retry_count, last_error,
          created_at, updated_at, is_deleted
        ) VALUES (
          @local_id, @collection_name, @doc_id, @doc_path, NULL, @data_json,
          @searchable_name, @searchable_barcode, 'pending_create', 0, NULL,
          @created_at, @updated_at, 0
        )
      `).run({
        local_id: localId,
        collection_name: collectionName,
        doc_id: docId,
        doc_path: path,
        data_json: JSON.stringify(nextData),
        searchable_name: String(nextData?.name || nextData?.fromTo || ''),
        searchable_barcode: String(nextData?.barcode || ''),
        created_at: ts,
        updated_at: ts,
      });
      queueSyncTx(db, {
        local_id: localId,
        collection_name: collectionName,
        doc_path: path,
        operation_type: 'upsert',
        payload_json: JSON.stringify(nextData),
      });
    } else {
      db.prepare(`
        UPDATE documents
        SET data_json = @data_json,
            searchable_name = @searchable_name,
            searchable_barcode = @searchable_barcode,
            sync_status = @sync_status,
            retry_count = 0,
            last_error = NULL,
            updated_at = @updated_at,
            is_deleted = 0
        WHERE doc_path = @doc_path
      `).run({
        doc_path: path,
        data_json: JSON.stringify(nextData),
        searchable_name: String(nextData?.name || nextData?.fromTo || ''),
        searchable_barcode: String(nextData?.barcode || ''),
        sync_status: nextSyncStatus,
        updated_at: ts,
      });
      queueSyncTx(db, {
        local_id: prev.local_id,
        collection_name: collectionName,
        doc_path: path,
        operation_type: 'upsert',
        payload_json: JSON.stringify(nextData),
      });
    }
  });
  tx();
  return getDocument(path);
}

function addDocument(collectionPath, data = {}) {
  const collectionName = normalizePath(collectionPath);
  const docId = genDocId();
  const docPath = `${collectionName}/${docId}`;
  const doc = upsertDocument(docPath, data, { merge: false });
  return { id: docId, path: docPath, ...doc };
}

function softDeleteDocument(docPath) {
  const db = getDb();
  const ts = nowIso();
  const path = normalizePath(docPath);
  const prev = db.prepare(`SELECT * FROM documents WHERE doc_path = ?`).get(path);
  if (!prev) return { ok: true, missing: true };
  const collectionName = getCollectionNameFromDocPath(path);

  const tx = db.transaction(() => {
    db.prepare(`
      UPDATE documents
      SET is_deleted = 1,
          sync_status = 'pending_delete',
          retry_count = 0,
          last_error = NULL,
          updated_at = @updated_at
      WHERE doc_path = @doc_path
    `).run({ doc_path: path, updated_at: ts });
    queueSyncTx(db, {
      local_id: prev.local_id,
      collection_name: collectionName,
      doc_path: path,
      operation_type: 'delete',
      payload_json: null,
    });
  });
  tx();
  return { ok: true };
}

function runAtomicOps(ops = []) {
  const db = getDb();
  const items = Array.isArray(ops) ? ops : [];
  const tx = db.transaction(() => {
    for (const op of items) {
      if (!op || !op.type || !op.path) continue;
      if (op.type === 'delete') {
        const path = normalizePath(op.path);
        const prev = db.prepare(`SELECT * FROM documents WHERE doc_path = ?`).get(path);
        if (!prev) continue;
        db.prepare(`
          UPDATE documents
          SET is_deleted = 1,
              sync_status = 'pending_delete',
              retry_count = 0,
              last_error = NULL,
              updated_at = @updated_at
          WHERE doc_path = @doc_path
        `).run({
          doc_path: path,
          updated_at: nowIso(),
        });
        queueSyncTx(db, {
          local_id: prev.local_id,
          collection_name: getCollectionNameFromDocPath(path),
          doc_path: path,
          operation_type: 'delete',
          payload_json: null,
        });
        continue;
      }
      const merge = op.type === 'update' ? true : Boolean(op.options?.merge);
      const path = normalizePath(op.path);
      const collectionName = getCollectionNameFromDocPath(path);
      const docId = getDocIdFromPath(path);
      const prev = db.prepare(`SELECT * FROM documents WHERE doc_path = ?`).get(path);
      const prevData = prev?.data_json ? JSON.parse(prev.data_json) : {};
      const nextData = merge ? { ...prevData, ...(op.data || {}) } : { ...(op.data || {}) };
      const ts = nowIso();
      if (!prev) {
        const localId = randomUUID();
        db.prepare(`
          INSERT INTO documents (
            local_id, collection_name, doc_id, doc_path, firebase_id, data_json,
            searchable_name, searchable_barcode, sync_status, retry_count, last_error,
            created_at, updated_at, is_deleted
          ) VALUES (
            @local_id, @collection_name, @doc_id, @doc_path, NULL, @data_json,
            @searchable_name, @searchable_barcode, 'pending_create', 0, NULL,
            @created_at, @updated_at, 0
          )
        `).run({
          local_id: localId,
          collection_name: collectionName,
          doc_id: docId,
          doc_path: path,
          data_json: JSON.stringify(nextData),
          searchable_name: String(nextData?.name || nextData?.fromTo || ''),
          searchable_barcode: String(nextData?.barcode || ''),
          created_at: ts,
          updated_at: ts,
        });
        queueSyncTx(db, {
          local_id: localId,
          collection_name: collectionName,
          doc_path: path,
          operation_type: 'upsert',
          payload_json: JSON.stringify(nextData),
        });
      } else {
        db.prepare(`
          UPDATE documents
          SET data_json = @data_json,
              searchable_name = @searchable_name,
              searchable_barcode = @searchable_barcode,
              sync_status = @sync_status,
              retry_count = 0,
              last_error = NULL,
              updated_at = @updated_at,
              is_deleted = 0
          WHERE doc_path = @doc_path
        `).run({
          doc_path: path,
          data_json: JSON.stringify(nextData),
          searchable_name: String(nextData?.name || nextData?.fromTo || ''),
          searchable_barcode: String(nextData?.barcode || ''),
          sync_status: prev.sync_status === 'pending_create' ? 'pending_create' : 'pending_update',
          updated_at: ts,
        });
        queueSyncTx(db, {
          local_id: prev.local_id,
          collection_name: collectionName,
          doc_path: path,
          operation_type: 'upsert',
          payload_json: JSON.stringify(nextData),
        });
      }
    }
  });
  tx();
  return { ok: true };
}

function nextCounter(key) {
  const db = getDb();
  const ts = nowIso();
  db.prepare(`
    INSERT INTO app_counters (key, value, updated_at)
    VALUES (@key, 1, @updated_at)
    ON CONFLICT(key) DO UPDATE SET
      value = app_counters.value + 1,
      updated_at = excluded.updated_at
  `).run({ key, updated_at: ts });
  const row = db.prepare(`SELECT value FROM app_counters WHERE key = ?`).get(key);
  return Number(row?.value || 1);
}

module.exports = {
  splitPath,
  normalizePath,
  listCollectionDocs,
  getDocument,
  upsertDocument,
  addDocument,
  softDeleteDocument,
  runAtomicOps,
  nextCounter,
};
