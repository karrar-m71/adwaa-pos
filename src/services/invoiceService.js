import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  query,
  setDoc,
  where,
  writeBatch,
} from 'firebase/firestore';
import { db } from '../firebase';
import { openProfessionalInvoicePrint } from '../utils/invoicePrint';
import { getErrorMessage, getExchangeRate, todayAR, todayISO } from '../utils/helpers';
import { hasLocalApi, localStoreGet, localUpdateSale, runLocalSync } from '../data/api/localApi';

const normalizeCurrency = (value = 'IQD') => (value === 'USD' ? 'USD' : 'IQD');
const nowIso = () => new Date().toISOString();
const nowAr = () => new Date().toLocaleDateString('ar-IQ', {
  year: 'numeric',
  month: 'short',
  day: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
});

const readDebtByCurrency = (entity = {}) => ({
  IQD: Number(entity?.debtByCurrency?.IQD ?? entity?.debt ?? 0) || 0,
  USD: Number(entity?.debtByCurrency?.USD ?? 0) || 0,
});

const readTotalsByCurrency = (entity = {}) => ({
  IQD: Number(entity?.totalPurchasesByCurrency?.IQD ?? entity?.totalPurchases ?? 0) || 0,
  USD: Number(entity?.totalPurchasesByCurrency?.USD ?? 0) || 0,
});

const applyCurrencyDelta = (current = { IQD: 0, USD: 0 }, currency = 'IQD', delta = 0) => {
  const next = {
    IQD: Number(current.IQD || 0),
    USD: Number(current.USD || 0),
  };
  const key = currency === 'USD' ? 'USD' : 'IQD';
  next[key] = Math.max(0, Number(next[key] || 0) + Number(delta || 0));
  return next;
};

const displayAmount = (amountIQD = 0, currency = 'IQD', rate = 1) => {
  const safeRate = Number(rate || 1) || 1;
  return currency === 'USD' ? Number(amountIQD || 0) / safeRate : Number(amountIQD || 0);
};

const buildEditItems = (invoice = {}, products = []) => (
  (invoice.items || []).map((item) => {
    const product = products.find((entry) => entry.id === item.id) || {};
    const currency = normalizeCurrency(invoice.currency || 'IQD');
    const exchangeRate = Number(invoice.exchangeRate || 1) || 1;
    const sellType = item.sellType || (item.isPackage ? 'package' : 'unit');
    return {
      key: `${item.id}_${sellType}`,
      id: item.id,
      name: item.name,
      img: product.img || item.img || '',
      imgUrl: product.imgUrl || item.imgUrl || '',
      qty: Number(item.qty || 1),
      price: Number(item.priceDisplay ?? displayAmount(Number(item.price || 0), currency, exchangeRate)),
      priceIQD: Number(item.price || 0),
      sellType,
      isPackage: Boolean(item.isPackage),
      packageName: item.packageName || '',
      packageQty: Number(item.packageQty || 1),
      lineDiscount: Number(item.lineDiscount || 0),
      lineDiscountType: item.lineDiscountType || 'fixed',
      stock: Number(product.stock || 0),
    };
  })
);

export async function getInvoiceById(invoiceId) {
  const id = String(invoiceId || '').trim();
  if (!id) throw new Error('رقم الفاتورة غير صالح');

  if (hasLocalApi()) {
    const localInvoice = await localStoreGet(`pos_sales/${id}`);
    if (localInvoice) return { ...localInvoice, id };
  }

  const snap = await getDoc(doc(db, 'pos_sales', id));
  if (!snap.exists()) throw new Error('الفاتورة غير موجودة');
  return { id: snap.id, ...snap.data() };
}

