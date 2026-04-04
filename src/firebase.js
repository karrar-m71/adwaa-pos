import { initializeApp } from 'firebase/app';
import {
  getFirestore,
  initializeFirestore,
  memoryLocalCache,
  persistentLocalCache,
  persistentMultipleTabManager,
} from 'firebase/firestore';
import { getStorage } from 'firebase/storage';

const firebaseConfig = {
  apiKey:            import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain:        import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId:         import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket:     import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId:             import.meta.env.VITE_FIREBASE_APP_ID,
};

const app = initializeApp(firebaseConfig);
let db;
let localDbMode = 'default';

try {
  db = initializeFirestore(app, {
    localCache: persistentLocalCache({
      tabManager: persistentMultipleTabManager(),
    }),
  });
  localDbMode = 'persistent-multi-tab';
} catch (error) {
  console.warn('Firestore persistent cache (multi-tab) fallback:', error?.message || error);
  try {
    db = initializeFirestore(app, {
      localCache: persistentLocalCache(),
    });
    localDbMode = 'persistent-default';
  } catch (secondError) {
    console.warn('Firestore persistent cache (default) fallback:', secondError?.message || secondError);
    try {
      db = initializeFirestore(app, { localCache: memoryLocalCache() });
      localDbMode = 'memory-only';
    } catch (thirdError) {
      console.warn('Firestore memory cache fallback:', thirdError?.message || thirdError);
      db = getFirestore(app);
      localDbMode = 'default';
    }
  }
}

export { db };
export const localDb = {
  mode: localDbMode,
  persistent: localDbMode.startsWith('persistent'),
};
export const storage = getStorage(app);
