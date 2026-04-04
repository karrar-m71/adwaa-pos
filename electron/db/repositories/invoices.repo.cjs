const { randomUUID } = require('crypto');
const { getDb } = require('../sqlite.cjs');

const nowIso = () => new Date().toISOString();

function createInvoiceWithStockTx(input = {}) {
  const db = getDb();
  const tx = db.transaction((payload) => {
    const ts = nowIso();
    const invoiceLocalId = randomUUID();
    const items = Array.isArray(payload.items) ? payload.items : [];
    if (!items.length) throw new Error('Invoice items are required');
    const invoiceType = String(payload.invoice_type || payload.invoiceType || 'sale').toLowerCase();
    const stockDirection = invoiceType === 'purchase' ? 1 : -1;

    const total = items.reduce((sum, it) => {
      const qty = Number(it.qty || 0);
      const unitPrice = Number(it.unit_price || it.unitPrice || 0);
      const line = Number(it.line_total || (qty * unitPrice));
      return sum + line;
    }, 0);
    const paid = Number(payload.paid_amount ?? payload.paidAmount ?? 0);
    const due = Math.max(0, total - paid);

    db.prepare(`
      INSERT INTO invoices (
        local_id, firebase_id, invoice_no, customer_local_id, total, paid_amount, due_amount, status,
        raw_json, sync_status, retry_count, last_error, created_at, updated_at, is_deleted
      ) VALUES (
        @local_id, NULL, @invoice_no, @customer_local_id, @total, @paid_amount, @due_amount, @status,
        @raw_json, 'pending_create', 0, NULL, @created_at, @updated_at, 0
      )
    `).run({
      local_id: invoiceLocalId,
      invoice_no: payload.invoice_no || payload.invoiceNo || `INV-${Date.now()}`,
      customer_local_id: payload.customer_local_id || null,
      total,
      paid_amount: paid,
      due_amount: due,
      status: payload.status || 'confirmed',
      raw_json: JSON.stringify(payload),
      created_at: ts,
      updated_at: ts,
    });

    const insItem = db.prepare(`
      INSERT INTO invoice_items (
        local_id, firebase_id, invoice_local_id, product_local_id, qty, unit_price, line_total,
        raw_json, sync_status, retry_count, last_error, created_at, updated_at, is_deleted
      ) VALUES (
        @local_id, NULL, @invoice_local_id, @product_local_id, @qty, @unit_price, @line_total,
        @raw_json, 'pending_create', 0, NULL, @created_at, @updated_at, 0
      )
    `);

    const updProductStock = db.prepare(`
      UPDATE products SET
        stock = stock - @qty_to_deduct,
        sync_status = CASE WHEN sync_status = 'pending_create' THEN 'pending_create' ELSE 'pending_update' END,
        retry_count = 0,
        last_error = NULL,
        updated_at = @updated_at
      WHERE local_id = @local_id AND is_deleted = 0
    `);

    const getProductByLocalId = db.prepare(`SELECT local_id, firebase_id, stock, name FROM products WHERE local_id = ? AND is_deleted = 0`);
    const getProductByFirebaseId = db.prepare(`SELECT local_id, firebase_id, stock, name FROM products WHERE firebase_id = ? AND is_deleted = 0`);
    const insertProductFromInvoice = db.prepare(`
      INSERT INTO products (
        local_id, firebase_id, name, barcode, sell_price, buy_price, stock,
        raw_json, sync_status, retry_count, last_error, created_at, updated_at, is_deleted
      ) VALUES (
        @local_id, @firebase_id, @name, @barcode, @sell_price, @buy_price, @stock,
        @raw_json, 'pending_update', 0, NULL, @created_at, @updated_at, 0
      )
    `);

    for (const item of items) {
      const firebaseProductId = item.firebase_product_id || item.firebaseProductId || item.product_id || item.productId || item.id || null;
      let productLocalId = item.product_local_id || item.productLocalId || null;
      const qty = Number(item.qty || 0);
      const unitPrice = Number(item.unit_price ?? item.unitPrice ?? 0);
      if (qty <= 0) throw new Error('Invalid item qty');

      let product = null;
      if (productLocalId) product = getProductByLocalId.get(productLocalId);
      if (!product && firebaseProductId) {
        product = getProductByFirebaseId.get(String(firebaseProductId));
        if (product) productLocalId = product.local_id;
      }
      if (!product) {
        const seededLocalId = randomUUID();
        const seededStock = Number(item.current_stock ?? item.currentStock ?? item.stock ?? 0);
        const seededName = String(item.name || item.productName || 'منتج');
        insertProductFromInvoice.run({
          local_id: seededLocalId,
          firebase_id: firebaseProductId ? String(firebaseProductId) : null,
          name: seededName,
          barcode: item.barcode ? String(item.barcode) : null,
          sell_price: Number(item.sell_price ?? item.sellPrice ?? unitPrice),
          buy_price: Number(item.buy_price ?? item.buyPrice ?? unitPrice),
          stock: seededStock,
          raw_json: JSON.stringify({
            id: firebaseProductId || seededLocalId,
            name: seededName,
            barcode: item.barcode || '',
            sellPrice: Number(item.sell_price ?? item.sellPrice ?? unitPrice),
            buyPrice: Number(item.buy_price ?? item.buyPrice ?? unitPrice),
            stock: seededStock,
          }),
          created_at: ts,
          updated_at: ts,
        });
        productLocalId = seededLocalId;
        product = getProductByLocalId.get(productLocalId);
      }
      if (!productLocalId) throw new Error('product_local_id is required');
      if (!product) throw new Error(`Product not found: ${productLocalId}`);
      if (stockDirection < 0 && Number(product.stock || 0) < qty) throw new Error(`Insufficient stock for product ${productLocalId}`);

      const lineTotal = Number(item.line_total || (qty * unitPrice));

      insItem.run({
        local_id: randomUUID(),
        invoice_local_id: invoiceLocalId,
        product_local_id: productLocalId,
        qty,
        unit_price: unitPrice,
        line_total: lineTotal,
        raw_json: JSON.stringify(item),
        created_at: ts,
        updated_at: ts,
      });

      updProductStock.run({
        qty_to_deduct: stockDirection < 0 ? qty : -qty,
        updated_at: ts,
        local_id: productLocalId,
      });
    }

    return {
      local_id: invoiceLocalId,
      invoice_no: payload.invoice_no || payload.invoiceNo || `INV-${Date.now()}`,
      invoice_type: invoiceType,
      total,
      paid_amount: paid,
      due_amount: due,
      sync_status: 'pending_create',
      created_at: ts,
      updated_at: ts,
    };
  });

  return tx(input);
}

module.exports = {
  createInvoiceWithStockTx,
};
