import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from '../firebase';

const STORAGE_KEY = 'adwaa_offline_image_queue_v1';
const REF_PREFIX = 'offline-image://';

const nowIso = () => new Date().toISOString();
const makeId = () => `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 9)}`;

function readQueue() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function writeQueue(queue) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(queue));
  } catch {
    // ignore
  }
}

function dataUrlFromFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('تعذر قراءة ملف الصورة'));
    reader.readAsDataURL(file);
  });
}

export function isOfflineImageRef(value) {
  return String(value || '').startsWith(REF_PREFIX);
}

export function getOfflineImagePreview(ref) {
  if (!isOfflineImageRef(ref)) return '';
  const id = String(ref).replace(REF_PREFIX, '');
  const queue = readQueue();
  return String(queue[id]?.dataUrl || '');
}

export async function queueOfflineImage(file) {
  const dataUrl = await dataUrlFromFile(file);
  const id = makeId();
  const queue = readQueue();
  queue[id] = {
    id,
    dataUrl,
    mimeType: file?.type || 'image/jpeg',
    fileName: file?.name || `image-${id}.jpg`,
    createdAt: nowIso(),
    updatedAt: nowIso(),
    status: 'pending',
    retryCount: 0,
    lastError: '',
    uploadedUrl: '',
    targets: [],
  };
  writeQueue(queue);
  return `${REF_PREFIX}${id}`;
}

export function attachOfflineImageTarget(ref, target) {
  if (!isOfflineImageRef(ref)) return false;
  const id = String(ref).replace(REF_PREFIX, '');
  const queue = readQueue();
  const item = queue[id];
  if (!item) return false;
  const nextTarget = {
    collection: String(target?.collection || '').trim(),
    docId: String(target?.docId || '').trim(),
    field: String(target?.field || '').trim(),
    index: Number.isInteger(target?.index) ? Number(target.index) : null,
  };
  if (!nextTarget.collection || !nextTarget.docId || !nextTarget.field) return false;
  const exists = (item.targets || []).some((t) =>
    t.collection === nextTarget.collection
    && t.docId === nextTarget.docId
    && t.field === nextTarget.field
    && Number(t.index ?? -1) === Number(nextTarget.index ?? -1)
  );
  if (!exists) item.targets = [...(item.targets || []), nextTarget];
  item.updatedAt = nowIso();
  queue[id] = item;
  writeQueue(queue);
  return true;
}

async function uploadDataUrlToImgBB(dataUrl, key) {
  const form = new FormData();
  form.append('image', dataUrl.split(',')[1] || dataUrl);
  form.append('key', key);
  const response = await fetch('https://api.imgbb.com/1/upload', {
    method: 'POST',
    body: form,
  });
  const data = await response.json();
  if (!data?.success || !data?.data?.url) {
    throw new Error(data?.error?.message || 'فشل رفع الصورة');
  }
  return String(data.data.url);
}

async function patchTarget(target, uploadedUrl) {
  const ref = doc(db, target.collection, target.docId);
  if (target.field === 'workImages' && Number.isInteger(target.index)) {
    const snap = await getDoc(ref);
    const base = snap.exists() ? (snap.data() || {}) : {};
    const arr = Array.isArray(base.workImages) ? [...base.workImages] : [];
    arr[target.index] = uploadedUrl;
    await setDoc(ref, { workImages: arr, updatedAt: nowIso() }, { merge: true });
    return;
  }
  await setDoc(ref, { [target.field]: uploadedUrl, updatedAt: nowIso() }, { merge: true });
}

let running = false;
export async function processOfflineImageQueue(imgbbKey) {
  if (running) return { ok: true, skipped: true };
  if (!imgbbKey) return { ok: false, reason: 'missing_imgbb_key' };
  if (!navigator.onLine) return { ok: true, skipped: true, reason: 'offline' };
  running = true;
  try {
    const queue = readQueue();
    const ids = Object.keys(queue);
    let done = 0;
    let failed = 0;
    for (const id of ids) {
      const item = queue[id];
      if (!item) continue;
      if (!item.targets?.length) continue;
      if (item.status === 'done') continue;
      try {
        const uploadedUrl = item.uploadedUrl || await uploadDataUrlToImgBB(item.dataUrl, imgbbKey);
        for (const target of item.targets) {
          // eslint-disable-next-line no-await-in-loop
          await patchTarget(target, uploadedUrl);
        }
        done += 1;
        delete queue[id];
        writeQueue(queue);
      } catch (error) {
        failed += 1;
        queue[id] = {
          ...item,
          status: 'failed',
          retryCount: Number(item.retryCount || 0) + 1,
          lastError: error?.message || 'failed',
          updatedAt: nowIso(),
        };
        writeQueue(queue);
      }
    }
    return { ok: true, done, failed };
  } finally {
    running = false;
  }
}

export function startOfflineImageQueueWorker(imgbbKey) {
  if (!imgbbKey) return () => {};
  const run = () => {
    processOfflineImageQueue(imgbbKey).catch(() => null);
  };
  const onOnline = () => run();
  window.addEventListener('online', onOnline);
  const timer = setInterval(run, 15000);
  run();
  return () => {
    window.removeEventListener('online', onOnline);
    clearInterval(timer);
  };
}
