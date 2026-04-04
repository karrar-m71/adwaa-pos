const { randomUUID } = require('crypto');
const { getDb } = require('../sqlite.cjs');
const { normalizePath, nextCounter } = require('./local-store.repo.cjs');

const nowIso = () => new Date().toISOString();
const todayIso = () => new Date().toISOString().split('T')[0];
const nowHuman = () => new Date().toLocaleDateString('ar-IQ', {
  year: 'numeric',
  month: 'short',
  day: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
});

function getByDocPathTx(db, docPath) {
  return db.prepare(`SELECT * FROM documents WHERE doc_path = ? LIMIT 1`).get(docPath);
}

function enqueueTx(db, { localId, collectionName, docPath, opType, payload }) {
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
    local_id: localId,
    collection_name: collectionName,
    doc_path: docPath,
    operation_type: opType,
    payload_json: payload ? JSON.stringify(payload) : null,
    created_at: ts,
    updated_at: ts,
  });
}

function upsertDocTx(db, docPath, data, merge = false) {
  const ts = nowIso();
  const path = normalizePath(docPath);
  const parts = path.split('/');
  const docId = parts[parts.length - 1];
  const collectionName = parts.slice(0, -1).join('/');
  const prev = getByDocPathTx(db, path);
  const prevData = prev?.data_json ? JSON.parse(prev.data_json) : {};
  const nextData = merge ? { ...prevData, ...data } : { ...data };
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
    enqueueTx(db, { localId, collectionName, docPath: path, opType: 'upsert', payload: nextData });
    return { id: docId, path, data: nextData };
  }

  const syncStatus = prev.sync_status === 'pending_create' ? 'pending_create' : 'pending_update';
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
    sync_status: syncStatus,
    updated_at: ts,
  });
  enqueueTx(db, { localId: prev.local_id, collectionName, docPath: path, opType: 'upsert', payload: nextData });
  return { id: docId, path, data: nextData };
}

function listByCollection(collectionName) {
  const db = getDb();
  const rows = db.prepare(`
    SELECT * FROM documents
    WHERE collection_name = ?
      AND is_deleted = 0
  `).all(normalizePath(collectionName));
  return rows.map((r) => ({ id: r.doc_id, ...(r.data_json ? JSON.parse(r.data_json) : {}) }));
}

function findCustomerByNameTx(db, customerName) {
  const rows = db.prepare(`
    SELECT * FROM documents
    WHERE collection_name = 'pos_customers'
      AND is_deleted = 0
      AND searchable_name = ?
    LIMIT 1
  `).get(String(customerName || ''));
  if (!rows) return null;
  return {
    docId: rows.doc_id,
    path: rows.doc_path,
    row: rows,
    data: rows.data_json ? JSON.parse(rows.data_json) : {},
  };
}

function readDebtByCurrency(data = {}) {
  return {
    IQD: Number(data?.debtByCurrency?.IQD ?? data?.debt ?? 0) || 0,
    USD: Number(data?.debtByCurrency?.USD ?? 0) || 0,
  };
}

function readTotalPurchasesByCurrency(data = {}) {
  return {
    IQD: Number(data?.totalPurchasesByCurrency?.IQD ?? data?.totalPurchases ?? 0) || 0,
    USD: Number(data?.totalPurchasesByCurrency?.USD ?? 0) || 0,
  };
}

function findDocsByCollectionTx(db, collectionName) {
  const rows = db.prepare(`
    SELECT * FROM documents
    WHERE collection_name = @collection_name
      AND is_deleted = 0
  `).all({ collection_name: normalizePath(collectionName) });
  return rows.map((row) => ({
    row,
    id: row.doc_id,
    path: row.doc_path,
    data: row.data_json ? JSON.parse(row.data_json) : {},
  }));
}

function softDeleteDocTx(db, docPath) {
  const row = getByDocPathTx(db, docPath);
  if (!row) return false;
  const ts = nowIso();
  db.prepare(`
    UPDATE documents
    SET is_deleted = 1,
        sync_status = 'pending_delete',
        retry_count = 0,
        last_error = NULL,
        updated_at = @updated_at
    WHERE doc_path = @doc_path
  `).run({
    doc_path: docPath,
    updated_at: ts,
  });
  enqueueTx(db, {
    localId: row.local_id,
    collectionName: row.collection_name,
    docPath,
    opType: 'delete',
    payload: null,
  });
  return true;
}

function buildSaleNormalizedItems(items = [], currency = 'IQD', exchangeRate = 1) {
  return (Array.isArray(items) ? items : []).map((item) => {
    const qty = Number(item.qty || 0);
    const unitPriceIQD = Number(item.priceIQD ?? item.price ?? 0);
    const unitPriceDisplay = Number(item.priceDisplay ?? (currency === 'USD' ? (unitPriceIQD / Number(exchangeRate || 1)) : unitPriceIQD));
    const lineSubtotalIQD = Number(item.lineSubtotal ?? (unitPriceIQD * qty));
    const lineDiscountAmountIQD = Number(item.lineDiscountAmount || 0);
    return {
      id: String(item.id || item.productId || '').trim(),
      name: item.name || '',
      qty,
      price: unitPriceIQD,
      priceDisplay: unitPriceDisplay,
      currency,
      sellType: item.sellType || (item.isPackage ? 'package' : 'unit'),
      isPackage: Boolean(item.isPackage),
      packageName: item.packageName || '',
      packageQty: Number(item.packageQty || 1),
      lineSubtotal: lineSubtotalIQD,
      lineDiscount: Number(item.lineDiscount || 0),
      lineDiscountType: item.lineDiscountType || 'fixed',
      lineDiscountAmount: lineDiscountAmountIQD,
      lineDiscountAmountDisplay: Number(item.lineDiscountAmountDisplay ?? (currency === 'USD' ? (lineDiscountAmountIQD / Number(exchangeRate || 1)) : lineDiscountAmountIQD)),
      total: Number(item.total ?? Math.max(0, lineSubtotalIQD - lineDiscountAmountIQD)),
    };
  });
}

function sumQtyByProduct(items = []) {
  const output = {};
  (items || []).forEach((item) => {
    const productId = String(item?.id || '').trim();
    if (!productId) return;
    const qtyUnits = Boolean(item?.isPackage)
      ? Number(item?.qty || 0) * Math.max(1, Number(item?.packageQty || 1))
      : Number(item?.qty || 0);
    output[productId] = Number(output[productId] || 0) + qtyUnits;
  });
  return output;
}

function generateLinkedVoucherNo(invoiceNo = '') {
  return `V-C-${String(invoiceNo || '').replace(/[^\w-]+/g, '') || Date.now()}`;
}

function generateInvoiceNo(prefix = 'INV') {
  const seq = nextCounter(`counter:${prefix}`);
  return `${prefix}-${String(seq).padStart(6, '0')}`;
}

function getCustomerRefTx(db, customerId, name) {
  const normalizedId = String(customerId || '').trim();
  if (normalizedId) {
    const row = getByDocPathTx(db, `pos_customers/${normalizedId}`);
    if (row) {
      return {
        id: row.doc_id,
        path: row.doc_path,
        data: row.data_json ? JSON.parse(row.data_json) : {},
      };
    }
  }
  if (name && name !== 'زبون عام') return findCustomerByNameTx(db, name);
  return null;
}

