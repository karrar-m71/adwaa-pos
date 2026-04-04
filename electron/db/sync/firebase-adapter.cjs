let cached = null;

const FIREBASE_CONFIG = Object.freeze({
  apiKey: 'AIzaSyAZdIbmvj7HD1SNp7ALr9gsV0sOf7MgNMo',
  authDomain: 'adwaa-app-e7aaf.firebaseapp.com',
  projectId: 'adwaa-app-e7aaf',
  storageBucket: 'adwaa-app-e7aaf.firebasestorage.app',
  messagingSenderId: '288505641994',
  appId: '1:288505641994:web:59e6eaf78300cfc05bb3f3',
});

function logSyncError(message, error) {
  const details = error?.stack || error?.message || error || 'unknown_error';
  console.error(`[adwaa-sync] ${message}\n${details}`);
}

function readFirebaseConfig() {
  const missingKeys = Object.entries(FIREBASE_CONFIG)
    .filter(([, value]) => !value)
    .map(([key]) => key);

  if (missingKeys.length) {
    throw new Error(`Desktop Firebase config is incomplete: ${missingKeys.join(', ')}`);
  }

  return FIREBASE_CONFIG;
}

async function getFirestoreClient() {
  if (cached) return cached;
  try {
    const config = readFirebaseConfig();
    const firebaseApp = await import('firebase/app');
    const firestore = await import('firebase/firestore');

    const app = firebaseApp.initializeApp(config, 'offline-sync-main');
    const db = firestore.getFirestore(app);
    cached = { db, firestore };
    return cached;
  } catch (error) {
    logSyncError('Failed to initialize desktop Firebase client.', error);
    throw error;
  }
}

async function upsertToFirebase(collectionName, row, payload) {
  const client = await getFirestoreClient();
  const { db, firestore } = client;
  const id = row.firebase_id || row.local_id;
  await firestore.setDoc(firestore.doc(db, collectionName, id), payload, { merge: true });
  return id;
}

async function softDeleteInFirebase(collectionName, row) {
  const client = await getFirestoreClient();
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
  const { db, firestore } = client;
  await firestore.setDoc(firestore.doc(db, docPath), payload, { merge: true });
  return true;
}

async function softDeleteDocPath(docPath) {
  const client = await getFirestoreClient();
  const { db, firestore } = client;
  await firestore.setDoc(firestore.doc(db, docPath), {
    is_deleted: true,
    updatedAt: new Date().toISOString(),
  }, { merge: true });
  return true;
}

async function listCollectionDocs(collectionName) {
  const client = await getFirestoreClient();
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
