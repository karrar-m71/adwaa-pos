import { addDoc, collection, deleteDoc, doc, getDocs, query, updateDoc, where } from 'firebase/firestore';
import { db } from '../../firebase';
import {
  hasLocalApi,
  localAddProduct,
  localDeleteProduct,
  localUpdateProduct,
} from '../api/localApi';

export async function addProduct(payload) {
  if (hasLocalApi()) return localAddProduct(payload);
  const ref = await addDoc(collection(db, 'pos_products'), {
    ...payload,
    createdAt: new Date().toISOString(),
  });
  return { local_id: ref.id, firebase_id: ref.id, ...payload };
}

export async function updateProduct(localIdOrFirebaseId, patch) {
  if (hasLocalApi()) return localUpdateProduct(localIdOrFirebaseId, patch);
  await updateDoc(doc(db, 'pos_products', localIdOrFirebaseId), {
    ...patch,
    updatedAt: new Date().toISOString(),
  });
  return { ok: true };
}

export async function softDeleteProduct(localIdOrFirebaseId) {
  if (hasLocalApi()) return localDeleteProduct(localIdOrFirebaseId);
  await deleteDoc(doc(db, 'pos_products', localIdOrFirebaseId));
  return { ok: true };
}

export async function findProductByBarcode(barcode) {
  const snap = await getDocs(query(collection(db, 'pos_products'), where('barcode', '==', String(barcode || '').trim())));
  if (snap.empty) return null;
  const d = snap.docs[0];
  return { id: d.id, ...d.data() };
}