function applyCustomerLedgerTx(db, ref, { totalDelta = 0, dueDelta = 0, currencyCode = 'IQD', nextName = '', nextPhone = '', nextAddress = '' } = {}) {
  if (!ref) return null;
  const current = ref.data || {};
  const totalsByCurrency = readTotalPurchasesByCurrency(current);
  const debtByCurrency = readDebtByCurrency(current);
  if (currencyCode === 'USD') {
    totalsByCurrency.USD = Math.max(0, Number(totalsByCurrency.USD || 0) + Number(totalDelta || 0));
    debtByCurrency.USD = Math.max(0, Number(debtByCurrency.USD || 0) + Number(dueDelta || 0));
  } else {
    totalsByCurrency.IQD = Math.max(0, Number(totalsByCurrency.IQD || 0) + Number(totalDelta || 0));
    debtByCurrency.IQD = Math.max(0, Number(debtByCurrency.IQD || 0) + Number(dueDelta || 0));
  }
  ref.data = {
    ...current,
    name: nextName || current.name || '',
    phone: nextPhone || current.phone || '',
    address: nextAddress || current.address || '',
    debt: Number(debtByCurrency.IQD || 0),
    debtByCurrency,
    totalPurchases: Math.max(0, Number(totalsByCurrency.IQD || 0)),
    totalPurchasesByCurrency: totalsByCurrency,
    updatedAt: nowIso(),
  };
  upsertDocTx(db, ref.path, ref.data, false);
  return ref.data;
}

function createSaleWithAccountingTx(input = {}) {
  const db = getDb();
  const tx = db.transaction((payload) => {
    const items = Array.isArray(payload.items) ? payload.items : [];
    if (!items.length) throw new Error('Sale items are required');

    const invoiceNo = payload.invoiceNo || payload.invoice_no || generateInvoiceNo('INV');
    const currency = payload.currency || 'IQD';
    const exchangeRate = Number(payload.exchangeRate || payload.exchange_rate || 1) || 1;

    const grossSubtotal = Number(payload.grossSubtotal || 0);
    const itemDiscountAmount = Number(payload.itemDiscountAmount || 0);
    const subtotal = Number(payload.subtotal || 0);
    const discount = Number(payload.discount || 0);
    const discountType = String(payload.discountType || 'percent');
    const discountAmount = Number(payload.discountAmount || 0);
    const total = Number(payload.total || 0);
    const receivedAmount = Number(payload.receivedAmount || 0);
    const appliedAmount = Math.min(receivedAmount, total);
    const remainingAmount = Math.max(0, total - appliedAmount);
    const paymentMethod = remainingAmount > 0 ? 'آجل' : 'نقدي';
    const customerName = String(payload.customer || 'زبون عام').trim() || 'زبون عام';
    const customerPhone = String(payload.customerPhone || '').trim();
    const customerAddress = String(payload.customerAddress || '').trim();
    const ts = nowIso();

    let customerDoc = null;
    if (customerName && customerName !== 'زبون عام') {
      customerDoc = findCustomerByNameTx(db, customerName);
      if (!customerDoc) {
        const customerInsert = upsertDocTx(db, `pos_customers/${randomUUID().replace(/-/g, '').slice(0, 20)}`, {
          name: customerName,
          phone: customerPhone,
          address: customerAddress,
          debt: 0,
          debtByCurrency: { IQD: 0, USD: 0 },
          totalPurchases: 0,
          createdAt: ts,
        }, false);
        customerDoc = {
          docId: customerInsert.id,
          path: customerInsert.path,
          data: customerInsert.data,
        };
      }
    }

    const productRows = new Map();
    for (const item of items) {
      const productId = String(item.id || item.productId || '').trim();
      if (!productId) throw new Error('Invalid product id');
      const productRow = getByDocPathTx(db, `pos_products/${productId}`);
      if (!productRow) throw new Error(`Product not found: ${productId}`);
      productRows.set(productId, productRow);
    }

    // Validate stock first.
    for (const item of items) {
      const productId = String(item.id || item.productId || '').trim();
      const row = productRows.get(productId);
      const product = row.data_json ? JSON.parse(row.data_json) : {};
      const qty = Number(item.qty || 0);
      const packageQty = Number(item.packageQty || 1);
      const isPackage = Boolean(item.isPackage);
      const stockUsed = isPackage ? qty * packageQty : qty;
      if (stockUsed <= 0) throw new Error(`Invalid qty for ${productId}`);
      if (Number(product.stock || 0) < stockUsed) throw new Error(`Insufficient stock for ${product.name || productId}`);
    }

    // Apply stock mutations.
    const normalizedItems = items.map((item) => {
      const productId = String(item.id || item.productId || '').trim();
      const row = productRows.get(productId);
      const product = row.data_json ? JSON.parse(row.data_json) : {};
      const qty = Number(item.qty || 0);
      const packageQty = Number(item.packageQty || 1);
      const isPackage = Boolean(item.isPackage);
      const stockUsed = isPackage ? qty * packageQty : qty;
      const nextStock = Number(product.stock || 0) - stockUsed;
      const unitPrice = Number(item.priceIQD ?? item.price ?? 0);

      upsertDocTx(db, `pos_products/${productId}`, {
        ...product,
        stock: nextStock,
        soldCount: Number(product.soldCount || 0) + Math.abs(stockUsed),
        updatedAt: ts,
      }, false);

      return {
        id: productId,
        name: item.name || product.name || '',
        qty,
        price: unitPrice,
        priceDisplay: Number(item.price || unitPrice),
        currency,
        sellType: item.sellType || (isPackage ? 'package' : 'unit'),
        isPackage,
        packageName: item.packageName || '',
        packageQty,
        lineSubtotal: Number(item.lineSubtotal || (unitPrice * qty)),
        lineDiscount: Number(item.lineDiscount || 0),
        lineDiscountType: item.lineDiscountType || 'fixed',
        lineDiscountAmount: Number(item.lineDiscountAmount || 0),
        lineDiscountAmountDisplay: Number(item.lineDiscountAmountDisplay || 0),
        total: Number(item.total || (unitPrice * qty)),
      };
    });

    let previousDebt = 0;
    let accountTotal = remainingAmount;
    if (customerDoc) {
      const curr = customerDoc.data || {};
      const debtByCurrency = {
        IQD: Number(curr?.debtByCurrency?.IQD ?? curr?.debt ?? 0) || 0,
        USD: Number(curr?.debtByCurrency?.USD ?? 0) || 0,
      };
      previousDebt = Number(debtByCurrency.IQD || 0);
      if (remainingAmount > 0) {
        if (currency === 'USD') debtByCurrency.USD = Number(debtByCurrency.USD || 0) + remainingAmount;
        else debtByCurrency.IQD = Number(debtByCurrency.IQD || 0) + remainingAmount;
      }
      const nextTotalPurchases = Number(curr.totalPurchases || 0) + (currency === 'USD' ? total * exchangeRate : total);
      accountTotal = Number(debtByCurrency.IQD || 0) + (currency === 'USD' ? Number(debtByCurrency.USD || 0) * exchangeRate : 0);
      upsertDocTx(db, customerDoc.path, {
        ...curr,
        name: customerName,
        phone: customerPhone || curr.phone || '',
        address: customerAddress || curr.address || '',
        debt: Number(debtByCurrency.IQD || 0),
        debtByCurrency,
        totalPurchases: nextTotalPurchases,
        updatedAt: ts,
      }, false);
    }

    let linkedVoucherNo = '';
    if (paymentMethod === 'آجل' && customerDoc && appliedAmount > 0) {
      linkedVoucherNo = generateInvoiceNo('V-C');
      const voucherDocId = randomUUID().replace(/-/g, '').slice(0, 20);
      upsertDocTx(db, `pos_vouchers/${voucherDocId}`, {
        voucherNo: linkedVoucherNo,
        type: 'قبض',
        amount: currency === 'USD' ? appliedAmount : appliedAmount,
        amountIQD: currency === 'USD' ? appliedAmount * exchangeRate : appliedAmount,
        amountIQDEntry: currency === 'USD' ? 0 : appliedAmount,
        amountUSDEntry: currency === 'USD' ? appliedAmount : 0,
        currency: currency === 'USD' ? 'دولار أمريكي' : 'دينار عراقي',
        exchangeRate: currency === 'USD' ? exchangeRate : 1,
        fromTo: customerName,
        description: `دفعة تلقائية مرتبطة بفاتورة البيع ${invoiceNo}`,
        paymentMethod: 'نقدي',
        dateISO: todayIso(),
        date: nowHuman(),
        source: 'sales_auto',
        linkedSaleId: '',
        linkedSaleNo: invoiceNo,
        addedBy: payload.cashier || '',
        status: 'مؤكد',
        createdAt: ts,
      }, false);
    }

    const saleDocId = randomUUID().replace(/-/g, '').slice(0, 20);
    const saleDoc = {
      invoiceNo,
      items: normalizedItems,
      grossSubtotal,
      itemDiscountAmount,
      subtotal,
      discount,
      discountType,
      discountAmount,
      total: currency === 'USD' ? total * exchangeRate : total,
      currency,
      exchangeRate: currency === 'USD' ? exchangeRate : 1,
      paymentMethod,
      customer: customerName,
      customerId: customerDoc?.docId || '',
      customerPhone,
      customerAddress,
      cashier: payload.cashier || '',
      paidAmount: currency === 'USD' ? appliedAmount * exchangeRate : appliedAmount,
      dueAmount: currency === 'USD' ? remainingAmount * exchangeRate : remainingAmount,
      remainingAmount: currency === 'USD' ? remainingAmount * exchangeRate : remainingAmount,
      receivedAmount: currency === 'USD' ? receivedAmount * exchangeRate : receivedAmount,
      previousDebt,
      accountTotal,
      cash: currency === 'USD' ? receivedAmount * exchangeRate : receivedAmount,
      change: Math.max(0, receivedAmount - total),
      dateISO: todayIso(),
      date: nowHuman(),
      createdAt: ts,
      ...(linkedVoucherNo ? { linkedVoucherNo, linkedVoucherId: `pos_vouchers/${linkedVoucherNo}` } : {}),
    };

    upsertDocTx(db, `pos_sales/${saleDocId}`, saleDoc, false);

    // محاسبيًا: خصومات فاتورة البيع (خصم المواد + الخصم العام) تُسجل كخسائر.
    const saleDiscountLoss = Math.max(0, Number(itemDiscountAmount || 0) + Number(discountAmount || 0));
    if (saleDiscountLoss > 0) {
      const expenseId = randomUUID().replace(/-/g, '').slice(0, 20);
      upsertDocTx(db, `pos_expenses/${expenseId}`, {
        desc: `خصم فاتورة بيع رقم ${invoiceNo} للزبون ${customerName}`,
        amount: saleDiscountLoss,
        cat: 'خسائر',
        dateISO: payload.dateISO || todayIso(),
        date: payload.date || nowHuman(),
        addedBy: payload.cashier || payload.addedBy || '',
        source: 'sale_discount_auto',
        linkedSaleNo: invoiceNo,
        linkedSaleId: saleDocId,
        createdAt: ts,
      }, false);
      saleDoc.linkedExpenseId = expenseId;
      upsertDocTx(db, `pos_sales/${saleDocId}`, saleDoc, false);
    }

    if (linkedVoucherNo) {
      const vouchers = findDocsByCollectionTx(db, 'pos_vouchers');
      const linkedVoucher = vouchers.find((entry) => entry.data?.linkedSaleNo === invoiceNo && entry.data?.source === 'sales_auto');
      if (linkedVoucher) {
        upsertDocTx(db, linkedVoucher.path, {
          ...linkedVoucher.data,
          linkedSaleId: saleDocId,
          linkedSaleNo: invoiceNo,
        }, false);
        saleDoc.linkedVoucherId = linkedVoucher.id;
        upsertDocTx(db, `pos_sales/${saleDocId}`, saleDoc, false);
      }
    }

    return { id: saleDocId, ...saleDoc };
  });

  return tx(input);
}

