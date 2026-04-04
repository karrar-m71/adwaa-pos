import { useState, useEffect } from 'react';
import { collection, onSnapshot, addDoc, doc, getDoc, getDocs, query, setDoc, where, writeBatch } from 'firebase/firestore';
import { db } from '../../firebase';
import { accountingStyles, paymentBadgeStyle, statusBadgeStyle } from '../../styles/accountingTheme';
import { shareInvoiceOnWhatsApp, explainWhatsAppError } from '../../utils/invoiceSharing';
import { openProfessionalInvoicePrint } from '../../utils/invoicePrint';
import { buildSalePricesFromBuyPrice } from '../../utils/pricing';
import { getErrorMessage, getExchangeRate, getPreferredCurrency, setPreferredCurrency } from '../../utils/helpers';
import { hasLocalApi, localCreatePurchase, runLocalSync } from '../../data/api/localApi';
import Products from '../Products';

const fmt = n=>(n||0).toLocaleString('ar-IQ')+' د.ع';
const normalizeDigits = (value) => String(value ?? '')
  .replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)))
  .replace(/[۰-۹]/g, (d) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d)))
  .replace('٫', '.')
  .replace(/[٬,]/g, '');
const toNum = (v) => {
  const n = Number(normalizeDigits(v).replace(/[^\d.-]/g, '') || 0);
  return Number.isFinite(n) ? n : 0;
};
const normalizeCurrencyCode = (value) => {
  if (value === 'USD' || value === 'دولار أمريكي') return 'USD';
  return 'IQD';
};
const amountInDisplayCurrency = (amountIQD, currencyCode, rate) => (
  normalizeCurrencyCode(currencyCode) === 'USD'
    ? toNum(amountIQD) / (toNum(rate) || 1)
    : toNum(amountIQD)
);
const readDebtByCurrency = (entity = {}) => ({
  IQD: toNum(entity?.debtByCurrency?.IQD ?? entity?.debtByCurrency?.iqd ?? entity?.debt ?? 0),
  USD: toNum(entity?.debtByCurrency?.USD ?? entity?.debtByCurrency?.usd ?? 0),
});
const readTotalByCurrency = (entity = {}) => ({
  IQD: toNum(entity?.totalPurchasesByCurrency?.IQD ?? entity?.totalPurchasesByCurrency?.iqd ?? entity?.totalPurchases ?? 0),
  USD: toNum(entity?.totalPurchasesByCurrency?.USD ?? entity?.totalPurchasesByCurrency?.usd ?? 0),
});
const applyCurrencyDelta = (current = { IQD:0, USD:0 }, code = 'IQD', delta = 0) => {
  const next = { IQD: toNum(current.IQD), USD: toNum(current.USD) };
  const k = normalizeCurrencyCode(code);
  next[k] = Math.max(0, toNum(next[k]) + toNum(delta));
  return next;
};
const fmtByCurrency = (amountIQD, currencyCode = 'IQD', rate = 1) => {
  const code = normalizeCurrencyCode(currencyCode);
  if (code === 'USD') return `$${amountInDisplayCurrency(amountIQD, 'USD', rate).toFixed(2)}`;
  return fmt(amountIQD);
};
const clampAmount = (value, max) => Math.max(0, Math.min(toNum(value), toNum(max)));
const resolvePaidAmountInput = (value, total) => (
  value === '' || value === null || typeof value === 'undefined'
    ? toNum(total)
    : value
);
const inferPaymentMethod = (dueAmount) => (toNum(dueAmount) > 0 ? 'آجل' : 'نقدي');
const isGeneralSupplierName = (value = '') => {
  const name = String(value || '').trim();
  return !name || name === 'عام' || name === 'مورد عام';
};
const today=()=>new Date().toISOString().split('T')[0];
const nowStr=()=>new Date().toLocaleDateString('ar-IQ',{year:'numeric',month:'short',day:'numeric'});
const genCode = (prefix) => `${prefix}-${Date.now().toString().slice(-6)}${Math.floor(Math.random() * 90 + 10)}`;
const selectFieldValue = (event) => {
  event.currentTarget.select?.();
};
const calcLineDiscountAmount = (item) => {
  const qty = Number(item?.qty || 0);
  const unit = Number(item?.buyPriceIQD ?? item?.buyPrice ?? item?.price ?? 0);
  const base = qty * unit;
  if (item?.lineDiscountAmount != null) return Math.max(0, Math.min(base, Number(item.lineDiscountAmount || 0)));
  const discount = Number(item?.lineDiscount || 0);
  if (!discount) return 0;
  if ((item?.lineDiscountType || 'fixed') === 'percent') return Math.max(0, Math.min(base, base * (discount / 100)));
  const discountIQD = (item?.buyCurrency || 'IQD') === 'USD'
    ? discount * Number(item?.exchangeRate || 1)
    : discount;
  return Math.max(0, Math.min(base, discountIQD));
};
const calcLineTotal = (item) => {
  const base = Number(item?.buyPriceIQD ?? item?.buyPrice ?? item?.price ?? 0) * Number(item?.qty || 0);
  return Number(item?.total ?? Math.max(0, base - calcLineDiscountAmount(item)));
};

// ── نافذة معلومات المادة ─────────────────────
function ProductPopup({product,pos,onClose}){
  return(
    <div style={{position:'fixed',inset:0,zIndex:900}} onClick={onClose}>
      <div onClick={e=>e.stopPropagation()} style={{position:'fixed',top:Math.min(pos.y,window.innerHeight-340),left:Math.min(pos.x,window.innerWidth-290),zIndex:901,background:'#ffffff',border:'1px solid #f59e0b55',borderRadius:16,padding:18,width:270,boxShadow:'0 8px 40px rgba(0,0,0,0.7)',direction:'rtl'}}>
        <div style={{display:'flex',gap:10,marginBottom:12,alignItems:'center'}}>
          {product.imgUrl?<img src={product.imgUrl} loading="lazy" decoding="async" style={{width:56,height:56,borderRadius:8,objectFit:'cover'}} alt=""/>:<div style={{width:56,height:56,borderRadius:8,background:'#d9e2f2',display:'flex',alignItems:'center',justifyContent:'center',fontSize:30}}>{product.img||'📦'}</div>}
          <div>
            <div style={{color:'#fff',fontSize:14,fontWeight:800}}>{product.name}</div>
            <div style={{color:'#64748b',fontSize:10}}>{product.cat} • {product.barcode||'—'}</div>
          </div>
        </div>
        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:6,marginBottom:10}}>
          {[['سعر الشراء',fmt(product.buyPrice),'#f59e0b'],['سعر البيع',fmt(product.sellPrice),'#F5C800'],['المخزون',(product.stock||0)+' وحدة',(product.stock||0)<=0?'#ef4444':'#10b981'],['الحد الأدنى',(product.minStock||5)+' وحدة','#64748b']].map(([l,v,c])=>(
            <div key={l} style={{background:'#f8fbff',borderRadius:7,padding:7,textAlign:'center'}}>
              <div style={{color:'#64748b',fontSize:9,marginBottom:2}}>{l}</div>
              <div style={{color:c,fontSize:11,fontWeight:700}}>{v}</div>
            </div>
          ))}
        </div>
        <button onClick={onClose} style={{width:'100%',background:'#d9e2f2',border:'none',borderRadius:7,padding:'7px',color:'#64748b',cursor:'pointer',fontFamily:"'Cairo'"}}>إغلاق ✕</button>
      </div>
    </div>
  );
}

function InlineAmountInput({ value, placeholder, max, onChangeValue }) {
  const [localValue, setLocalValue] = useState(value ?? '');
  const [isEditing, setIsEditing] = useState(false);

  const commitValue = () => {
    const raw = String(localValue ?? '');
    if (!raw.trim()) {
      onChangeValue('');
      setIsEditing(false);
      return;
    }
    const capped = String(Math.min(toNum(raw), toNum(max)));
    setLocalValue(capped);
    onChangeValue(capped);
    setIsEditing(false);
  };

  return (
    <input
      type="text"
      inputMode="decimal"
      value={localValue}
      onFocus={() => setIsEditing(true)}
      onChange={(e) => setLocalValue(e.target.value)}
      onBlur={commitValue}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          commitValue();
          e.currentTarget.blur();
        }
      }}
      onDoubleClick={selectFieldValue}
      placeholder={placeholder}
      style={{width:'100%',background:'#fff',border:'1px solid #93c5fd',borderRadius:7,padding:'6px 10px',color:'#1d4ed8',fontSize:14,fontWeight:900,outline:'none',boxSizing:'border-box',textAlign:'center'}}
    />
  );
}

