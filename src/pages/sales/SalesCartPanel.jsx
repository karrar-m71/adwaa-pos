import { memo, useCallback, useEffect, useState } from 'react';
import { addDoc, collection, doc, setDoc } from 'firebase/firestore';
import { db } from '../../firebase';
import { openProfessionalInvoicePrint } from '../../utils/invoicePrint';
import { getUnitPriceByMode } from '../../utils/pricing';
import { getErrorMessage, genInvoiceNo } from '../../utils/helpers';
import { hasLocalApi, localCreateSale, runLocalSync } from '../../data/api/localApi';
import {
  applyCurrencyDelta,
  calcLineDiscountAmount,
  createDraftCart,
  createEditSession,
  fmtCur,
  genCode,
  nowStr,
  readDebtByCurrency,
  readTotalByCurrency,
  resolveImageUrl,
  resolvePackageMeta,
  SALES_UI as UI,
  selectFieldValue,
  today,
  toDisplay,
} from './salesListShared';

async function syncStockToMobile(productId, newStock) {
  try {
    await setDoc(doc(db, 'products', productId), {
      stock: newStock,
      updatedAt: new Date().toISOString(),
    }, { merge: true });
    return true;
  } catch (error) {
    console.warn('[adwaa-sales] Mobile stock sync failed:', error.message);
    return false;
  }
}