function updateSaleWithAccountingTx(input = {}) {
  const db = getDb();
  const tx = db.transaction((payload) => {
    const saleId = String(payload.id || payload.invoiceId || '').trim();
    if (!saleId) throw new Error('Invoice id is required');
    const saleRow = getByDocPathTx(db, `pos_sales/${saleId}`);
    if (!saleRow || Number(saleRow.is_deleted || 0) === 1) throw new Error('Invoice not found');
    const oldSale = saleRow.data_json ? JSON.parse(saleRow.data_json) : {};
    const items = Array.isArray(payload.items) ? payload.items : [];
    if (!items.length) throw new Error('Sale items are required');

    const invoiceNo = oldSale.invoiceNo || payload.invoiceNo || generateInvoiceNo('INV');
    const currency = payload.currency === 'USD' ? 'USD' : 'IQD';
    const exchangeRate = Number(payload.exchangeRate || oldSale.exchangeRate || 1) || 1;
    const ts = nowIso();

    const grossSubtotal = Number(payload.grossSubtotal || 0);
    const itemDiscountAmount = Number(payload.itemDiscountAmount || 0);
    const subtotal = Number(payload.subtotal || 0);
    const discount = Number(payload.discount || 0);
    const discountType = String(payload.discountType || 'percent');
    const discountAmount = Number(payload.discountAmount || 0);
    const totalDisplay = Number(payload.totalDisplay || payload.total || 0);
    const receivedAmountDisplay = Number(payload.receivedAmountDisplay ?? payload.receivedAmount ?? 0);
    const appliedAmountDisplay = Math.min(receivedAmountDisplay, totalDisplay);
    const remainingAmountDisplay = Math.max(0, totalDisplay - appliedAmountDisplay);
    const paymentMethod = remainingAmountDisplay > 0 ? 'آجل' : 'نقدي';
    const customerName = String(payload.customer || 'زبون عام').trim() || 'زبون عام';
    const customerPhone = String(payload.customerPhone || '').trim();
    const customerAddress = String(payload.customerAddress || '').trim();

    const normalizedItems = buildSaleNormalizedItems(items, currency, exchangeRate);
    const oldQtyMap = sumQtyByProduct(oldSale.items || []);
    const newQtyMap = sumQtyByProduct(normalizedItems);
    const productIds = [...new Set([...Object.keys(oldQtyMap), ...Object.keys(newQtyMap)])];

    for (const productId of productIds) {
      const row = getByDocPathTx(db, `pos_products/${productId}`);
      if (!row) throw new Error(`Product not found: ${productId}`);
      const product = row.data_json ? JSON.parse(row.data_json) : {};
      const availableUnits = Number(product.stock || 0) + Number(oldQtyMap[productId] || 0);
      const neededUnits = Number(newQtyMap[productId] || 0);
      if (availableUnits < neededUnits) throw new Error(`Insufficient stock for ${product.name || productId}`);
    }

    for (const productId of productIds) {
      const row = getByDocPathTx(db, `pos_products/${productId}`);
      if (!row) continue;
      const product = row.data_json ? JSON.parse(row.data_json) : {};
      const oldQty = Number(oldQtyMap[productId] || 0);
      const newQty = Number(newQtyMap[productId] || 0);
      const nextStock = Number(product.stock || 0) + oldQty - newQty;
      const nextSoldCount = Math.max(0, Number(product.soldCount || 0) - oldQty + newQty);
      upsertDocTx(db, `pos_products/${productId}`, {
        ...product,
        stock: nextStock,
        soldCount: nextSoldCount,
        updatedAt: ts,
      }, false);
    }

    const oldCustomerName = String(oldSale.customer || '').trim();
    const oldCustomerRef = getCustomerRefTx(db, oldSale.customerId, oldCustomerName);
    let newCustomerRef = getCustomerRefTx(db, payload.customerId, customerName);

    if (!newCustomerRef && customerName && customerName !== 'زبون عام') {
      const newCustomerId = randomUUID().replace(/-/g, '').slice(0, 20);
      const created = upsertDocTx(db, `pos_customers/${newCustomerId}`, {
        name: customerName,
        phone: customerPhone,
        address: customerAddress,
        debt: 0,
        debtByCurrency: { IQD: 0, USD: 0 },
        totalPurchases: 0,
        totalPurchasesByCurrency: { IQD: 0, USD: 0 },
        createdAt: ts,
      }, false);
      newCustomerRef = {
        id: created.id,
        path: created.path,
        data: created.data,
      };
    }

    const oldCurrency = oldSale.currency === 'USD' ? 'USD' : 'IQD';
    const oldRate = Number(oldSale.exchangeRate || 1) || 1;
    const oldTotalDisplay = oldCurrency === 'USD' ? Number(oldSale.total || 0) / oldRate : Number(oldSale.total || 0);
    const oldDueDisplay = oldCurrency === 'USD'
      ? Number(oldSale.dueAmount ?? oldSale.remainingAmount ?? 0) / oldRate
      : Number(oldSale.dueAmount ?? oldSale.remainingAmount ?? 0);

    const isSameCustomer = Boolean(
      oldCustomerRef
      && newCustomerRef
      && oldCustomerRef.path === newCustomerRef.path
    );

    if (oldCustomerRef && oldCustomerName && oldCustomerName !== 'زبون عام' && !isSameCustomer) {
      applyCustomerLedgerTx(db, oldCustomerRef, {
        totalDelta: -oldTotalDisplay,
        dueDelta: -oldDueDisplay,
        currencyCode: oldCurrency,
      });
    }

    const previousDebtByCurrency = newCustomerRef ? readDebtByCurrency(newCustomerRef.data) : { IQD: 0, USD: 0 };
    const previousDebt = currency === 'USD' ? Number(previousDebtByCurrency.USD || 0) : Number(previousDebtByCurrency.IQD || 0);

    if (newCustomerRef && customerName !== 'زبون عام') {
      applyCustomerLedgerTx(db, newCustomerRef, {
        totalDelta: isSameCustomer ? (currency === oldCurrency ? totalDisplay - oldTotalDisplay : totalDisplay) : totalDisplay,
        dueDelta: isSameCustomer ? (currency === oldCurrency ? remainingAmountDisplay - oldDueDisplay : remainingAmountDisplay) : remainingAmountDisplay,
        currencyCode: currency,
        nextName: customerName,
        nextPhone: customerPhone,
        nextAddress: customerAddress,
      });
      if (isSameCustomer && currency !== oldCurrency) {
        applyCustomerLedgerTx(db, newCustomerRef, {
          totalDelta: -oldTotalDisplay,
          dueDelta: -oldDueDisplay,
          currencyCode: oldCurrency,
          nextName: customerName,
          nextPhone: customerPhone,
          nextAddress: customerAddress,
        });
      }
    }

    const linkedVouchers = findDocsByCollectionTx(db, 'pos_vouchers').filter((entry) => (
      entry.data?.linkedSaleId === saleId
      || entry.data?.linkedSaleNo === invoiceNo
      || entry.data?.linkedSaleNo === oldSale.invoiceNo
    ));
    linkedVouchers.forEach((entry) => softDeleteDocTx(db, entry.path));

    const linkedExpenses = findDocsByCollectionTx(db, 'pos_expenses').filter((entry) => (
      entry.data?.source === 'sale_discount_auto'
      && (
        entry.data?.linkedSaleId === saleId
        || entry.data?.linkedSaleNo === invoiceNo
        || entry.data?.linkedSaleNo === oldSale.invoiceNo
      )
    ));
    linkedExpenses.forEach((entry) => softDeleteDocTx(db, entry.path));

    let linkedVoucherNo = '';
    let linkedVoucherId = '';
    if (paymentMethod === 'آجل' && newCustomerRef && appliedAmountDisplay > 0) {
      linkedVoucherNo = oldSale.linkedVoucherNo || generateLinkedVoucherNo(invoiceNo);
      linkedVoucherId = oldSale.linkedVoucherId || randomUUID().replace(/-/g, '').slice(0, 20);
      upsertDocTx(db, `pos_vouchers/${linkedVoucherId}`, {
        voucherNo: linkedVoucherNo,
        type: 'قبض',
        amount: currency === 'USD' ? appliedAmountDisplay : appliedAmountDisplay,
        amountIQD: currency === 'USD' ? appliedAmountDisplay * exchangeRate : appliedAmountDisplay,
        amountIQDEntry: currency === 'USD' ? 0 : appliedAmountDisplay,
        amountUSDEntry: currency === 'USD' ? appliedAmountDisplay : 0,
        currency: currency === 'USD' ? 'دولار أمريكي' : 'دينار عراقي',
        exchangeRate: currency === 'USD' ? exchangeRate : 1,
        fromTo: customerName,
        description: `دفعة تلقائية مرتبطة بفاتورة البيع ${invoiceNo}`,
        paymentMethod: 'نقدي',
        dateISO: payload.dateISO || oldSale.dateISO || todayIso(),
        date: payload.date || oldSale.date || nowHuman(),
        source: 'sales_auto',
        linkedSaleId: saleId,
        linkedSaleNo: invoiceNo,
        addedBy: payload.cashier || oldSale.cashier || '',
        status: 'مؤكد',
        createdAt: oldSale.createdAt || ts,
        updatedAt: ts,
      }, false);
    }

    const saleDiscountLoss = Math.max(0, Number(itemDiscountAmount || 0) + Number(discountAmount || 0));
    let linkedExpenseId = '';
    if (saleDiscountLoss > 0) {
      linkedExpenseId = oldSale.linkedExpenseId || randomUUID().replace(/-/g, '').slice(0, 20);
      upsertDocTx(db, `pos_expenses/${linkedExpenseId}`, {
        desc: `خصم فاتورة بيع رقم ${invoiceNo} للزبون ${customerName}`,
        amount: saleDiscountLoss,
        cat: 'خسائر',
        dateISO: payload.dateISO || oldSale.dateISO || todayIso(),
        date: payload.date || oldSale.date || nowHuman(),
        addedBy: payload.cashier || oldSale.cashier || '',
        source: 'sale_discount_auto',
        linkedSaleNo: invoiceNo,
        linkedSaleId: saleId,
        createdAt: oldSale.createdAt || ts,
        updatedAt: ts,
      }, false);
    }

    const totalIQD = currency === 'USD' ? totalDisplay * exchangeRate : totalDisplay;
    const paidAmountIQD = currency === 'USD' ? appliedAmountDisplay * exchangeRate : appliedAmountDisplay;
    const dueAmountIQD = currency === 'USD' ? remainingAmountDisplay * exchangeRate : remainingAmountDisplay;
    const receivedAmountIQD = currency === 'USD' ? receivedAmountDisplay * exchangeRate : receivedAmountDisplay;
    const accountTotalIQD = (currency === 'USD' ? Number((newCustomerRef?.data?.debtByCurrency?.USD || 0)) * exchangeRate : 0)
      + Number(newCustomerRef?.data?.debtByCurrency?.IQD || 0);

    const saleDoc = {
      ...oldSale,
      invoiceNo,
      items: normalizedItems,
      grossSubtotal: currency === 'USD' ? grossSubtotal * exchangeRate : grossSubtotal,
      itemDiscountAmount: currency === 'USD' ? itemDiscountAmount * exchangeRate : itemDiscountAmount,
      subtotal: currency === 'USD' ? subtotal * exchangeRate : subtotal,
      discount,
      discountType,
      discountAmount: currency === 'USD' ? discountAmount * exchangeRate : discountAmount,
      total: totalIQD,
      currency,
      exchangeRate: currency === 'USD' ? exchangeRate : 1,
      paymentMethod,
      customer: customerName,
      customerId: newCustomerRef?.id || '',
      customerPhone,
      customerAddress,
      cashier: payload.cashier || oldSale.cashier || '',
      paidAmount: paidAmountIQD,
      dueAmount: dueAmountIQD,
      remainingAmount: dueAmountIQD,
      receivedAmount: receivedAmountIQD,
      previousDebt: currency === 'USD' ? previousDebt * exchangeRate : previousDebt,
      accountTotal: accountTotalIQD,
      cash: receivedAmountIQD,
      change: currency === 'USD' ? Math.max(0, receivedAmountDisplay - totalDisplay) * exchangeRate : Math.max(0, receivedAmountDisplay - totalDisplay),
      dateISO: payload.dateISO || oldSale.dateISO || todayIso(),
      date: payload.date || oldSale.date || nowHuman(),
      createdAt: oldSale.createdAt || ts,
      updatedAt: ts,
      linkedVoucherNo,
      linkedVoucherId,
      linkedExpenseId,
    };

    if (!linkedVoucherNo) {
      delete saleDoc.linkedVoucherNo;
      delete saleDoc.linkedVoucherId;
    }
    if (!linkedExpenseId) {
      delete saleDoc.linkedExpenseId;
    }

    upsertDocTx(db, `pos_sales/${saleId}`, saleDoc, false);
    return { id: saleId, ...saleDoc };
  });

  return tx(input);
}

