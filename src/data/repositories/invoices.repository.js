import { addDoc, collection, doc, getDoc, runTransaction, updateDoc } from 'firebase/firestore';
import { db } from '../../firebase';
import { hasLocalApi, localCreateInvoiceTx } from '../api/localApi';

const nowIso = () => new Date().toISOString();

export async function createInvoice(payload) {
  if (hasLocalApi()) {
    return localCreateInvoiceTx(payload);
  }

  const items = Array.isArray(payload.items) ? payload.items : [];
  if (!items.length) throw new Error('Invoice items required');

  const result = await runTransaction(db, async (tx) => {
    const total = items.reduce((sum, it) => sum + Number(it.qty || 0) * Number(it.unit_price || it.unitPrice || 0), 0);
    const paid = Number(payload.paid_amount ?? payload.paidAmount ?? 0);
    const due = Math.max(0, total - paid);

    const saleRef = doc(collection(db, 'pos_sales'));
    tx.set(saleRef, {
      invoiceNo: payload.invoice_no || `INV-${Date.now()}`,
      customerId: payload.customer_firebase_id || '',
      total,
      paidAmount: paid,
      dueAmount: due,
      createdAt: nowIso(),
      source: 'repository_fallback',
    });

    for (const item of items) {
      const productId = item.product_firebase_id || item.product_id;
      if (!productId) throw new Error('product_firebase_id required');
      const qty = Number(item.qty || 0);
      if (qty <= 0) throw new Error('invalid qty');
      const productRef = doc(db, 'pos_products', productId);
      const productSnap = await tx.get(productRef);
      if (!productSnap.exists()) throw new Error(`product not found: ${productId}`);
      const currentStock = Number(productSnap.data().stock || 0);
      if (currentStock < qty) throw new Error(`insufficient stock for ${productId}`);
      tx.update(productRef, {
        stock: currentStock - qty,
        updatedAt: nowIso(),
      });
    }

    return { firebase_id: saleRef.id, total, due };
  });

  return result;
}

export async function updateStock(productId, qtyDelta) {
  if (hasLocalApi()) {
    throw new Error('Use createInvoice() local transaction for stock updates in local-first mode');
  }
  const ref = doc(db, 'pos_products', productId);
  const snap = await getDoc(ref);
  if (!snap.exists()) throw new Error('product not found');
  const nextStock = Number(snap.data().stock || 0) + Number(qtyDelta || 0);
  await updateDoc(ref, { stock: nextStock, updatedAt: nowIso() });
  return { ok: true, stock: nextStock };
}

