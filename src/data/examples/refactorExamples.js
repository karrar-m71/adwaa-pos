import { addProduct, updateProduct } from '../repositories/products.repository';
import { createInvoice, updateStock } from '../repositories/invoices.repository';

// Example: replaces direct addDoc(collection(db,'pos_products'), ...)
export async function addProductExample(form) {
  return addProduct({
    name: form.name,
    barcode: form.barcode || '',
    buyPrice: Number(form.buyPrice || 0),
    sellPrice: Number(form.sellPrice || 0),
    stock: Number(form.stock || 0),
    cat: form.cat || '',
    imgUrl: form.imgUrl || '',
  });
}

// Example: replaces direct updateDoc(doc(db,'pos_products', id), patch)
export async function updateProductExample(localIdOrFirebaseId, patch) {
  return updateProduct(localIdOrFirebaseId, patch);
}

// Example: invoice + stock mutation in ONE local transaction
export async function createInvoiceExample({ customerLocalId, items, paidAmount }) {
  return createInvoice({
    invoice_no: `INV-${Date.now()}`,
    customer_local_id: customerLocalId || null,
    items: items.map((it) => ({
      product_local_id: it.product_local_id,
      qty: Number(it.qty || 0),
      unit_price: Number(it.unit_price || 0),
    })),
    paid_amount: Number(paidAmount || 0),
    status: 'confirmed',
  });
}

// Example: standalone stock update (fallback/firebase mode only)
export async function updateStockExample(productId, qtyDelta) {
  return updateStock(productId, qtyDelta);
}