function createVoucherWithAccountingTx(input = {}) {
  const db = getDb();
  const tx = db.transaction((payload) => {
    const ts = nowIso();
    const voucherNo = payload.voucherNo || payload.voucher_no || generateInvoiceNo('VCH');
    const type = String(payload.type || 'قبض');
    const fromTo = String(payload.fromTo || '').trim();
    if (!fromTo) throw new Error('طرف السند مطلوب');

    const amountIQDEntry = Math.max(0, Number(payload.amountIQDEntry || 0) || 0);
    const amountUSDEntry = Math.max(0, Number(payload.amountUSDEntry || 0) || 0);
    const discountIQDEntry = Math.max(0, Number(payload.discountIQDEntry || 0) || 0);
    const discountUSDEntry = Math.max(0, Number(payload.discountUSDEntry || 0) || 0);
    const exchangeRate = Number(payload.exchangeRate || 1) || 1;
    const amountIQD = Number(payload.amountIQD || (amountIQDEntry + amountUSDEntry * exchangeRate) || 0);
    const discountIQD = Number(payload.discountIQD || (discountIQDEntry + discountUSDEntry * exchangeRate) || 0);
    if ((amountIQD + discountIQD) <= 0) throw new Error('قيمة السند غير صالحة');

    const partyType = String(payload.partyType || 'زبون');
    const collectionName = partyType === 'مورد' ? 'pos_suppliers' : 'pos_customers';
    let party = db.prepare(`
      SELECT * FROM documents
      WHERE collection_name = @collection_name
        AND is_deleted = 0
        AND searchable_name = @searchable_name
      LIMIT 1
    `).get({
      collection_name: collectionName,
      searchable_name: fromTo,
    });

    if (!party) {
      const id = randomUUID().replace(/-/g, '').slice(0, 20);
      upsertDocTx(db, `${collectionName}/${id}`, {
        name: fromTo,
        debt: 0,
        debtByCurrency: { IQD: 0, USD: 0 },
        createdAt: ts,
      }, false);
      party = getByDocPathTx(db, `${collectionName}/${id}`);
    }

    const partyData = party?.data_json ? JSON.parse(party.data_json) : {};
    const debtByCurrency = {
      IQD: Number(partyData?.debtByCurrency?.IQD ?? partyData?.debt ?? 0) || 0,
      USD: Number(partyData?.debtByCurrency?.USD ?? 0) || 0,
    };
    const debtSign = (() => {
      if (collectionName === 'pos_customers') return type === 'قبض' ? -1 : (type === 'دفع' ? 1 : 0);
      return type === 'دفع' ? -1 : (type === 'قبض' ? 1 : 0);
    })();
    const effectiveIQDEntry = amountIQDEntry + discountIQDEntry;
    const effectiveUSDEntry = amountUSDEntry + discountUSDEntry;
    // Apply movement per currency to avoid corrupting multi-currency balances.
    debtByCurrency.IQD = Math.max(0, Number(debtByCurrency.IQD || 0) + debtSign * effectiveIQDEntry);
    debtByCurrency.USD = Math.max(0, Number(debtByCurrency.USD || 0) + debtSign * effectiveUSDEntry);

    upsertDocTx(db, party.doc_path, {
      ...partyData,
      name: fromTo,
      debt: Number(debtByCurrency.IQD || 0),
      debtByCurrency,
      updatedAt: ts,
    }, false);

    const voucherId = randomUUID().replace(/-/g, '').slice(0, 20);
    const voucher = {
      voucherNo,
      type,
      amount: Number(payload.amount || amountIQD),
      amountIQD,
      amountIQDEntry,
      amountUSDEntry,
      discountIQD,
      discountIQDEntry,
      discountUSDEntry,
      currency: payload.currency || 'دينار عراقي',
      exchangeRate,
      fromTo,
      description: String(payload.description || ''),
      paymentMethod: String(payload.paymentMethod || 'نقدي'),
      dateISO: payload.dateISO || todayIso(),
      date: payload.date || nowHuman(),
      addedBy: payload.addedBy || '',
      status: payload.status || 'مؤكد',
      source: payload.source || 'manual',
      createdAt: ts,
    };
    upsertDocTx(db, `pos_vouchers/${voucherId}`, voucher, false);

    // محاسبيًا: أي خصم على السند يُسجل كخسارة تشغيلية ليظهر في التقارير.
    if (discountIQD > 0 && type !== 'تحويل') {
      const expenseId = randomUUID().replace(/-/g, '').slice(0, 20);
      upsertDocTx(db, `pos_expenses/${expenseId}`, {
        desc: `خصم سند ${type} رقم ${voucherNo} للطرف ${fromTo}`,
        amount: Number(discountIQD),
        cat: 'خسائر',
        dateISO: payload.dateISO || todayIso(),
        date: payload.date || nowHuman(),
        addedBy: payload.addedBy || '',
        source: 'voucher_discount_auto',
        linkedVoucherNo: voucherNo,
        linkedVoucherId: voucherId,
        createdAt: ts,
      }, false);
    }

    return { id: voucherId, ...voucher };
  });
  return tx(input);
}

