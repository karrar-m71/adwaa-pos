import { useState, useEffect, useMemo, useCallback } from 'react';
import { collection, onSnapshot, addDoc, updateDoc, deleteDoc, doc } from 'firebase/firestore';
import { db } from '../firebase';
import {
  fmtIQD, fmtUSD, toNum, nowAR, getExchangeRate,
  getErrorMessage, genInvoiceNo, applyDebtDelta, readDebt,
} from '../utils/helpers';
import { canUser } from '../utils/permissions';

export default function Suppliers({ user }) {
  const canCreate = canUser(user, 'suppliers_create');
  const canEdit = canUser(user, 'suppliers_edit');
  const canDelete = canUser(user, 'suppliers_delete');
  const [suppliers, setSuppliers]     = useState([]);
  const [purchases, setPurchases]     = useState([]);
  const [products, setProducts]       = useState([]);
  const [showForm, setShowForm]       = useState(false);
  const [showPurchase, setShowPurchase] = useState(false);
  const [showPayDebt, setShowPayDebt] = useState(false);
  const [selSupplier, setSelSupplier] = useState(null);
  const [editing, setEditing]         = useState(null);
  const [search, setSearch]           = useState('');
  const [saving, setSaving]           = useState(false);

  const emptyS = { name: '', phone: '', address: '', notes: '' };
  const [form, setForm] = useState(emptyS);

  const emptyP = { paymentMethod: 'نقدي', currency: 'IQD', notes: '' };
  const [purchForm, setPurchForm] = useState(emptyP);
  const [cartItems, setCartItems] = useState([]);

  // دفع الدين
  const [payAmount, setPayAmount]   = useState('');
  const [payCurrency, setPayCurrency] = useState('IQD');

  const openCreateSupplierForm = useCallback(() => {
    if (!canCreate) {
      alert('ليس لديك صلاحية لإضافة مورد جديد');
      return;
    }
    setForm(emptyS);
    setEditing(null);
    setShowForm(true);
  }, [canCreate]);

  const openEditSupplierForm = useCallback((supplier) => {
    if (!canEdit) {
      alert('ليس لديك صلاحية لتعديل بيانات الموردين');
      return;
    }
    setForm({ name: supplier.name, phone: supplier.phone || '', address: supplier.address || '', notes: supplier.notes || '' });
    setEditing(supplier.id);
    setShowForm(true);
  }, [canEdit]);

  useEffect(() => {
    const u1 = onSnapshot(collection(db, 'pos_suppliers'), s =>
      setSuppliers(s.docs.map(d => ({ ...d.data(), id: d.id }))));
    const u2 = onSnapshot(collection(db, 'pos_purchases'), s =>
      setPurchases(s.docs.map(d => ({ ...d.data(), id: d.id }))));
    const u3 = onSnapshot(collection(db, 'pos_products'), s =>
      setProducts(s.docs.map(d => ({ ...d.data(), id: d.id }))));
    return () => { u1(); u2(); u3(); };
  }, []);

  const filtered = useMemo(
    () => suppliers.filter(s => !search || s.name?.includes(search) || s.phone?.includes(search)),
    [suppliers, search]
  );

  const totalDebtIQD = useMemo(
    () => suppliers.reduce((sum, s) => sum + toNum(s.debtByCurrency?.IQD ?? s.debt ?? 0), 0),
    [suppliers]
  );
  const totalDebtUSD = useMemo(
    () => suppliers.reduce((sum, s) => sum + toNum(s.debtByCurrency?.USD), 0),
    [suppliers]
  );

  // ── حفظ مورد ────────────────────────────────────────────────────────────────
  const saveSupplier = useCallback(async () => {
    if (!(editing ? canEdit : canCreate)) return alert('ليس لديك صلاحية لتعديل بيانات الموردين');
    const name = form.name.trim();
    if (!name) return alert('يرجى إدخال اسم المورد');
    // التحقق من التكرار
    const duplicate = suppliers.find(
      s => s.name.trim() === name && s.id !== editing
    );
    if (duplicate) return alert(`المورد "${name}" موجود بالفعل`);
    setSaving(true);
    try {
      if (editing) {
        await updateDoc(doc(db, 'pos_suppliers', editing), {
          name, phone: form.phone, address: form.address, notes: form.notes,
        });
      } else {
        await addDoc(collection(db, 'pos_suppliers'), {
          name, phone: form.phone, address: form.address, notes: form.notes,
          debt: 0, totalPurchases: 0,
          debtByCurrency: { IQD: 0, USD: 0 },
          totalPurchasesByCurrency: { IQD: 0, USD: 0 },
          createdAt: new Date().toISOString(),
        });
      }
      setForm(emptyS); setEditing(null); setShowForm(false);
    } catch (e) {
      alert(getErrorMessage(e, 'فشل حفظ بيانات المورد'));
    } finally {
      setSaving(false);
    }
  }, [canCreate, canEdit, editing, form, suppliers]);

  // ── حذف مورد ────────────────────────────────────────────────────────────────
  const delSupplier = useCallback(async (s) => {
    if (!canDelete) return alert('ليس لديك صلاحية لحذف الموردين');
    const { IQD, USD } = readDebt(s);
    const hasDebt = IQD > 0 || USD > 0;
    const msg = hasDebt
      ? `تحذير: للمورد "${s.name}" ديون مستحقة.\nهل أنت متأكد من حذفه نهائياً؟`
      : `هل أنت متأكد من حذف المورد "${s.name}"؟`;
    if (!confirm(msg)) return;
    try {
      await deleteDoc(doc(db, 'pos_suppliers', s.id));
    } catch (e) {
      alert(getErrorMessage(e, 'فشل حذف المورد'));
    }
  }, [canDelete]);

  // ── عربة المشتريات ───────────────────────────────────────────────────────────
  const addCartItem = useCallback(() =>
    setCartItems(c => [...c, { productId: '', productName: '', qty: 1, buyPrice: 0, buyPriceRaw: '' }]),
  []);

  const updateCartItem = useCallback((i, field, val) =>
    setCartItems(c => c.map((item, idx) => {
      if (idx !== i) return item;
      if (field === 'productId') {
        const p = products.find(p => p.id === val);
        return { ...item, productId: val, productName: p?.name || '', buyPrice: toNum(p?.buyPrice) };
      }
      if (field === 'qty') return { ...item, qty: toNum(val) };
      if (field === 'buyPrice') return { ...item, buyPrice: toNum(val) };
      return { ...item, [field]: val };
    })),
  [products]);

  const removeCartItem = useCallback((i) =>
    setCartItems(c => c.filter((_, idx) => idx !== i)),
  []);

  const cartTotal = useMemo(
    () => cartItems.reduce((s, i) => s + i.qty * i.buyPrice, 0),
    [cartItems]
  );

  // ── حفظ فاتورة الشراء ────────────────────────────────────────────────────────
  const savePurchase = useCallback(async () => {
    if (!selSupplier) return alert('يرجى اختيار المورد');
    if (cartItems.length === 0) return alert('يرجى إضافة منتج واحد على الأقل');
    if (cartItems.some(i => !i.productId)) return alert('يرجى اختيار المنتج لكل صنف');
    if (cartItems.some(i => i.qty <= 0)) return alert('الكمية يجب أن تكون أكبر من صفر');
    setSaving(true);
    try {
      const isCredit = purchForm.paymentMethod === 'آجل';
      const currency  = purchForm.currency || 'IQD';
      const rate      = getExchangeRate();
      const invoiceNo = genInvoiceNo('PUR');
      const { IQD: prevIQD, USD: prevUSD } = readDebt(selSupplier);

      await addDoc(collection(db, 'pos_purchases'), {
        invoiceNo,
        supplierId:         selSupplier.id,
        supplierName:       selSupplier.name,
        items:              cartItems.map(({ productId, productName, qty, buyPrice }) => ({ productId, productName, qty, buyPrice })),
        total:              cartTotal,
        currency,
        paymentMethod:      purchForm.paymentMethod,
        paidAmount:         isCredit ? 0 : cartTotal,
        dueAmount:          isCredit ? cartTotal : 0,
        dueCurrency:        currency,
        previousDebtIQD:    prevIQD,
        previousDebtUSD:    prevUSD,
        paymentStatus:      isCredit ? 'غير مدفوع' : 'مدفوع',
        notes:              purchForm.notes,
        date:               nowAR(),
        createdAt:          new Date().toISOString(),
        addedBy:            user.name,
      });

      // تحديث المخزون بالتوازي
      await Promise.all(
        cartItems
          .filter(i => i.productId)
          .map(i => {
            const p = products.find(p => p.id === i.productId);
            if (!p) return Promise.resolve();
            return updateDoc(doc(db, 'pos_products', i.productId), {
              stock:    (p.stock || 0) + i.qty,
              buyPrice: i.buyPrice,
            });
          })
      );

      // تحديث ديون المورد إن كانت آجلاً
      if (isCredit) {
        const nextDebt = applyDebtDelta(readDebt(selSupplier), currency, cartTotal);
        const totalPurByCur = {
          IQD: toNum(selSupplier.totalPurchasesByCurrency?.IQD ?? selSupplier.totalPurchases ?? 0)
            + (currency === 'IQD' ? cartTotal : 0),
          USD: toNum(selSupplier.totalPurchasesByCurrency?.USD ?? 0)
            + (currency === 'USD' ? cartTotal : 0),
        };
        await updateDoc(doc(db, 'pos_suppliers', selSupplier.id), {
          debt:                     nextDebt.IQD,
          debtByCurrency:           nextDebt,
          totalPurchases:           (selSupplier.totalPurchases || 0) + cartTotal,
          totalPurchasesByCurrency: totalPurByCur,
        });
      }

      setCartItems([]);
      setPurchForm(emptyP);
      setSelSupplier(null);
      setShowPurchase(false);
      alert('✅ تم تسجيل فاتورة الشراء وتحديث المخزون');
    } catch (e) {
      alert(getErrorMessage(e, 'فشل حفظ فاتورة الشراء'));
    } finally {
      setSaving(false);
    }
  }, [selSupplier, cartItems, cartTotal, purchForm, products, user]);

  // ── دفع دين المورد ────────────────────────────────────────────────────────────
  const payDebt = useCallback(async () => {
    if (!selSupplier) return;
    const amount = toNum(payAmount);
    if (amount <= 0) return alert('يرجى إدخال مبلغ صحيح');
    const current = readDebt(selSupplier);
    if (payCurrency === 'IQD' && amount > current.IQD)
      return alert(`المبلغ أكبر من الدين الحالي (${fmtIQD(current.IQD)})`);
    if (payCurrency === 'USD' && amount > current.USD)
      return alert(`المبلغ أكبر من الدين الحالي (${fmtUSD(current.USD)})`);
    if (!confirm(`تأكيد سداد ${payCurrency === 'USD' ? fmtUSD(amount) : fmtIQD(amount)} من دين "${selSupplier.name}"؟`)) return;
    setSaving(true);
    try {
      const nextDebt = applyDebtDelta(current, payCurrency, -amount);
      await updateDoc(doc(db, 'pos_suppliers', selSupplier.id), {
        debt:           nextDebt.IQD,
        debtByCurrency: nextDebt,
      });
      await addDoc(collection(db, 'pos_purchases'), {
        invoiceNo:    genInvoiceNo('PAY'),
        supplierId:   selSupplier.id,
        supplierName: selSupplier.name,
        items:        [],
        total:        0,
        currency:     payCurrency,
        paymentMethod: 'سداد دين',
        paidAmount:   amount,
        dueAmount:    0,
        paymentStatus: 'مدفوع',
        notes:        `سداد دين — ${payCurrency === 'USD' ? fmtUSD(amount) : fmtIQD(amount)}`,
        date:         nowAR(),
        createdAt:    new Date().toISOString(),
        addedBy:      user.name,
      });
      setPayAmount('');
      setShowPayDebt(false);
      setSelSupplier(null);
      alert('✅ تم تسجيل السداد بنجاح');
    } catch (e) {
      alert(getErrorMessage(e, 'فشل تسجيل السداد'));
    } finally {
      setSaving(false);
    }
  }, [selSupplier, payAmount, payCurrency, user]);

  // ══════════════════ واجهة فاتورة الشراء ══════════════════
  if (showPurchase) return (
    <div style={{ padding: 24, fontFamily: "'Cairo'", direction: 'rtl' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24 }}>
        <button onClick={() => { setShowPurchase(false); setCartItems([]); setPurchForm(emptyP); setSelSupplier(null); }}
          style={{ background: '#ffffff', border: '1px solid #cdd8ec', borderRadius: 10, padding: '8px 16px', color: '#F5C800', cursor: 'pointer', fontFamily: "'Cairo'" }}>← رجوع</button>
        <div style={{ color: '#fff', fontSize: 20, fontWeight: 800 }}>فاتورة شراء جديدة</div>
      </div>

      {/* اختيار المورد */}
      <div style={{ background: '#ffffff', borderRadius: 16, padding: 20, border: '1px solid #d9e2f2', marginBottom: 16 }}>
        <label style={{ color: '#64748b', fontSize: 13, display: 'block', marginBottom: 10 }}>اختر المورد *</label>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px,1fr))', gap: 10 }}>
          {suppliers.map(s => (
            <div key={s.id} onClick={() => setSelSupplier(s)}
              style={{ padding: 12, borderRadius: 12, border: `2px solid ${selSupplier?.id === s.id ? '#F5C800' : '#cdd8ec'}`, background: selSupplier?.id === s.id ? '#F5C80011' : '#f8fbff', cursor: 'pointer' }}>
              <div style={{ color: selSupplier?.id === s.id ? '#F5C800' : '#1e293b', fontSize: 13, fontWeight: 700 }}>{s.name}</div>
              <div style={{ color: '#64748b', fontSize: 11 }}>{s.phone || '—'}</div>
            </div>
          ))}
        </div>
      </div>

      {/* العملة */}
      <div style={{ background: '#ffffff', borderRadius: 16, padding: 20, border: '1px solid #d9e2f2', marginBottom: 16 }}>
        <label style={{ color: '#64748b', fontSize: 13, display: 'block', marginBottom: 10 }}>عملة الفاتورة</label>
        <div style={{ display: 'flex', gap: 10 }}>
          {['IQD', 'USD'].map(c => (
            <button key={c} onClick={() => setPurchForm(f => ({ ...f, currency: c }))}
              style={{ flex: 1, background: purchForm.currency === c ? '#F5C800' : '#f8fbff', color: purchForm.currency === c ? '#000' : '#64748b', border: `1px solid ${purchForm.currency === c ? '#F5C800' : '#cdd8ec'}`, borderRadius: 10, padding: '10px 0', fontWeight: 700, cursor: 'pointer', fontFamily: "'Cairo'" }}>
              {c === 'IQD' ? 'دينار عراقي' : 'دولار أمريكي'}
            </button>
          ))}
        </div>
      </div>

      {/* المنتجات */}
      <div style={{ background: '#ffffff', borderRadius: 16, padding: 20, border: '1px solid #d9e2f2', marginBottom: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 14 }}>
          <div style={{ color: '#1e293b', fontSize: 15, fontWeight: 700 }}>المنتجات</div>
          <button onClick={addCartItem}
            style={{ background: '#F5C80022', border: '1px solid #F5C80044', borderRadius: 10, padding: '6px 14px', color: '#F5C800', cursor: 'pointer', fontFamily: "'Cairo'", fontSize: 13, fontWeight: 700 }}>+ إضافة صنف</button>
        </div>
        {cartItems.length === 0 && (
          <div style={{ color: '#94a3b8', textAlign: 'center', padding: '20px 0', fontSize: 13 }}>اضغط "إضافة صنف" لبدء الفاتورة</div>
        )}
        {cartItems.map((item, i) => (
          <div key={i} style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr auto', gap: 10, marginBottom: 10, alignItems: 'center' }}>
            <select value={item.productId} onChange={e => updateCartItem(i, 'productId', e.target.value)}
              style={{ color: '#0f172a', outline: 'none', padding: '8px 10px', borderRadius: 8, border: '1px solid #cdd8ec', fontFamily: "'Cairo'" }}>
              <option value="">اختر منتج...</option>
              {products.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
            <input type="number" min="1" value={item.qty}
              onChange={e => updateCartItem(i, 'qty', e.target.value)}
              placeholder="الكمية"
              style={{ color: '#0f172a', outline: 'none', padding: '8px 10px', borderRadius: 8, border: '1px solid #cdd8ec', textAlign: 'center' }} />
            <input type="number" min="0" value={item.buyPrice}
              onChange={e => updateCartItem(i, 'buyPrice', e.target.value)}
              placeholder="سعر الشراء"
              style={{ color: '#0f172a', outline: 'none', padding: '8px 10px', borderRadius: 8, border: '1px solid #cdd8ec', textAlign: 'center' }} />
            <button onClick={() => removeCartItem(i)}
              style={{ background: '#ef444422', border: '1px solid #ef444444', borderRadius: 10, padding: '10px 12px', color: '#ef4444', cursor: 'pointer', fontSize: 14 }}>✕</button>
          </div>
        ))}
        {cartItems.length > 0 && (
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 14, paddingTop: 14, borderTop: '1px solid #d9e2f2' }}>
            <span style={{ color: '#64748b' }}>الإجمالي</span>
            <span style={{ color: '#F5C800', fontSize: 18, fontWeight: 800 }}>
              {purchForm.currency === 'USD' ? fmtUSD(cartTotal) : fmtIQD(cartTotal)}
            </span>
          </div>
        )}
      </div>

      {/* طريقة الدفع */}
      <div style={{ background: '#ffffff', borderRadius: 16, padding: 20, border: '1px solid #d9e2f2', marginBottom: 16 }}>
        <label style={{ color: '#64748b', fontSize: 13, display: 'block', marginBottom: 10 }}>طريقة الدفع</label>
        <div style={{ display: 'flex', gap: 10 }}>
          {['نقدي', 'تحويل', 'آجل'].map(m => (
            <button key={m} onClick={() => setPurchForm(f => ({ ...f, paymentMethod: m }))}
              style={{ flex: 1, background: purchForm.paymentMethod === m ? '#F5C800' : '#f8fbff', color: purchForm.paymentMethod === m ? '#000' : '#64748b', border: `1px solid ${purchForm.paymentMethod === m ? '#F5C800' : '#cdd8ec'}`, borderRadius: 10, padding: '10px 0', fontWeight: 700, cursor: 'pointer', fontFamily: "'Cairo'" }}>{m}</button>
          ))}
        </div>
        {purchForm.paymentMethod === 'آجل' && selSupplier && (
          <div style={{ marginTop: 12, background: '#ef444411', border: '1px solid #ef444433', borderRadius: 10, padding: '10px 14px', color: '#ef4444', fontSize: 13 }}>
            ⚠️ الدين الحالي للمورد: {fmtIQD(readDebt(selSupplier).IQD)}
            {readDebt(selSupplier).USD > 0 && ` + ${fmtUSD(readDebt(selSupplier).USD)}`}
          </div>
        )}
      </div>

      {/* ملاحظات */}
      <div style={{ background: '#ffffff', borderRadius: 16, padding: 20, border: '1px solid #d9e2f2', marginBottom: 16 }}>
        <label style={{ color: '#64748b', fontSize: 13, display: 'block', marginBottom: 8 }}>ملاحظات (اختياري)</label>
        <textarea value={purchForm.notes} onChange={e => setPurchForm(f => ({ ...f, notes: e.target.value }))}
          rows={2} placeholder="أي ملاحظات عن هذه الفاتورة..."
          style={{ width: '100%', color: '#0f172a', outline: 'none', padding: '10px', borderRadius: 8, border: '1px solid #cdd8ec', fontFamily: "'Cairo'", resize: 'vertical', boxSizing: 'border-box' }} />
      </div>

      <button onClick={savePurchase} disabled={saving || !selSupplier || cartItems.length === 0}
        style={{ width: '100%', background: (!selSupplier || cartItems.length === 0) ? '#f1f5f9' : 'linear-gradient(135deg,#F5C800,#d4a800)', color: (!selSupplier || cartItems.length === 0) ? '#94a3b8' : '#000', border: 'none', borderRadius: 14, padding: 16, fontWeight: 800, fontSize: 16, cursor: (!selSupplier || cartItems.length === 0) ? 'not-allowed' : 'pointer', fontFamily: "'Cairo'" }}>
        {saving ? '⏳ جاري الحفظ...' : '✅ حفظ فاتورة الشراء'}
      </button>
    </div>
  );

  // ══════════════════ واجهة دفع الدين ══════════════════
  if (showPayDebt && selSupplier) {
    const debt = readDebt(selSupplier);
    return (
      <div style={{ padding: 24, fontFamily: "'Cairo'", direction: 'rtl' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24 }}>
          <button onClick={() => { setShowPayDebt(false); setSelSupplier(null); setPayAmount(''); }}
            style={{ background: '#ffffff', border: '1px solid #cdd8ec', borderRadius: 10, padding: '8px 16px', color: '#F5C800', cursor: 'pointer', fontFamily: "'Cairo'" }}>← رجوع</button>
          <div style={{ color: '#fff', fontSize: 20, fontWeight: 800 }}>سداد دين — {selSupplier.name}</div>
        </div>
        <div style={{ background: '#ffffff', borderRadius: 16, padding: 24, border: '1px solid #d9e2f2', maxWidth: 480 }}>
          <div style={{ display: 'flex', gap: 16, marginBottom: 20 }}>
            <div style={{ flex: 1, background: '#ef444411', border: '1px solid #ef444433', borderRadius: 12, padding: 14, textAlign: 'center' }}>
              <div style={{ color: '#64748b', fontSize: 12, marginBottom: 4 }}>دين دينار</div>
              <div style={{ color: '#ef4444', fontSize: 18, fontWeight: 800 }}>{fmtIQD(debt.IQD)}</div>
            </div>
            {debt.USD > 0 && (
              <div style={{ flex: 1, background: '#3b82f611', border: '1px solid #3b82f633', borderRadius: 12, padding: 14, textAlign: 'center' }}>
                <div style={{ color: '#64748b', fontSize: 12, marginBottom: 4 }}>دين دولار</div>
                <div style={{ color: '#3b82f6', fontSize: 18, fontWeight: 800 }}>{fmtUSD(debt.USD)}</div>
              </div>
            )}
          </div>
          <label style={{ color: '#64748b', fontSize: 13, display: 'block', marginBottom: 8 }}>عملة السداد</label>
          <div style={{ display: 'flex', gap: 10, marginBottom: 16 }}>
            {['IQD', 'USD'].map(c => (
              <button key={c} onClick={() => setPayCurrency(c)}
                style={{ flex: 1, background: payCurrency === c ? '#F5C800' : '#f8fbff', color: payCurrency === c ? '#000' : '#64748b', border: `1px solid ${payCurrency === c ? '#F5C800' : '#cdd8ec'}`, borderRadius: 10, padding: '10px 0', fontWeight: 700, cursor: 'pointer', fontFamily: "'Cairo'" }}>
                {c === 'IQD' ? 'دينار' : 'دولار'}
              </button>
            ))}
          </div>
          <label style={{ color: '#64748b', fontSize: 13, display: 'block', marginBottom: 8 }}>مبلغ السداد</label>
          <input
            type="text" inputMode="decimal"
            value={payAmount}
            onChange={e => setPayAmount(e.target.value)}
            onFocus={e => e.target.select()}
            placeholder={payCurrency === 'IQD' ? 'أدخل المبلغ بالدينار' : 'أدخل المبلغ بالدولار'}
            style={{ width: '100%', color: '#0f172a', outline: 'none', padding: '12px 16px', borderRadius: 10, border: '1px solid #cdd8ec', fontSize: 16, fontFamily: "'Cairo'", boxSizing: 'border-box', marginBottom: 16, textAlign: 'center' }}
          />
          <button onClick={payDebt} disabled={saving || toNum(payAmount) <= 0}
            style={{ width: '100%', background: toNum(payAmount) > 0 ? 'linear-gradient(135deg,#10b981,#059669)' : '#f1f5f9', color: toNum(payAmount) > 0 ? '#fff' : '#94a3b8', border: 'none', borderRadius: 12, padding: 14, fontWeight: 800, fontSize: 15, cursor: toNum(payAmount) > 0 ? 'pointer' : 'not-allowed', fontFamily: "'Cairo'" }}>
            {saving ? '⏳ جاري الحفظ...' : '✅ تأكيد السداد'}
          </button>
        </div>
      </div>
    );
  }

  // ══════════════════ الواجهة الرئيسية ══════════════════
  return (
    <div style={{ padding: 24, fontFamily: "'Cairo'", direction: 'rtl' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <div>
          <div style={{ color: '#fff', fontSize: 22, fontWeight: 800 }}>الموردون والمشتريات</div>
          <div style={{ color: '#64748b', fontSize: 13 }}>{suppliers.length} مورد مسجل</div>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <button onClick={() => setShowPurchase(true)}
            style={{ background: '#3b82f6', color: '#fff', border: 'none', borderRadius: 12, padding: '10px 20px', fontWeight: 800, cursor: 'pointer', fontFamily: "'Cairo'", fontSize: 14 }}>
            🛍️ فاتورة شراء
          </button>
          <button onClick={openCreateSupplierForm}
            style={{ background: '#F5C800', color: '#000', border: 'none', borderRadius: 12, padding: '10px 20px', fontWeight: 800, cursor: 'pointer', fontFamily: "'Cairo'", fontSize: 14 }}>
            + إضافة مورد
          </button>
        </div>
      </div>

      {/* ملخص */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 16, marginBottom: 24 }}>
        {[
          ['🏭', 'إجمالي الموردين', suppliers.length, '#3b82f6'],
          ['⚠️', 'ديون دينار', fmtIQD(totalDebtIQD), '#ef4444'],
          ['💵', 'ديون دولار', fmtUSD(totalDebtUSD), '#3b82f6'],
          ['📦', 'إجمالي الفواتير', purchases.length, '#F5C800'],
        ].map(([icon, label, val, color]) => (
          <div key={label} style={{ background: '#ffffff', borderRadius: 16, padding: 20, border: '1px solid #d9e2f2', textAlign: 'center' }}>
            <div style={{ fontSize: 32, marginBottom: 8 }}>{icon}</div>
            <div style={{ color: '#64748b', fontSize: 12, marginBottom: 6 }}>{label}</div>
            <div style={{ color, fontSize: 18, fontWeight: 800 }}>{val}</div>
          </div>
        ))}
      </div>

      {/* نموذج إضافة/تعديل مورد */}
      {showForm && (
        <div style={{ background: '#ffffff', borderRadius: 16, padding: 24, border: '1px solid #F5C80033', marginBottom: 20 }}>
          <div style={{ color: '#F5C800', fontSize: 16, fontWeight: 800, marginBottom: 20 }}>
            {editing ? '✏️ تعديل مورد' : '➕ إضافة مورد'}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,1fr)', gap: 14 }}>
            {[['اسم المورد *', 'name'], ['رقم الهاتف', 'phone'], ['العنوان', 'address'], ['ملاحظات', 'notes']].map(([lb, k]) => (
              <div key={k}>
                <label style={{ color: '#64748b', fontSize: 12, display: 'block', marginBottom: 5 }}>{lb}</label>
                <input value={form[k]} onChange={e => setForm(f => ({ ...f, [k]: e.target.value }))}
                  onKeyDown={e => e.key === 'Enter' && saveSupplier()}
                  style={{ width: '100%', color: '#0f172a', outline: 'none', padding: '10px 14px', borderRadius: 8, border: '1px solid #cdd8ec', fontFamily: "'Cairo'", boxSizing: 'border-box' }} />
              </div>
            ))}
          </div>
          <div style={{ display: 'flex', gap: 10, marginTop: 20 }}>
            <button onClick={() => { setShowForm(false); setForm(emptyS); setEditing(null); }}
              style={{ flex: 1, background: '#f8fbff', border: '1px solid #cdd8ec', borderRadius: 12, padding: 12, color: '#64748b', cursor: 'pointer', fontFamily: "'Cairo'" }}>إلغاء</button>
            <button onClick={saveSupplier} disabled={saving}
              style={{ flex: 2, background: 'linear-gradient(135deg,#F5C800,#d4a800)', color: '#000', border: 'none', borderRadius: 12, padding: 12, fontWeight: 800, cursor: 'pointer', fontFamily: "'Cairo'" }}>
              {saving ? '⏳ جاري الحفظ...' : editing ? '💾 حفظ' : '✅ إضافة'}
            </button>
          </div>
        </div>
      )}

      <input value={search} onChange={e => setSearch(e.target.value)}
        placeholder="🔍 ابحث باسم المورد أو رقم الهاتف..."
        style={{ width: '100%', color: '#0f172a', fontSize: 13, outline: 'none', padding: '10px 16px', borderRadius: 10, border: '1px solid #cdd8ec', marginBottom: 16, boxSizing: 'border-box', fontFamily: "'Cairo'" }} />

      {/* قائمة الموردين */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(320px,1fr))', gap: 12 }}>
        {filtered.length === 0
          ? <div style={{ gridColumn: '1/-1', color: '#94a3b8', textAlign: 'center', padding: 60 }}>لا يوجد موردون مطابقون</div>
          : filtered.map(s => {
            const debt = readDebt(s);
            const hasDebt = debt.IQD > 0 || debt.USD > 0;
            return (
              <div key={s.id} style={{ background: '#ffffff', borderRadius: 16, border: `1px solid ${hasDebt ? '#ef444433' : '#d9e2f2'}`, padding: 16 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
                  <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                    <div style={{ width: 40, height: 40, borderRadius: 10, background: '#3b82f622', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20 }}>🏭</div>
                    <div>
                      <div style={{ color: '#1e293b', fontSize: 14, fontWeight: 700 }}>{s.name}</div>
                      <div style={{ color: '#64748b', fontSize: 11 }}>{s.phone || '—'}</div>
                      {s.address && <div style={{ color: '#94a3b8', fontSize: 11 }}>{s.address}</div>}
                    </div>
                  </div>
                  {hasDebt && (
                    <div style={{ background: '#ef444422', border: '1px solid #ef444444', borderRadius: 10, padding: '4px 10px', textAlign: 'center' }}>
                      <div style={{ color: '#ef4444', fontSize: 10, marginBottom: 2 }}>دين مستحق</div>
                      {debt.IQD > 0 && <div style={{ color: '#ef4444', fontSize: 12, fontWeight: 800 }}>{fmtIQD(debt.IQD)}</div>}
                      {debt.USD > 0 && <div style={{ color: '#3b82f6', fontSize: 12, fontWeight: 800 }}>{fmtUSD(debt.USD)}</div>}
                    </div>
                  )}
                </div>
                <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                  {hasDebt && (
                    <button onClick={() => { setSelSupplier(s); setPayAmount(''); setPayCurrency('IQD'); setShowPayDebt(true); }}
                      style={{ flex: 1, background: '#10b98122', border: '1px solid #10b98144', borderRadius: 10, padding: '7px 0', color: '#10b981', fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: "'Cairo'" }}>💰 سداد دين</button>
                  )}
                  <button onClick={() => openEditSupplierForm(s)}
                    style={{ flex: 1, background: '#F5C80022', border: '1px solid #F5C80044', borderRadius: 10, padding: '7px 0', color: '#F5C800', fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: "'Cairo'" }}>✏️ تعديل</button>
                  {canDelete && (
                    <button onClick={() => delSupplier(s)}
                      style={{ flex: 1, background: '#ef444422', border: '1px solid #ef444444', borderRadius: 10, padding: '7px 0', color: '#ef4444', fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: "'Cairo'" }}>🗑️ حذف</button>
                  )}
                </div>
              </div>
            );
          })
        }
      </div>

      {/* آخر المشتريات */}
      {purchases.length > 0 && (
        <div style={{ background: '#ffffff', borderRadius: 16, border: '1px solid #d9e2f2', overflow: 'hidden', marginTop: 24 }}>
          <div style={{ color: '#1e293b', fontSize: 15, fontWeight: 700, padding: '16px 20px', borderBottom: '1px solid #d9e2f2' }}>📦 آخر فواتير الشراء</div>
          {purchases.slice(0, 8).map((p, i) => (
            <div key={p.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '12px 20px', borderBottom: i < 7 ? '1px solid #f1f5f9' : 'none', alignItems: 'center' }}>
              <div>
                <div style={{ color: '#F5C800', fontSize: 13, fontWeight: 700 }}>{p.invoiceNo}</div>
                <div style={{ color: '#64748b', fontSize: 11 }}>{p.supplierName} — {p.date}</div>
              </div>
              <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                <span style={{ background: p.paymentStatus === 'مدفوع' ? '#10b98122' : '#ef444422', border: `1px solid ${p.paymentStatus === 'مدفوع' ? '#10b98144' : '#ef444444'}`, borderRadius: 20, padding: '2px 10px', color: p.paymentStatus === 'مدفوع' ? '#10b981' : '#ef4444', fontSize: 11 }}>{p.paymentMethod}</span>
                <span style={{ color: '#1e293b', fontSize: 14, fontWeight: 800 }}>
                  {p.currency === 'USD' ? fmtUSD(p.total) : fmtIQD(p.total || 0)}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
