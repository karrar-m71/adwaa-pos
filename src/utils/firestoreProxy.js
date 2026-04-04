import * as real from 'firebase/firestore-real';

const LOCAL_EVENT = 'adwaa_local_store_changed_v2';
const localEnabled = () => Boolean(window?.adwaaLocal?.enabled && window?.adwaaLocal?.store);

const normalizePath = (path = '') => String(path || '').split('/').filter(Boolean).join('/');
const isDocPath = (path = '') => normalizePath(path).split('/').filter(Boolean).length % 2 === 0;
const toCollectionPath = (docPath = '') => {
  const parts = normalizePath(docPath).split('/').filter(Boolean);
  return parts.slice(0, -1).join('/');
};
const toDocId = (docPath = '') => {
  const parts = normalizePath(docPath).split('/').filter(Boolean);
  return parts[parts.length - 1] || '';
};

const emitLocalChanged = (path) => {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(LOCAL_EVENT, { detail: { path: normalizePath(path) } }));
};

const toLocalConstraint = (c) => {
  if (!c || !c.__localType) return null;
  if (c.__localType === 'where') return { type: 'where', field: c.field, op: c.op, value: c.value };
  if (c.__localType === 'orderBy') return { type: 'orderBy', field: c.field, direction: c.direction };
  if (c.__localType === 'limit') return { type: 'limit', value: c.value };
  return null;
};

const makeDocSnapshot = (id, payload) => ({
  id,
  exists: () => Boolean(payload),
  data: () => (payload ? { ...payload } : undefined),
});

const makeCollectionSnapshot = (docs) => ({
  docs,
  size: docs.length,
  empty: docs.length === 0,
  forEach: (cb) => docs.forEach(cb),
});

const docSignature = (id, payload) => JSON.stringify([id, payload || null]);
const collectionSignature = (rows = []) => JSON.stringify(
  rows.map((row) => [row?.id || '', row?.data || null]),
);

const makeDocRef = (path) => ({
  __localType: 'doc',
  id: toDocId(path),
  path: normalizePath(path),
  firestore: null,
});

function buildPathFromBase(base, ...segments) {
  if (!base) return normalizePath(segments.join('/'));
  if (typeof base === 'string') return normalizePath([base, ...segments].join('/'));
  const bp = normalizePath(base?.path || '');
  return normalizePath([bp, ...segments].join('/'));
}

export async function flushLocalQueue() {
  if (localEnabled()) {
    try {
      const result = await window.adwaaLocal.sync.run();
      return { ok: true, ...result };
    } catch {
      return { ok: false };
    }
  }
  return { ok: true, skipped: true };
}

if (typeof window !== 'undefined') {
  window.addEventListener('online', () => {
    flushLocalQueue().catch(() => null);
  });
  setInterval(() => {
    if (navigator.onLine) flushLocalQueue().catch(() => null);
  }, 15000);
}

export function collection(db, ...segments) {
  if (localEnabled()) {
    const path = normalizePath(segments.join('/'));
    return { __localType: 'collection', path, firestore: null };
  }
  const r = real.collection(db, ...segments);
  return { __localType: 'collection', real: r, path: r.path, firestore: r.firestore };
}

export function doc(base, ...segments) {
  if (localEnabled()) {
    return makeDocRef(buildPathFromBase(base, ...segments));
  }
  const ub = base?.real || base;
  const r = real.doc(ub, ...segments);
  return { __localType: 'doc', real: r, id: r.id, path: r.path, firestore: r.firestore };
}

export function where(field, op, value) {
  return { __localType: 'where', field, op, value, real: real.where(field, op, value) };
}

export function orderBy(field, direction = 'asc') {
  return { __localType: 'orderBy', field, direction, real: real.orderBy(field, direction) };
}

export function limit(value) {
  return { __localType: 'limit', value, real: real.limit(value) };
}