function createPurchaseWithAccountingTx(input = {}) {
  const db = getDb();
  const tx = db.transaction((payload) => {
    const items = Array.isArray(payload.items) ? payload.items : [];
    if (!items.length) throw new Error('Purchase items are required');

    const invoiceNo = payload.invoiceNo || payload.invoice_no || generateInvoiceNo('PINV');
    const currency = payload.currency || 'IQD';
    const exchangeRate = Number(payload.exchangeRate || payload.exchange_rate || 1) || 1;
    const ts = nowIso();

    const grossSubtotal = Number(payload.grossSubtotal || payload.subtotal || 0);
    const itemDiscountAmount = Number(payload.itemDiscountAmount || 0);
    const subtotal = Number(payload.subtotal || Math.max(0, grossSubtotal - itemDiscountAmount));
    const discount = Number(payload.discount || 0);
    const discountAmount = Number(payload.discountAmount || 0);
    const total = Number(payload.total || Math.max(0, subtotal - discountAmount));
    const paidAmount = Math.min(total, Math.max(0, Number(payload.paidAmount || 0)));
    const dueAmount = Math.max(0, total - paidAmount);
    const paymentMethod = dueAmount > 0 ? 'آجل' : 'نقدي';
    const supplierName = String(payload.supplier || '').trim() || 'مورد عام';
    const supplierPhone = String(payload.supplierPhone || '').trim();
    const supplierAddress = String(payload.supplierAddress || '').trim();

    let supplierDoc = null;
    if (supplierName !== 'مورد عام' && supplierName !== 'عام') {
      supplierDoc = db.prepare(`
        SELECT * FROM documents
        WHERE collection_name = 'pos_suppliers'
          AND is_deleted = 0
          AND searchable_name = ?
        LIMIT 1
      `).get(supplierName);
      if (!supplierDoc) {
        const supplierId = randomUUID().replace(/-/g, '').slice(0, 20);
        const created = upsertDocTx(db, `pos_suppliers/${supplierId}`, {
          name: supplierName,
          phone: supplierPhone,
          address: supplierAddress,
          debt: 0,
          debtByCurrency: { IQD: 0, USD: 0 },
          totalPurchases: 0,
          createdAt: ts,
        }, false);
        supplierDoc = getByDocPathTx(db, created.path);
      }
    }

    const normalizedItems = items.map((item) => {
      const productId = String(item.id || item.productId || '').trim();
      if (!productId) throw new Error('Invalid product id');
      const row = getByDocPathTx(db, `pos_products/${productId}`);
      if (!row) throw new Error(`Product not found: ${productId}`);
      const product = row.data_json ? JSON.parse(row.data_json) : {};
      const qty = Number(item.qty || 0);
      const packageQty = Number(item.packageQty || 1);
      const isPackage = Boolean(item.isPackage);
      const qtyUnits = isPackage ? qty * packageQty : qty;
      if (qtyUnits <= 0) throw new Error(`Invalid qty for ${productId}`);

      const buyPriceIQD = Number(item.buyPriceIQD ?? item.buyPrice ?? 0);
      const nextStock = Number(product.stock || 0) + qtyUnits;
      const patch = {
        ...product,
        stock: nextStock,
        updatedAt: ts,
      };
      if (isPackage) {
        patch.packageBuyPrice = buyPriceIQD;
        patch.packageBuyPriceInput = Number(item.buyPrice ?? item.buyPriceDisplay ?? 0);
        patch.packageBuyCurrency = item.buyCurrency || 'IQD';
        if (packageQty > 0) {
          patch.buyPrice = buyPriceIQD / packageQty;
          patch.buyCurrency = item.buyCurrency || 'IQD';
          patch.buyPriceInput = (item.buyCurrency === 'USD')
            ? (Number(item.buyPrice ?? item.buyPriceDisplay ?? 0) / packageQty)
            : (buyPriceIQD / packageQty);
        }
      } else {
        patch.buyPrice = buyPriceIQD;
        patch.buyPriceInput = Number(item.buyPrice ?? item.buyPriceDisplay ?? 0);
        patch.buyCurrency = item.buyCurrency || 'IQD';
      }
      upsertDocTx(db, `pos_products/${productId}`, patch, false);

      return {
        id: productId,
        name: item.name || product.name || '',
        qty,
        qtyUnits,
        buyPrice: buyPriceIQD,
        buyPriceDisplay: Number(item.buyPrice ?? item.buyPriceDisplay ?? 0),
        buyCurrency: item.buyCurrency || 'IQD',
        exchangeRate,
        isPackage,
        packageQty,
        packageName: item.packageName || '',
        packageId: item.packageId || null,
        sellType: item.sellType || (isPackage ? 'package' : 'unit'),
        lineSubtotal: Number(item.lineSubtotal || (buyPriceIQD * qty)),
        lineDiscount: Number(item.lineDiscount || 0),
        lineDiscountType: item.lineDiscountType || 'fixed',
        lineDiscountAmount: Number(item.lineDiscountAmount || 0),
        total: Number(item.total || (buyPriceIQD * qty)),
      };
    });

    const dueAmountDisplay = currency === 'USD' ? (dueAmount / exchangeRate) : dueAmount;
    const totalDisplay = currency === 'USD' ? (total / exchangeRate) : total;
    let previousDebt = 0;
    let accountTotal = dueAmountDisplay;

    if (supplierDoc) {
      const supplier = supplierDoc.data_json ? JSON.parse(supplierDoc.data_json) : {};
      const debtByCurrency = {
        IQD: Number(supplier?.debtByCurrency?.IQD ?? supplier?.debt ?? 0) || 0,
        USD: Number(supplier?.debtByCurrency?.USD ?? 0) || 0,
      };
      const totalByCurrency = {
        IQD: Number(supplier?.totalPurchasesByCurrency?.IQD ?? supplier?.totalPurchases ?? 0) || 0,
        USD: Number(supplier?.totalPurchasesByCurrency?.USD ?? 0) || 0,
      };
      previousDebt = Number(debtByCurrency[currency] || 0);
      totalByCurrency[currency] = Number(totalByCurrency[currency] || 0) + totalDisplay;
      if (dueAmount > 0) debtByCurrency[currency] = Number(debtByCurrency[currency] || 0) + dueAmountDisplay;
      accountTotal = Number(debtByCurrency[currency] || 0);
      upsertDocTx(db, supplierDoc.doc_path, {
        ...supplier,
        name: supplierName,
        phone: supplierPhone || supplier.phone || '',
        address: supplierAddress || supplier.address || '',
        debt: Number(debtByCurrency.IQD || 0),
        debtByCurrency,
        totalPurchases: Number(supplier.totalPurchases || 0) + total,
        totalPurchasesByCurrency: totalByCurrency,
        updatedAt: ts,
      }, false);
    }

    let linkedVoucherNo = '';
    if (paidAmount > 0) {
      linkedVoucherNo = generateInvoiceNo('V-P');
      const voucherId = randomUUID().replace(/-/g, '').slice(0, 20);
      upsertDocTx(db, `pos_vouchers/${voucherId}`, {
        voucherNo: linkedVoucherNo,
        type: 'دفع',
        amount: currency === 'USD' ? (paidAmount / exchangeRate) : paidAmount,
        amountIQD: paidAmount,
        amountIQDEntry: currency === 'USD' ? 0 : paidAmount,
        amountUSDEntry: currency === 'USD' ? (paidAmount / exchangeRate) : 0,
        currency: currency === 'USD' ? 'دولار أمريكي' : 'دينار عراقي',
        exchangeRate: currency === 'USD' ? exchangeRate : 1,
        fromTo: supplierName || 'مورد عام',
        description: `دفعة تلقائية مرتبطة بفاتورة الشراء ${invoiceNo}`,
        paymentMethod: 'نقدي',
        dateISO: payload.dateISO || todayIso(),
        date: payload.date || nowHuman(),
        source: 'purchase_auto',
        linkedPurchaseNo: invoiceNo,
        addedBy: payload.addedBy || '',
        status: 'مؤكد',
        createdAt: ts,
      }, false);
    }

    const purchaseId = randomUUID().replace(/-/g, '').slice(0, 20);
    const purchaseDoc = {
      invoiceNo,
      items: normalizedItems,
      grossSubtotal,
      itemDiscountAmount,
      subtotal,
      discount,
      discountType: payload.discountType || 'percent',
      discountAmount,
      total,
      paymentMethod,
      supplier: supplierName || 'مورد عام',
      supplierId: supplierDoc?.doc_id || '',
      supplierPhone,
      supplierAddress,
      paidAmount,
      dueAmount,
      dueCurrency: currency,
      dueAmountDisplay,
      previousDebt,
      accountTotal,
      paymentStatus: dueAmount > 0 ? 'غير مدفوع' : 'مدفوع',
      status: 'مؤكدة',
      source: 'purchase_list',
      currency,
      exchangeRate: currency === 'USD' ? exchangeRate : 1,
      totalDisplay,
      notes: payload.notes || '',
      date: payload.date || nowHuman(),
      dateISO: payload.dateISO || todayIso(),
      addedBy: payload.addedBy || '',
      createdAt: ts,
      ...(linkedVoucherNo ? { linkedVoucherNo } : {}),
    };
    upsertDocTx(db, `pos_purchases/${purchaseId}`, purchaseDoc, false);
    return { id: purchaseId, ...purchaseDoc };
  });
  return tx(input);
}