export function buildInvoiceEditDraft(invoice, products = []) {
  const currency = normalizeCurrency(invoice?.currency || 'IQD');
  const exchangeRate = Number(invoice?.exchangeRate || getExchangeRate() || 1) || 1;
  return {
    mode: 'edit',
    invoiceId: invoice.id,
    invoiceNo: invoice.invoiceNo || '',
    customer: invoice.customer || '',
    customerId: invoice.customerId || '',
    customerPhone: invoice.customerPhone || '',
    customerAddress: invoice.customerAddress || '',
    discount: Number(invoice.discount || 0),
    discountType: invoice.discountType || 'percent',
    received: invoice.receivedAmount != null
      ? String(displayAmount(invoice.receivedAmount, currency, exchangeRate))
      : '',
    allowNeg: false,
    currency,
    exchangeRate,
    dateISO: invoice.dateISO || todayISO(),
    date: invoice.date || todayAR(),
    createdAt: invoice.createdAt || nowIso(),
    items: buildEditItems(invoice, products),
  };
}

export async function printInvoice(invoiceId, options = {}) {
  const invoice = await getInvoiceById(invoiceId);
  const customers = Array.isArray(options.customers) ? options.customers : [];
  const matchedCustomer = customers.find((entry) => entry.id === invoice.customerId || entry.name === invoice.customer);
  const payload = {
    ...invoice,
    dueAmount: invoice.dueAmount ?? invoice.remainingAmount ?? 0,
    paidAmount: invoice.paidAmount ?? Math.max(0, Number(invoice.total || 0) - Number(invoice.remainingAmount || 0)),
    customerPhone: invoice.customerPhone || matchedCustomer?.phone || '',
    customerAddress: invoice.customerAddress || matchedCustomer?.address || '',
  };
  const ok = openProfessionalInvoicePrint(payload, 'sale');
  if (!ok) throw new Error('تعذر فتح نافذة الطباعة');
  return payload;
}

const buildUpdatePayload = ({ invoice, draft, user }) => {
  const currency = normalizeCurrency(draft.currency || invoice.currency || 'IQD');
  const exchangeRate = Number(draft.exchangeRate || invoice.exchangeRate || getExchangeRate() || 1) || 1;
  const items = (draft.items || []).map((item) => {
    const qty = Math.max(0, Number(item.qty || 0));
    const priceDisplay = Math.max(0, Number(item.price || 0));
    const priceIQD = currency === 'USD' ? priceDisplay * exchangeRate : priceDisplay;
    const lineSubtotalDisplay = qty * priceDisplay;
    const rawLineDiscount = Math.max(0, Number(item.lineDiscount || 0));
    const lineDiscountType = item.lineDiscountType || 'fixed';
    const lineDiscountDisplay = lineDiscountType === 'percent'
      ? Math.min(lineSubtotalDisplay, lineSubtotalDisplay * (rawLineDiscount / 100))
      : Math.min(lineSubtotalDisplay, rawLineDiscount);
    const totalDisplay = Math.max(0, lineSubtotalDisplay - lineDiscountDisplay);
    return {
      id: item.id,
      name: item.name,
      qty,
      price: priceIQD,
      priceIQD,
      priceDisplay,
      sellType: item.sellType || (item.isPackage ? 'package' : 'unit'),
      isPackage: Boolean(item.isPackage),
      packageName: item.packageName || '',
      packageQty: Number(item.packageQty || 1),
      lineSubtotal: currency === 'USD' ? lineSubtotalDisplay * exchangeRate : lineSubtotalDisplay,
      lineDiscount: rawLineDiscount,
      lineDiscountType,
      lineDiscountAmount: currency === 'USD' ? lineDiscountDisplay * exchangeRate : lineDiscountDisplay,
      lineDiscountAmountDisplay: lineDiscountDisplay,
      total: currency === 'USD' ? totalDisplay * exchangeRate : totalDisplay,
    };
  }).filter((item) => item.id && item.qty > 0);

  const grossSubtotalDisplay = items.reduce((sum, item) => sum + Number(item.priceDisplay || 0) * Number(item.qty || 0), 0);
  const itemDiscountAmountDisplay = items.reduce((sum, item) => sum + Number(item.lineDiscountAmountDisplay || 0), 0);
  const subtotalDisplay = Math.max(0, grossSubtotalDisplay - itemDiscountAmountDisplay);
  const discount = Math.max(0, Number(draft.discount || 0));
  const discountType = draft.discountType || 'percent';
  const discountAmountDisplay = discountType === 'percent'
    ? Math.min(subtotalDisplay, subtotalDisplay * (discount / 100))
    : Math.min(subtotalDisplay, discount);
  const totalDisplay = Math.max(0, subtotalDisplay - discountAmountDisplay);
  const receivedAmountDisplay = Math.max(0, Number(draft.received === '' ? totalDisplay : draft.received) || 0);
  const appliedAmountDisplay = Math.min(receivedAmountDisplay, totalDisplay);
  const dueAmountDisplay = Math.max(0, totalDisplay - appliedAmountDisplay);

  return {
    id: invoice.id,
    invoiceNo: invoice.invoiceNo,
    customer: String(draft.customer || '').trim() || 'زبون عام',
    customerId: draft.customerId || invoice.customerId || '',
    customerPhone: String(draft.customerPhone || '').trim(),
    customerAddress: String(draft.customerAddress || '').trim(),
    cashier: user?.name || invoice.cashier || '',
    dateISO: invoice.dateISO || draft.dateISO || todayISO(),
    date: invoice.date || draft.date || nowAr(),
    createdAt: invoice.createdAt || draft.createdAt || nowIso(),
    currency,
    exchangeRate,
    items,
    grossSubtotal: grossSubtotalDisplay,
    itemDiscountAmount: itemDiscountAmountDisplay,
    subtotal: subtotalDisplay,
    discount,
    discountType,
    discountAmount: discountAmountDisplay,
    total: totalDisplay,
    totalDisplay,
    receivedAmount: receivedAmountDisplay,
    receivedAmountDisplay,
    paidAmount: appliedAmountDisplay,
    dueAmount: dueAmountDisplay,
    dueAmountDisplay,
  };
};