export function query(baseRef, ...constraints) {
  if (localEnabled()) {
    return {
      __localType: 'query',
      path: normalizePath(baseRef?.path || ''),
      constraints,
      firestore: null,
    };
  }
  const realBase = baseRef?.real || baseRef;
  const realConstraints = constraints.map((c) => c?.real || c);
  const r = real.query(realBase, ...realConstraints);
  return {
    __localType: 'query',
    real: r,
    path: baseRef?.path || r.path || '',
    firestore: baseRef?.firestore || realBase?.firestore,
    constraints,
  };
}

export async function addDoc(collectionRef, data) {
  if (localEnabled()) {
    const created = await window.adwaaLocal.store.add(collectionRef?.path, data || {});
    emitLocalChanged(created?.path || collectionRef?.path);
    return makeDocRef(created?.path || `${collectionRef?.path}/${created?.id}`);
  }

  const realCol = collectionRef?.real || collectionRef;
  const ref = await real.addDoc(realCol, data);
  return { __localType: 'doc', real: ref, id: ref.id, path: ref.path, firestore: ref.firestore };
}

export async function setDoc(docRef, data, options = {}) {
  if (localEnabled()) {
    const path = normalizePath(docRef?.path || '');
    await window.adwaaLocal.store.set(path, data || {}, options || {});
    emitLocalChanged(path);
    return;
  }
  await real.setDoc(docRef?.real || docRef, data, options);
}

export async function updateDoc(docRef, data) {
  if (localEnabled()) {
    const path = normalizePath(docRef?.path || '');
    await window.adwaaLocal.store.set(path, data || {}, { merge: true });
    emitLocalChanged(path);
    return;
  }
  await real.updateDoc(docRef?.real || docRef, data);
}

export async function deleteDoc(docRef) {
  if (localEnabled()) {
    const path = normalizePath(docRef?.path || '');
    await window.adwaaLocal.store.delete(path);
    emitLocalChanged(path);
    return;
  }
  await real.deleteDoc(docRef?.real || docRef);
}

export async function getDoc(docRef) {
  if (localEnabled()) {
    const path = normalizePath(docRef?.path || '');
    const found = await window.adwaaLocal.store.get(path);
    return makeDocSnapshot(toDocId(path), found?.data || null);
  }
  return real.getDoc(docRef?.real || docRef);
}

export async function getDocs(queryRef) {
  if (localEnabled()) {
    const path = normalizePath(queryRef?.path || '');
    const constraints = (queryRef?.constraints || []).map(toLocalConstraint).filter(Boolean);
    const rows = await window.adwaaLocal.store.list(path, constraints);
    const docs = rows.map((r) => makeDocSnapshot(r.id, r.data || {}));
    return makeCollectionSnapshot(docs);
  }
  return real.getDocs(queryRef?.real || queryRef);
}

export function onSnapshot(refOrQuery, next, onError) {
  if (localEnabled()) {
    const path = normalizePath(refOrQuery?.path || '');
    const docMode = refOrQuery?.__localType === 'doc' || isDocPath(path);
    const constraints = (refOrQuery?.constraints || []).map(toLocalConstraint).filter(Boolean);

    let stopped = false;
    let timerId = null;
    let lastSignature = null;

    const fetchNow = async () => {
      if (stopped) return;
      try {
        if (docMode) {
          const found = await window.adwaaLocal.store.get(path);
          const payload = found?.data || null;
          const nextSignature = docSignature(toDocId(path), payload);
          if (nextSignature === lastSignature) return;
          lastSignature = nextSignature;
          next(makeDocSnapshot(toDocId(path), payload));
          return;
        }
        const rows = await window.adwaaLocal.store.list(path, constraints);
        const nextSignature = collectionSignature(rows);
        if (nextSignature === lastSignature) return;
        lastSignature = nextSignature;
        const docs = rows.map((r) => makeDocSnapshot(r.id, r.data || {}));
        next(makeCollectionSnapshot(docs));
      } catch (err) {
        if (onError) onError(err);
      }
    };

    const onLocalChange = (e) => {
      const changed = normalizePath(e?.detail?.path || '');
      if (!changed) return;
      if (docMode) {
        if (changed === path || changed.startsWith(`${toCollectionPath(path)}/`)) fetchNow();
      } else if (changed === path || changed.startsWith(`${path}/`)) {
        fetchNow();
      }
    };

    fetchNow();
    if (typeof window !== 'undefined') window.addEventListener(LOCAL_EVENT, onLocalChange);
    timerId = setInterval(fetchNow, docMode ? 1500 : 4000);

    return () => {
      stopped = true;
      if (timerId) clearInterval(timerId);
      if (typeof window !== 'undefined') window.removeEventListener(LOCAL_EVENT, onLocalChange);
    };
  }

  const realRef = refOrQuery?.real || refOrQuery;
  return real.onSnapshot(realRef, next, onError);
}