function createSaleReturnTx(input = {}) {
  const db = getDb();
  const tx = db.transaction((payload) => {
    const ts = nowIso();
    const items = Array.isArray(payload.items) ? payload.items : [];
    if (!items.length) throw new Error('Return items are required');
    const returnNo = payload.returnNo || generateInvoiceNo('RET');
    const settledAmount = Math.max(0, Number(payload.settledAmount || payload.receivedAmount || 0));
    const total = Math.max(0, Number(payload.total || 0));
    const remainingAmount = Math.max(0, total - settledAmount);
    const customerId = String(payload.customerId || '').trim();

    for (const item of items) {
      const row = getByDocPathTx(db, `pos_products/${item.id}`);
      if (!row) throw new Error(`Product not found: ${item.id}`);
      const product = row.data_json ? JSON.parse(row.data_json) : {};
      const packageQty = Math.max(1, Number(item.packageQty || 1));
      const qty = Math.max(0, Number(item.returnQty || 0));
      const qtyUnits = Boolean(item.isPackage) ? (qty * packageQty) : qty;
      upsertDocTx(db, `pos_products/${item.id}`, {
        ...product,
        stock: Number(product.stock || 0) + qtyUnits,
        updatedAt: ts,
      }, false);
    }

    let linkedVoucherNo = '';
    let accountTotal = Number(payload.accountTotal || 0);
    if (customerId) {
      const customerRow = getByDocPathTx(db, `pos_customers/${customerId}`);
      if (customerRow) {
        const c = customerRow.data_json ? JSON.parse(customerRow.data_json) : {};
        const debtByCurrency = {
          IQD: Math.max(0, Number(c?.debtByCurrency?.IQD ?? c?.debt ?? 0) - settledAmount),
          USD: Number(c?.debtByCurrency?.USD ?? 0),
        };
        accountTotal = debtByCurrency.IQD;
        upsertDocTx(db, customerRow.doc_path, {
          ...c,
          debt: debtByCurrency.IQD,
          debtByCurrency,
          updatedAt: ts,
        }, false);
      }
    }

    if (settledAmount > 0 && customerId) {
      linkedVoucherNo = generateInvoiceNo('V-RS');
      const voucherId = randomUUID().replace(/-/g, '').slice(0, 20);
      upsertDocTx(db, `pos_vouchers/${voucherId}`, {
        voucherNo: linkedVoucherNo,
        type: 'دفع',
        amount: settledAmount,
        amountIQD: settledAmount,
        amountIQDEntry: settledAmount,
        amountUSDEntry: 0,
        currency: 'دينار عراقي',
        exchangeRate: 1,
        fromTo: payload.customer || '',
        description: `تسوية تلقائية لإرجاع البيع ${returnNo}`,
        paymentMethod: 'نقدي',
        dateISO: payload.dateISO || todayIso(),
        date: payload.date || nowHuman(),
        source: 'sale_return_auto',
        linkedReturnNo: returnNo,
        addedBy: payload.addedBy || '',
        status: 'مؤكد',
        createdAt: ts,
      }, false);
    }

    const id = randomUUID().replace(/-/g, '').slice(0, 20);
    const ret = {
      returnNo,
      originalInvoice: payload.originalInvoice || '',
      originalId: payload.originalId || '',
      customer: payload.customer || '',
      customerId,
      items,
      subtotal: Number(payload.subtotal || total),
      discount: Number(payload.discount || 0),
      discountType: payload.discountType || 'percent',
      discountAmount: Number(payload.discountAmount || 0),
      total,
      receivedAmount: Number(payload.receivedAmount || settledAmount),
      settledAmount,
      paidAmount: Number(payload.paidAmount || settledAmount),
      remainingAmount,
      dueAmount: remainingAmount,
      refundMethod: remainingAmount > 0 ? 'آجل' : 'نقدي',
      previousDebt: Number(payload.previousDebt || 0),
      accountTotal,
      reason: payload.reason || '',
      date: payload.date || nowHuman(),
      dateISO: payload.dateISO || todayIso(),
      addedBy: payload.addedBy || '',
      createdAt: ts,
      ...(linkedVoucherNo ? { linkedVoucherNo } : {}),
    };
    upsertDocTx(db, `pos_returns/${id}`, ret, false);
    return { id, ...ret };
  });
  return tx(input);
}

