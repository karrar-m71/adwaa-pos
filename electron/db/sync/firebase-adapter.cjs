const fs = require('fs');
const path = require('path');

let cached = null;

function parseEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return {};
  const text = fs.readFileSync(filePath, 'utf8');
  const lines = text.split(/\r?\n/);
  const out = {};
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const idx = trimmed.indexOf('=');
    if (idx < 0) continue;
    const key = trimmed.slice(0, idx).trim();
    const value = trimmed.slice(idx + 1).trim().replace(/^['"]|['"]$/g, '');
    if (key) out[key] = value;
  }
  return out;
}

function readFirebaseConfig() {
  const root = path.join(__dirname, '..', '..', '..');
  const envLocal = parseEnvFile(path.join(root, '.env.local'));
  const env = { ...envLocal, ...process.env };
  const config = {
    apiKey: env.VITE_FIREBASE_API_KEY,
    authDomain: env.VITE_FIREBASE_AUTH_DOMAIN,
    projectId: env.VITE_FIREBASE_PROJECT_ID,
    storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID,
    appId: env.VITE_FIREBASE_APP_ID,
  };
  const complete = Object.values(config).every(Boolean);
  return complete ? config : null;
}

async function getFirestoreClient() {
  if (cached) return cached;
  const config = readFirebaseConfig();
  if (!config) return null;

  const firebaseApp = await import('firebase/app');
  const firestore = await import('firebase/firestore');

  const app = firebaseApp.initializeApp(config, 'offline-sync-main');
  const db = firestore.getFirestore(app);
  cached = { db, firestore };
  return cached;
}

async function upsertToFirebase(collectionName, row, payload) {
  const client = await getFirestoreClient();
  if (!client) throw new Error('Firebase config missing for sync');
  const { db, firestore } = client;
  const id = row.firebase_id || row.local_id;
  await firestore.setDoc(firestore.doc(db, collectionName, id), payload, { merge: true });
  return id;
}

async function softDeleteInFirebase(collectionName, row) {
  const client = await getFirestoreClient();
  if (!client) throw new Error('Firebase config missing for sync');
  const { db, firestore } = client;
  const id = row.firebase_id || row.local_id;
  await firestore.setDoc(firestore.doc(db, collectionName, id), {
    is_deleted: true,
    updated_at: row.updated_at,
  }, { merge: true });
  return id;
}

async function upsertDocPath(docPath, payload) {
  const client = await getFirestoreClient();
  if (!client) throw new Error('Firebase config missing for sync');
  const { db, firestore } = client;
  await firestore.setDoc(firestore.doc(db, docPath), payload, { merge: true });
  return true;
}

async function softDeleteDocPath(docPath) {
  const client = await getFirestoreClient();
  if (!client) throw new Error('Firebase config missing for sync');
  const { db, firestore } = client;
  await firestore.setDoc(firestore.doc(db, docPath), {
    is_deleted: true,
    updatedAt: new Date().toISOString(),
  }, { merge: true });
  return true;
}

async function listCollectionDocs(collectionName) {
  const client = await getFirestoreClient();
  if (!client) throw new Error('Firebase config missing for sync');
  const { db, firestore } = client;
  const snap = await firestore.getDocs(firestore.collection(db, collectionName));
  return snap.docs.map((d) => ({ id: d.id, data: d.data() || {} }));
}

module.exports = {
  upsertToFirebase,
  softDeleteInFirebase,
  upsertDocPath,
  softDeleteDocPath,
  listCollectionDocs,
};