export function writeBatch(db) {
  if (localEnabled()) {
    const ops = [];
    return {
      set(ref, data, options) {
        ops.push({ type: 'set', path: normalizePath(ref?.path || ''), data, options: options || {} });
      },
      update(ref, data) {
        ops.push({ type: 'update', path: normalizePath(ref?.path || ''), data });
      },
      delete(ref) {
        ops.push({ type: 'delete', path: normalizePath(ref?.path || '') });
      },
      async commit() {
        await window.adwaaLocal.store.atomic(ops);
        for (const op of ops) emitLocalChanged(op.path);
      },
    };
  }

  const realBatch = real.writeBatch(db);
  return {
    set(ref, data, options) {
      realBatch.set(ref?.real || ref, data, options || {});
    },
    update(ref, data) {
      realBatch.update(ref?.real || ref, data);
    },
    delete(ref) {
      realBatch.delete(ref?.real || ref);
    },
    commit() {
      return realBatch.commit();
    },
  };
}

export async function runTransaction(db, updateFunction) {
  if (localEnabled()) {
    const ops = [];
    const tx = {
      async get(ref) {
        const path = normalizePath(ref?.path || '');
        const found = await window.adwaaLocal.store.get(path);
        return makeDocSnapshot(toDocId(path), found?.data || null);
      },
      set(ref, data, options) {
        ops.push({ type: 'set', path: normalizePath(ref?.path || ''), data, options: options || {} });
      },
      update(ref, data) {
        ops.push({ type: 'update', path: normalizePath(ref?.path || ''), data });
      },
      delete(ref) {
        ops.push({ type: 'delete', path: normalizePath(ref?.path || '') });
      },
    };
    const result = await updateFunction(tx);
    await window.adwaaLocal.store.atomic(ops);
    for (const op of ops) emitLocalChanged(op.path);
    return result;
  }

  return real.runTransaction(db, async (tx) => {
    const wrapper = {
      get: (ref) => tx.get(ref?.real || ref),
      set: (ref, data, options) => tx.set(ref?.real || ref, data, options || {}),
      update: (ref, data) => tx.update(ref?.real || ref, data),
      delete: (ref) => tx.delete(ref?.real || ref),
    };
    return updateFunction(wrapper);
  });
}

export async function waitForPendingWrites(db) {
  if (localEnabled()) {
    await flushLocalQueue().catch(() => null);
    return;
  }
  await real.waitForPendingWrites(db);
}

export const initializeFirestore = real.initializeFirestore;
export const getFirestore = real.getFirestore;
export const memoryLocalCache = real.memoryLocalCache;
export const persistentLocalCache = real.persistentLocalCache;
export const persistentMultipleTabManager = real.persistentMultipleTabManager;
export const serverTimestamp = real.serverTimestamp;
export const increment = real.increment;
export const arrayUnion = real.arrayUnion;
export const arrayRemove = real.arrayRemove;
export const Timestamp = real.Timestamp;
export const documentId = real.documentId;
export const startAfter = real.startAfter;
export const startAt = real.startAt;
export const endAt = real.endAt;