function createPurchaseReturnTx(input = {}) {
  const db = getDb();
  const tx = db.transaction((payload) => {
    const ts = nowIso();
    const items = Array.isArray(payload.items) ? payload.items : [];
    if (!items.length) throw new Error('Return items are required');
    const returnNo = payload.returnNo || generateInvoiceNo('PRET');
    const settledAmount = Math.max(0, Number(payload.settledAmount || payload.receivedAmount || 0));
    const total = Math.max(0, Number(payload.total || 0));
    const remainingAmount = Math.max(0, total - settledAmount);
    const supplierId = String(payload.supplierId || '').trim();

    for (const item of items) {
      const row = getByDocPathTx(db, `pos_products/${item.id}`);
      if (!row) throw new Error(`Product not found: ${item.id}`);
      const product = row.data_json ? JSON.parse(row.data_json) : {};
      const packageQty = Math.max(1, Number(item.packageQty || 1));
      const qty = Math.max(0, Number(item.returnQty || 0));
      const qtyUnits = Boolean(item.isPackage) ? (qty * packageQty) : qty;
      upsertDocTx(db, `pos_products/${item.id}`, {
        ...product,
        stock: Math.max(0, Number(product.stock || 0) - qtyUnits),
        updatedAt: ts,
      }, false);
    }

    let linkedVoucherNo = '';
    let accountTotal = Number(payload.accountTotal || 0);
    if (supplierId) {
      const supplierRow = getByDocPathTx(db, `pos_suppliers/${supplierId}`);
      if (supplierRow) {
        const s = supplierRow.data_json ? JSON.parse(supplierRow.data_json) : {};
        const debtByCurrency = {
          IQD: Math.max(0, Number(s?.debtByCurrency?.IQD ?? s?.debt ?? 0) - settledAmount),
          USD: Number(s?.debtByCurrency?.USD ?? 0),
        };
        accountTotal = debtByCurrency.IQD;
        upsertDocTx(db, supplierRow.doc_path, {
          ...s,
          debt: debtByCurrency.IQD,
          debtByCurrency,
          updatedAt: ts,
        }, false);
      }
    }

    if (settledAmount > 0 && supplierId) {
      linkedVoucherNo = generateInvoiceNo('V-RP');
      const voucherId = randomUUID().replace(/-/g, '').slice(0, 20);
      upsertDocTx(db, `pos_vouchers/${voucherId}`, {
        voucherNo: linkedVoucherNo,
        type: 'قبض',
        amount: settledAmount,
        amountIQD: settledAmount,
        amountIQDEntry: settledAmount,
        amountUSDEntry: 0,
        currency: 'دينار عراقي',
        exchangeRate: 1,
        fromTo: payload.supplier || '',
        description: `تسوية تلقائية لإرجاع الشراء ${returnNo}`,
        paymentMethod: 'نقدي',
        dateISO: payload.dateISO || todayIso(),
        date: payload.date || nowHuman(),
        source: 'purchase_return_auto',
        linkedReturnNo: returnNo,
        addedBy: payload.addedBy || '',
        status: 'مؤكد',
        createdAt: ts,
      }, false);
    }

    const id = randomUUID().replace(/-/g, '').slice(0, 20);
    const ret = {
      returnNo,
      originalInvoice: payload.originalInvoice || '',
      originalId: payload.originalId || '',
      supplier: payload.supplier || '',
      supplierId,
      items,
      total,
      receivedAmount: Number(payload.receivedAmount || settledAmount),
      settledAmount,
      paidAmount: Number(payload.paidAmount || settledAmount),
      remainingAmount,
      dueAmount: remainingAmount,
      refundMethod: remainingAmount > 0 ? 'آجل' : 'نقدي',
      previousDebt: Number(payload.previousDebt || 0),
      accountTotal,
      reason: payload.reason || '',
      date: payload.date || nowHuman(),
      dateISO: payload.dateISO || todayIso(),
      addedBy: payload.addedBy || '',
      createdAt: ts,
      ...(linkedVoucherNo ? { linkedVoucherNo } : {}),
    };
    upsertDocTx(db, `pos_purchase_returns/${id}`, ret, false);
    return { id, ...ret };
  });
  return tx(input);
}