async function fetchCustomerRefByName(name = '') {
  const customerName = String(name || '').trim();
  if (!customerName || customerName === 'زبون عام') return null;
  const found = await getDocs(query(collection(db, 'pos_customers'), where('name', '==', customerName)));
  const match = found.docs[0];
  return match ? { id: match.id, data: match.data() } : null;
}

async function updateInvoiceInFirestore(payload, context = {}) {
  const invoiceRef = doc(db, 'pos_sales', payload.id);
  const invoiceSnap = await getDoc(invoiceRef);
  if (!invoiceSnap.exists()) throw new Error('الفاتورة غير موجودة');
  const oldInvoice = { id: invoiceSnap.id, ...invoiceSnap.data() };
  const batch = writeBatch(db);

  const oldQtyMap = {};
  (oldInvoice.items || []).forEach((item) => {
    if (!item?.id) return;
    const used = item.isPackage ? Number(item.qty || 0) * Math.max(1, Number(item.packageQty || 1)) : Number(item.qty || 0);
    oldQtyMap[item.id] = Number(oldQtyMap[item.id] || 0) + used;
  });
  const newQtyMap = {};
  (payload.items || []).forEach((item) => {
    if (!item?.id) return;
    const used = item.isPackage ? Number(item.qty || 0) * Math.max(1, Number(item.packageQty || 1)) : Number(item.qty || 0);
    newQtyMap[item.id] = Number(newQtyMap[item.id] || 0) + used;
  });

  const productIds = [...new Set([...Object.keys(oldQtyMap), ...Object.keys(newQtyMap)])];
  const products = Array.isArray(context.products) ? context.products : [];
  for (const productId of productIds) {
    let product = products.find((entry) => entry.id === productId);
    if (!product) {
      const snap = await getDoc(doc(db, 'pos_products', productId));
      if (snap.exists()) product = { id: snap.id, ...snap.data() };
    }
    if (!product) throw new Error(`المادة غير موجودة: ${productId}`);
    const available = Number(product.stock || 0) + Number(oldQtyMap[productId] || 0);
    const requested = Number(newQtyMap[productId] || 0);
    if (available < requested) throw new Error(`الكمية غير كافية للمادة: ${product.name || productId}`);
    batch.set(doc(db, 'pos_products', productId), {
      stock: available - requested,
      soldCount: Math.max(0, Number(product.soldCount || 0) - Number(oldQtyMap[productId] || 0) + requested),
    }, { merge: true });
  }

  const oldCurrency = normalizeCurrency(oldInvoice.currency || 'IQD');
  const oldRate = Number(oldInvoice.exchangeRate || 1) || 1;
  const oldTotalDisplay = displayAmount(oldInvoice.total || 0, oldCurrency, oldRate);
  const oldDueDisplay = displayAmount(oldInvoice.dueAmount ?? oldInvoice.remainingAmount ?? 0, oldCurrency, oldRate);

  let oldCustomerRef = null;
  if (oldInvoice.customerId) {
    const snap = await getDoc(doc(db, 'pos_customers', oldInvoice.customerId));
    if (snap.exists()) oldCustomerRef = { id: snap.id, data: snap.data() };
  }
  if (!oldCustomerRef) oldCustomerRef = await fetchCustomerRefByName(oldInvoice.customer);

  let newCustomerRef = null;
  if (payload.customerId) {
    const snap = await getDoc(doc(db, 'pos_customers', payload.customerId));
    if (snap.exists()) newCustomerRef = { id: snap.id, data: snap.data() };
  }
  if (!newCustomerRef) newCustomerRef = await fetchCustomerRefByName(payload.customer);

  if (!newCustomerRef && payload.customer !== 'زبون عام') {
    const customerRef = doc(collection(db, 'pos_customers'));
    const customerDoc = {
      name: payload.customer,
      phone: payload.customerPhone || '',
      address: payload.customerAddress || '',
      debt: 0,
      debtByCurrency: { IQD: 0, USD: 0 },
      totalPurchases: 0,
      totalPurchasesByCurrency: { IQD: 0, USD: 0 },
      createdAt: nowIso(),
    };
    batch.set(customerRef, customerDoc);
    newCustomerRef = { id: customerRef.id, data: customerDoc };
  }

  if (oldCustomerRef && oldInvoice.customer && oldInvoice.customer !== 'زبون عام') {
    const nextTotals = applyCurrencyDelta(readTotalsByCurrency(oldCustomerRef.data), oldCurrency, -oldTotalDisplay);
    const nextDebt = applyCurrencyDelta(readDebtByCurrency(oldCustomerRef.data), oldCurrency, -oldDueDisplay);
    batch.set(doc(db, 'pos_customers', oldCustomerRef.id), {
      totalPurchases: Number(nextTotals.IQD || 0),
      totalPurchasesByCurrency: nextTotals,
      debt: Number(nextDebt.IQD || 0),
      debtByCurrency: nextDebt,
    }, { merge: true });
  }

  let previousDebtDisplay = 0;
  if (newCustomerRef && payload.customer !== 'زبون عام') {
    const currentDebt = readDebtByCurrency(newCustomerRef.data);
    previousDebtDisplay = payload.currency === 'USD' ? Number(currentDebt.USD || 0) : Number(currentDebt.IQD || 0);
    const nextTotals = applyCurrencyDelta(readTotalsByCurrency(newCustomerRef.data), payload.currency, payload.totalDisplay);
    const nextDebt = applyCurrencyDelta(currentDebt, payload.currency, payload.dueAmountDisplay);
    batch.set(doc(db, 'pos_customers', newCustomerRef.id), {
      name: payload.customer,
      phone: payload.customerPhone || '',
      address: payload.customerAddress || '',
      totalPurchases: Number(nextTotals.IQD || 0),
      totalPurchasesByCurrency: nextTotals,
      debt: Number(nextDebt.IQD || 0),
      debtByCurrency: nextDebt,
    }, { merge: true });
  }

  const linkedVoucherSnaps = await getDocs(query(collection(db, 'pos_vouchers'), where('linkedSaleId', '==', payload.id)));
  const linkedVoucherDocs = linkedVoucherSnaps.docs.length
    ? linkedVoucherSnaps.docs
    : (await getDocs(query(collection(db, 'pos_vouchers'), where('linkedSaleNo', '==', oldInvoice.invoiceNo || payload.invoiceNo)))).docs;
  linkedVoucherDocs.forEach((voucherDoc) => batch.delete(voucherDoc.ref));

  const linkedExpenseSnaps = await getDocs(query(collection(db, 'pos_expenses'), where('linkedSaleId', '==', payload.id)));
  const linkedExpenseDocs = linkedExpenseSnaps.docs.length
    ? linkedExpenseSnaps.docs.filter((entry) => entry.data()?.source === 'sale_discount_auto')
    : (await getDocs(query(collection(db, 'pos_expenses'), where('linkedSaleNo', '==', oldInvoice.invoiceNo || payload.invoiceNo)))).docs
        .filter((entry) => entry.data()?.source === 'sale_discount_auto');
  linkedExpenseDocs.forEach((expenseDoc) => batch.delete(expenseDoc.ref));

  let linkedVoucherNo = '';
  if (payload.dueAmountDisplay > 0 && payload.paidAmount > 0 && newCustomerRef && payload.customer !== 'زبون عام') {
    const voucherRef = doc(collection(db, 'pos_vouchers'));
    linkedVoucherNo = oldInvoice.linkedVoucherNo || `V-C-${oldInvoice.invoiceNo || payload.invoiceNo || payload.id}`;
    batch.set(voucherRef, {
      voucherNo: linkedVoucherNo,
      type: 'قبض',
      amount: payload.currency === 'USD' ? payload.paidAmount : payload.paidAmount,
      amountIQD: payload.currency === 'USD' ? payload.paidAmount * payload.exchangeRate : payload.paidAmount,
      amountIQDEntry: payload.currency === 'USD' ? 0 : payload.paidAmount,
      amountUSDEntry: payload.currency === 'USD' ? payload.paidAmount : 0,
      currency: payload.currency === 'USD' ? 'دولار أمريكي' : 'دينار عراقي',
      exchangeRate: payload.currency === 'USD' ? payload.exchangeRate : 1,
      fromTo: payload.customer,
      description: `دفعة تلقائية مرتبطة بفاتورة البيع ${oldInvoice.invoiceNo || payload.invoiceNo}`,
      paymentMethod: 'نقدي',
      dateISO: oldInvoice.dateISO || todayISO(),
      date: oldInvoice.date || nowAr(),
      source: 'sales_auto',
      linkedSaleId: payload.id,
      linkedSaleNo: oldInvoice.invoiceNo || payload.invoiceNo,
      addedBy: payload.cashier || oldInvoice.cashier || '',
      status: 'مؤكد',
      createdAt: nowIso(),
    });
  }

  const saleDiscountLossDisplay = Math.max(0, Number(payload.itemDiscountAmount || 0) + Number(payload.discountAmount || 0));
  if (saleDiscountLossDisplay > 0) {
    const expenseRef = doc(collection(db, 'pos_expenses'));
    batch.set(expenseRef, {
      desc: `خصم فاتورة بيع رقم ${oldInvoice.invoiceNo || payload.invoiceNo} للزبون ${payload.customer}`,
      amount: payload.currency === 'USD' ? saleDiscountLossDisplay * payload.exchangeRate : saleDiscountLossDisplay,
      cat: 'خسائر',
      dateISO: oldInvoice.dateISO || todayISO(),
      date: oldInvoice.date || nowAr(),
      addedBy: payload.cashier || oldInvoice.cashier || '',
      source: 'sale_discount_auto',
      linkedSaleNo: oldInvoice.invoiceNo || payload.invoiceNo,
      linkedSaleId: payload.id,
      createdAt: nowIso(),
    });
  }

  const totalIQD = payload.currency === 'USD' ? payload.totalDisplay * payload.exchangeRate : payload.totalDisplay;
  const paidAmountIQD = payload.currency === 'USD' ? payload.paidAmount * payload.exchangeRate : payload.paidAmount;
  const dueAmountIQD = payload.currency === 'USD' ? payload.dueAmountDisplay * payload.exchangeRate : payload.dueAmountDisplay;
  const receivedAmountIQD = payload.currency === 'USD' ? payload.receivedAmountDisplay * payload.exchangeRate : payload.receivedAmountDisplay;
  const nextDebtByCurrency = newCustomerRef ? readDebtByCurrency({
    ...newCustomerRef.data,
    debtByCurrency: applyCurrencyDelta(readDebtByCurrency(newCustomerRef.data), payload.currency, payload.dueAmountDisplay),
  }) : { IQD: 0, USD: 0 };

  batch.set(invoiceRef, {
    ...oldInvoice,
    invoiceNo: oldInvoice.invoiceNo || payload.invoiceNo,
    items: payload.items,
    grossSubtotal: payload.currency === 'USD' ? payload.grossSubtotal * payload.exchangeRate : payload.grossSubtotal,
    itemDiscountAmount: payload.currency === 'USD' ? payload.itemDiscountAmount * payload.exchangeRate : payload.itemDiscountAmount,
    subtotal: payload.currency === 'USD' ? payload.subtotal * payload.exchangeRate : payload.subtotal,
    discount: payload.discount,
    discountType: payload.discountType,
    discountAmount: payload.currency === 'USD' ? payload.discountAmount * payload.exchangeRate : payload.discountAmount,
    total: totalIQD,
    currency: payload.currency,
    exchangeRate: payload.currency === 'USD' ? payload.exchangeRate : 1,
    paymentMethod: payload.dueAmountDisplay > 0 ? 'آجل' : 'نقدي',
    customer: payload.customer,
    customerId: newCustomerRef?.id || '',
    customerPhone: payload.customerPhone,
    customerAddress: payload.customerAddress,
    cashier: payload.cashier || oldInvoice.cashier || '',
    paidAmount: paidAmountIQD,
    dueAmount: dueAmountIQD,
    remainingAmount: dueAmountIQD,
    receivedAmount: receivedAmountIQD,
    previousDebt: payload.currency === 'USD' ? previousDebtDisplay * payload.exchangeRate : previousDebtDisplay,
    accountTotal: Number(nextDebtByCurrency.IQD || 0) + (Number(nextDebtByCurrency.USD || 0) * payload.exchangeRate),
    cash: receivedAmountIQD,
    change: payload.currency === 'USD'
      ? Math.max(0, payload.receivedAmountDisplay - payload.totalDisplay) * payload.exchangeRate
      : Math.max(0, payload.receivedAmountDisplay - payload.totalDisplay),
    dateISO: oldInvoice.dateISO || payload.dateISO || todayISO(),
    date: oldInvoice.date || payload.date || nowAr(),
    createdAt: oldInvoice.createdAt || nowIso(),
    updatedAt: nowIso(),
    ...(linkedVoucherNo ? { linkedVoucherNo } : {}),
  });

  await batch.commit();
  return { id: payload.id, invoiceNo: oldInvoice.invoiceNo || payload.invoiceNo };
}

export async function updateInvoice(draft, context = {}) {
  const invoice = await getInvoiceById(draft.invoiceId || draft.id);
  const payload = buildUpdatePayload({ invoice, draft, user: context.user });
  if (hasLocalApi()) {
    const result = await localUpdateSale(payload);
    runLocalSync().catch(() => null);
    return result;
  }
  return updateInvoiceInFirestore(payload, context);
}

export function explainInvoiceError(error, fallback = 'تعذر تنفيذ العملية على الفاتورة') {
  const raw = String(error?.message || '');
  if (raw.toLowerCase().includes('insufficient stock')) {
    const productName = raw.split('for ').pop() || '';
    return `الكمية غير كافية${productName ? ` للمادة: ${productName}` : ''}`;
  }
  return getErrorMessage(error, fallback);
}