function PurchaseEditModal({ purchase, suppliers, onSave, onClose }) {
  const [draft, setDraft] = useState(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!purchase) {
      setDraft(null);
      return;
    }
    setDraft({ ...purchase, items:(purchase.items || []).map((it) => ({ ...it })) });
  }, [purchase]);

  if (!purchase || !draft) return null;

  const matchedSupplier = suppliers.find((s) => s.name === (draft.supplier || '').trim())
    || suppliers.find((s) => draft.supplierId && s.id === draft.supplierId)
    || null;
  const supplierPhone = draft.supplierPhone || matchedSupplier?.phone || '';
  const supplierAddress = draft.supplierAddress || matchedSupplier?.address || '';
  const previousDebt = matchedSupplier ? readDebtByCurrency(matchedSupplier) : { IQD:0, USD:0 };

  const recalc = (next) => {
    const items = (next.items || [])
      .map((it) => {
        const qty = Math.max(0, Number(it.qty || 0));
        const buyPrice = Math.max(0, Number(it.buyPrice ?? it.price ?? 0));
        const lineSubtotal = qty * buyPrice;
        const lineDiscount = Math.max(0, Number(it.lineDiscount || 0));
        const lineDiscountType = it.lineDiscountType || 'fixed';
        const lineDiscountAmount = lineDiscountType === 'percent'
          ? Math.min(lineSubtotal, lineSubtotal * (lineDiscount / 100))
          : Math.min(lineSubtotal, lineDiscount);
        return { ...it, qty, buyPrice, lineSubtotal, lineDiscount, lineDiscountType, lineDiscountAmount, total: Math.max(0, lineSubtotal - lineDiscountAmount) };
      })
      .filter((it) => it.qty > 0);
    const grossSubtotal = items.reduce((s, it) => s + Number(it.lineSubtotal || 0), 0);
    const itemDiscountAmount = items.reduce((s, it) => s + Number(it.lineDiscountAmount || 0), 0);
    const subtotal = Math.max(0, grossSubtotal - itemDiscountAmount);
    const discount = Number(next.discount || 0);
    const discountType = next.discountType || 'percent';
    const discountAmount = discountType === 'percent'
      ? subtotal * (discount / 100)
      : Math.min(subtotal, discount);
    const total = Math.max(0, subtotal - discountAmount);
    const paidAmount = clampAmount(resolvePaidAmountInput(next.paidAmount, total), total);
    const dueAmount = Math.max(0, total - paidAmount);
    const currencyCode = normalizeCurrencyCode(next.currency || purchase.currency || 'IQD');
    const rate = Number(next.exchangeRate || purchase.exchangeRate || getExchangeRate() || 1);
    const dueAmountDisplay = amountInDisplayCurrency(dueAmount, currencyCode, rate);
    const previousDebtDisplay = Number(previousDebt[currencyCode] || 0);
    return {
      ...next,
      supplierId: matchedSupplier?.id || '',
      items,
      grossSubtotal,
      itemDiscountAmount,
      subtotal,
      discount,
      discountType,
      discountAmount,
      total,
      paymentMethod: inferPaymentMethod(dueAmount),
      paidAmount,
      dueAmount,
      dueAmountDisplay,
      previousDebt: previousDebtDisplay,
      accountTotal: Math.max(0, previousDebtDisplay + dueAmountDisplay),
      paymentStatus: dueAmount > 0 ? 'غير مدفوع' : 'مدفوع',
      supplierPhone: next.supplierPhone || matchedSupplier?.phone || '',
      supplierAddress: next.supplierAddress || matchedSupplier?.address || '',
    };
  };
  const calc = recalc(draft);

  const share = async () => {
    const normalized = recalc(draft);
    const payload = {
      ...normalized,
      items: (normalized.items || []).map((it) => ({ ...it, price: it.buyPrice })),
    };
    const result = await shareInvoiceOnWhatsApp({ invoice:payload, type:'purchase', phone:supplierPhone });
    if (!result.ok) {
      alert(explainWhatsAppError(result));
      return;
    }
    if (result.mode === 'cloud-api') {
      alert('✅ تم إرسال الفاتورة عبر WhatsApp Cloud API');
    } else if (result.manualAttachRequired) {
      alert(`✅ تم تنزيل ملف PDF (${result.fileName})\nافتح محادثة واتساب وأرفق الملف ثم أرسل.`);
    }
  };

  const print = () => {
    const normalized = recalc(draft);
    const payload = {
      ...normalized,
      items: (normalized.items || []).map((it) => ({ ...it, price: it.buyPrice })),
    };
    const ok = openProfessionalInvoicePrint(payload, 'purchase');
    if (!ok) alert('تعذر فتح نافذة الطباعة. تأكد من السماح بالنوافذ المنبثقة.');
  };

  const save = async () => {
    setSaving(true);
    try {
      await onSave(recalc(draft));
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,.65)',zIndex:1200,display:'flex',alignItems:'center',justifyContent:'center',padding:14}} onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} style={{width:'100%',maxWidth:960,maxHeight:'90vh',overflow:'auto',background:'#fff',border:'1px solid #d9e2f2',borderRadius:16,padding:16,direction:'rtl'}}>
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:12}}>
          <div>
            <div style={{color:'#0f172a',fontSize:20,fontWeight:800}}>🛍️ {draft.invoiceNo}</div>
            <div style={{color:'#64748b',fontSize:11}}>تعديل فاتورة الشراء</div>
          </div>
          <div style={{display:'flex',gap:8}}>
            <button onClick={print} style={{background:'#3b82f6',color:'#fff',border:'none',borderRadius:10,padding:'8px 12px',fontFamily:"'Cairo'",cursor:'pointer'}}>طباعة</button>
            <button onClick={share} style={{background:'#10b981',color:'#fff',border:'none',borderRadius:10,padding:'8px 12px',fontFamily:"'Cairo'",cursor:'pointer'}}>واتساب</button>
            <button onClick={save} disabled={saving} style={{background:'#0f766e',color:'#fff',border:'none',borderRadius:10,padding:'8px 12px',fontFamily:"'Cairo'",cursor:'pointer'}}>{saving?'جاري الحفظ...':'حفظ'}</button>
            <button onClick={onClose} style={{background:'#f8fbff',color:'#334155',border:'1px solid #d9e2f2',borderRadius:10,padding:'8px 12px',fontFamily:"'Cairo'",cursor:'pointer'}}>إغلاق</button>
          </div>
        </div>

        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr 1fr',gap:8,marginBottom:10}}>
          <input value={draft.supplier || ''} onChange={(e) => {
            const value = e.target.value;
            const found = suppliers.find((s) => s.name === value);
            setDraft((s) => ({ ...s, supplier:value, supplierId:found?.id || '', supplierPhone:found?.phone || s.supplierPhone || '', supplierAddress:found?.address || s.supplierAddress || '' }));
          }} list="purchase-edit-suppliers" placeholder="اسم المورد" style={{border:'1px solid #cdd8ec',borderRadius:8,padding:'7px 8px',fontFamily:"'Cairo'"}} />
          <input type="text" inputMode="decimal" value={draft.paidAmountRaw ?? draft.paidAmount ?? 0}
            onFocus={(e) => { setDraft((s) => ({ ...s, paidAmountRaw: String(s.paidAmount ?? 0) })); e.target.select(); }}
            onChange={(e) => setDraft((s) => ({ ...s, paidAmountRaw: e.target.value }))}
            onBlur={(e) => setDraft((s) => ({ ...s, paidAmount: toNum(e.target.value), paidAmountRaw: undefined }))}
            onDoubleClick={selectFieldValue}
            placeholder="المبلغ الواصل" style={{border:'1px solid #cdd8ec',borderRadius:8,padding:'7px 8px',fontFamily:"'Cairo'"}} />
          <input type="date" value={draft.dateISO || ''} onChange={(e) => setDraft((s) => ({ ...s, dateISO:e.target.value }))} style={{border:'1px solid #cdd8ec',borderRadius:8,padding:'7px 8px',fontFamily:"'Cairo'"}} />
          <input value={supplierPhone} onChange={(e) => setDraft((s) => ({ ...s, supplierPhone:e.target.value }))}
            placeholder="هاتف المورد" style={{border:'1px solid #cdd8ec',borderRadius:8,padding:'7px 8px',fontFamily:"'Cairo'"}} />
        </div>
        <div style={{display:'grid',gridTemplateColumns:'1fr',gap:8,marginBottom:10}}>
          <input value={supplierAddress} onChange={(e) => setDraft((s) => ({ ...s, supplierAddress:e.target.value }))}
            placeholder="عنوان المورد" style={{border:'1px solid #cdd8ec',borderRadius:8,padding:'7px 8px',fontFamily:"'Cairo'"}} />
        </div>

        <div style={{background:'#fff',border:'1px solid #d9e2f2',borderRadius:12,overflow:'hidden'}}>
          <div style={{display:'grid',gridTemplateColumns:'2fr 1fr 1fr 1.3fr 1fr auto',padding:'10px 12px',background:'#f8fbff',borderBottom:'1px solid #e2e8f7'}}>
            {['المادة','الكمية','سعر الشراء','خصم المادة','المجموع',''].map((h) => <div key={h} style={{color:'#64748b',fontSize:10,fontWeight:700}}>{h}</div>)}
          </div>
          {(draft.items || []).map((item, idx) => (
            <div key={`${item.id || item.name}-${idx}`} style={{display:'grid',gridTemplateColumns:'2fr 1fr 1fr 1.3fr 1fr auto',padding:'8px 12px',alignItems:'center',gap:6,borderBottom:'1px solid #eef2fa'}}>
              <input value={item.name || ''} onChange={(e) => setDraft((s) => ({ ...s, items:s.items.map((it,i)=>i===idx?{...it,name:e.target.value}:it) }))} style={{border:'1px solid #cdd8ec',borderRadius:6,padding:'4px 6px',fontFamily:"'Cairo'"}} />
              <input type="text" inputMode="numeric" value={item.qty ?? 0} onChange={(e) => setDraft((s) => ({ ...s, items:s.items.map((it,i)=>i===idx?{...it,qty:Number(e.target.value)||0}:it) }))} onDoubleClick={selectFieldValue} style={{border:'1px solid #cdd8ec',borderRadius:6,padding:'4px 6px',fontFamily:"'Cairo'"}} />
              <input type="text" inputMode="decimal" value={item.buyPrice ?? 0} onChange={(e) => setDraft((s) => ({ ...s, items:s.items.map((it,i)=>i===idx?{...it,buyPrice:Number(e.target.value)}:it) }))} onDoubleClick={selectFieldValue} style={{border:'1px solid #cdd8ec',borderRadius:6,padding:'4px 6px',fontFamily:"'Cairo'"}} />
              <div style={{display:'flex',gap:4}}>
                <input type="text" inputMode="decimal" value={item.lineDiscount ?? 0} onDoubleClick={selectFieldValue}
                  onChange={(e) => setDraft((s) => ({ ...s, items:s.items.map((it,i)=>i===idx?{...it,lineDiscount:Number(e.target.value)||0}:it) }))}
                  style={{width:'100%',border:'1px solid #cdd8ec',borderRadius:6,padding:'4px 6px',fontFamily:"'Cairo'"}} />
                <select value={item.lineDiscountType || 'fixed'}
                  onChange={(e) => setDraft((s) => ({ ...s, items:s.items.map((it,i)=>i===idx?{...it,lineDiscountType:e.target.value}:it) }))}
                  style={{border:'1px solid #cdd8ec',borderRadius:6,padding:'4px 6px',fontFamily:"'Cairo'"}}>
                  <option value="fixed">د.ع</option>
                  <option value="percent">%</option>
                </select>
              </div>
              <div style={{color:'#0f766e',fontSize:11,fontWeight:700}}>{fmt(calcLineTotal(item))}</div>
              <button onClick={() => setDraft((s) => ({ ...s, items:s.items.filter((_, i) => i !== idx) }))} style={{background:'#ef4444',color:'#fff',border:'none',borderRadius:6,padding:'4px 8px',fontFamily:"'Cairo'",cursor:'pointer'}}>حذف</button>
            </div>
          ))}
        </div>
        <div style={{display:'grid',gridTemplateColumns:'1.4fr 1fr 1fr 1fr 1fr',gap:8,marginTop:10}}>
          <div style={{background:'#f8fbff',border:'1px solid #d9e2f2',borderRadius:10,padding:'8px 10px'}}>
            <div style={{color:'#64748b',fontSize:10}}>مجموع قبل خصم المواد</div>
            <div style={{color:'#334155',fontSize:12,fontWeight:800}}>{fmt(calc.grossSubtotal)}</div>
          </div>
          <div style={{background:'#fef2f2',border:'1px solid #fecaca',borderRadius:10,padding:'8px 10px'}}>
            <div style={{color:'#ef4444',fontSize:10}}>خصم المواد</div>
            <div style={{color:'#ef4444',fontSize:12,fontWeight:800}}>{fmt(calc.itemDiscountAmount)}</div>
          </div>
          <div style={{background:'#f8fbff',border:'1px solid #d9e2f2',borderRadius:10,padding:'8px 10px'}}>
            <div style={{color:'#64748b',fontSize:10}}>الصافي قبل الخصم العام</div>
            <div style={{color:'#334155',fontSize:12,fontWeight:800}}>{fmt(calc.subtotal)}</div>
          </div>
          <div style={{background:'#fff7ed',border:'1px solid #fdba74',borderRadius:10,padding:'8px 10px'}}>
            <div style={{color:'#d97706',fontSize:10}}>خصم الفاتورة</div>
            <div style={{display:'flex',gap:4,marginTop:3}}>
              <input type="text" inputMode="decimal" value={draft.discount || 0} onDoubleClick={selectFieldValue}
                onChange={(e)=>setDraft((s)=>({...s,discount:Number(e.target.value)||0}))}
                style={{width:'100%',border:'1px solid #fdba74',borderRadius:6,padding:'3px 6px',fontFamily:"'Cairo'"}} />
              <select value={draft.discountType || 'percent'}
                onChange={(e)=>setDraft((s)=>({...s,discountType:e.target.value}))}
                style={{border:'1px solid #fdba74',borderRadius:6,padding:'3px 4px',fontFamily:"'Cairo'"}}>
                <option value="percent">%</option>
                <option value="fixed">د.ع</option>
              </select>
            </div>
          </div>
          <div style={{background:'#ecfdf5',border:'1px solid #a7f3d0',borderRadius:10,padding:'8px 10px'}}>
            <div style={{color:'#10b981',fontSize:10}}>الإجمالي النهائي</div>
            <div style={{color:'#047857',fontSize:13,fontWeight:900}}>{fmt(calc.total)}</div>
          </div>
        </div>
        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:8,marginTop:10}}>
          <div style={{background:'#dbeafe',border:'1px solid #93c5fd',borderRadius:10,padding:'8px 10px'}}>
            <div style={{color:'#2563eb',fontSize:10}}>المبلغ الواصل</div>
            <div style={{color:'#1d4ed8',fontSize:13,fontWeight:900}}>{fmt(calc.paidAmount)}</div>
          </div>
          <div style={{background:calc.dueAmount>0?'#fff7ed':'#ecfdf5',border:`1px solid ${calc.dueAmount>0?'#fdba74':'#86efac'}`,borderRadius:10,padding:'8px 10px'}}>
            <div style={{color:calc.dueAmount>0?'#c2410c':'#047857',fontSize:10}}>المبلغ المتبقي</div>
            <div style={{color:calc.dueAmount>0?'#c2410c':'#047857',fontSize:13,fontWeight:900}}>{fmt(calc.dueAmount)}</div>
          </div>
          <div style={{background:'#f8fbff',border:'1px solid #d9e2f2',borderRadius:10,padding:'8px 10px'}}>
            <div style={{color:'#64748b',fontSize:10}}>الحالة</div>
            <div style={{color:calc.paymentMethod==='آجل'?'#f59e0b':'#10b981',fontSize:13,fontWeight:900}}>{calc.paymentMethod}</div>
          </div>
        </div>
        {calc.previousDebt>0&&(
          <div style={{display:'flex',justifyContent:'space-between',background:'#fff7ed',border:'1px solid #fdba74',borderRadius:10,padding:'8px 10px',marginTop:10}}>
            <span style={{color:'#64748b',fontSize:11}}>الدين السابق</span>
            <span style={{color:'#c2410c',fontSize:12,fontWeight:800}}>{fmt(calc.previousDebt)}</span>
          </div>
        )}
        {calc.accountTotal>0&&(
          <div style={{display:'flex',justifyContent:'space-between',background:'#f3e8ff',border:'1px solid #d8b4fe',borderRadius:10,padding:'8px 10px',marginTop:8}}>
            <span style={{color:'#64748b',fontSize:11}}>مبلغ الحساب الكلي</span>
            <span style={{color:'#7C3AED',fontSize:12,fontWeight:800}}>{fmt(calc.accountTotal)}</span>
          </div>
        )}
        <button onClick={() => setDraft((s) => ({ ...s, items:[...(s.items || []), { id:'', name:'مادة جديدة', qty:1, buyPrice:0, lineDiscount:0, lineDiscountType:'fixed', total:0 }] }))} style={{marginTop:8,background:'#e8f1ff',color:'#1f6feb',border:'1px solid #bfdbfe',borderRadius:8,padding:'6px 12px',fontFamily:"'Cairo'",cursor:'pointer'}}>+ إضافة مادة</button>
        <datalist id="purchase-edit-suppliers">{suppliers.map((s) => <option key={s.id} value={s.name} />)}</datalist>
      </div>
    </div>
  );
}