function deleteSaleWithAccountingTx(input = {}) {
  const db = getDb();
  const tx = db.transaction((payload) => {
    const saleId = String(payload.id || payload.invoiceId || '').trim();
    if (!saleId) throw new Error('Invoice id is required');
    const saleRow = getByDocPathTx(db, `pos_sales/${saleId}`);
    if (!saleRow || Number(saleRow.is_deleted || 0) === 1) throw new Error('Invoice not found');
    const sale = saleRow.data_json ? JSON.parse(saleRow.data_json) : {};
    const ts = nowIso();

    const oldQtyMap = sumQtyByProduct(sale.items || []);
    for (const productId of Object.keys(oldQtyMap)) {
      const row = getByDocPathTx(db, `pos_products/${productId}`);
      if (!row) continue;
      const product = row.data_json ? JSON.parse(row.data_json) : {};
      const restoredQty = Number(oldQtyMap[productId] || 0);
      upsertDocTx(db, `pos_products/${productId}`, {
        ...product,
        stock: Number(product.stock || 0) + restoredQty,
        soldCount: Math.max(0, Number(product.soldCount || 0) - restoredQty),
        updatedAt: ts,
      }, false);
    }

    const customerName = String(sale.customer || '').trim();
    const customerRef = getCustomerRefTx(db, sale.customerId, customerName);
    if (customerRef && customerName && customerName !== 'زبون عام') {
      const saleCurrency = sale.currency === 'USD' ? 'USD' : 'IQD';
      const saleRate = Number(sale.exchangeRate || 1) || 1;
      const saleTotalDisplay = saleCurrency === 'USD' ? Number(sale.total || 0) / saleRate : Number(sale.total || 0);
      const saleDueDisplay = saleCurrency === 'USD'
        ? Number(sale.dueAmount ?? sale.remainingAmount ?? 0) / saleRate
        : Number(sale.dueAmount ?? sale.remainingAmount ?? 0);
      applyCustomerLedgerTx(db, customerRef, {
        totalDelta: -saleTotalDisplay,
        dueDelta: -saleDueDisplay,
        currencyCode: saleCurrency,
        nextName: customerName,
        nextPhone: sale.customerPhone || customerRef.data?.phone || '',
        nextAddress: sale.customerAddress || customerRef.data?.address || '',
      });
    }

    const linkedVouchers = findDocsByCollectionTx(db, 'pos_vouchers').filter((entry) => (
      entry.data?.linkedSaleId === saleId
      || entry.data?.linkedSaleNo === sale.invoiceNo
    ));
    linkedVouchers.forEach((entry) => softDeleteDocTx(db, entry.path));

    const linkedExpenses = findDocsByCollectionTx(db, 'pos_expenses').filter((entry) => (
      entry.data?.source === 'sale_discount_auto'
      && (
        entry.data?.linkedSaleId === saleId
        || entry.data?.linkedSaleNo === sale.invoiceNo
      )
    ));
    linkedExpenses.forEach((entry) => softDeleteDocTx(db, entry.path));

    softDeleteDocTx(db, `pos_sales/${saleId}`);
    return {
      id: saleId,
      invoiceNo: sale.invoiceNo || '',
      deleted: true,
    };
  });

  return tx(input);
}

module.exports = {
  listByCollection,
  createSaleWithAccountingTx,
  updateSaleWithAccountingTx,
  deleteSaleWithAccountingTx,
  createVoucherWithAccountingTx,
  createPurchaseWithAccountingTx,
  createSaleReturnTx,
  createPurchaseReturnTx,
  generateInvoiceNo,
};