export const SalesCartPanel = memo(function SalesCartPanel({
  tabId,
  productMap,
  packageMap,
  customers,
  customerMap,
  user,
  currency,
  exchangeRate,
  priceMode,
  initialDraft,
  onDraftApplied,
  onUpdateInvoice,
}) {
  const [cart, setCart] = useState(() => createDraftCart(initialDraft));
  const [customer, setCustomer] = useState(() => initialDraft?.customer || '');
  const [customerPhone, setCustomerPhone] = useState(() => initialDraft?.customerPhone || '');
  const [customerAddress, setCustomerAddress] = useState(() => initialDraft?.customerAddress || '');
  const [discount, setDiscount] = useState(() => Number(initialDraft?.discount || 0));
  const [discountType, setDiscountType] = useState(() => initialDraft?.discountType || 'percent');
  const [received, setReceived] = useState(() => initialDraft?.received || '');
  const [allowNeg, setAllowNeg] = useState(() => Boolean(initialDraft?.allowNeg));
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(null);
  const [editSession, setEditSession] = useState(() => createEditSession(initialDraft));

  const resetPanel = () => {
    setDone(null);
    setCart([]);
    setCustomer('');
    setCustomerPhone('');
    setCustomerAddress('');
    setDiscount(0);
    setDiscountType('percent');
    setReceived('');
    setAllowNeg(false);
    setEditSession(null);
  };

  const addItem = useCallback((product, sellType) => {
    const pkg = packageMap[product.packageTypeId] || null;
    const pkgMeta = resolvePackageMeta(product, pkg);
    const supportsPackage = Boolean(pkgMeta);
    const normalizedSellType = sellType === 'package' && supportsPackage ? 'package' : 'unit';
    const isPackage = normalizedSellType === 'package';
    const packageQty = Number(pkgMeta?.qty || 1);
    const packageName = String(pkgMeta?.name || 'تعبئة');
    const priceIQD = isPackage ? (product.packagePrice || (product.sellPrice * packageQty)) : getUnitPriceByMode(product, priceMode);
    const price = currency === 'USD' ? priceIQD / exchangeRate : priceIQD;
    const stockPerUnit = isPackage ? packageQty : 1;
    const key = `${product.id}_${normalizedSellType}`;
    setCart((current) => {
      const existingIndex = current.findIndex((item) => item.key === key);
      if (existingIndex >= 0) {
        const newQty = current[existingIndex].qty + 1;
        const newUnits = newQty * stockPerUnit;
        const avail = product.stock || 0;
        // تحذير بصري إذا تجاوزت الكمية المخزون، لكن لا نمنع الإضافة
        const stockWarning = !allowNeg && newUnits > avail;
        return current.map((item, index) => (
          index === existingIndex ? { ...item, qty: newQty, stockWarning } : item
        ));
      }
      // تحذير بصري إذا كان المخزون = 0، لكن لا نمنع الإضافة
      const stockWarning = !allowNeg && (product.stock || 0) <= 0;
      return [...current, { key, id: product.id, name: product.name, img: product.img, imgUrl: product.imgUrl, qty: 1, price, priceIQD, sellType: normalizedSellType, isPackage, packageName: isPackage ? packageName : '', packageQty: isPackage ? packageQty : 1, lineDiscount: 0, lineDiscountType: 'fixed', stock: product.stock, stockWarning }];
    });
  }, [allowNeg, currency, exchangeRate, packageMap, priceMode]);

  useEffect(() => {
    const handler = (event) => {
      if (event.detail.tabId !== tabId) return;
      addItem(event.detail.product, event.detail.sellType);
    };
    window.addEventListener('cartAdd', handler);
    return () => window.removeEventListener('cartAdd', handler);
  }, [addItem, tabId]);

  useEffect(() => {
    if (!initialDraft) return;
    onDraftApplied?.(tabId);
  }, [initialDraft, onDraftApplied, tabId]);

  const updateQty = (key, delta) => setCart((current) => current.map((item) => {
    if (item.key !== key) return item;
    const product = productMap[item.id];
    const newQty = item.qty + delta;
    // لا نمنع التعديل — فقط نضع تحذيراً بصرياً
    if (newQty <= 0 && !allowNeg) return item; // لا نسمح بالصفر أو السالب إلا بوضع allowNeg
    const need = newQty * (item.isPackage ? item.packageQty : 1);
    const stockWarning = !allowNeg && need > (product?.stock || 0);
    return { ...item, qty: newQty, stockWarning };
  }));
  const updateQtyDirect = (key, value) => setCart((current) => current.map((item) => (item.key === key ? { ...item, qty: Number(value) || 0 } : item)));
  const updatePrice = (key, value) => setCart((current) => current.map((item) => (item.key === key ? { ...item, price: Number(value), priceIQD: currency === 'USD' ? Number(value) * exchangeRate : Number(value) } : item)));
  const removeItem = (key) => setCart((current) => current.filter((item) => item.key !== key));

  const grossSubtotal = cart.reduce((sum, item) => sum + item.price * item.qty, 0);
  const itemDiscountAmount = cart.reduce((sum, item) => sum + calcLineDiscountAmount(item, currency, exchangeRate).amount, 0);
  const subtotal = Math.max(0, grossSubtotal - itemDiscountAmount);
  const discAmt = discountType === 'percent' ? subtotal * (discount / 100) : Math.min(subtotal, Number(discount || 0));
  const total = Math.max(0, subtotal - discAmt);
  const receivedInputValue = received === '' ? total : received;
  const receivedAmount = Math.max(0, Number(received === '' ? total : received) || 0);
  const appliedAmount = Math.min(receivedAmount, total);
  const remainingAmount = Math.max(0, total - appliedAmount);
  const change = Math.max(0, receivedAmount - total);
  const payMethod = remainingAmount > 0 ? 'آجل' : 'نقدي';
  const selCust = customerMap[customer.trim()] || null;
  const previousDebtIQD = Number(selCust?.debt || 0);
  const remainingAmountIQD = currency === 'USD' ? remainingAmount * exchangeRate : remainingAmount;
  const totalAccountIQD = previousDebtIQD + remainingAmountIQD;

  const save = async () => {
    if (!cart.length) return alert('السلة فارغة');
    if (payMethod === 'آجل' && !customer.trim()) return alert('أدخل اسم الزبون');
    if (!customer.trim() && receivedAmount > total) return alert('لا يمكن أن يكون المبلغ الواصل أكبر من مبلغ الفاتورة عند البيع لزبون عام');
    // فحص المخزون: تحذير فقط (لا حظر) — يمكن للمستخدم تفعيل "البيع بالسالب" عبر خيار allowNeg لتخطي حتى التحذير
    if (!allowNeg) {
      const insufficientItem = cart.find((item) => {
        const product = productMap[item.id];
        const originalQty = Number(editSession?.originalQtyByProduct?.[item.id] || 0);
        const requestedUnits = Number(item.qty || 0) * (item.isPackage ? Number(item.packageQty || 1) : 1);
        return requestedUnits > (Number(product?.stock || 0) + originalQty);
      });
      // تحذير بصري فقط — لا نوقف الحفظ
      if (insufficientItem) {
        console.warn(`[adwaa-sales] مخزون غير كافٍ للمادة: ${insufficientItem.name} — سيصبح المخزون بالسالب`);
      }
    }
    setSaving(true);
    try {
      if (editSession?.invoiceId) {
        const updatedInvoice = await onUpdateInvoice?.({
          mode: 'edit',
          invoiceId: editSession.invoiceId,
          invoiceNo: editSession.invoiceNo,
          createdAt: editSession.createdAt,
          dateISO: editSession.dateISO,
          date: editSession.date,
          customer,
          customerPhone,
          customerAddress,
          discount,
          discountType,
          received,
          currency,
          exchangeRate,
          items: cart,
        });
        setDone(updatedInvoice || {
          invoiceNo: editSession.invoiceNo,
          customer,
          paymentMethod: payMethod,
          total: currency === 'USD' ? total * exchangeRate : total,
          currency,
          exchangeRate,
          receivedAmount: currency === 'USD' ? receivedAmount * exchangeRate : receivedAmount,
          remainingAmount: currency === 'USD' ? remainingAmount * exchangeRate : remainingAmount,
          updatedAt: new Date().toISOString(),
        });
        setEditSession(null);
        setSaving(false);
        return;
      }

      const invoiceNo = genInvoiceNo('INV');
      const totalIQD = currency === 'USD' ? total * exchangeRate : total;
      const paidAmountIQD = currency === 'USD' ? appliedAmount * exchangeRate : appliedAmount;
      const dueAmountIQD = currency === 'USD' ? remainingAmount * exchangeRate : remainingAmount;
      const receivedAmountIQD = currency === 'USD' ? receivedAmount * exchangeRate : receivedAmount;
      const changeIQD = currency === 'USD' ? change * exchangeRate : change;
      const sale = {
        invoiceNo,
        items: cart.map((item) => {
          const lineBase = Number(item.price || 0) * Number(item.qty || 0);
          const lineDisc = calcLineDiscountAmount(item, currency, exchangeRate);
          const lineTotal = Math.max(0, lineBase - lineDisc.amount);
          return {
            id: item.id,
            name: item.name,
            qty: item.qty,
            price: item.priceIQD,
            priceDisplay: item.price,
            currency,
            sellType: item.sellType,
            isPackage: item.isPackage,
            packageName: item.packageName,
            packageQty: item.packageQty,
            lineSubtotal: currency === 'USD' ? lineBase * exchangeRate : lineBase,
            lineDiscount: Number(item.lineDiscount || 0),
            lineDiscountType: item.lineDiscountType || 'fixed',
            lineDiscountAmount: lineDisc.amountIQD,
            lineDiscountAmountDisplay: lineDisc.amount,
            total: currency === 'USD' ? lineTotal * exchangeRate : lineTotal,
          };
        }),
        grossSubtotal: currency === 'USD' ? grossSubtotal * exchangeRate : grossSubtotal,
        itemDiscountAmount: currency === 'USD' ? itemDiscountAmount * exchangeRate : itemDiscountAmount,
        subtotal: currency === 'USD' ? subtotal * exchangeRate : subtotal,
        discount,
        discountType,
        discountAmount: currency === 'USD' ? discAmt * exchangeRate : discAmt,
        total: totalIQD,
        currency,
        exchangeRate: currency === 'USD' ? exchangeRate : 1,
        paymentMethod: payMethod,
        customer: customer.trim() || 'زبون عام',
        customerId: selCust?.id || '',
        customerPhone: customerPhone.trim(),
        customerAddress: customerAddress.trim(),
        cashier: user.name,
        paidAmount: paidAmountIQD,
        dueAmount: dueAmountIQD,
        remainingAmount: dueAmountIQD,
        receivedAmount: receivedAmountIQD,
        previousDebt: previousDebtIQD,
        accountTotal: totalAccountIQD,
        cash: receivedAmountIQD,
        change: changeIQD,
        dateISO: today(),
        date: nowStr(),
        createdAt: new Date().toISOString(),
      };

      if (hasLocalApi()) {
        const localResult = await localCreateSale({
          invoiceNo,
          items: cart.map((item) => ({
            id: item.id,
            name: item.name,
            qty: Number(item.qty || 0),
            price: Number(item.price || 0),
            priceIQD: Number(item.priceIQD || 0),
            isPackage: Boolean(item.isPackage),
            packageQty: Number(item.packageQty || 1),
            packageName: item.packageName || '',
            sellType: item.sellType || (item.isPackage ? 'package' : 'unit'),
            lineDiscount: Number(item.lineDiscount || 0),
            lineDiscountType: item.lineDiscountType || 'fixed',
            lineDiscountAmount: calcLineDiscountAmount(item, currency, exchangeRate).amountIQD,
          })),
          grossSubtotal: currency === 'USD' ? grossSubtotal * exchangeRate : grossSubtotal,
          itemDiscountAmount: currency === 'USD' ? itemDiscountAmount * exchangeRate : itemDiscountAmount,
          subtotal: currency === 'USD' ? subtotal * exchangeRate : subtotal,
          discount,
          discountType,
          discountAmount: currency === 'USD' ? discAmt * exchangeRate : discAmt,
          total: totalIQD,
          receivedAmount: receivedAmountIQD,
          customer: customer.trim() || 'زبون عام',
          customerPhone: customerPhone.trim(),
          customerAddress: customerAddress.trim(),
          cashier: user.name,
          currency,
          exchangeRate: currency === 'USD' ? exchangeRate : 1,
        });
        setDone({ ...localResult, localId: localResult?.id, localSaved: true });
        runLocalSync().catch(() => null);
        setSaving(false);
        return;
      }

      const saleRef = await addDoc(collection(db, 'pos_sales'), sale);
      const stockSyncJobs = [];
      await Promise.all(cart.map(async (item) => {
        const product = productMap[item.id];
        if (!product) return;
        const stockUsed = item.isPackage ? item.qty * item.packageQty : item.qty;
        const newStock = (product.stock || 0) - stockUsed;
        await setDoc(doc(db, 'pos_products', item.id), {
          stock: newStock,
          soldCount: (product.soldCount || 0) + Math.abs(stockUsed),
        }, { merge: true });
        stockSyncJobs.push(syncStockToMobile(item.id, newStock));
      }));

      if (payMethod === 'آجل' && customer.trim()) {
        const nextDebtByCurrency = applyCurrencyDelta(readDebtByCurrency(selCust || {}), currency, remainingAmount);
        const nextTotalPurchasesByCurrency = applyCurrencyDelta(readTotalByCurrency(selCust || {}), currency, total);
        if (selCust) {
          await setDoc(doc(db, 'pos_customers', selCust.id), {
            debt: Number(nextDebtByCurrency.IQD || 0),
            debtByCurrency: nextDebtByCurrency,
            totalPurchases: (selCust.totalPurchases || 0) + totalIQD,
            totalPurchasesByCurrency: nextTotalPurchasesByCurrency,
            phone: customerPhone.trim(),
            address: customerAddress.trim(),
          }, { merge: true });
        } else {
          await addDoc(collection(db, 'pos_customers'), {
            name: customer.trim(),
            phone: customerPhone.trim(),
            address: customerAddress.trim(),
            debt: currency === 'USD' ? remainingAmount * exchangeRate : remainingAmount,
            debtByCurrency: applyCurrencyDelta({ IQD:0, USD:0 }, currency, remainingAmount),
            totalPurchases: totalIQD,
            totalPurchasesByCurrency: applyCurrencyDelta({ IQD:0, USD:0 }, currency, total),
            createdAt: new Date().toISOString(),
          });
        }
      }

      if (payMethod === 'آجل' && appliedAmount > 0 && customer.trim()) {
        const voucherNo = genCode('V-C');
        await addDoc(collection(db, 'pos_vouchers'), {
          voucherNo,
          type: 'قبض',
          amount: currency === 'USD' ? appliedAmount : paidAmountIQD,
          amountIQD: paidAmountIQD,
          amountIQDEntry: currency === 'USD' ? 0 : paidAmountIQD,
          amountUSDEntry: currency === 'USD' ? appliedAmount : 0,
          currency: currency === 'USD' ? 'دولار أمريكي' : 'دينار عراقي',
          exchangeRate: currency === 'USD' ? exchangeRate : 1,
          fromTo: customer.trim(),
          description: `دفعة تلقائية مرتبطة بفاتورة البيع ${invoiceNo}`,
          paymentMethod: 'نقدي',
          dateISO: today(),
          date: nowStr(),
          source: 'sales_auto',
          linkedSaleId: saleRef.id,
          linkedSaleNo: invoiceNo,
          addedBy: user.name,
          status: 'مؤكد',
          createdAt: new Date().toISOString(),
        });
        await setDoc(saleRef, { linkedVoucherNo: voucherNo }, { merge: true });
        sale.linkedVoucherNo = voucherNo;
      }

      setDone(sale);
      Promise.allSettled(stockSyncJobs).then((results) => {
        const failures = results.filter((entry) => entry.status === 'fulfilled' && entry.value === false).length
          + results.filter((entry) => entry.status === 'rejected').length;
        if (failures > 0) {
          console.warn(`[adwaa-sales] ${failures} mobile stock sync operation(s) failed after saving sale ${sale.invoiceNo}`);
        }
      });
    } catch (error) {
      const rawMessage = String(error?.message || '');
      if (rawMessage.toLowerCase().includes('insufficient stock')) {
        const productName = rawMessage.split('for ').pop() || '';
        alert(`الكمية غير كافية${productName ? ` للمادة: ${productName}` : ''}`);
      } else {
        alert('خطأ في حفظ الفاتورة: ' + getErrorMessage(error));
      }
    }
    setSaving(false);
  };

  const printInv = (invoice) => {
    try {
      const ok = openProfessionalInvoicePrint({
        ...invoice,
        dueAmount: invoice.dueAmount ?? invoice.remainingAmount ?? 0,
        paidAmount: invoice.paidAmount ?? Math.max(0, Number(invoice.total || 0) - Number(invoice.remainingAmount || 0)),
        customerPhone: invoice.customerPhone || customerMap[invoice.customer || '']?.phone || '',
      }, 'sale');
      if (!ok) alert('تعذر فتح نافذة الطباعة. تأكد من السماح بالنوافذ المنبثقة.');
    } catch (error) {
      console.error('[adwaa-print] Sales invoice print failed', error);
      alert('تعذر طباعة الفاتورة');
    }
  };

  if (done) return (
    <div style={{ flex:'1 1 340px', width:'min(100%, 360px)', maxWidth:'100%', background:UI.panel, display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', padding:24, borderRight:`1px solid ${UI.border}` }}>
      <div style={{ fontSize:60, marginBottom:10 }}>{done.paymentMethod === 'آجل' ? '📋' : '✅'}</div>
      <div style={{ color:done.paymentMethod === 'آجل' ? '#f59e0b' : '#10b981', fontSize:18, fontWeight:800, marginBottom:4 }}>{done.paymentMethod === 'آجل' ? 'تسجيل آجل!' : 'تمت عملية البيع!'}</div>
      <div style={{ color:UI.muted, fontSize:12, marginBottom:4 }}>{done.invoiceNo}</div>
      {done.updatedAt && <div style={{ color:UI.info, fontSize:11, fontWeight:700, marginBottom:4 }}>تم تحديث الفاتورة بنجاح</div>}
      <div style={{ background:UI.infoSoft, border:'1px solid #93c5fd', borderRadius:10, padding:'6px 14px', marginBottom:16 }}>
        <span style={{ color:UI.info, fontSize:11, fontWeight:700 }}>📱 تم تحديث مخزون الموبايل</span>
      </div>
      <div style={{ background:UI.soft, borderRadius:12, padding:16, border:`1px solid ${UI.border}`, width:'100%', marginBottom:16 }}>
        {[
          ['الإجمالي', fmtCur(toDisplay(done.total, done.currency || 'IQD', done.exchangeRate || 1), done.currency || 'IQD'), '#F5C800'],
          ['طريقة الدفع', done.paymentMethod, '#10b981'],
          ['الواصل', fmtCur(toDisplay(done.receivedAmount ?? done.cash ?? 0, done.currency || 'IQD', done.exchangeRate || 1), done.currency || 'IQD'), '#2563EB'],
          ['المتبقي', fmtCur(toDisplay(done.remainingAmount || 0, done.currency || 'IQD', done.exchangeRate || 1), done.currency || 'IQD'), done.remainingAmount > 0 ? '#f59e0b' : '#10b981'],
          ...((done.accountTotal || 0) > 0 ? [['الحساب الكلي', fmtCur(toDisplay(done.accountTotal || 0, done.currency || 'IQD', done.exchangeRate || 1), done.currency || 'IQD'), '#7C3AED']] : []),
          ...(done.change > 0 ? [['الباقي', fmtCur(toDisplay(done.change || 0, done.currency || 'IQD', done.exchangeRate || 1), done.currency || 'IQD'), '#10b981']] : []),
        ].map(([label, value, color]) => (
          <div key={label} style={{ display:'flex', justifyContent:'space-between', padding:'7px 0', borderBottom:`1px solid ${UI.borderSoft}` }}>
            <span style={{ color:UI.muted, fontSize:12 }}>{label}</span>
            <span style={{ color, fontWeight:700, fontSize:13 }}>{value}</span>
          </div>
        ))}
      </div>
      <div style={{ display:'flex', gap:8, width:'100%' }}>
        <button onClick={() => printInv(done)} style={{ flex:1, background:UI.info, color:'#fff', border:'none', borderRadius:10, padding:10, fontWeight:700, cursor:'pointer', fontFamily:"'Cairo'", fontSize:13 }}>🖨️ طباعة</button>
        <button onClick={resetPanel} style={{ flex:1, background:UI.accent, color:'#fff', border:'none', borderRadius:10, padding:10, fontWeight:700, cursor:'pointer', fontFamily:"'Cairo'", fontSize:13 }}>+ جديدة</button>
      </div>
    </div>
  );

  return (
    <div style={{ flex:'1 1 340px', width:'min(100%, 360px)', maxWidth:'100%', background:UI.panel, display:'flex', flexDirection:'column', borderRight:`1px solid ${UI.border}`, overflow:'hidden', minWidth:0 }}>
      <div style={{ padding:'8px 10px', borderBottom:`1px solid ${UI.border}` }}>
        <input value={customer} onChange={(event) => {
          const nextCustomer = event.target.value;
          const matchedCustomer = customerMap[nextCustomer.trim()] || null;
          setCustomer(nextCustomer);
          if (!nextCustomer.trim()) {
            setCustomerPhone('');
            setCustomerAddress('');
          } else if (matchedCustomer) {
            setCustomerPhone(matchedCustomer.phone || '');
            setCustomerAddress(matchedCustomer.address || '');
          }
        }} list={`cl-${tabId}`} placeholder="الزبون (مطلوب عند وجود متبقي)" style={{ width:'100%', background:UI.soft, border:`1px solid ${payMethod === 'آجل' && !customer.trim() ? UI.danger : UI.border}`, borderRadius:8, padding:'6px 10px', color:UI.text, fontSize:12, outline:'none', fontFamily:"'Cairo'", boxSizing:'border-box', marginBottom:4 }} />
        <datalist id={`cl-${tabId}`}>{customers.map((entry) => <option key={entry.id} value={entry.name} />)}</datalist>
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:6, marginBottom:4 }}>
          <input value={customerPhone} onChange={(event) => setCustomerPhone(event.target.value)} placeholder="رقم الهاتف" style={{ width:'100%', background:'#fff', border:`1px solid ${UI.border}`, borderRadius:8, padding:'6px 10px', color:UI.text, fontSize:12, outline:'none', fontFamily:"'Cairo'", boxSizing:'border-box' }} />
          <input value={customerAddress} onChange={(event) => setCustomerAddress(event.target.value)} placeholder="العنوان" style={{ width:'100%', background:'#fff', border:`1px solid ${UI.border}`, borderRadius:8, padding:'6px 10px', color:UI.text, fontSize:12, outline:'none', fontFamily:"'Cairo'", boxSizing:'border-box' }} />
        </div>
        {selCust && (selCust.debt || 0) > 0 && <div style={{ background:'#fff7ed', border:'1px solid #fdba74', borderRadius:6, padding:'3px 8px', display:'flex', justifyContent:'space-between', marginBottom:4 }}><span style={{ color:UI.muted, fontSize:10 }}>دينه الحالي</span><span style={{ color:'#f59e0b', fontSize:11, fontWeight:700 }}>{fmtCur(toDisplay(previousDebtIQD, currency, exchangeRate), currency)}</span></div>}
        {customer.trim() && totalAccountIQD > 0 && <div style={{ background:'#f3e8ff', border:'1px solid #d8b4fe', borderRadius:6, padding:'3px 8px', display:'flex', justifyContent:'space-between', marginBottom:4 }}><span style={{ color:UI.muted, fontSize:10 }}>مبلغ الحساب الكلي</span><span style={{ color:UI.purple, fontSize:11, fontWeight:700 }}>{fmtCur(toDisplay(totalAccountIQD, currency, exchangeRate), currency)}</span></div>}
        <label style={{ display:'flex', gap:6, alignItems:'center', cursor:'pointer' }}>
          <input type="checkbox" checked={allowNeg} onChange={(event) => setAllowNeg(event.target.checked)} style={{ accentColor:'#ef4444' }} />
          <span style={{ color:allowNeg ? UI.danger : UI.muted, fontSize:10, fontWeight:allowNeg ? 700 : 400 }}>⚠️ البيع بالسالب</span>
        </label>
      </div>

      <div style={{ flex:1, overflowY:'auto', padding:6 }}>
        {!cart.length ? <div style={{ color:UI.subtle, textAlign:'center', padding:30, fontSize:12 }}>أضف منتجات من اليسار<br /><span style={{ fontSize:10, color:UI.muted }}>كليك يمين لمعلومات المادة</span></div> : cart.map((item) => (
          <div key={item.key} style={{ background:UI.soft, borderRadius:10, padding:8, marginBottom:5, border:`1px solid ${item.isPackage ? '#d8b4fe' : item.qty < 0 ? '#fecaca' : item.stockWarning ? '#fbbf24' : UI.border}` }}>
            <div style={{ display:'flex', gap:6, alignItems:'center', marginBottom:5 }}>
              {item.imgUrl ? <img src={resolveImageUrl(item.imgUrl)} loading="lazy" decoding="async" style={{ width:22, height:22, borderRadius:4, objectFit:'cover' }} alt="" onError={(event) => { event.target.style.display = 'none'; }} /> : <span style={{ fontSize:14 }}>{item.img || '📦'}</span>}
              <div style={{ flex:1, overflow:'hidden' }}>
                <span style={{ color:UI.text, fontSize:11, fontWeight:600 }}>{item.name?.length > 16 ? item.name.slice(0, 16) + '…' : item.name}</span>
                {item.isPackage && <span style={{ background:UI.purpleSoft, borderRadius:20, padding:'0 4px', color:UI.purple, fontSize:8, marginRight:3 }}>📦{item.packageName}</span>}
                {item.qty < 0 && <span style={{ background:UI.dangerSoft, borderRadius:20, padding:'0 4px', color:UI.danger, fontSize:8, marginRight:3 }}>⚠️سالب</span>}
                {item.stockWarning && item.qty >= 0 && <span style={{ background:'#fef3c7', borderRadius:20, padding:'0 4px', color:'#d97706', fontSize:8, marginRight:3 }}>⚠️ مخزون منخفض</span>}
              </div>
              <button onClick={() => removeItem(item.key)} style={{ background:'none', border:'none', color:UI.danger, cursor:'pointer', fontSize:13 }}>✕</button>
            </div>
            {item.isPackage && <div style={{ color:UI.muted, fontSize:9, marginBottom:4 }}>يُخصم: {Math.abs(item.qty * (item.packageQty || 1))} وحدة</div>}
            <div style={{ display:'flex', gap:5, alignItems:'center' }}>
              <input type="text" inputMode="decimal" value={item.price} onChange={(event) => updatePrice(item.key, event.target.value)} onDoubleClick={selectFieldValue} style={{ width:72, background:'#fff', border:`1px solid ${UI.border}`, borderRadius:6, padding:'3px 5px', color:item.isPackage ? UI.purple : UI.accent, fontSize:10, outline:'none' }} />
              <div style={{ display:'flex', gap:2, alignItems:'center' }}>
                <input type="text" inputMode="decimal" value={item.lineDiscount || 0} onChange={(event) => setCart((current) => current.map((entry) => (entry.key === item.key ? { ...entry, lineDiscount: Number(event.target.value) || 0 } : entry)))} onDoubleClick={selectFieldValue} style={{ width:44, background:'#fff', border:`1px solid ${UI.border}`, borderRadius:6, padding:'2px 4px', color:'#ef4444', fontSize:9, outline:'none', textAlign:'center' }} />
                <button onClick={() => setCart((current) => current.map((entry) => (entry.key === item.key ? { ...entry, lineDiscountType: 'percent' } : entry)))} style={{ padding:'1px 4px', background:(item.lineDiscountType || 'fixed') === 'percent' ? UI.accentSoft : '#fff', border:`1px solid ${UI.border}`, borderRadius:4, color:(item.lineDiscountType || 'fixed') === 'percent' ? UI.accent : UI.muted, fontSize:8, cursor:'pointer' }}>%</button>
                <button onClick={() => setCart((current) => current.map((entry) => (entry.key === item.key ? { ...entry, lineDiscountType: 'fixed' } : entry)))} style={{ padding:'1px 4px', background:(item.lineDiscountType || 'fixed') === 'fixed' ? UI.accentSoft : '#fff', border:`1px solid ${UI.border}`, borderRadius:4, color:(item.lineDiscountType || 'fixed') === 'fixed' ? UI.accent : UI.muted, fontSize:8, cursor:'pointer' }}>د.ع</button>
              </div>
              <div style={{ display:'flex', gap:3, alignItems:'center', marginRight:'auto' }}>
                <button onClick={() => updateQty(item.key, -1)} style={{ width:22, height:22, borderRadius:5, background:'#fff', border:`1px solid ${UI.border}`, color:UI.accent, cursor:'pointer', fontSize:13, lineHeight:1 }}>−</button>
                <input type="text" inputMode="numeric" value={item.qty} onChange={(event) => updateQtyDirect(item.key, event.target.value)} onDoubleClick={selectFieldValue} style={{ width:32, background:'#fff', border:`1px solid ${UI.border}`, borderRadius:5, padding:'2px 3px', color:UI.text, fontSize:11, outline:'none', textAlign:'center' }} />
                <button onClick={() => updateQty(item.key, +1)} style={{ width:22, height:22, borderRadius:5, background:'#fff', border:`1px solid ${UI.border}`, color:UI.accent, cursor:'pointer', fontSize:13, lineHeight:1 }}>+</button>
              </div>
              {calcLineDiscountAmount(item, currency, exchangeRate).amount > 0 && <span style={{ color:'#ef4444', fontSize:9, fontWeight:700, minWidth:54, textAlign:'left' }}>- {fmtCur(calcLineDiscountAmount(item, currency, exchangeRate).amount, currency)}</span>}
              <span style={{ color:item.isPackage ? UI.purple : UI.accent, fontSize:10, fontWeight:700, minWidth:60, textAlign:'left' }}>{fmtCur(Math.max(0, (item.price * item.qty) - calcLineDiscountAmount(item, currency, exchangeRate).amount), currency)}</span>
            </div>
          </div>
        ))}
      </div>

      <div style={{ padding:'8px 10px', borderTop:`1px solid ${UI.border}`, background:UI.panel }}>
        <div style={{ display:'flex', justifyContent:'space-between', marginBottom:3 }}><span style={{ color:UI.muted, fontSize:11 }}>المجموع قبل خصم المواد</span><span style={{ color:UI.muted, fontSize:11 }}>{fmtCur(grossSubtotal, currency)}</span></div>
        {itemDiscountAmount > 0 && <div style={{ display:'flex', justifyContent:'space-between', marginBottom:3 }}><span style={{ color:'#ef4444', fontSize:10 }}>خصم المواد</span><span style={{ color:'#ef4444', fontSize:10 }}>- {fmtCur(itemDiscountAmount, currency)}</span></div>}
        <div style={{ display:'flex', justifyContent:'space-between', marginBottom:3 }}><span style={{ color:UI.muted, fontSize:11 }}>المجموع</span><span style={{ color:UI.muted, fontSize:11 }}>{fmtCur(subtotal, currency)}</span></div>
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:3 }}>
          <span style={{ color:UI.muted, fontSize:11 }}>خصم الفاتورة</span>
          <div style={{ display:'flex', gap:4, alignItems:'center' }}>
            <input type="text" inputMode="decimal" value={discount} onChange={(event) => setDiscount(Number(event.target.value))} onDoubleClick={selectFieldValue} style={{ width:55, background:'#fff', border:`1px solid ${UI.border}`, borderRadius:6, padding:'3px 5px', color:UI.accent, fontSize:11, outline:'none', textAlign:'center' }} />
            <button onClick={() => setDiscountType('percent')} style={{ padding:'2px 6px', background:discountType === 'percent' ? UI.accentSoft : '#fff', border:`1px solid ${UI.border}`, borderRadius:6, color:discountType === 'percent' ? UI.accent : UI.muted, fontSize:9, cursor:'pointer', fontWeight:700 }}>%</button>
            <button onClick={() => setDiscountType('fixed')} style={{ padding:'2px 6px', background:discountType === 'fixed' ? UI.accentSoft : '#fff', border:`1px solid ${UI.border}`, borderRadius:6, color:discountType === 'fixed' ? UI.accent : UI.muted, fontSize:9, cursor:'pointer', fontWeight:700 }}>مقطوع</button>
          </div>
        </div>
        {discount > 0 && <div style={{ display:'flex', justifyContent:'space-between', marginBottom:3 }}><span style={{ color:'#ef4444', fontSize:10 }}>الخصم</span><span style={{ color:'#ef4444', fontSize:10 }}>- {fmtCur(discAmt, currency)}</span></div>}
        <div style={{ display:'flex', justifyContent:'space-between', borderTop:`1px solid ${UI.borderSoft}`, paddingTop:6, marginBottom:8 }}>
          <span style={{ color:UI.text, fontWeight:800, fontSize:13 }}>المبلغ الكلي</span>
          <div style={{ textAlign:'left' }}>
            <div style={{ color:UI.accent, fontWeight:900, fontSize:17 }}>{fmtCur(total, currency)}</div>
            {currency === 'USD' && <div style={{ color:UI.muted, fontSize:9 }}>{(total * exchangeRate).toLocaleString('ar-IQ')} د.ع</div>}
          </div>
        </div>
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:6, marginBottom:6 }}>
          <div>
            <div style={{ color:UI.muted, fontSize:10, marginBottom:4 }}>المبلغ الواصل</div>
            <input type="text" inputMode="decimal" value={receivedInputValue} onChange={(event) => {
              const nextValue = event.target.value;
              if (nextValue === '') { setReceived(''); return; }
              if (!customer.trim() && Number(nextValue) > total) { setReceived(String(total)); return; }
              setReceived(nextValue);
            }} onDoubleClick={selectFieldValue} placeholder="0" style={{ width:'100%', background:'#fff', border:`1px solid ${UI.border}`, borderRadius:7, padding:'6px 10px', color:UI.text, fontSize:12, outline:'none', boxSizing:'border-box' }} />
          </div>
          <div>
            <div style={{ color:UI.muted, fontSize:10, marginBottom:4 }}>المبلغ المتبقي</div>
            <div style={{ background:remainingAmount > 0 ? '#fff7ed' : UI.successSoft, border:`1px solid ${remainingAmount > 0 ? '#fdba74' : '#86efac'}`, borderRadius:7, padding:'7px 10px', color:remainingAmount > 0 ? '#b45309' : UI.success, fontSize:12, fontWeight:800, textAlign:'center' }}>{fmtCur(remainingAmount, currency)}</div>
          </div>
        </div>
        <div style={{ display:'flex', justifyContent:'space-between', marginBottom:6, background:UI.soft, border:`1px solid ${UI.border}`, borderRadius:8, padding:'6px 10px' }}><span style={{ color:UI.muted, fontSize:11 }}>حالة الفاتورة</span><span style={{ color:payMethod === 'آجل' ? '#f59e0b' : UI.success, fontSize:11, fontWeight:800 }}>{payMethod}</span></div>
        {received && change > 0 && <div style={{ color:UI.success, fontSize:11, textAlign:'center', marginBottom:5 }}>الباقي: {fmtCur(change, currency)}</div>}
        {payMethod === 'آجل' && !customer.trim() && <div style={{ color:UI.danger, fontSize:10, textAlign:'center', marginBottom:4 }}>أدخل اسم الزبون أعلاه</div>}
        {/* تحذير مخزون منخفض — لا يمنع الحفظ */}
        {!allowNeg && cart.some((item) => item.stockWarning) && (
          <div style={{ background:'#fffbeb', border:'1px solid #fbbf24', borderRadius:8, padding:'4px 10px', fontSize:10, color:'#d97706', textAlign:'center', marginBottom:5 }}>
            ⚠️ بعض المواد تتجاوز المخزون المتاح — سيصبح الرصيد بالسالب
          </div>
        )}
        <button onClick={save} disabled={saving || !cart.length || (payMethod === 'آجل' && !customer.trim())} style={{ width:'100%', background:(!cart.length || (payMethod === 'آجل' && !customer.trim())) ? '#E2E8F0' : payMethod === 'آجل' ? 'linear-gradient(135deg,#f59e0b,#d97706)' : `linear-gradient(135deg,${UI.accent},#A86E00)`, color:'#fff', border:'none', borderRadius:10, padding:12, fontWeight:800, fontSize:13, cursor:(!cart.length || (payMethod === 'آجل' && !customer.trim())) ? 'not-allowed' : 'pointer' }}>
          {saving ? '⏳ جاري الحفظ...' : editSession?.invoiceId ? `💾 تحديث الفاتورة ${editSession.invoiceNo || ''}` : `✅ حفظ الفاتورة ${fmtCur(total, currency)}`}
        </button>
      </div>
    </div>
  );
});