function ProductPickerModal({ initialSearch, user, onProductSaved, onClose }) {
  if (!initialSearch) return null;
  return (
    <div style={{position:'fixed',inset:0,background:'rgba(15,23,42,.28)',zIndex:1250,display:'flex',alignItems:'center',justifyContent:'center',padding:16}} onClick={onClose}>
      <div onClick={(e)=>e.stopPropagation()} style={{width:'min(1120px, 100%)',height:'min(90vh, 920px)',background:'#fff',border:'1px solid #d9e2f2',borderRadius:18,overflow:'hidden',boxShadow:'0 20px 60px rgba(15,23,42,.18)'}}>
        <Products
          user={user}
          embedded
          initialSearch={initialSearch}
          openCreateOnMount
          onProductSaved={onProductSaved}
          onClose={onClose}
        />
      </div>
    </div>
  );
}

let _purchTabId=2;

export default function PurchaseList({user}){
  const [exchangeRate] = useState(() => {
    try {
      const s = JSON.parse(localStorage.getItem('adwaa_settings') || '{}');
      return Number(s.exchangeRate || 1480) || 1480;
    } catch {
      return 1480;
    }
  });
  const [products,  setProducts]  = useState([]);
  const [packages,  setPackages]  = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [purchases, setPurchases] = useState([]);
  const [search,    setSearch]    = useState('');
  const [catFilter, setCatFilter] = useState('الكل');
  const [tabs,      setTabs]      = useState([{id:1,label:'فاتورة شراء 1'}]);
  const [activeTab, setActiveTab] = useState(1);
  const [view,      setView]      = useState('pos');
  const [popup,     setPopup]     = useState(null);
  const [listSearch,setListSearch]= useState('');
  const [payFilter, setPayFilter] = useState('الكل');
  const [dateFrom,  setDateFrom]  = useState('');
  const [dateTo,    setDateTo]    = useState('');
  const [selectedPurchase, setSelectedPurchase] = useState(null);
  const [productSearchModal, setProductSearchModal] = useState('');
  const [carts,     setCarts]     = useState({1:{items:[],supplier:'',supplierPhone:'',supplierAddress:'',paidAmountInput:'',currency:getPreferredCurrency(),date:today(),notes:'',discount:0,discountType:'percent',saving:false,done:null}});

  useEffect(()=>{
    const us=[
      onSnapshot(collection(db,'pos_products'),  s=>setProducts(s.docs.map(d=>({...d.data(),id:d.id})))),
      onSnapshot(collection(db,'pos_packages'),  s=>setPackages(s.docs.map(d=>({...d.data(),id:d.id})))),
      onSnapshot(collection(db,'pos_suppliers'), s=>setSuppliers(s.docs.map(d=>({...d.data(),id:d.id})))),
      onSnapshot(collection(db,'pos_purchases'), s=>setPurchases(s.docs.map(d=>({...d.data(),id:d.id})).sort((a,b)=>new Date(b.createdAt)-new Date(a.createdAt)))),
    ];
    return()=>us.forEach(u=>u());
  },[]);

  const cats=['الكل',...new Set(products.map(p=>p.cat).filter(Boolean))];
  const filtered=products.filter(p=>{
    return(!search||p.name?.includes(search)||p.barcode?.includes(search))&&(catFilter==='الكل'||p.cat===catFilter);
  });
  const activeCurrency = normalizeCurrencyCode((carts[activeTab] || {}).currency || 'IQD');

  useEffect(() => {
    setPreferredCurrency(activeCurrency);
  }, [activeCurrency]);

  const handleSearchEnter = (event) => {
    if (event.key !== 'Enter') return;
    event.preventDefault();
    const queryText = String(search || '').trim();
    if (!queryText) return;
    const normalized = queryText.toLowerCase();
    const exactMatch = products.find((p) => {
      const name = String(p.name || '').trim().toLowerCase();
      const barcode = String(p.barcode || '').trim().toLowerCase();
      return name === normalized || barcode === normalized;
    });
    if (exactMatch) {
      addToTab(activeTab, exactMatch, 'unit');
      return;
    }
    if (filtered[0]) {
      addToTab(activeTab, filtered[0], 'unit');
      return;
    }
    setProductSearchModal(queryText);
  };

  const addTab=()=>{
    const id=_purchTabId++;
    setTabs(t=>[...t,{id,label:`فاتورة شراء ${id}`}]);
    setCarts(c=>({...c,[id]:{items:[],supplier:'',supplierPhone:'',supplierAddress:'',paidAmountInput:'',currency:getPreferredCurrency(),date:today(),notes:'',discount:0,discountType:'percent',saving:false,done:null}}));
    setActiveTab(id);
  };

  const closeTab=(id)=>{
    if(tabs.length===1)return;
    const idx=tabs.findIndex(t=>t.id===id);
    const newTabs=tabs.filter(t=>t.id!==id);
    setTabs(newTabs);
    setActiveTab(newTabs[Math.max(0,idx-1)].id);
  };

  const addToTab=(tabId,p,sellType='unit')=>{
    setCarts(c=>{
      const tab=c[tabId]||{items:[]};
      const pkg=packages.find(pk=>pk.id===p.packageTypeId);
      const isPackage=sellType==='package' && pkg;
      const packageQty=Math.max(1, Number(pkg?.qty||1));
      const itemKey=`${p.id}_${isPackage?'package':'unit'}`;
      const ex=tab.items.findIndex(i=>i.key===itemKey);
      const unitPriceIQD = toNum(p.buyPrice || 0);
      const packagePriceIQD = isPackage
        ? toNum(p.packageBuyPrice || (unitPriceIQD * packageQty))
        : 0;
      const initialCurrency = normalizeCurrencyCode(tab.currency || (isPackage
        ? (p.packageBuyCurrency || p.buyCurrency || 'IQD')
        : (p.buyCurrency || 'IQD')));
      const initialPriceDisplay = isPackage
        ? (p.packageBuyPriceInput != null
          ? toNum(p.packageBuyPriceInput)
          : (initialCurrency === 'USD' ? (packagePriceIQD / exchangeRate) : packagePriceIQD))
        : (p.buyPriceInput != null
          ? toNum(p.buyPriceInput)
          : (initialCurrency === 'USD' ? (unitPriceIQD / exchangeRate) : unitPriceIQD));
      let items;
      if(ex>=0){
        items=tab.items.map((i,idx)=>idx===ex?{...i,qty:i.qty+1}:i);
      }else{
        items=[...tab.items,{
          key:itemKey,
          id:p.id,
          name:p.name,
          img:p.img,
          imgUrl:p.imgUrl,
          qty:1,
          qtyUnits:isPackage?packageQty:1,
          buyPrice:initialPriceDisplay,
          buyPriceIQD:isPackage?packagePriceIQD:unitPriceIQD,
          buyCurrency:initialCurrency,
          exchangeRate:exchangeRate||1,
          barcode:p.barcode,
          lineDiscount:0,
          lineDiscountType:'fixed',
          sellType:isPackage?'package':'unit',
          isPackage:Boolean(isPackage),
          packageQty,
          packageName:pkg?.name||'عبوة',
          packageId:pkg?.id||null,
        }];
      }
      return{...c,[tabId]:{...tab,items}};
    });
    setSearch('');
  };

  const updateCart=(tabId,field,val,itemKey=null)=>{
    setCarts(c=>{
      const tab=c[tabId]||{};
      if(itemKey!==null){
        const items=tab.items.map(i=>{
          if((i.key||i.id)!==itemKey) return i;
          if (field === 'buyPrice') {
            const display = toNum(val);
            const buyPriceIQD = (i.buyCurrency || 'IQD') === 'USD' ? display * exchangeRate : display;
            return { ...i, buyPrice:display, buyPriceIQD, exchangeRate:exchangeRate||1 };
          }
          if (field === 'buyCurrency') {
            const nextCurrency = val === 'USD' ? 'USD' : 'IQD';
            const currentIQD = toNum(i.buyPriceIQD ?? i.buyPrice);
            const display = nextCurrency === 'USD' ? (currentIQD / exchangeRate) : currentIQD;
            return { ...i, buyCurrency:nextCurrency, buyPrice:display, buyPriceIQD:currentIQD, exchangeRate:exchangeRate||1 };
          }
          return {...i,[field]:Number(val)||val};
        });
        return{...c,[tabId]:{...tab,items}};
      }
      if (field === 'currency') {
        const nextCurrency = normalizeCurrencyCode(val);
        const items = (tab.items || []).map((i) => {
          const baseIQD = toNum(i.buyPriceIQD ?? i.buyPrice);
          return {
            ...i,
            buyCurrency: nextCurrency,
            buyPrice: nextCurrency === 'USD' ? (baseIQD / (exchangeRate || 1)) : baseIQD,
            buyPriceIQD: baseIQD,
            exchangeRate: exchangeRate || 1,
          };
        });
        return{...c,[tabId]:{...tab,currency:nextCurrency,items}};
      }
      return{...c,[tabId]:{...tab,[field]:val}};
    });
  };

  const removeFromTab=(tabId,itemKey)=>setCarts(c=>{
    const tab=c[tabId]||{};
    return{...c,[tabId]:{...tab,items:tab.items.filter(i=>(i.key||i.id)!==itemKey)}};
  });

  const save=async(tabId)=>{
    const tab=carts[tabId];
    if(!tab?.items?.length)return alert('الفاتورة فارغة');
    updateCart(tabId,'saving',true);
    try{
      const invoiceNo=genCode('PINV');
      const grossSubtotal = tab.items.reduce((s,i)=>s+(toNum(i.buyPriceIQD ?? i.buyPrice)||0)*toNum(i.qty),0);
      const itemDiscountAmount = tab.items.reduce((s, i) => s + calcLineDiscountAmount(i), 0);
      const subtotal = Math.max(0, grossSubtotal - itemDiscountAmount);
      const discAmt=tab.discountType==='percent'
        ? subtotal*(Number(tab.discount||0)/100)
        : Math.min(Number(tab.discount||0),subtotal);
      const total=subtotal-discAmt;
      const purchaseCurrency = normalizeCurrencyCode(tab.currency || 'IQD');
      const totalDisplay = amountInDisplayCurrency(total, purchaseCurrency, exchangeRate);
      const paidAmountSource = tab.paidAmountInput ?? tab.paidAmount;
      const paidAmount = clampAmount(resolvePaidAmountInput(paidAmountSource, total), total);
      if (toNum(paidAmountSource) > total) {
        updateCart(tabId,'paidAmountInput',String(total));
        updateCart(tabId,'saving',false);
        return alert('لا يمكن أن يكون المبلغ الواصل أكبر من مبلغ الفاتورة');
      }
      const dueAmount = Math.max(0, total - paidAmount);
      const supplierName = String(tab.supplier || '').trim();
      const generalSupplier = isGeneralSupplierName(supplierName);
      if (dueAmount > 0 && generalSupplier) {
        updateCart(tabId,'saving',false);
        return alert('لا يمكن ترحيل مبلغ متبقٍ على مورد عام. حدّد اسم المورد أولاً.');
      }
      const paidAmountDisplay = amountInDisplayCurrency(paidAmount, purchaseCurrency, exchangeRate);
      const dueAmountDisplay = amountInDisplayCurrency(dueAmount, purchaseCurrency, exchangeRate);
      const paymentMethod = inferPaymentMethod(dueAmount);
      const matchedSupplier=suppliers.find(s=>s.name===supplierName);
      const previousDebtByCurrency = matchedSupplier ? readDebtByCurrency(matchedSupplier) : { IQD:0, USD:0 };
      const previousDebtDisplay = Number(previousDebtByCurrency[purchaseCurrency] || 0);
      const accountTotal = Math.max(0, previousDebtDisplay + dueAmountDisplay);
      const purchase={
        invoiceNo,
        items:tab.items.map(i=>{
          const packageQty = Math.max(1, Number(i.packageQty || 1));
          const qtyUnits = i.isPackage ? Number(i.qty || 0) * packageQty : Number(i.qty || 0);
          const lineSubtotal = (toNum(i.buyPriceIQD ?? i.buyPrice)||0) * toNum(i.qty);
          const lineDiscountAmount = calcLineDiscountAmount(i);
          return {
            key:i.key||`${i.id}_${i.isPackage?'package':'unit'}`,
            id:i.id,name:i.name,qty:i.qty,qtyUnits,
            buyPrice:toNum(i.buyPriceIQD ?? i.buyPrice),
            buyPriceDisplay:toNum(i.buyPrice ?? 0),
            buyCurrency:i.buyCurrency||'IQD',
            exchangeRate:exchangeRate||1,
            isPackage:Boolean(i.isPackage),
            packageQty,
            packageName:i.packageName||'',
            packageId:i.packageId||null,
            sellType:i.sellType||(i.isPackage?'package':'unit'),
            lineSubtotal,
            lineDiscount:Number(i.lineDiscount||0),
            lineDiscountType:i.lineDiscountType||'fixed',
            lineDiscountAmount,
            total:Math.max(0, lineSubtotal - lineDiscountAmount),
          };
        }),
        grossSubtotal,
        itemDiscountAmount,
        subtotal,discount:tab.discount||0,discountType:tab.discountType||'percent',discountAmount:discAmt,
        total,paymentMethod,supplier:supplierName || 'مورد عام',
        currency: purchaseCurrency,
        exchangeRate: purchaseCurrency === 'USD' ? exchangeRate : 1,
        totalDisplay,
        supplierId:suppliers.find(s=>s.name===supplierName)?.id||'',
        supplierPhone:tab.supplierPhone?.trim() || suppliers.find(s=>s.name===supplierName)?.phone || '',
        supplierAddress:tab.supplierAddress?.trim() || suppliers.find(s=>s.name===supplierName)?.address || '',
        paidAmount,
        dueAmount,
        dueCurrency: purchaseCurrency,
        dueAmountDisplay,
        previousDebt: previousDebtDisplay,
        accountTotal,
        paymentStatus: dueAmount > 0 ? 'غير مدفوع' : 'مدفوع',
        status:'مؤكدة',
        source:'purchase_list',
        notes:tab.notes||'',date:nowStr(),dateISO:tab.date||today(),
        addedBy:user.name,createdAt:new Date().toISOString(),
      };

      if (hasLocalApi()) {
        const localResult = await localCreatePurchase({
          invoiceNo,
          items: purchase.items,
          grossSubtotal,
          itemDiscountAmount,
          subtotal,
          discount: tab.discount || 0,
          discountType: tab.discountType || 'percent',
          discountAmount: discAmt,
          total,
          paidAmount,
          supplier: supplierName || 'مورد عام',
          supplierPhone: tab.supplierPhone?.trim() || '',
          supplierAddress: tab.supplierAddress?.trim() || '',
          currency: purchaseCurrency,
          exchangeRate: purchaseCurrency === 'USD' ? exchangeRate : 1,
          notes: tab.notes || '',
          date: nowStr(),
          dateISO: tab.date || today(),
          addedBy: user.name,
        });
        setCarts(c=>({...c,[tabId]:{...c[tabId],done:{ ...localResult, localId: localResult?.id, localSaved: true },saving:false}}));
        runLocalSync().catch(() => null);
        return;
      }
      const purchaseRef = await addDoc(collection(db,'pos_purchases'),purchase);
      // تحديث المخزون
      for(const item of tab.items){
        const p=products.find(p=>p.id===item.id);
        if(p){
          const packageQty = Math.max(1, Number(item.packageQty || 1));
          const qtyUnits = item.isPackage ? Number(item.qty || 0) * packageQty : Number(item.qty || 0);
          const buyPriceIQD = toNum(item.buyPriceIQD ?? item.buyPrice);
          const patch = {stock:(p.stock||0)+qtyUnits};
          if (item.isPackage) {
            patch.packageBuyPrice = buyPriceIQD;
            patch.packageBuyPriceInput = toNum(item.buyPrice ?? item.buyPriceDisplay ?? 0);
            patch.packageBuyCurrency = item.buyCurrency || 'IQD';
            if (packageQty > 0) {
              patch.buyPrice = buyPriceIQD / packageQty;
              Object.assign(patch, buildSalePricesFromBuyPrice(patch.buyPrice));
              patch.buyPriceInput = (item.buyCurrency === 'USD')
                ? (toNum(item.buyPrice ?? item.buyPriceDisplay ?? 0) / packageQty)
                : (buyPriceIQD / packageQty);
              patch.buyCurrency = item.buyCurrency || 'IQD';
            }
          } else {
            patch.buyPrice = buyPriceIQD;
            Object.assign(patch, buildSalePricesFromBuyPrice(buyPriceIQD));
            patch.buyPriceInput = toNum(item.buyPrice ?? item.buyPriceDisplay ?? 0);
            patch.buyCurrency = item.buyCurrency || 'IQD';
          }
          await setDoc(doc(db,'pos_products',item.id), patch, { merge:true });
        }
      }
      // تحديث دين المورد
      const s=matchedSupplier;
      if(s){
        const nextTotalsByCurrency = applyCurrencyDelta(readTotalByCurrency(s), purchaseCurrency, totalDisplay);
        const nextDebtByCurrency = dueAmount > 0
          ? applyCurrencyDelta(readDebtByCurrency(s), purchaseCurrency, dueAmountDisplay)
          : readDebtByCurrency(s);
        const payload = {
          totalPurchases:(s.totalPurchases||0)+total,
          totalPurchasesByCurrency: nextTotalsByCurrency,
          debtByCurrency: nextDebtByCurrency,
          debt: toNum(nextDebtByCurrency.IQD),
          phone: tab.supplierPhone?.trim(),
          address: tab.supplierAddress?.trim(),
        };
        await setDoc(doc(db,'pos_suppliers',s.id),payload, { merge:true });
      } else if (!generalSupplier) {
        const totalPurchasesByCurrency = applyCurrencyDelta({ IQD:0, USD:0 }, purchaseCurrency, totalDisplay);
        const debtByCurrency = dueAmount > 0
          ? applyCurrencyDelta({ IQD:0, USD:0 }, purchaseCurrency, dueAmountDisplay)
          : { IQD:0, USD:0 };
        await addDoc(collection(db,'pos_suppliers'),{
          name:supplierName,
          phone:tab.supplierPhone?.trim() || '',
          address:tab.supplierAddress?.trim() || '',
          debt:toNum(debtByCurrency.IQD),
          totalPurchases:total,
          debtByCurrency,
          totalPurchasesByCurrency,
          createdAt:new Date().toISOString(),
          notes:'أُنشئ تلقائياً من قائمة الشراء',
        });
      }

      if (paidAmount > 0) {
        const voucherNo = genCode('V-P');
        const voucherAmount = purchaseCurrency === 'USD' ? paidAmountDisplay : paidAmount;
        const voucherCurrency = purchaseCurrency === 'USD' ? 'دولار أمريكي' : 'دينار عراقي';
        const voucherAmountIQDEntry = purchaseCurrency === 'USD' ? 0 : paidAmount;
        const voucherAmountUSDEntry = purchaseCurrency === 'USD' ? paidAmountDisplay : 0;
        await addDoc(collection(db,'pos_vouchers'),{
          voucherNo,
          type:'دفع',
          amount:voucherAmount,
          amountIQD:paidAmount,
          amountIQDEntry:voucherAmountIQDEntry,
          amountUSDEntry:voucherAmountUSDEntry,
          currency:voucherCurrency,
          exchangeRate: purchaseCurrency === 'USD' ? exchangeRate : 1,
          fromTo:supplierName || 'مورد عام',
          description:`دفعة تلقائية مرتبطة بفاتورة الشراء ${invoiceNo}`,
          paymentMethod:'نقدي',
          dateISO:tab.date||today(),
          date:nowStr(),
          source:'purchase_auto',
          linkedPurchaseId:purchaseRef.id,
          linkedPurchaseNo:invoiceNo,
          addedBy:user.name,
          status:'مؤكد',
          createdAt:new Date().toISOString(),
        });
        await setDoc(purchaseRef,{linkedVoucherNo:voucherNo},{ merge:true });
        purchase.linkedVoucherNo=voucherNo;
      }
      setCarts(c=>({...c,[tabId]:{...c[tabId],done:purchase,saving:false}}));
    }catch(e){console.error(e);updateCart(tabId,'saving',false);alert('خطأ في حفظ الفاتورة: '+getErrorMessage(e));}
  };

  const printPurchase=(inv)=>{
    const normalized = {
      ...inv,
      items: (inv.items || []).map((it) => ({ ...it, price: it.buyPrice ?? it.price })),
    };
    const ok = openProfessionalInvoicePrint(normalized, 'purchase');
    if (!ok) alert('تعذر فتح نافذة الطباعة. تأكد من السماح بالنوافذ المنبثقة.');
  };

  const sharePurchaseToWhatsApp = async (inv) => {
    const supplierPhone = inv?.supplierPhone
      || suppliers.find((s) => (inv?.supplierId && s.id === inv.supplierId) || s.name === inv?.supplier)?.phone
      || '';
    const result = await shareInvoiceOnWhatsApp({ invoice:inv, type:'purchase', phone:supplierPhone });
    if (!result.ok) {
      alert(explainWhatsAppError(result));
      return;
    }
    if (result.mode === 'cloud-api') {
      alert('✅ تم إرسال الفاتورة عبر WhatsApp Cloud API');
    } else if (result.manualAttachRequired) {
      alert(`✅ تم تنزيل ملف PDF (${result.fileName})\nافتح محادثة واتساب وأرفق الملف ثم أرسل.`);
    }
  };
  const saveEditedPurchase = async (updated) => {
    if (!updated?.id) return;
    const purchRef = doc(db, 'pos_purchases', updated.id);
    const oldSnap = await getDoc(purchRef);
    if (!oldSnap.exists()) return;
    const oldPurchase = { id:oldSnap.id, ...oldSnap.data() };
    const batch = writeBatch(db);

    const payload = {
      supplier: (updated.supplier || '').trim(),
      supplierId: updated.supplierId || '',
      supplierPhone: updated.supplierPhone || '',
      supplierAddress: updated.supplierAddress || '',
      paymentMethod: inferPaymentMethod(Number(updated.dueAmount || 0)),
      paymentStatus: Number(updated.dueAmount || 0) > 0 ? 'غير مدفوع' : 'مدفوع',
      currency: normalizeCurrencyCode(updated.currency || oldPurchase.currency || 'IQD'),
      exchangeRate: Number(updated.exchangeRate || oldPurchase.exchangeRate || exchangeRate || 1),
      items: (updated.items || []).map((it) => ({
        ...it,
        buyPrice: Number(it.buyPrice || it.price || 0),
        buyPriceDisplay: Number(it.buyPriceDisplay || it.buyPrice || it.price || 0),
        buyCurrency: it.buyCurrency || 'IQD',
        exchangeRate: Number(it.exchangeRate || exchangeRate || 1),
        qty: Number(it.qty || 0),
        qtyUnits: it.isPackage
          ? Number(it.qty || 0) * Math.max(1, Number(it.packageQty || 1))
          : Number(it.qty || 0),
        lineDiscount: Number(it.lineDiscount || 0),
        lineDiscountType: it.lineDiscountType || 'fixed',
        lineDiscountAmount: Number(it.lineDiscountAmount || 0),
        lineSubtotal: Number(it.lineSubtotal ?? Number(it.buyPrice || it.price || 0) * Number(it.qty || 0)),
        total: Number(it.total ?? Math.max(0, (Number(it.buyPrice || it.price || 0) * Number(it.qty || 0)) - Number(it.lineDiscountAmount || 0))),
      })),
      grossSubtotal: Number(updated.grossSubtotal || 0),
      itemDiscountAmount: Number(updated.itemDiscountAmount || 0),
      subtotal: Number(updated.subtotal || 0),
      discount: Number(updated.discount || 0),
      discountType: updated.discountType || 'percent',
      discountAmount: Number(updated.discountAmount || 0),
      total: Number(updated.total || 0),
      totalDisplay: Number(updated.totalDisplay || 0),
      paidAmount: clampAmount(resolvePaidAmountInput(updated.paidAmount, Number(updated.total || 0)), Number(updated.total || 0)),
      dueAmount: Number(updated.dueAmount || 0),
      dueCurrency: normalizeCurrencyCode(updated.dueCurrency || updated.currency || oldPurchase.dueCurrency || oldPurchase.currency || 'IQD'),
      dueAmountDisplay: Number(updated.dueAmountDisplay || 0),
      previousDebt: Number(updated.previousDebt || 0),
      accountTotal: Number(updated.accountTotal || 0),
      dateISO: updated.dateISO || today(),
      notes: updated.notes || '',
      updatedAt: new Date().toISOString(),
    };
    if (!payload.totalDisplay) payload.totalDisplay = amountInDisplayCurrency(payload.total, payload.currency, payload.exchangeRate);
    if (!payload.dueAmountDisplay) payload.dueAmountDisplay = amountInDisplayCurrency(payload.dueAmount, payload.dueCurrency, payload.exchangeRate);

    // 1) فروقات المخزون
    const sumQtyByProduct = (items = []) => {
      const out = {};
      (items || []).forEach((it) => {
        if (!it?.id) return;
        const qtyUnits = it.isPackage
          ? Number(it.qty || 0) * Math.max(1, Number(it.packageQty || 1))
          : Number(it.qty || 0);
        out[it.id] = Number(out[it.id] || 0) + qtyUnits;
      });
      return out;
    };
    const oldQtyMap = sumQtyByProduct(oldPurchase.items || []);
    const newQtyMap = sumQtyByProduct(payload.items || []);
    const productIds = [...new Set([...Object.keys(oldQtyMap), ...Object.keys(newQtyMap)])];
    for (const productId of productIds) {
      const oldQty = Number(oldQtyMap[productId] || 0);
      const newQty = Number(newQtyMap[productId] || 0);
      if (oldQty === newQty) continue;
      const stockDelta = newQty - oldQty;
      let base = products.find((p) => p.id === productId);
      if (!base) {
        const pSnap = await getDoc(doc(db, 'pos_products', productId));
        if (!pSnap.exists()) continue;
        base = { id:pSnap.id, ...pSnap.data() };
      }
      batch.update(doc(db, 'pos_products', productId), {
        stock: Number(base.stock || 0) + stockDelta,
      });
    }

    // 2) حسابات الموردين (إجمالي مشتريات + دين)
    const getSupplierDocByRef = async (id, name) => {
      if (id) {
        const snap = await getDoc(doc(db, 'pos_suppliers', id));
        if (snap.exists()) return { id:snap.id, data:snap.data() };
      }
      if (name) {
        const qy = query(collection(db, 'pos_suppliers'), where('name', '==', name));
        const snaps = await getDocs(qy);
        const d = snaps.docs[0];
        if (d) return { id:d.id, data:d.data() };
      }
      return null;
    };
    const queueSupplierLedger = (ref, deltaTotalPurchasesIQD, deltaDebtIQD, totalDisplayDeltas = {}, debtDisplayDeltas = {}) => {
      if (!ref) return;
      const nextTotalsByCurrency = { ...readTotalByCurrency(ref.data) };
      Object.entries(totalDisplayDeltas || {}).forEach(([code, delta]) => {
        const k = normalizeCurrencyCode(code);
        nextTotalsByCurrency[k] = Math.max(0, Number(nextTotalsByCurrency[k] || 0) + Number(delta || 0));
      });
      const nextDebtByCurrency = { ...readDebtByCurrency(ref.data) };
      Object.entries(debtDisplayDeltas || {}).forEach(([code, delta]) => {
        const k = normalizeCurrencyCode(code);
        nextDebtByCurrency[k] = Math.max(0, Number(nextDebtByCurrency[k] || 0) + Number(delta || 0));
      });
      batch.update(doc(db, 'pos_suppliers', ref.id), {
        totalPurchases: Math.max(0, Number(ref.data.totalPurchases || 0) + Number(deltaTotalPurchasesIQD || 0)),
        debt: Math.max(0, Number(nextDebtByCurrency.IQD || 0)),
        totalPurchasesByCurrency: nextTotalsByCurrency,
        debtByCurrency: nextDebtByCurrency,
      });
    };

    const oldSupplierName = (oldPurchase.supplier || '').trim();
    const newSupplierName = (payload.supplier || '').trim();
    const oldTotal = Number(oldPurchase.total || 0);
    const newTotal = Number(payload.total || 0);
    const oldDue = Number(oldPurchase.dueAmount ?? Math.max(0, oldTotal - Number(oldPurchase.paidAmount || 0)));
    const newDue = Number(payload.dueAmount ?? Math.max(0, newTotal - Number(payload.paidAmount || 0)));
    const oldCurrency = normalizeCurrencyCode(oldPurchase.currency || 'IQD');
    const newCurrency = normalizeCurrencyCode(payload.currency || 'IQD');
    const oldRate = Number(oldPurchase.exchangeRate || exchangeRate || 1);
    const newRate = Number(payload.exchangeRate || exchangeRate || 1);
    const oldDueCurrency = normalizeCurrencyCode(oldPurchase.dueCurrency || oldCurrency);
    const newDueCurrency = normalizeCurrencyCode(payload.dueCurrency || newCurrency);
    const oldTotalDisplay = Number(oldPurchase.totalDisplay ?? amountInDisplayCurrency(oldTotal, oldCurrency, oldRate));
    const newTotalDisplay = Number(payload.totalDisplay ?? amountInDisplayCurrency(newTotal, newCurrency, newRate));
    const oldDueDisplay = Number(oldPurchase.dueAmountDisplay ?? amountInDisplayCurrency(oldDue, oldDueCurrency, oldRate));
    const newDueDisplay = Number(payload.dueAmountDisplay ?? amountInDisplayCurrency(newDue, newDueCurrency, newRate));

    const oldSupp = oldSupplierName ? await getSupplierDocByRef(oldPurchase.supplierId, oldSupplierName) : null;
    let newSupp = newSupplierName ? await getSupplierDocByRef(payload.supplierId, newSupplierName) : null;

    if (!newSupp && newSupplierName) {
      const sRef = doc(collection(db, 'pos_suppliers'));
      batch.set(sRef, {
        name: newSupplierName,
        phone: payload.supplierPhone || '',
        address: payload.supplierAddress || '',
        notes: 'أُنشئ تلقائياً من تعديل فاتورة الشراء',
        debt: Math.max(0, Number(newDueCurrency === 'IQD' ? newDueDisplay : 0)),
        totalPurchases: Math.max(0, newTotal),
        debtByCurrency: applyCurrencyDelta({ IQD:0, USD:0 }, newDueCurrency, newDueDisplay),
        totalPurchasesByCurrency: applyCurrencyDelta({ IQD:0, USD:0 }, newCurrency, newTotalDisplay),
        createdAt: new Date().toISOString(),
      });
      payload.supplierId = sRef.id;
      newSupp = { id:sRef.id, data:{ debt:newDue, totalPurchases:newTotal, debtByCurrency:{ [newDueCurrency]:newDueDisplay }, totalPurchasesByCurrency:{ [newCurrency]:newTotalDisplay } } };
    }

    if (oldSupp && newSupp && oldSupp.id === newSupp.id) {
      queueSupplierLedger(oldSupp, newTotal - oldTotal, newDue - oldDue, {
        [oldCurrency]: -oldTotalDisplay,
        [newCurrency]: newTotalDisplay,
      }, {
        [oldDueCurrency]: -oldDueDisplay,
        [newDueCurrency]: newDueDisplay,
      });
    } else {
      if (oldSupp) queueSupplierLedger(oldSupp, -oldTotal, -oldDue, { [oldCurrency]: -oldTotalDisplay }, { [oldDueCurrency]: -oldDueDisplay });
      if (newSupp) queueSupplierLedger(newSupp, newTotal, newDue, { [newCurrency]: newTotalDisplay }, { [newDueCurrency]: newDueDisplay });
    }
    const supplierAccountBase = newSupp?.data ? readDebtByCurrency(newSupp.data) : { IQD:0, USD:0 };
    payload.previousDebt = Math.max(0, Number((supplierAccountBase[payload.dueCurrency] || 0) - newDueDisplay));
    payload.accountTotal = Math.max(0, Number(supplierAccountBase[payload.dueCurrency] || 0));

    // 3) سند الدفع المرتبط
    const findLinkedPurchaseVoucher = async () => {
      const byId = await getDocs(query(collection(db, 'pos_vouchers'), where('linkedPurchaseId', '==', oldPurchase.id)));
      if (!byId.empty) return { id:byId.docs[0].id, data:byId.docs[0].data() };
      if (oldPurchase.linkedVoucherNo) {
        const byNo = await getDocs(query(collection(db, 'pos_vouchers'), where('voucherNo', '==', oldPurchase.linkedVoucherNo)));
        if (!byNo.empty) return { id:byNo.docs[0].id, data:byNo.docs[0].data() };
      }
      if (oldPurchase.invoiceNo) {
        const byInv = await getDocs(query(collection(db, 'pos_vouchers'), where('linkedPurchaseNo', '==', oldPurchase.invoiceNo)));
        if (!byInv.empty) return { id:byInv.docs[0].id, data:byInv.docs[0].data() };
      }
      return null;
    };

    const existingVoucher = await findLinkedPurchaseVoucher();
    let linkedVoucherNo = oldPurchase.linkedVoucherNo || '';
    if (Number(payload.paidAmount || 0) > 0) {
      const voucherCurrencyCode = normalizeCurrencyCode(payload.currency || 'IQD');
      const voucherCurrency = voucherCurrencyCode === 'USD' ? 'دولار أمريكي' : 'دينار عراقي';
      const voucherRate = Number(payload.exchangeRate || exchangeRate || 1);
      const voucherAmount = voucherCurrencyCode === 'USD'
        ? amountInDisplayCurrency(Number(payload.paidAmount || 0), voucherCurrencyCode, voucherRate)
        : Number(payload.paidAmount || 0);
      const voucherAmountIQDEntry = voucherCurrencyCode === 'USD' ? 0 : Number(payload.paidAmount || 0);
      const voucherAmountUSDEntry = voucherCurrencyCode === 'USD'
        ? amountInDisplayCurrency(Number(payload.paidAmount || 0), voucherCurrencyCode, voucherRate)
        : 0;
      if (existingVoucher) {
        batch.update(doc(db, 'pos_vouchers', existingVoucher.id), {
          type: 'دفع',
          amount: voucherAmount,
          amountIQD: Number(payload.paidAmount || 0),
          amountIQDEntry: voucherAmountIQDEntry,
          amountUSDEntry: voucherAmountUSDEntry,
          currency: voucherCurrency,
          exchangeRate: voucherCurrencyCode === 'USD' ? voucherRate : 1,
          fromTo: newSupplierName || '-',
          paymentMethod: 'نقدي',
          description: `دفعة تلقائية مرتبطة بفاتورة الشراء ${oldPurchase.invoiceNo}`,
          dateISO: payload.dateISO || today(),
          date: nowStr(),
          linkedPurchaseId: oldPurchase.id,
          linkedPurchaseNo: oldPurchase.invoiceNo,
          updatedAt: new Date().toISOString(),
        });
        linkedVoucherNo = existingVoucher.data.voucherNo || linkedVoucherNo;
      } else {
        const voucherNo = genCode('V-P');
        const voucherRef = doc(collection(db, 'pos_vouchers'));
        batch.set(voucherRef, {
          voucherNo,
          type: 'دفع',
          amount: voucherAmount,
          amountIQD: Number(payload.paidAmount || 0),
          amountIQDEntry: voucherAmountIQDEntry,
          amountUSDEntry: voucherAmountUSDEntry,
          currency: voucherCurrency,
          exchangeRate: voucherCurrencyCode === 'USD' ? voucherRate : 1,
          fromTo: newSupplierName || '-',
          description: `دفعة تلقائية مرتبطة بفاتورة الشراء ${oldPurchase.invoiceNo}`,
          paymentMethod: 'نقدي',
          dateISO: payload.dateISO || today(),
          date: nowStr(),
          source: 'purchase_auto_edit',
          linkedPurchaseId: oldPurchase.id,
          linkedPurchaseNo: oldPurchase.invoiceNo,
          addedBy: user.name,
          status: 'مؤكد',
          createdAt: new Date().toISOString(),
        });
        linkedVoucherNo = voucherNo;
      }
    } else if (existingVoucher) {
      batch.delete(doc(db, 'pos_vouchers', existingVoucher.id));
      linkedVoucherNo = '';
    } else {
      linkedVoucherNo = '';
    }

    payload.linkedVoucherNo = linkedVoucherNo || '';
    batch.update(purchRef, payload);
    await batch.commit();
    setSelectedPurchase((prev) => (prev?.id === updated.id ? { ...prev, ...payload } : prev));
  };

  const listPurchases = purchases.filter((p)=>{
    const q = listSearch.trim();
    const d = p.dateISO || '';
    if (payFilter !== 'الكل' && p.paymentMethod !== payFilter) return false;
    if (dateFrom && d < dateFrom) return false;
    if (dateTo && d > dateTo) return false;
    if (!q) return true;
    return p.invoiceNo?.includes(q) || p.supplier?.includes(q) || p.addedBy?.includes(q) || p.linkedVoucherNo?.includes(q);
  });
  const listStats = {
    count:listPurchases.length,
    total:listPurchases.reduce((s,p)=>s+(p.total||0),0),
    unpaid:listPurchases.filter((p)=>(p.paymentStatus || (p.paymentMethod==='آجل'?'غير مدفوع':'مدفوع'))!=='مدفوع').length,
    cash:listPurchases.filter((p)=>p.paymentMethod==='نقدي').length,
  };

  if(view==='list') return(
    <div style={accountingStyles.page}>
      {selectedPurchase && (
        <PurchaseEditModal
          purchase={selectedPurchase}
          suppliers={suppliers}
          onSave={saveEditedPurchase}
          onClose={() => setSelectedPurchase(null)}
        />
      )}
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:16}}>
        <div style={accountingStyles.title}>قائمة فواتير الشراء</div>
        <button onClick={()=>setView('pos')} style={accountingStyles.primaryButton}>+ فاتورة شراء</button>
      </div>

      <div style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:10,marginBottom:12}}>
        {[
          ['عدد الفواتير',listStats.count,'#1f6feb'],
          ['إجمالي المشتريات',fmt(listStats.total),'#0f766e'],
          ['غير المدفوع',listStats.unpaid,'#d97706'],
          ['فواتير نقدي',listStats.cash,'#059669'],
        ].map(([label,val,color])=>(
          <div key={label} style={accountingStyles.card}>
            <div style={{color:'#64748b',fontSize:11,marginBottom:3}}>{label}</div>
            <div style={{color,fontSize:16,fontWeight:900}}>{val}</div>
          </div>
        ))}
      </div>

      <div style={{display:'grid',gridTemplateColumns:'2fr 1fr 1fr 1fr auto',gap:8,marginBottom:12}}>
        <input value={listSearch} onChange={(e)=>setListSearch(e.target.value)} placeholder="بحث برقم الفاتورة / المورد / المستخدم / السند"
          style={accountingStyles.input}/>
        <select value={payFilter} onChange={(e)=>setPayFilter(e.target.value)}
          style={{...accountingStyles.input,padding:'9px 10px',fontFamily:"'Cairo'"}}>
          {['الكل','نقدي','آجل'].map((m)=><option key={m} value={m}>{m}</option>)}
        </select>
        <input type="date" value={dateFrom} onChange={(e)=>setDateFrom(e.target.value)} style={{...accountingStyles.input,padding:'9px 10px'}}/>
        <input type="date" value={dateTo} onChange={(e)=>setDateTo(e.target.value)} style={{...accountingStyles.input,padding:'9px 10px'}}/>
        <button onClick={()=>{setListSearch('');setPayFilter('الكل');setDateFrom('');setDateTo('');}}
          style={{background:'#fff',border:'1px solid #cdd8ec',borderRadius:10,padding:'9px 12px',color:'#334155',fontSize:12,cursor:'pointer',fontFamily:"'Cairo'"}}>
          إعادة ضبط
        </button>
      </div>

      <div style={accountingStyles.tableWrap}>
        <div style={{...accountingStyles.tableHead,display:'grid',gridTemplateColumns:'1fr 1.3fr 1fr 1fr 1fr 1fr 1fr 1fr auto auto auto',padding:'11px 18px'}}>
          {['رقم الفاتورة','المورد','المبلغ الكلي','الواصل','المتبقي','الدفع','الحالة','سند الدفع','التاريخ','',''].map(h=><div key={h} style={{color:'#334155',fontSize:10,fontWeight:800}}>{h}</div>)}
        </div>
        {!listPurchases.length && <div style={{padding:30,textAlign:'center',color:'#64748b',fontSize:12}}>لا توجد نتائج مطابقة</div>}
        {listPurchases.map((p,i)=>(
          <div key={p.id} style={{display:'grid',gridTemplateColumns:'1fr 1.3fr 1fr 1fr 1fr 1fr 1fr 1fr auto auto auto',padding:'10px 18px',borderBottom:i<listPurchases.length-1?'1px solid #eef2fa':'none',alignItems:'center',background:i%2===0?'#fff':'#f8fbff'}}>
            <div style={{color:'#0f766e',fontSize:11,fontWeight:800}}>{p.invoiceNo}</div>
            <div style={{color:'#1e293b',fontSize:11,fontWeight:700}}>{p.supplier}</div>
            <div style={{color:'#0f766e',fontSize:12,fontWeight:900}}>{fmt(p.total)}</div>
            <div style={{color:'#2563eb',fontSize:11,fontWeight:700}}>{fmt(p.paidAmount||0)}</div>
            <div style={{color:(p.dueAmount||0)>0?'#c2410c':'#047857',fontSize:11,fontWeight:700}}>{fmt(p.dueAmount||0)}</div>
            <span style={{...paymentBadgeStyle(p.paymentMethod),borderRadius:20,padding:'2px 7px',fontSize:9,fontWeight:700,display:'inline-block'}}>{p.paymentMethod}</span>
            <span style={{...statusBadgeStyle(p.paymentStatus|| (p.paymentMethod==='آجل'?'غير مدفوع':'مدفوع')),borderRadius:20,padding:'2px 7px',fontSize:9,fontWeight:700,display:'inline-block'}}>
              {p.paymentStatus|| (p.paymentMethod==='آجل'?'غير مدفوع':'مدفوع')}
            </span>
            <div style={{color:'#1f6feb',fontSize:10,fontWeight:700}}>{p.linkedVoucherNo || '—'}</div>
            <div style={{color:'#475569',fontSize:10}}>{p.dateISO}</div>
            <button onClick={() => printPurchase(p)} style={{background:'#e8f1ff',border:'1px solid #bfdbfe',borderRadius:8,padding:'4px 10px',color:'#1f6feb',fontSize:10,cursor:'pointer',fontFamily:"'Cairo'",fontWeight:700}}>
              طباعة
            </button>
            <button onClick={() => sharePurchaseToWhatsApp(p)} style={{background:'#ecfdf5',border:'1px solid #a7f3d0',borderRadius:8,padding:'4px 10px',color:'#047857',fontSize:10,cursor:'pointer',fontFamily:"'Cairo'",fontWeight:700}}>
              واتساب
            </button>
            <button onClick={() => setSelectedPurchase(p)} style={{background:'#ecfeff',border:'1px solid #99f6e4',borderRadius:8,padding:'4px 10px',color:'#0f766e',fontSize:10,cursor:'pointer',fontFamily:"'Cairo'",fontWeight:700}}>
              تعديل
            </button>
          </div>
        ))}
      </div>
    </div>
  );

  return(
    <div style={{display:'flex',flexDirection:'column',height:'100%',minHeight:0,fontFamily:"'Cairo'",direction:'rtl',overflow:'hidden',background:'#f3f6fb'}}>
      {popup&&<ProductPopup {...popup} onClose={()=>setPopup(null)}/>}
      <ProductPickerModal
        initialSearch={productSearchModal}
        user={user}
        onProductSaved={(product)=>{
          if (product?.id) addToTab(activeTab, product, 'unit');
          setProductSearchModal('');
          setSearch('');
        }}
        onClose={()=>setProductSearchModal('')}
      />

      {/* شريط التبويبات */}
      <div style={{background:'#ffffff',borderBottom:'1px solid #ffffff',display:'flex',alignItems:'flex-end',padding:'4px 8px 0',flexShrink:0,gap:2,overflowX:'auto'}}>
        <button onClick={()=>setView('list')} style={{background:'#ffffff',border:'1px solid #d9e2f2',borderBottom:'none',borderRadius:'7px 7px 0 0',padding:'5px 12px',color:'#64748b',cursor:'pointer',fontSize:10,fontWeight:600,flexShrink:0,marginLeft:4}}>
          📋 القائمة
        </button>
        {tabs.map(tab=>(
          <div key={tab.id}
            style={{display:'flex',alignItems:'center',gap:5,background:activeTab===tab.id?'#ffffff':'#ffffff',border:`1px solid ${activeTab===tab.id?'#f59e0b33':'#ffffff'}`,borderBottom:'none',borderRadius:'7px 7px 0 0',padding:'5px 10px',cursor:'pointer',flexShrink:0,position:'relative',top:1}}>
            <span onClick={()=>setActiveTab(tab.id)} style={{color:activeTab===tab.id?'#f59e0b':'#64748b',fontSize:10,fontWeight:activeTab===tab.id?700:400,whiteSpace:'nowrap'}}>
              🛍️ {tab.label}
              {(carts[tab.id]?.items?.length||0)>0&&<span style={{background:'#f59e0b',borderRadius:10,padding:'0 4px',color:'#000',fontSize:8,marginRight:3,fontWeight:800}}>{carts[tab.id].items.length}</span>}
            </span>
            {tabs.length>1&&<span onClick={e=>{e.stopPropagation();closeTab(tab.id);}} style={{color:'#475569',fontSize:11,cursor:'pointer'}}>✕</span>}
          </div>
        ))}
        <button onClick={addTab} style={{background:'none',border:'1px solid #ffffff',borderBottom:'none',borderRadius:'7px 7px 0 0',color:'#64748b',cursor:'pointer',fontSize:16,padding:'3px 10px',flexShrink:0}}>＋</button>
      </div>

      <div style={{flex:1,display:'flex',overflow:'auto',flexWrap:'wrap',alignItems:'stretch',minHeight:0}}>
        {/* المنتجات */}
        <div style={{flex:'999 1 540px',minWidth:0,display:'flex',flexDirection:'column',overflow:'hidden'}}>
          <div style={{padding:'6px 10px',borderBottom:'1px solid #ffffff'}}>
            <input value={search} onChange={e=>setSearch(e.target.value)} onKeyDown={handleSearchEnter} placeholder="🔍 اسم / باركود..."
              style={{width:'100%',color:'#0f172a',fontSize:12,outline:'none',boxSizing:'border-box',marginBottom:5}}/>
            <div style={{display:'flex',gap:5,overflowX:'auto',paddingBottom:2}}>
              {cats.map(c=>(
                <button key={c} onClick={()=>setCatFilter(c)}
                  style={{background:catFilter===c?'#f59e0b':'#ffffff',color:catFilter===c?'#000':'#64748b',border:`1px solid ${catFilter===c?'#f59e0b':'#d9e2f2'}`,borderRadius:20,padding:'3px 10px',fontSize:10,cursor:'pointer',whiteSpace:'nowrap',fontWeight:catFilter===c?700:400}}>
                  {c}
                </button>
              ))}
            </div>
          </div>
          <div style={{flex:1,overflowY:'auto',padding:8,minHeight:280}}>
            <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill, minmax(120px, 1fr))',gap:7}}>
              {filtered.map(p=>{
                const pkg=packages.find(pk=>pk.id===p.packageTypeId);
                return(
                  <div key={p.id} onContextMenu={e=>{e.preventDefault();setPopup({product:p,pkg,pos:{x:Math.min(e.clientX,window.innerWidth-280),y:Math.min(e.clientY,window.innerHeight-350)}});}}
                    style={{background:'#ffffff',borderRadius:11,border:'1px solid #252525',overflow:'hidden',cursor:'context-menu'}}>
                    <div style={{padding:'8px 8px 4px',textAlign:'center'}}>
                      {p.imgUrl?<img src={p.imgUrl} loading="lazy" decoding="async" style={{width:48,height:48,objectFit:'cover',borderRadius:7,marginBottom:4}} alt=""/>
                        :<div style={{fontSize:28,marginBottom:4}}>{p.img||'📦'}</div>}
                      <div style={{color:'#334155',fontSize:10,fontWeight:600,marginBottom:1}}>{p.name?.length>13?p.name.slice(0,13)+'…':p.name}</div>
                      <div style={{color:'#64748b',fontSize:9}}>مخزون: {p.stock||0}</div>
                    </div>
                    <button onClick={()=>addToTab(activeTab,p,'unit')}
                      style={{width:'100%',padding:'7px',background:'none',border:'none',borderTop:'1px solid #e2e8f7',cursor:'pointer'}}
                      onMouseEnter={e=>e.currentTarget.style.background='#f59e0b12'}
                      onMouseLeave={e=>e.currentTarget.style.background='none'}>
                      <div style={{color:'#f59e0b',fontSize:11,fontWeight:800}}>مفرد {fmtByCurrency(toNum(p.buyPrice||0), activeCurrency, exchangeRate)}</div>
                    </button>
                    {pkg && (
                      <button onClick={()=>addToTab(activeTab,p,'package')}
                        style={{width:'100%',padding:'7px',background:'#f8fbff',border:'none',borderTop:'1px solid #e2e8f7',cursor:'pointer'}}
                        onMouseEnter={e=>e.currentTarget.style.background='#f59e0b12'}
                        onMouseLeave={e=>e.currentTarget.style.background='#f8fbff'}>
                        <div style={{color:'#1f6feb',fontSize:10,fontWeight:800}}>
                          {pkg.name} ({Number(pkg.qty||1)}): {fmtByCurrency(
                            Number(p.packageBuyPrice || (Number(p.buyPrice||0)*Number(pkg.qty||1))),
                            activeCurrency,
                            exchangeRate,
                          )}
                        </div>
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* فاتورة الشراء */}
        {tabs.map(tab=>{
          const cart=carts[tab.id]||{items:[],supplier:'',supplierPhone:'',supplierAddress:'',paidAmountInput:'',currency:'IQD',date:today(),notes:''};
          const grossSubtotal=cart.items.reduce((s,i)=>s+(toNum(i.buyPriceIQD ?? i.buyPrice)||0)*toNum(i.qty),0);
          const itemDiscountTotal=cart.items.reduce((s,i)=>s+calcLineDiscountAmount(i),0);
          const subtotal=Math.max(0, grossSubtotal-itemDiscountTotal);
          const discAmt=cart.discountType==='percent'
            ? subtotal*(Number(cart.discount||0)/100)
            : Math.min(Number(cart.discount||0),subtotal);
          const total=subtotal-discAmt;
          const paidAmount=clampAmount(resolvePaidAmountInput(cart.paidAmountInput ?? cart.paidAmount, total), total);
          const dueAmount=Math.max(0,total-paidAmount);
          const paymentMethod=inferPaymentMethod(dueAmount);
          const matchedSupplier=suppliers.find(s=>s.name===cart.supplier.trim());
          const previousDebtByCurrency=matchedSupplier ? readDebtByCurrency(matchedSupplier) : { IQD:0, USD:0 };
          const previousDebtDisplay=Number(previousDebtByCurrency[normalizeCurrencyCode(cart.currency || 'IQD')] || 0);
          const accountTotal=Math.max(0, previousDebtDisplay + amountInDisplayCurrency(dueAmount, cart.currency || 'IQD', exchangeRate));
          if(activeTab!==tab.id)return null;
          if(cart.done) return(
            <div key={tab.id} style={{flex:'1 1 340px',width:'min(100%, 360px)',maxWidth:'100%',background:'#ffffff',display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',padding:24,borderRight:'1px solid #ffffff'}}>
              <div style={{fontSize:60,marginBottom:10}}>✅</div>
              <div style={{color:'#f59e0b',fontSize:18,fontWeight:800,marginBottom:4}}>تم تسجيل الشراء!</div>
              <div style={{color:'#64748b',fontSize:12,marginBottom:16}}>{cart.done.invoiceNo}</div>
              <div style={{background:'#ffffff',borderRadius:12,padding:16,border:'1px solid #d9e2f2',width:'100%',marginBottom:16}}>
                <div style={{display:'flex',justifyContent:'space-between',padding:'7px 0',borderBottom:'1px solid #e2e8f7'}}>
                  <span style={{color:'#64748b',fontSize:12}}>المورد</span><span style={{color:'#1e293b',fontWeight:700,fontSize:13}}>{cart.done.supplier}</span>
                </div>
                <div style={{display:'flex',justifyContent:'space-between',padding:'7px 0',borderBottom:'1px solid #e2e8f7'}}>
                  <span style={{color:'#64748b',fontSize:12}}>الإجمالي</span><span style={{color:'#f59e0b',fontWeight:800,fontSize:16}}>{fmtByCurrency(cart.done.total, cart.done.currency || 'IQD', cart.done.exchangeRate || exchangeRate)}</span>
                </div>
                <div style={{display:'flex',justifyContent:'space-between',padding:'7px 0',borderBottom:'1px solid #e2e8f7'}}>
                  <span style={{color:'#64748b',fontSize:12}}>الواصل</span><span style={{color:'#2563eb',fontWeight:800,fontSize:13}}>{fmtByCurrency(cart.done.paidAmount || 0, cart.done.currency || 'IQD', cart.done.exchangeRate || exchangeRate)}</span>
                </div>
                <div style={{display:'flex',justifyContent:'space-between',padding:'7px 0',borderBottom:'1px solid #e2e8f7'}}>
                  <span style={{color:'#64748b',fontSize:12}}>المتبقي</span><span style={{color:(cart.done.dueAmount||0)>0?'#f59e0b':'#10b981',fontWeight:800,fontSize:13}}>{fmtByCurrency(cart.done.dueAmount || 0, cart.done.currency || 'IQD', cart.done.exchangeRate || exchangeRate)}</span>
                </div>
                {(cart.done.accountTotal||0)>0&&<div style={{display:'flex',justifyContent:'space-between',padding:'7px 0',borderBottom:'1px solid #e2e8f7'}}>
                  <span style={{color:'#64748b',fontSize:12}}>الحساب الكلي</span><span style={{color:'#7C3AED',fontWeight:800,fontSize:13}}>{fmtByCurrency(cart.done.accountTotal || 0, cart.done.currency || 'IQD', cart.done.exchangeRate || exchangeRate)}</span>
                </div>}
                <div style={{display:'flex',justifyContent:'space-between',padding:'7px 0'}}>
                  <span style={{color:'#64748b',fontSize:12}}>الحالة</span><span style={{color:(cart.done.dueAmount||0)>0?'#f59e0b':'#10b981',fontWeight:800,fontSize:13}}>{cart.done.paymentMethod}</span>
                </div>
              </div>
              <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:8,width:'100%'}}>
                <button onClick={()=>printPurchase(cart.done)} style={{flex:1,background:'#3b82f6',color:'#fff',border:'none',borderRadius:10,padding:10,fontWeight:700,cursor:'pointer',fontFamily:"'Cairo'",fontSize:12}}>🖨️ طباعة</button>
                <button onClick={()=>sharePurchaseToWhatsApp(cart.done)} style={{flex:1,background:'#10b981',color:'#fff',border:'none',borderRadius:10,padding:10,fontWeight:700,cursor:'pointer',fontFamily:"'Cairo'",fontSize:12}}>واتساب</button>
                <button onClick={()=>setCarts(c=>({...c,[tab.id]:{items:[],supplier:'',supplierPhone:'',supplierAddress:'',paidAmountInput:'',currency:getPreferredCurrency(),date:today(),notes:'',discount:0,discountType:'percent',saving:false,done:null}}))} style={{flex:1,background:'#f59e0b',color:'#000',border:'none',borderRadius:10,padding:10,fontWeight:700,cursor:'pointer',fontFamily:"'Cairo'",fontSize:12}}>+ جديدة</button>
              </div>
            </div>
          );
          return(
            <div key={tab.id} style={{flex:'1 1 340px',width:'min(100%, 360px)',maxWidth:'100%',background:'#ffffff',display:'flex',flexDirection:'column',borderRight:'1px solid #ffffff',overflow:'hidden',minWidth:0}}>
              <div style={{padding:'8px 10px',borderBottom:'1px solid #ffffff'}}>
                <input value={cart.supplier} onChange={e=>{
                  const value = e.target.value;
                  const found = suppliers.find((s) => s.name === value);
                  updateCart(tab.id,'supplier',value);
                  if (found) {
                    updateCart(tab.id,'supplierPhone',found.phone || '');
                    updateCart(tab.id,'supplierAddress',found.address || '');
                  }
                }} list={`sl-${tab.id}`} placeholder="اسم المورد (مطلوب عند وجود متبقي)"
                  style={{width:'100%',background:'#ffffff',border:`1px solid ${paymentMethod==='آجل'&&isGeneralSupplierName(cart.supplier)?'#ef444430':'#d9e2f2'}`,borderRadius:8,padding:'6px 10px',color:'#0f172a',fontSize:12,outline:'none',fontFamily:"'Cairo'",boxSizing:'border-box',marginBottom:5}}/>
                <datalist id={`sl-${tab.id}`}>{suppliers.map(s=><option key={s.id} value={s.name}/>)}</datalist>
                <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:6,marginBottom:6}}>
                  <input value={cart.supplierPhone || ''} onChange={e=>updateCart(tab.id,'supplierPhone',e.target.value)} placeholder="هاتف المورد"
                    style={{color:'#0f172a',fontSize:10,outline:'none'}}/>
                  <input value={cart.supplierAddress || ''} onChange={e=>updateCart(tab.id,'supplierAddress',e.target.value)} placeholder="عنوان المورد"
                    style={{color:'#0f172a',fontSize:10,outline:'none'}}/>
                </div>
                <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:6,marginBottom:6}}>
                  <input type="date" value={cart.date||today()} onChange={e=>updateCart(tab.id,'date',e.target.value)}
                    style={{color:'#0f172a',fontSize:10,outline:'none'}}/>
                  <div />
                </div>
                <div style={{display:'flex',alignItems:'center',gap:5}}>
                  {['IQD','USD'].map((c)=>(
                    <button key={c} onClick={()=>updateCart(tab.id,'currency',c)}
                      style={{background:(cart.currency||'IQD')===c?'#e8f1ff':'#fff',color:(cart.currency||'IQD')===c?'#1f6feb':'#64748b',border:`1px solid ${(cart.currency||'IQD')===c?'#93c5fd':'#d9e2f2'}`,borderRadius:7,padding:'3px 8px',fontSize:9,cursor:'pointer',fontWeight:(cart.currency||'IQD')===c?700:500}}>
                      {c==='IQD'?'دينار':'دولار $'}
                    </button>
                  ))}
                  {(cart.currency||'IQD')==='USD'&&<span style={{color:'#64748b',fontSize:9}}>1$ = {toNum(exchangeRate).toLocaleString('ar-IQ')} د.ع</span>}
                </div>
              </div>
              <div style={{flex:1,overflowY:'auto',padding:6}}>
                {!cart.items.length?<div style={{color:'#e2e8f7',textAlign:'center',padding:30,fontSize:12}}>اضغط على مادة لإضافتها</div>
                  :cart.items.map(item=>(
                  <div key={item.key||item.id} style={{background:'#f8fbff',borderRadius:9,padding:7,marginBottom:5,border:'1px solid #1e1e1e'}}>
                    <div style={{display:'flex',gap:6,alignItems:'center',marginBottom:5}}>
                      {item.imgUrl?<img src={item.imgUrl} loading="lazy" decoding="async" style={{width:20,height:20,borderRadius:3,objectFit:'cover'}} alt=""/>:<span style={{fontSize:13}}>{item.img||'📦'}</span>}
                      <span style={{color:'#334155',fontSize:11,fontWeight:600,flex:1}}>{item.name?.length>18?item.name.slice(0,18)+'…':item.name}</span>
                      {item.isPackage&&<span style={{background:'#e8f1ff',color:'#1f6feb',border:'1px solid #bfdbfe',borderRadius:999,padding:'1px 6px',fontSize:8,fontWeight:800}}>{item.packageName||'تعبئة'} × {item.packageQty||1}</span>}
                      <button onClick={()=>removeFromTab(tab.id,item.key||item.id)} style={{background:'none',border:'none',color:'#ef4444',cursor:'pointer',fontSize:12}}>✕</button>
                    </div>
                    <div style={{display:'flex',gap:5,alignItems:'center'}}>
                      <input type="text" inputMode="decimal" value={item.buyPrice} onChange={e=>updateCart(tab.id,'buyPrice',e.target.value,item.key||item.id)} onDoubleClick={selectFieldValue}
                        style={{width:75,background:'#ffffff',border:'1px solid #d9e2f2',borderRadius:5,padding:'3px 5px',color:'#f59e0b',fontSize:10,outline:'none'}}/>
                      <select value={item.buyCurrency||'IQD'} onChange={e=>updateCart(tab.id,'buyCurrency',e.target.value,item.key||item.id)}
                        style={{width:56,background:'#fff',border:'1px solid #d9e2f2',borderRadius:5,padding:'2px 3px',fontSize:9,color:'#475569',outline:'none'}}>
                        <option value="IQD">د.ع</option>
                        <option value="USD">$</option>
                      </select>
                      <div style={{display:'flex',gap:3,alignItems:'center',marginRight:'auto'}}>
                        <button onClick={()=>updateCart(tab.id,'qty',item.qty-1<1?1:item.qty-1,item.key||item.id)} style={{width:20,height:20,borderRadius:4,background:'#d9e2f2',border:'none',color:'#f59e0b',cursor:'pointer',fontSize:12,lineHeight:1}}>−</button>
                        <input type="text" inputMode="numeric" value={item.qty} onChange={e=>updateCart(tab.id,'qty',Number(e.target.value)||1,item.key||item.id)} onDoubleClick={selectFieldValue}
                          style={{width:30,color:'#0f172a',fontSize:10,outline:'none',textAlign:'center'}}/>
                        <button onClick={()=>updateCart(tab.id,'qty',item.qty+1,item.key||item.id)} style={{width:20,height:20,borderRadius:4,background:'#d9e2f2',border:'none',color:'#f59e0b',cursor:'pointer',fontSize:12,lineHeight:1}}>+</button>
                      </div>
                      <span style={{color:'#f59e0b',fontSize:10,fontWeight:700,minWidth:60,textAlign:'left'}}>{fmtByCurrency(calcLineTotal(item), cart.currency || 'IQD', exchangeRate)}</span>
                    </div>
                    {(item.buyCurrency||'IQD')==='USD'&&(
                      <div style={{color:'#64748b',fontSize:9,marginTop:2}}>
                        سعر مكافئ: {fmt(toNum(item.buyPriceIQD || 0))}
                      </div>
                    )}
                    <div style={{display:'flex',alignItems:'center',gap:4,marginTop:4}}>
                      <span style={{color:'#64748b',fontSize:9}}>خصم</span>
                      <input type="text" inputMode="decimal" value={item.lineDiscount||0} onChange={e=>updateCart(tab.id,'lineDiscount',Number(e.target.value)||0,item.key||item.id)} onDoubleClick={selectFieldValue}
                        style={{width:52,background:'#fff',border:'1px solid #d9e2f2',borderRadius:5,padding:'2px 4px',fontSize:9,color:'#ef4444',textAlign:'center'}}/>
                      <div style={{display:'flex',border:'1px solid #d9e2f2',borderRadius:5,overflow:'hidden'}}>
                        <button onClick={()=>updateCart(tab.id,'lineDiscountType','percent',item.key||item.id)}
                          style={{padding:'2px 5px',background:(item.lineDiscountType||'fixed')==='percent'?'#f59e0b':'#fff',color:(item.lineDiscountType||'fixed')==='percent'?'#000':'#64748b',border:'none',fontSize:8,cursor:'pointer'}}>%</button>
                        <button onClick={()=>updateCart(tab.id,'lineDiscountType','fixed',item.key||item.id)}
                          style={{padding:'2px 5px',background:(item.lineDiscountType||'fixed')==='fixed'?'#f59e0b':'#fff',color:(item.lineDiscountType||'fixed')==='fixed'?'#000':'#64748b',border:'none',fontSize:8,cursor:'pointer'}}>د.ع</button>
                      </div>
                      {calcLineDiscountAmount(item)>0&&<span style={{color:'#ef4444',fontSize:9,fontWeight:700,marginRight:'auto'}}>- {fmtByCurrency(calcLineDiscountAmount(item), cart.currency || 'IQD', exchangeRate)}</span>}
                    </div>
                  </div>
                ))}
              </div>
              <div style={{padding:'8px 10px',borderTop:'1px solid #e2e8f7',background:'#ffffff'}}>
                <input value={cart.notes||''} onChange={e=>updateCart(tab.id,'notes',e.target.value)} placeholder="ملاحظات..."
                  style={{width:'100%',background:'#f8fbff',border:'1px solid #d9e2f2',borderRadius:7,padding:'5px 8px',color:'#64748b',fontSize:10,outline:'none',marginBottom:7,boxSizing:'border-box',fontFamily:"'Cairo'"}}/>
                {/* المجموع الفرعي */}
                <div style={{display:'flex',justifyContent:'space-between',marginBottom:4}}>
                  <span style={{color:'#64748b',fontSize:11}}>مجموع قبل خصم المواد</span>
                  <span style={{color:'#334155',fontSize:11}}>{fmtByCurrency(grossSubtotal, cart.currency || 'IQD', exchangeRate)}</span>
                </div>
                {itemDiscountTotal>0&&<div style={{display:'flex',justifyContent:'space-between',marginBottom:4}}>
                  <span style={{color:'#ef4444',fontSize:10}}>خصم المواد</span>
                  <span style={{color:'#ef4444',fontSize:10}}>- {fmtByCurrency(itemDiscountTotal, cart.currency || 'IQD', exchangeRate)}</span>
                </div>}
                <div style={{display:'flex',justifyContent:'space-between',marginBottom:4}}>
                  <span style={{color:'#64748b',fontSize:11}}>الصافي قبل الخصم العام</span>
                  <span style={{color:'#334155',fontSize:11}}>{fmtByCurrency(subtotal, cart.currency || 'IQD', exchangeRate)}</span>
                </div>
                {/* الخصم: نسبة أو مقطوع */}
                <div style={{display:'flex',alignItems:'center',gap:4,marginBottom:4}}>
                  <div style={{display:'flex',borderRadius:6,overflow:'hidden',border:'1px solid #cdd8ec',flexShrink:0}}>
                    <button onClick={()=>updateCart(tab.id,'discountType','percent')}
                      style={{padding:'3px 7px',background:cart.discountType==='percent'?'#f59e0b':'#fff',color:cart.discountType==='percent'?'#fff':'#64748b',border:'none',cursor:'pointer',fontSize:10,fontWeight:700}}>%</button>
                    <button onClick={()=>updateCart(tab.id,'discountType','fixed')}
                      style={{padding:'3px 7px',background:cart.discountType==='fixed'?'#f59e0b':'#fff',color:cart.discountType==='fixed'?'#fff':'#64748b',border:'none',cursor:'pointer',fontSize:10,fontWeight:700}}>مقطوع</button>
                  </div>
                  <span style={{color:'#64748b',fontSize:11}}>خصم</span>
                  <input type="text" inputMode="decimal" value={cart.discount||0} onChange={e=>updateCart(tab.id,'discount',Number(e.target.value))} onDoubleClick={selectFieldValue}
                    style={{flex:1,background:'#fff',border:'1px solid #cdd8ec',borderRadius:6,padding:'3px 5px',color:'#f59e0b',fontSize:11,outline:'none',textAlign:'center'}}/>
                  <span style={{color:'#64748b',fontSize:10}}>{cart.discountType==='percent'?'%':((cart.currency||'IQD')==='USD'?'$':'د.ع')}</span>
                </div>
                {discAmt>0&&<div style={{display:'flex',justifyContent:'space-between',marginBottom:4}}>
                  <span style={{color:'#ef4444',fontSize:10}}>الخصم</span>
                  <span style={{color:'#ef4444',fontSize:10}}>- {fmtByCurrency(discAmt, cart.currency || 'IQD', exchangeRate)}</span>
                </div>}
                <div style={{display:'flex',justifyContent:'space-between',borderTop:'1px solid #e2e8f7',paddingTop:6,marginBottom:8}}>
                  <span style={{color:'#1e293b',fontWeight:800,fontSize:13}}>المبلغ الكلي</span>
                  <div style={{textAlign:'left'}}>
                    <div style={{color:'#f59e0b',fontWeight:900,fontSize:18}}>{fmtByCurrency(total, cart.currency || 'IQD', exchangeRate)}</div>
                    {(cart.currency||'IQD')==='USD'&&<div style={{color:'#64748b',fontSize:9}}>{fmt(total)}</div>}
                  </div>
                </div>
                <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8,marginBottom:8}}>
                  <div style={{background:'#dbeafe',border:'1px solid #93c5fd',borderRadius:8,padding:10,textAlign:'center'}}>
                    <div style={{color:'#2563eb',fontSize:10,marginBottom:3}}>المبلغ الواصل</div>
                    <InlineAmountInput
                      key={String(cart.paidAmountInput ?? cart.paidAmount ?? '')}
                      value={cart.paidAmountInput ?? cart.paidAmount ?? ''}
                      max={total}
                      placeholder={fmtByCurrency(total, cart.currency || 'IQD', exchangeRate)}
                      onChangeValue={(nextValue) => updateCart(tab.id,'paidAmountInput',nextValue)}
                    />
                  </div>
                  <div style={{background:dueAmount>0?'#fff7ed':'#ecfdf5',border:`1px solid ${dueAmount>0?'#fdba74':'#86efac'}`,borderRadius:8,padding:10,textAlign:'center'}}>
                    <div style={{color:dueAmount>0?'#c2410c':'#047857',fontSize:10,marginBottom:3}}>المبلغ المتبقي</div>
                    <div style={{color:dueAmount>0?'#c2410c':'#047857',fontSize:14,fontWeight:900}}>{fmtByCurrency(dueAmount, cart.currency || 'IQD', exchangeRate)}</div>
                  </div>
                </div>
                {cart.supplier.trim()&&previousDebtDisplay>0&&<div style={{display:'flex',justifyContent:'space-between',background:'#fff7ed',border:'1px solid #fdba74',borderRadius:8,padding:'7px 10px',marginBottom:8}}>
                  <span style={{color:'#64748b',fontSize:11}}>الدين السابق</span>
                  <span style={{color:'#c2410c',fontSize:11,fontWeight:800}}>{fmtByCurrency(previousDebtDisplay, cart.currency || 'IQD', exchangeRate)}</span>
                </div>}
                {cart.supplier.trim()&&accountTotal>0&&<div style={{display:'flex',justifyContent:'space-between',background:'#f3e8ff',border:'1px solid #d8b4fe',borderRadius:8,padding:'7px 10px',marginBottom:8}}>
                  <span style={{color:'#64748b',fontSize:11}}>مبلغ الحساب الكلي</span>
                  <span style={{color:'#7C3AED',fontSize:11,fontWeight:800}}>{fmtByCurrency(accountTotal, cart.currency || 'IQD', exchangeRate)}</span>
                </div>}
                <div style={{display:'flex',justifyContent:'space-between',background:'#f8fbff',border:'1px solid #d9e2f2',borderRadius:8,padding:'7px 10px',marginBottom:8}}>
                  <span style={{color:'#64748b',fontSize:11}}>حالة الفاتورة</span>
                  <span style={{color:paymentMethod==='آجل'?'#f59e0b':'#10b981',fontSize:11,fontWeight:800}}>{paymentMethod}</span>
                </div>
                {paymentMethod==='آجل'&&isGeneralSupplierName(cart.supplier)&&<div style={{color:'#dc2626',fontSize:10,textAlign:'center',marginBottom:6}}>حدّد اسم المورد إذا كان هناك مبلغ متبقٍ</div>}
                <button onClick={()=>save(tab.id)} disabled={cart.saving||!cart.items.length||(paymentMethod==='آجل'&&isGeneralSupplierName(cart.supplier))}
                  style={{width:'100%',background:(!cart.items.length||(paymentMethod==='آجل'&&isGeneralSupplierName(cart.supplier)))?'#f8fbff':'linear-gradient(135deg,#f59e0b,#d97706)',color:(!cart.items.length||(paymentMethod==='آجل'&&isGeneralSupplierName(cart.supplier)))?'#cdd8ec':'#000',border:'none',borderRadius:10,padding:12,fontWeight:800,fontSize:13,cursor:(!cart.items.length||(paymentMethod==='آجل'&&isGeneralSupplierName(cart.supplier)))?'not-allowed':'pointer'}}>
                  {cart.saving?'⏳ جاري...':cart.items.length?`✅ حفظ الشراء — ${fmtByCurrency(total, cart.currency || 'IQD', exchangeRate)}`:'✅ حفظ الشراء'}
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
