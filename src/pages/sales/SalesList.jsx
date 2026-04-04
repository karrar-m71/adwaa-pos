import { memo, useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import { collection, onSnapshot, addDoc, doc, getDoc, getDocs, query, setDoc, where, writeBatch } from 'firebase/firestore';
import { db } from '../../firebase';
import { openProfessionalInvoicePrint } from '../../utils/invoicePrint';
import { getUnitPriceByMode, PRICE_MODES } from '../../utils/pricing';
import { getErrorMessage, getExchangeRate, genInvoiceNo, getPreferredCurrency, setPreferredCurrency } from '../../utils/helpers';
import { getOfflineImagePreview, isOfflineImageRef } from '../../utils/offlineImageQueue';
import { hasLocalApi, localCreateSale, localDeleteSale, runLocalSync } from '../../data/api/localApi';
import { buildInvoiceEditDraft, explainInvoiceError, getInvoiceById, printInvoice, updateInvoice as updateInvoiceService } from '../../services/invoiceService';

const UI = {
  bg: '#F6F8FC',
  panel: '#FFFFFF',
  soft: '#F8FBFF',
  border: '#D9E2F2',
  borderSoft: '#E8EEF8',
  text: '#18243A',
  muted: '#64748B',
  subtle: '#94A3B8',
  accent: '#C88A12',
  accentSoft: '#FEF3C7',
  success: '#059669',
  successSoft: '#D1FAE5',
  danger: '#DC2626',
  dangerSoft: '#FEE2E2',
  info: '#2563EB',
  infoSoft: '#DBEAFE',
  purple: '#7C3AED',
  purpleSoft: '#F3E8FF',
};

const toIQD = (price, cur, rate) => cur === 'USD' ? price * rate : price;
const toDisplay = (iqd, cur, rate) => cur === 'USD' ? iqd / rate : iqd;
const fmtCur = (n, cur) => cur === 'USD'
  ? '$' + (n||0).toFixed(2)
  : (n||0).toLocaleString('ar-IQ') + ' د.ع';
const today = () => new Date().toISOString().split('T')[0];
const nowStr = () => new Date().toLocaleDateString('ar-IQ',{year:'numeric',month:'short',day:'numeric'});
const genCode = (prefix) => `${prefix}-${Date.now().toString().slice(-6)}${Math.floor(Math.random() * 90 + 10)}`;
const selectFieldValue = (event) => {
  event.currentTarget.select?.();
};
const resolveImageUrl = (value = '') => (isOfflineImageRef(value) ? getOfflineImagePreview(value) : value);
const sortProductsStable = (items = []) => [...items].sort((a, b) => {
  const aCreated = String(a?.createdAt || '');
  const bCreated = String(b?.createdAt || '');
  if (aCreated !== bCreated) return aCreated.localeCompare(bCreated, 'ar');
  const aName = String(a?.name || '');
  const bName = String(b?.name || '');
  const byName = aName.localeCompare(bName, 'ar');
  if (byName !== 0) return byName;
  return String(a?.id || '').localeCompare(String(b?.id || ''), 'en');
});
const calcLineDiscountAmount = (item = {}, currencyCode = 'IQD', exchangeRate = 1) => {
  const qty = Number(item?.qty || 0);
  const unit = Number(item?.price || 0);
  const base = Math.max(0, qty * unit);
  const discount = Math.max(0, Number(item?.lineDiscount || 0));
  const discountType = item?.lineDiscountType || 'fixed';
  const amount = discountType === 'percent'
    ? Math.min(base, base * (discount / 100))
    : Math.min(base, discount);
  const amountIQD = currencyCode === 'USD' ? amount * Number(exchangeRate || 1) : amount;
  return {
    amount,
    amountIQD: Math.max(0, Number(amountIQD || 0)),
  };
};
const readDebtByCurrency = (entity = {}) => ({
  IQD: Number(entity?.debtByCurrency?.IQD ?? entity?.debtByCurrency?.iqd ?? entity?.debt ?? 0) || 0,
  USD: Number(entity?.debtByCurrency?.USD ?? entity?.debtByCurrency?.usd ?? 0) || 0,
});
const readTotalByCurrency = (entity = {}) => ({
  IQD: Number(entity?.totalPurchasesByCurrency?.IQD ?? entity?.totalPurchasesByCurrency?.iqd ?? entity?.totalPurchases ?? 0) || 0,
  USD: Number(entity?.totalPurchasesByCurrency?.USD ?? entity?.totalPurchasesByCurrency?.usd ?? 0) || 0,
});
const applyCurrencyDelta = (current = { IQD:0, USD:0 }, code = 'IQD', delta = 0) => {
  const next = { IQD:Number(current.IQD || 0), USD:Number(current.USD || 0) };
  const key = code === 'USD' ? 'USD' : 'IQD';
  next[key] = Math.max(0, Number(next[key] || 0) + Number(delta || 0));
  return next;
};
const resolvePackageMeta = (product = {}, pkg = null) => {
  const qty = Number(product?.packageQty || pkg?.qty || 0);
  const hasData = Boolean(
    product?.hasPackage
    || product?.packageTypeId
    || qty > 0
    || Number(product?.packagePrice || 0) > 0
    || String(product?.packageBarcode || '').trim()
  );
  if (!hasData) return null;
  return {
    qty: qty > 0 ? qty : 1,
    name: String(pkg?.name || product?.packageName || 'تعبئة'),
    unit: String(pkg?.unit || 'وحدة'),
  };
};
const createEditSession = (draft) => (
  draft?.mode === 'edit' && draft?.invoiceId
    ? {
        mode: 'edit',
        invoiceId: draft.invoiceId,
        invoiceNo: draft.invoiceNo || '',
        createdAt: draft.createdAt || '',
        dateISO: draft.dateISO || '',
        date: draft.date || '',
        originalQtyByProduct: (draft.items || []).reduce((acc, item) => {
          if (!item?.id) return acc;
          const qtyUnits = Number(item.qty || 0) * (item.isPackage ? Number(item.packageQty || 1) : 1);
          acc[item.id] = Number(acc[item.id] || 0) + qtyUnits;
          return acc;
        }, {}),
      }
    : null
);
const createDraftCart = (draft) => (draft?.items || []).map((item) => ({
  key: item.key || `${item.id}_${item.sellType || (item.isPackage ? 'package' : 'unit')}`,
  id: item.id,
  name: item.name,
  img: item.img || '',
  imgUrl: item.imgUrl || '',
  qty: Number(item.qty || 1),
  price: Number(item.price || 0),
  priceIQD: Number(item.priceIQD || 0),
  sellType: item.sellType || (item.isPackage ? 'package' : 'unit'),
  isPackage: Boolean(item.isPackage),
  packageName: item.packageName || '',
  packageQty: Number(item.packageQty || 1),
  lineDiscount: Number(item.lineDiscount || 0),
  lineDiscountType: item.lineDiscountType || 'fixed',
  stock: Number(item.stock || 0),
}));

// ── مزامنة المخزون مع تطبيق الموبايل ──────────
async function syncStockToMobile(productId, newStock) {
  try {
    await setDoc(doc(db, 'products', productId), {
      stock: newStock,
      updatedAt: new Date().toISOString(),
    }, { merge: true });
    return true;
  } catch (e) {
    console.warn('[adwaa-sales] Mobile stock sync failed:', e.message);
    return false;
  }
}

// ── نافذة معلومات المادة (كليك يمين) ──────────
function ProductPopup({ product, pkg, pos, onClose }) {
  const pkgMeta = resolvePackageMeta(product, pkg);
  const supportsPackage = Boolean(pkgMeta);
  return (
    <div style={{position:'fixed',inset:0,zIndex:900}} onClick={onClose}>
      <div onClick={e=>e.stopPropagation()} style={{
        position:'fixed',
        top: Math.min(pos.y, window.innerHeight-380),
        left: Math.min(pos.x, window.innerWidth-300),
        zIndex:901, background:UI.panel, border:`1px solid ${UI.border}`,
        borderRadius:16, padding:20, width:280,
        boxShadow:'0 16px 40px rgba(15,23,42,0.12)', direction:'rtl',
      }}>
        <div style={{display:'flex',gap:12,marginBottom:14,alignItems:'center'}}>
          {product.imgUrl
            ?<img src={resolveImageUrl(product.imgUrl)} loading="lazy" decoding="async" style={{width:64,height:64,borderRadius:10,objectFit:'cover'}} alt=""
               onError={e=>{e.target.style.display='none';}}/>
            :<div style={{width:64,height:64,borderRadius:10,background:UI.soft,border:`1px solid ${UI.border}`,display:'flex',alignItems:'center',justifyContent:'center',fontSize:36}}>{product.img||'📦'}</div>}
          <div>
            <div style={{color:UI.text,fontSize:15,fontWeight:800}}>{product.name}</div>
            <div style={{color:UI.muted,fontSize:11}}>{product.cat}</div>
            {product.barcode&&<div style={{color:UI.subtle,fontSize:10,fontFamily:'monospace'}}>{product.barcode}</div>}
          </div>
        </div>
        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8,marginBottom:12}}>
          {[
            ['سعر الشراء',(product.buyPrice||0).toLocaleString('ar-IQ')+' د.ع','#f59e0b'],
            ['سعر البيع',(product.sellPrice||0).toLocaleString('ar-IQ')+' د.ع','#F5C800'],
            ['سعر الجملة',(product.wholesalePrice||0).toLocaleString('ar-IQ')+' د.ع','#3b82f6'],
            ['المخزون',(product.stock||0)+' وحدة',(product.stock||0)<=0?'#ef4444':'#10b981'],
          ].map(([l,v,c])=>(
            <div key={l} style={{background:UI.soft,border:`1px solid ${UI.borderSoft}`,borderRadius:8,padding:'8px',textAlign:'center'}}>
              <div style={{color:UI.muted,fontSize:10,marginBottom:2}}>{l}</div>
              <div style={{color:c,fontSize:12,fontWeight:700}}>{v}</div>
            </div>
          ))}
        </div>
        {supportsPackage&&(
          <div style={{background:UI.purpleSoft,border:`1px solid #d8b4fe`,borderRadius:10,padding:10,marginBottom:10}}>
            <div style={{color:UI.purple,fontSize:11,fontWeight:700,marginBottom:4}}>📦 التعبئة: {pkgMeta.name}</div>
            <div style={{color:UI.muted,fontSize:11}}>{pkgMeta.qty} {pkgMeta.unit}</div>
            <div style={{color:UI.success,fontSize:12,fontWeight:700}}>
              {(product.packagePrice||(product.sellPrice*pkgMeta.qty)).toLocaleString('ar-IQ')} د.ع
            </div>
          </div>
        )}
        {product.desc&&<div style={{color:UI.muted,fontSize:11,borderTop:`1px solid ${UI.borderSoft}`,paddingTop:10}}>{product.desc}</div>}
        <button onClick={onClose} style={{width:'100%',background:UI.soft,border:`1px solid ${UI.border}`,borderRadius:8,padding:'7px',color:UI.muted,cursor:'pointer',fontFamily:"'Cairo'",marginTop:10}}>إغلاق ✕</button>
      </div>
    </div>
  );
}

// ── كارت منتج ──────────────────────────────────
const PCard = memo(function PCard({ p, packageMap, onAdd, onInfo, priceMode }) {
  const pkg = packageMap[p.packageTypeId] || null;
  const pkgMeta = resolvePackageMeta(p, pkg);
  const supportsPackage = Boolean(pkgMeta);
  const low = (p.stock||0) <= 0;
  const unitPrice = getUnitPriceByMode(p, priceMode);
  const priceModeLabel = PRICE_MODES[priceMode]?.label || 'مفرد';
  return (
    <div onContextMenu={e=>{e.preventDefault();onInfo(e,p,pkg);}}
      style={{background:UI.panel,borderRadius:11,border:`1px solid ${low?'#fecaca':UI.border}`,overflow:'hidden',position:'relative',boxShadow:'0 6px 18px rgba(15,23,42,0.04)'}}>
      {low&&<div style={{position:'absolute',top:5,right:5,background:UI.danger,borderRadius:20,padding:'1px 5px',fontSize:8,color:'#fff',fontWeight:700,zIndex:1}}>نفد</div>}
      <div style={{padding:'8px 8px 4px',textAlign:'center'}}>
        {p.imgUrl
          ?<img src={resolveImageUrl(p.imgUrl)} loading="lazy" decoding="async" style={{width:48,height:48,objectFit:'cover',borderRadius:7,marginBottom:4}} alt=""
             onError={e=>{e.target.style.display='none';}}/>
          :<div style={{fontSize:28,marginBottom:4}}>{p.img||'📦'}</div>}
        <div style={{color:UI.text,fontSize:10,fontWeight:600,marginBottom:1,lineHeight:1.3}} title={p.name}>
          {p.name?.length>13?p.name.slice(0,13)+'…':p.name}
        </div>
        <div style={{color:UI.muted,fontSize:9}}>{p.stock||0}</div>
      </div>
      {supportsPackage
        ?<div style={{display:'grid',gridTemplateColumns:'1fr 1fr',borderTop:`1px solid ${UI.borderSoft}`}}>
          <button onClick={()=>onAdd(p,'unit')}
            style={{padding:'7px 2px',background:'none',border:'none',borderLeft:`1px solid ${UI.borderSoft}`,cursor:'pointer',textAlign:'center'}}
            onMouseEnter={e=>e.currentTarget.style.background=UI.accentSoft}
            onMouseLeave={e=>e.currentTarget.style.background='none'}>
            <div style={{color:UI.accent,fontSize:10,fontWeight:800}}>{unitPrice.toLocaleString('ar-IQ')}</div>
            <div style={{color:UI.muted,fontSize:8}}>{priceModeLabel}</div>
          </button>
          <button onClick={()=>onAdd(p,'package')}
            style={{padding:'7px 2px',background:'none',border:'none',cursor:'pointer',textAlign:'center'}}
            onMouseEnter={e=>e.currentTarget.style.background=UI.purpleSoft}
            onMouseLeave={e=>e.currentTarget.style.background='none'}>
            <div style={{color:UI.purple,fontSize:10,fontWeight:800}}>
              {(p.packagePrice||(p.sellPrice*pkgMeta.qty)).toLocaleString('ar-IQ')}
            </div>
            <div style={{color:UI.muted,fontSize:8}}>{pkgMeta.name}</div>
          </button>
        </div>
        :<button onClick={()=>onAdd(p,'unit')}
          style={{width:'100%',padding:'7px',background:'none',border:'none',borderTop:`1px solid ${UI.borderSoft}`,cursor:'pointer'}}
          onMouseEnter={e=>e.currentTarget.style.background=UI.accentSoft}
          onMouseLeave={e=>e.currentTarget.style.background='none'}>
          <div style={{color:UI.accent,fontSize:11,fontWeight:800}}>{unitPrice.toLocaleString('ar-IQ')} د.ع</div>
        </button>}
    </div>
  );
});

// ── لوحة السلة (فاتورة واحدة) ─────────────────
const CartPanel = memo(function CartPanel({ tabId, products, productMap, packageMap, customers, customerMap, user, currency, exchangeRate, onClose, priceMode, initialDraft, onDraftApplied, onUpdateInvoice }) {
  const [cart,      setCart]       = useState(() => createDraftCart(initialDraft));
  const [customer,  setCustomer]   = useState(() => initialDraft?.customer || '');
  const [customerPhone, setCustomerPhone] = useState(() => initialDraft?.customerPhone || '');
  const [customerAddress, setCustomerAddress] = useState(() => initialDraft?.customerAddress || '');
  const [discount,  setDiscount]   = useState(() => Number(initialDraft?.discount || 0));
  const [discountType, setDiscountType] = useState(() => initialDraft?.discountType || 'percent');
  const [received,  setReceived]   = useState(() => initialDraft?.received || '');
  const [allowNeg,  setAllowNeg]   = useState(() => Boolean(initialDraft?.allowNeg));
  const [saving,    setSaving]     = useState(false);
  const [done,      setDone]       = useState(null);
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

  const addItem=useCallback((p,sellType)=>{
    const pkg = packageMap[p.packageTypeId] || null;
    const pkgMeta = resolvePackageMeta(p, pkg);
    const supportsPackage = Boolean(pkgMeta);
    const normalizedSellType = sellType === 'package' && supportsPackage ? 'package' : 'unit';
    const isPackage = normalizedSellType === 'package';
    const packageQty = Number(pkgMeta?.qty || 1);
    const packageName = String(pkgMeta?.name || 'تعبئة');
    const priceIQD=isPackage?(p.packagePrice||(p.sellPrice*packageQty)):getUnitPriceByMode(p, priceMode);
    const price=currency==='USD'?priceIQD/exchangeRate:priceIQD;
    const stockPerUnit=isPackage?packageQty:1;
    const key=`${p.id}_${normalizedSellType}`;
    setCart(c=>{
      const ex=c.findIndex(i=>i.key===key);
      if(ex>=0){
        const newQty=c[ex].qty+1;
        if(!allowNeg&&newQty*stockPerUnit>(p.stock||0))return c;
        return c.map((i,idx)=>idx===ex?{...i,qty:newQty}:i);
      }
      if(!allowNeg&&(p.stock||0)<=0)return c;
      return[...c,{key,id:p.id,name:p.name,img:p.img,imgUrl:p.imgUrl,qty:1,price,priceIQD,sellType:normalizedSellType,isPackage,packageName:isPackage?packageName:'',packageQty:isPackage?packageQty:1,lineDiscount:0,lineDiscountType:'fixed',stock:p.stock}];
    });
  }, [allowNeg, currency, exchangeRate, packageMap, priceMode]);

  useEffect(()=>{
    const handler=(e)=>{
      if(e.detail.tabId!==tabId)return;
      addItem(e.detail.product, e.detail.sellType);
    };
    window.addEventListener('cartAdd',handler);
    return()=>window.removeEventListener('cartAdd',handler);
  },[addItem, tabId]);

  useEffect(() => {
    if (!initialDraft) return;
    onDraftApplied?.(tabId);
  }, [initialDraft, onDraftApplied, tabId]);

  const uQty=(key,d)=>setCart(c=>c.map(i=>{
    if(i.key!==key)return i;
    const p = productMap[i.id];
    const newQty=i.qty+d;
    if(!allowNeg&&newQty<=0)return i;
    const need=newQty*(i.isPackage?i.packageQty:1);
    if(!allowNeg&&need>(p?.stock||0)&&d>0)return i;
    return{...i,qty:newQty};
  }));
  const uQtyDirect=(key,v)=>setCart(c=>c.map(i=>i.key===key?{...i,qty:Number(v)||0}:i));
  const uPrice=(key,v)=>setCart(c=>c.map(i=>i.key===key?{...i,price:Number(v),priceIQD:currency==='USD'?Number(v)*exchangeRate:Number(v)}:i));
  const removeItem=(key)=>setCart(c=>c.filter(i=>i.key!==key));

  const grossSubtotal=cart.reduce((s,i)=>s+i.price*i.qty,0);
  const itemDiscountAmount=cart.reduce((s,i)=>s+calcLineDiscountAmount(i,currency,exchangeRate).amount,0);
  const subtotal=Math.max(0,grossSubtotal-itemDiscountAmount);
  const discAmt=discountType==='percent'
    ? subtotal*(discount/100)
    : Math.min(subtotal, Number(discount||0));
  const total=Math.max(0, subtotal-discAmt);
  const receivedInputValue = received === '' ? total : received;
  const receivedAmount=Math.max(0, Number(received === '' ? total : received)||0);
  const appliedAmount=Math.min(receivedAmount,total);
  const remainingAmount=Math.max(0,total-appliedAmount);
  const change=Math.max(0,receivedAmount-total);
  const payMethod=remainingAmount>0?'آجل':'نقدي';
  const selCust = customerMap[customer.trim()] || null;
  const previousDebtIQD=Number(selCust?.debt||0);
  const remainingAmountIQD=currency==='USD'?remainingAmount*exchangeRate:remainingAmount;
  const totalAccountIQD=previousDebtIQD+remainingAmountIQD;

  const save=async()=>{
    if(!cart.length)return alert('السلة فارغة');
    if(payMethod==='آجل'&&!customer.trim())return alert('أدخل اسم الزبون');
    if(!customer.trim() && receivedAmount > total)return alert('لا يمكن أن يكون المبلغ الواصل أكبر من مبلغ الفاتورة عند البيع لزبون عام');
    if (!allowNeg) {
      const insufficientItem = cart.find((item) => {
        const product = productMap[item.id];
        const originalQty = Number(editSession?.originalQtyByProduct?.[item.id] || 0);
        const requestedUnits = Number(item.qty || 0) * (item.isPackage ? Number(item.packageQty || 1) : 1);
        return requestedUnits > (Number(product?.stock || 0) + originalQty);
      });
      if (insufficientItem) {
        return alert(`الكمية غير كافية للمادة: ${insufficientItem.name}`);
      }
    }
    setSaving(true);
    try{
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
      const totalIQD=currency==='USD'?total*exchangeRate:total;
      const paidAmountIQD = currency==='USD'?appliedAmount*exchangeRate:appliedAmount;
      const dueAmountIQD = currency==='USD'?remainingAmount*exchangeRate:remainingAmount;
      const receivedAmountIQD = currency==='USD'?receivedAmount*exchangeRate:receivedAmount;
      const changeIQD = currency==='USD'?change*exchangeRate:change;
      const sale={
        invoiceNo,
        items:cart.map(i=>{
          const lineBase = Number(i.price || 0) * Number(i.qty || 0);
          const lineDisc = calcLineDiscountAmount(i,currency,exchangeRate);
          const lineTotal = Math.max(0, lineBase - lineDisc.amount);
          return {
            id:i.id,name:i.name,qty:i.qty,price:i.priceIQD,priceDisplay:i.price,currency,sellType:i.sellType,isPackage:i.isPackage,packageName:i.packageName,packageQty:i.packageQty,
            lineSubtotal: currency==='USD' ? lineBase*exchangeRate : lineBase,
            lineDiscount:Number(i.lineDiscount||0),
            lineDiscountType:i.lineDiscountType||'fixed',
            lineDiscountAmount:lineDisc.amountIQD,
            lineDiscountAmountDisplay:lineDisc.amount,
            total:currency==='USD' ? lineTotal*exchangeRate : lineTotal,
          };
        }),
        grossSubtotal:currency==='USD'?grossSubtotal*exchangeRate:grossSubtotal,
        itemDiscountAmount:currency==='USD'?itemDiscountAmount*exchangeRate:itemDiscountAmount,
        subtotal:currency==='USD'?subtotal*exchangeRate:subtotal,
        discount,
        discountType,
        discountAmount:currency==='USD'?discAmt*exchangeRate:discAmt,
        total:totalIQD,currency,exchangeRate:currency==='USD'?exchangeRate:1,
        paymentMethod:payMethod,customer:customer.trim()||'زبون عام',customerId:selCust?.id||'',
        customerPhone:customerPhone.trim(),
        customerAddress:customerAddress.trim(),
        cashier:user.name,
        paidAmount:paidAmountIQD,
        dueAmount:dueAmountIQD,
        remainingAmount:dueAmountIQD,
        receivedAmount:receivedAmountIQD,
        previousDebt:previousDebtIQD,
        accountTotal:totalAccountIQD,
        cash:receivedAmountIQD,
        change:changeIQD,
        dateISO:today(),date:nowStr(),createdAt:new Date().toISOString(),
      };

      if (hasLocalApi()) {
        const localResult = await localCreateSale({
          invoiceNo,
          items: cart.map((i) => ({
            id: i.id,
            name: i.name,
            qty: Number(i.qty || 0),
            price: Number(i.price || 0),
            priceIQD: Number(i.priceIQD || 0),
            isPackage: Boolean(i.isPackage),
            packageQty: Number(i.packageQty || 1),
            packageName: i.packageName || '',
            sellType: i.sellType || (i.isPackage ? 'package' : 'unit'),
            lineDiscount: Number(i.lineDiscount || 0),
            lineDiscountType: i.lineDiscountType || 'fixed',
            lineDiscountAmount: calcLineDiscountAmount(i, currency, exchangeRate).amountIQD,
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
        setDone({
          ...localResult,
          localId: localResult?.id,
          localSaved: true,
        });
        runLocalSync().catch(() => null);
        setSaving(false);
        return;
      }
      const saleRef = await addDoc(collection(db,'pos_sales'),sale);

      // تحديث المخزون في الديسكتوب الآن، ومزامنة الموبايل بالخلفية حتى لا تؤخر حفظ الفاتورة.
      const stockSyncJobs = [];
      await Promise.all(cart.map(async (item) => {
        const p = productMap[item.id];
        if (!p) return;
        const stockUsed = item.isPackage ? item.qty * item.packageQty : item.qty;
        const newStock  = (p.stock || 0) - stockUsed;
        await setDoc(doc(db, 'pos_products', item.id), {
          stock:     newStock,
          soldCount: (p.soldCount || 0) + Math.abs(stockUsed),
        }, { merge: true });
        stockSyncJobs.push(syncStockToMobile(item.id, newStock));
      }));

      // دين الزبون
      if(payMethod==='آجل'&&customer.trim()){
        const nextDebtByCurrency = applyCurrencyDelta(readDebtByCurrency(selCust || {}), currency, remainingAmount);
        const nextTotalPurchasesByCurrency = applyCurrencyDelta(readTotalByCurrency(selCust || {}), currency, total);
        if(selCust){
          await setDoc(doc(db,'pos_customers',selCust.id),{
            debt:Number(nextDebtByCurrency.IQD || 0),
            debtByCurrency:nextDebtByCurrency,
            totalPurchases:(selCust.totalPurchases||0)+totalIQD,
            totalPurchasesByCurrency:nextTotalPurchasesByCurrency,
            phone:customerPhone.trim(),
            address:customerAddress.trim(),
          }, { merge: true });
        } else {
          await addDoc(collection(db,'pos_customers'),{
            name:customer.trim(),phone:customerPhone.trim(),address:customerAddress.trim(),debt:(currency==='USD'?remainingAmount*exchangeRate:remainingAmount),
            debtByCurrency:applyCurrencyDelta({ IQD:0, USD:0 }, currency, remainingAmount),
            totalPurchases:totalIQD,totalPurchasesByCurrency:applyCurrencyDelta({ IQD:0, USD:0 }, currency, total),createdAt:new Date().toISOString(),
          });
        }
      }

      if (payMethod === 'آجل' && appliedAmount > 0 && customer.trim()) {
        const voucherNo = genCode('V-C');
        await addDoc(collection(db,'pos_vouchers'),{
          voucherNo,
          type:'قبض',
          amount: currency === 'USD' ? appliedAmount : paidAmountIQD,
          amountIQD: paidAmountIQD,
          amountIQDEntry: currency === 'USD' ? 0 : paidAmountIQD,
          amountUSDEntry: currency === 'USD' ? appliedAmount : 0,
          currency: currency === 'USD' ? 'دولار أمريكي' : 'دينار عراقي',
          exchangeRate: currency === 'USD' ? exchangeRate : 1,
          fromTo: customer.trim(),
          description:`دفعة تلقائية مرتبطة بفاتورة البيع ${invoiceNo}`,
          paymentMethod:'نقدي',
          dateISO:today(),
          date:nowStr(),
          source:'sales_auto',
          linkedSaleId:saleRef.id,
          linkedSaleNo:invoiceNo,
          addedBy:user.name,
          status:'مؤكد',
          createdAt:new Date().toISOString(),
        });
        await setDoc(saleRef,{ linkedVoucherNo:voucherNo }, { merge: true });
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
    } catch (e) {
      const rawMessage = String(e?.message || '');
      if (rawMessage.toLowerCase().includes('insufficient stock')) {
        const productName = rawMessage.split('for ').pop() || '';
        alert(`الكمية غير كافية${productName ? ` للمادة: ${productName}` : ''}`);
      } else {
        alert('خطأ في حفظ الفاتورة: ' + getErrorMessage(e));
      }
    }
    setSaving(false);
  };

  const printInv=(inv)=>{
    try {
      const ok = openProfessionalInvoicePrint({
        ...inv,
        dueAmount: inv.dueAmount ?? inv.remainingAmount ?? 0,
        paidAmount: inv.paidAmount ?? Math.max(0, Number(inv.total || 0) - Number(inv.remainingAmount || 0)),
        customerPhone: inv.customerPhone || customerMap[inv.customer || '']?.phone || '',
      }, 'sale');
      if(!ok) alert('تعذر فتح نافذة الطباعة. تأكد من السماح بالنوافذ المنبثقة.');
    } catch (error) {
      console.error('[adwaa-print] Sales invoice print failed', error);
      alert('تعذر طباعة الفاتورة');
    }
  };

  if(done) return(
    <div style={{flex:'1 1 340px',width:'min(100%, 360px)',maxWidth:'100%',background:UI.panel,display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',padding:24,borderRight:`1px solid ${UI.border}`}}>
      <div style={{fontSize:60,marginBottom:10}}>{done.paymentMethod==='آجل'?'📋':'✅'}</div>
      <div style={{color:done.paymentMethod==='آجل'?'#f59e0b':'#10b981',fontSize:18,fontWeight:800,marginBottom:4}}>
        {done.paymentMethod==='آجل'?'تسجيل آجل!':'تمت عملية البيع!'}
      </div>
      <div style={{color:UI.muted,fontSize:12,marginBottom:4}}>{done.invoiceNo}</div>
      {done.updatedAt && <div style={{color:UI.info,fontSize:11,fontWeight:700,marginBottom:4}}>تم تحديث الفاتورة بنجاح</div>}
      {/* تأكيد المزامنة */}
      <div style={{background:UI.infoSoft,border:`1px solid #93c5fd`,borderRadius:10,padding:'6px 14px',marginBottom:16}}>
        <span style={{color:UI.info,fontSize:11,fontWeight:700}}>📱 تم تحديث مخزون الموبايل</span>
      </div>
      <div style={{background:UI.soft,borderRadius:12,padding:16,border:`1px solid ${UI.border}`,width:'100%',marginBottom:16}}>
        {[
          [`الإجمالي`,fmtCur(toDisplay(done.total,done.currency||'IQD',done.exchangeRate||1),done.currency||'IQD'),'#F5C800'],
          ['طريقة الدفع',done.paymentMethod,'#10b981'],
          ['الواصل',fmtCur(toDisplay(done.receivedAmount ?? done.cash ?? 0,done.currency||'IQD',done.exchangeRate||1),done.currency||'IQD'),'#2563EB'],
          ['المتبقي',fmtCur(toDisplay(done.remainingAmount||0,done.currency||'IQD',done.exchangeRate||1),done.currency||'IQD'),done.remainingAmount>0?'#f59e0b':'#10b981'],
          ...((done.accountTotal||0)>0?[['الحساب الكلي',fmtCur(toDisplay(done.accountTotal||0,done.currency||'IQD',done.exchangeRate||1),done.currency||'IQD'),'#7C3AED']]:[]),
          ...(done.change>0?[['الباقي',fmtCur(toDisplay(done.change||0,done.currency||'IQD',done.exchangeRate||1),done.currency||'IQD'),'#10b981']]:[]),
        ].map(([l,v,c])=>(
          <div key={l} style={{display:'flex',justifyContent:'space-between',padding:'7px 0',borderBottom:`1px solid ${UI.borderSoft}`}}>
            <span style={{color:UI.muted,fontSize:12}}>{l}</span>
            <span style={{color:c,fontWeight:700,fontSize:13}}>{v}</span>
          </div>
        ))}
      </div>
      <div style={{display:'flex',gap:8,width:'100%'}}>
        <button onClick={()=>printInv(done)} style={{flex:1,background:UI.info,color:'#fff',border:'none',borderRadius:10,padding:10,fontWeight:700,cursor:'pointer',fontFamily:"'Cairo'",fontSize:13}}>🖨️ طباعة</button>
        <button onClick={resetPanel} style={{flex:1,background:UI.accent,color:'#fff',border:'none',borderRadius:10,padding:10,fontWeight:700,cursor:'pointer',fontFamily:"'Cairo'",fontSize:13}}>+ جديدة</button>
      </div>
    </div>
  );

  return(
    <div style={{flex:'1 1 340px',width:'min(100%, 360px)',maxWidth:'100%',background:UI.panel,display:'flex',flexDirection:'column',borderRight:`1px solid ${UI.border}`,overflow:'hidden',minWidth:0}}>
      {/* الزبون */}
      <div style={{padding:'8px 10px',borderBottom:`1px solid ${UI.border}`}}>
        <input value={customer} onChange={e=>{
          const nextCustomer = e.target.value;
          const matchedCustomer = customerMap[nextCustomer.trim()] || null;
          setCustomer(nextCustomer);
          if (!nextCustomer.trim()) {
            setCustomerPhone('');
            setCustomerAddress('');
          } else if (matchedCustomer) {
            setCustomerPhone(matchedCustomer.phone || '');
            setCustomerAddress(matchedCustomer.address || '');
          }
        }} list={`cl-${tabId}`} placeholder="الزبون (مطلوب عند وجود متبقي)"
          style={{width:'100%',background:UI.soft,border:`1px solid ${payMethod==='آجل'&&!customer.trim()?UI.danger:UI.border}`,borderRadius:8,padding:'6px 10px',color:UI.text,fontSize:12,outline:'none',fontFamily:"'Cairo'",boxSizing:'border-box',marginBottom:4}}/>
        <datalist id={`cl-${tabId}`}>{customers.map(c=><option key={c.id} value={c.name}/>)}</datalist>
        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:6,marginBottom:4}}>
          <input value={customerPhone} onChange={e=>setCustomerPhone(e.target.value)} placeholder="رقم الهاتف"
            style={{width:'100%',background:'#fff',border:`1px solid ${UI.border}`,borderRadius:8,padding:'6px 10px',color:UI.text,fontSize:12,outline:'none',fontFamily:"'Cairo'",boxSizing:'border-box'}}/>
          <input value={customerAddress} onChange={e=>setCustomerAddress(e.target.value)} placeholder="العنوان"
            style={{width:'100%',background:'#fff',border:`1px solid ${UI.border}`,borderRadius:8,padding:'6px 10px',color:UI.text,fontSize:12,outline:'none',fontFamily:"'Cairo'",boxSizing:'border-box'}}/>
        </div>
        {selCust&&(selCust.debt||0)>0&&(
          <div style={{background:'#fff7ed',border:'1px solid #fdba74',borderRadius:6,padding:'3px 8px',display:'flex',justifyContent:'space-between',marginBottom:4}}>
            <span style={{color:UI.muted,fontSize:10}}>دينه الحالي</span>
            <span style={{color:'#f59e0b',fontSize:11,fontWeight:700}}>{fmtCur(toDisplay(previousDebtIQD,currency,exchangeRate),currency)}</span>
          </div>
        )}
        {customer.trim()&&totalAccountIQD>0&&(
          <div style={{background:'#f3e8ff',border:'1px solid #d8b4fe',borderRadius:6,padding:'3px 8px',display:'flex',justifyContent:'space-between',marginBottom:4}}>
            <span style={{color:UI.muted,fontSize:10}}>مبلغ الحساب الكلي</span>
            <span style={{color:UI.purple,fontSize:11,fontWeight:700}}>{fmtCur(toDisplay(totalAccountIQD,currency,exchangeRate),currency)}</span>
          </div>
        )}
        <label style={{display:'flex',gap:6,alignItems:'center',cursor:'pointer'}}>
          <input type="checkbox" checked={allowNeg} onChange={e=>setAllowNeg(e.target.checked)} style={{accentColor:'#ef4444'}}/>
          <span style={{color:allowNeg?UI.danger:UI.muted,fontSize:10,fontWeight:allowNeg?700:400}}>⚠️ البيع بالسالب</span>
        </label>
      </div>

      {/* السلة */}
      <div style={{flex:1,overflowY:'auto',padding:6}}>
        {!cart.length
          ?<div style={{color:UI.subtle,textAlign:'center',padding:30,fontSize:12}}>
            أضف منتجات من اليسار<br/>
            <span style={{fontSize:10,color:UI.muted}}>كليك يمين لمعلومات المادة</span>
          </div>
          :cart.map(item=>(
            <div key={item.key} style={{background:UI.soft,borderRadius:10,padding:8,marginBottom:5,border:`1px solid ${item.isPackage?'#d8b4fe':item.qty<0?'#fecaca':UI.border}`}}>
              <div style={{display:'flex',gap:6,alignItems:'center',marginBottom:5}}>
                {item.imgUrl
                  ?<img src={resolveImageUrl(item.imgUrl)} loading="lazy" decoding="async" style={{width:22,height:22,borderRadius:4,objectFit:'cover'}} alt=""
                     onError={e=>e.target.style.display='none'}/>
                  :<span style={{fontSize:14}}>{item.img||'📦'}</span>}
                <div style={{flex:1,overflow:'hidden'}}>
                  <span style={{color:UI.text,fontSize:11,fontWeight:600}}>{item.name?.length>16?item.name.slice(0,16)+'…':item.name}</span>
                  {item.isPackage&&<span style={{background:UI.purpleSoft,borderRadius:20,padding:'0 4px',color:UI.purple,fontSize:8,marginRight:3}}>📦{item.packageName}</span>}
                  {item.qty<0&&<span style={{background:UI.dangerSoft,borderRadius:20,padding:'0 4px',color:UI.danger,fontSize:8,marginRight:3}}>⚠️سالب</span>}
                </div>
                <button onClick={()=>removeItem(item.key)} style={{background:'none',border:'none',color:UI.danger,cursor:'pointer',fontSize:13}}>✕</button>
              </div>
              {item.isPackage&&<div style={{color:UI.muted,fontSize:9,marginBottom:4}}>يُخصم: {Math.abs(item.qty*(item.packageQty||1))} وحدة</div>}
              <div style={{display:'flex',gap:5,alignItems:'center'}}>
                <input type="text" inputMode="decimal" value={item.price} onChange={e=>uPrice(item.key,e.target.value)} onDoubleClick={selectFieldValue}
                  style={{width:72,background:'#fff',border:`1px solid ${UI.border}`,borderRadius:6,padding:'3px 5px',color:item.isPackage?UI.purple:UI.accent,fontSize:10,outline:'none'}}/>
                <div style={{display:'flex',gap:2,alignItems:'center'}}>
                  <input type="text" inputMode="decimal" value={item.lineDiscount||0}
                    onChange={e=>setCart(c=>c.map(it=>it.key===item.key?{...it,lineDiscount:Number(e.target.value)||0}:it))}
                    onDoubleClick={selectFieldValue}
                    style={{width:44,background:'#fff',border:`1px solid ${UI.border}`,borderRadius:6,padding:'2px 4px',color:'#ef4444',fontSize:9,outline:'none',textAlign:'center'}}/>
                  <button onClick={()=>setCart(c=>c.map(it=>it.key===item.key?{...it,lineDiscountType:'percent'}:it))}
                    style={{padding:'1px 4px',background:(item.lineDiscountType||'fixed')==='percent'?UI.accentSoft:'#fff',border:`1px solid ${UI.border}`,borderRadius:4,color:(item.lineDiscountType||'fixed')==='percent'?UI.accent:UI.muted,fontSize:8,cursor:'pointer'}}>%</button>
                  <button onClick={()=>setCart(c=>c.map(it=>it.key===item.key?{...it,lineDiscountType:'fixed'}:it))}
                    style={{padding:'1px 4px',background:(item.lineDiscountType||'fixed')==='fixed'?UI.accentSoft:'#fff',border:`1px solid ${UI.border}`,borderRadius:4,color:(item.lineDiscountType||'fixed')==='fixed'?UI.accent:UI.muted,fontSize:8,cursor:'pointer'}}>د.ع</button>
                </div>
                <div style={{display:'flex',gap:3,alignItems:'center',marginRight:'auto'}}>
                  <button onClick={()=>uQty(item.key,-1)} style={{width:22,height:22,borderRadius:5,background:'#fff',border:`1px solid ${UI.border}`,color:UI.accent,cursor:'pointer',fontSize:13,lineHeight:1}}>−</button>
                  <input type="text" inputMode="numeric" value={item.qty} onChange={e=>uQtyDirect(item.key,e.target.value)} onDoubleClick={selectFieldValue}
                    style={{width:32,background:'#fff',border:`1px solid ${UI.border}`,borderRadius:5,padding:'2px 3px',color:UI.text,fontSize:11,outline:'none',textAlign:'center'}}/>
                  <button onClick={()=>uQty(item.key,+1)} style={{width:22,height:22,borderRadius:5,background:'#fff',border:`1px solid ${UI.border}`,color:UI.accent,cursor:'pointer',fontSize:13,lineHeight:1}}>+</button>
                </div>
                {calcLineDiscountAmount(item,currency,exchangeRate).amount>0&&(
                  <span style={{color:'#ef4444',fontSize:9,fontWeight:700,minWidth:54,textAlign:'left'}}>
                    - {fmtCur(calcLineDiscountAmount(item,currency,exchangeRate).amount,currency)}
                  </span>
                )}
                <span style={{color:item.isPackage?UI.purple:UI.accent,fontSize:10,fontWeight:700,minWidth:60,textAlign:'left'}}>
                  {fmtCur(Math.max(0,(item.price*item.qty)-calcLineDiscountAmount(item,currency,exchangeRate).amount),currency)}
                </span>
              </div>
            </div>
          ))
        }
      </div>

      {/* الإجمالي والدفع */}
      <div style={{padding:'8px 10px',borderTop:`1px solid ${UI.border}`,background:UI.panel}}>
        <div style={{display:'flex',justifyContent:'space-between',marginBottom:3}}>
          <span style={{color:UI.muted,fontSize:11}}>المجموع قبل خصم المواد</span>
          <span style={{color:UI.muted,fontSize:11}}>{fmtCur(grossSubtotal,currency)}</span>
        </div>
        {itemDiscountAmount>0&&<div style={{display:'flex',justifyContent:'space-between',marginBottom:3}}>
          <span style={{color:'#ef4444',fontSize:10}}>خصم المواد</span>
          <span style={{color:'#ef4444',fontSize:10}}>- {fmtCur(itemDiscountAmount,currency)}</span>
        </div>}
        <div style={{display:'flex',justifyContent:'space-between',marginBottom:3}}>
          <span style={{color:UI.muted,fontSize:11}}>المجموع</span>
          <span style={{color:UI.muted,fontSize:11}}>{fmtCur(subtotal,currency)}</span>
        </div>
        <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:3}}>
          <span style={{color:UI.muted,fontSize:11}}>خصم الفاتورة</span>
          <div style={{display:'flex',gap:4,alignItems:'center'}}>
            <input type="text" inputMode="decimal" value={discount} onChange={e=>setDiscount(Number(e.target.value))} onDoubleClick={selectFieldValue}
              style={{width:55,background:'#fff',border:`1px solid ${UI.border}`,borderRadius:6,padding:'3px 5px',color:UI.accent,fontSize:11,outline:'none',textAlign:'center'}}/>
            <button onClick={()=>setDiscountType('percent')}
              style={{padding:'2px 6px',background:discountType==='percent'?UI.accentSoft:'#fff',border:`1px solid ${UI.border}`,borderRadius:6,color:discountType==='percent'?UI.accent:UI.muted,fontSize:9,cursor:'pointer',fontWeight:700}}>%</button>
            <button onClick={()=>setDiscountType('fixed')}
              style={{padding:'2px 6px',background:discountType==='fixed'?UI.accentSoft:'#fff',border:`1px solid ${UI.border}`,borderRadius:6,color:discountType==='fixed'?UI.accent:UI.muted,fontSize:9,cursor:'pointer',fontWeight:700}}>مقطوع</button>
          </div>
        </div>
        {discount>0&&<div style={{display:'flex',justifyContent:'space-between',marginBottom:3}}>
          <span style={{color:'#ef4444',fontSize:10}}>الخصم</span>
          <span style={{color:'#ef4444',fontSize:10}}>- {fmtCur(discAmt,currency)}</span>
        </div>}
        <div style={{display:'flex',justifyContent:'space-between',borderTop:`1px solid ${UI.borderSoft}`,paddingTop:6,marginBottom:8}}>
          <span style={{color:UI.text,fontWeight:800,fontSize:13}}>المبلغ الكلي</span>
          <div style={{textAlign:'left'}}>
            <div style={{color:UI.accent,fontWeight:900,fontSize:17}}>{fmtCur(total,currency)}</div>
            {currency==='USD'&&<div style={{color:UI.muted,fontSize:9}}>{(total*exchangeRate).toLocaleString('ar-IQ')} د.ع</div>}
          </div>
        </div>
        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:6,marginBottom:6}}>
          <div>
            <div style={{color:UI.muted,fontSize:10,marginBottom:4}}>المبلغ الواصل</div>
            <input
              type="text"
              inputMode="decimal"
              value={receivedInputValue}
              onChange={e=>{
                const nextValue = e.target.value;
                if(nextValue === ''){ setReceived(''); return; }
                if(!customer.trim() && Number(nextValue) > total){
                  setReceived(String(total));
                  return;
                }
                setReceived(nextValue);
              }}
              onDoubleClick={selectFieldValue}
              placeholder="0"
              style={{width:'100%',background:'#fff',border:`1px solid ${UI.border}`,borderRadius:7,padding:'6px 10px',color:UI.text,fontSize:12,outline:'none',boxSizing:'border-box'}}/>
          </div>
          <div>
            <div style={{color:UI.muted,fontSize:10,marginBottom:4}}>المبلغ المتبقي</div>
            <div style={{background:remainingAmount>0?'#fff7ed':UI.successSoft,border:`1px solid ${remainingAmount>0?'#fdba74':'#86efac'}`,borderRadius:7,padding:'7px 10px',color:remainingAmount>0?'#b45309':UI.success,fontSize:12,fontWeight:800,textAlign:'center'}}>
              {fmtCur(remainingAmount,currency)}
            </div>
          </div>
        </div>
        <div style={{display:'flex',justifyContent:'space-between',marginBottom:6,background:UI.soft,border:`1px solid ${UI.border}`,borderRadius:8,padding:'6px 10px'}}>
          <span style={{color:UI.muted,fontSize:11}}>حالة الفاتورة</span>
          <span style={{color:payMethod==='آجل'?'#f59e0b':UI.success,fontSize:11,fontWeight:800}}>{payMethod}</span>
        </div>
        {received&&change>0&&<div style={{color:UI.success,fontSize:11,textAlign:'center',marginBottom:5}}>الباقي: {fmtCur(change,currency)}</div>}
        {payMethod==='آجل'&&!customer.trim()&&<div style={{color:UI.danger,fontSize:10,textAlign:'center',marginBottom:4}}>أدخل اسم الزبون أعلاه</div>}
        <button onClick={save} disabled={saving||!cart.length||(payMethod==='آجل'&&!customer.trim())}
          style={{width:'100%',background:(!cart.length||(payMethod==='آجل'&&!customer.trim()))?'#E2E8F0':payMethod==='آجل'?'linear-gradient(135deg,#f59e0b,#d97706)':`linear-gradient(135deg,${UI.accent},#A86E00)`,color:'#fff',border:'none',borderRadius:10,padding:12,fontWeight:800,fontSize:13,cursor:(!cart.length||(payMethod==='آجل'&&!customer.trim()))?'not-allowed':'pointer'}}>
          {saving
            ? '⏳ جاري الحفظ...'
            : editSession?.invoiceId
              ? `💾 تحديث الفاتورة ${editSession.invoiceNo || ''}`
              : `✅ حفظ الفاتورة ${fmtCur(total,currency)}`}
        </button>
      </div>
    </div>
  );
});

// ── المكوّن الرئيسي ────────────────────────────
let _tabId = 2;

export default function SalesList({ user }) {
  const [products,  setProducts]  = useState([]);
  const [packages,  setPackages]  = useState([]);
  const [customers, setCustomers] = useState([]);
  const [sales,     setSales]     = useState([]);
  const [search,    setSearch]    = useState('');
  const [catFilter, setCatFilter] = useState('الكل');
  const [tabs,      setTabs]      = useState([{id:1,label:'فاتورة 1'}]);
  const [activeTab, setActiveTab] = useState(1);
  const [view,      setView]      = useState('pos');
  const [currency,  setCurrency]  = useState(() => getPreferredCurrency());
  const [rate,      setRate]      = useState(() => getExchangeRate());
  const [showRate,  setShowRate]  = useState(false);
  const [popup,     setPopup]     = useState(null);
  const [priceMode, setPriceMode] = useState('retail');
  const [listSearchInput,setListSearchInput]= useState('');
  const [listSearch,setListSearch]= useState('');
  const [draftsByTab,setDraftsByTab] = useState({});
  const [rowActionState,setRowActionState] = useState({});
  const deferredSearch = useDeferredValue(search);

  const packageMap = useMemo(
    () => Object.fromEntries(packages.map((pkg) => [pkg.id, pkg])),
    [packages],
  );
  const productMap = useMemo(
    () => Object.fromEntries(products.map((product) => [product.id, product])),
    [products],
  );
  const customerMap = useMemo(
    () => customers.reduce((acc, customerItem) => {
      const key = String(customerItem?.name || '').trim();
      if (key) acc[key] = customerItem;
      return acc;
    }, {}),
    [customers],
  );

  useEffect(()=>{
    const us=[
      onSnapshot(collection(db,'pos_products'),  s=>setProducts(sortProductsStable(s.docs.map(d=>({...d.data(),id:d.id}))))),
      onSnapshot(collection(db,'pos_packages'),  s=>setPackages(s.docs.map(d=>({...d.data(),id:d.id})))),
      onSnapshot(collection(db,'pos_customers'), s=>setCustomers(s.docs.map(d=>({...d.data(),id:d.id})))),
      onSnapshot(collection(db,'pos_sales'),     s=>setSales(s.docs.map(d=>({...d.data(),id:d.id})).sort((a,b)=>new Date(b.createdAt)-new Date(a.createdAt)))),
    ];
    return()=>us.forEach(u=>u());
  },[]);

  useEffect(() => {
    setPreferredCurrency(currency);
  }, [currency]);

  useEffect(() => {
    const timer = setTimeout(() => {
      setListSearch(listSearchInput);
    }, 250);
    return () => clearTimeout(timer);
  }, [listSearchInput]);

  const cats = useMemo(
    () => ['الكل', ...new Set(products.map((p) => p.cat).filter(Boolean))],
    [products],
  );
  const filtered = useMemo(() => products.filter((p) => {
    const ms = !deferredSearch || p.name?.includes(deferredSearch) || p.barcode?.includes(deferredSearch) || p.packageBarcode?.includes(deferredSearch);
    const mc = catFilter === 'الكل' || p.cat === catFilter;
    return ms && mc;
  }), [products, catFilter, deferredSearch]);

  const inferSellTypeFromSearch = (product, queryText = '') => {
    const normalizedQuery = String(queryText || '').trim().toLowerCase();
    if (!normalizedQuery) return 'unit';
    const packageBarcode = String(product?.packageBarcode || '').trim().toLowerCase();
    if (packageBarcode && packageBarcode === normalizedQuery) return 'package';
    return 'unit';
  };

  const addTab=()=>{
    const id=_tabId++;
    setTabs(t=>[...t,{id,label:`فاتورة ${id}`}]);
    setActiveTab(id);
  };

  const repeatSaleIntoNewTab = (sale) => {
    const id = _tabId++;
    setTabs((current) => [...current, { id, label:`تعديل ${sale.invoiceNo || id}` }]);
    setActiveTab(id);
    if (sale?.currency === 'USD' || sale?.currency === 'IQD') setCurrency(sale.currency);
    setView('pos');
    setDraftsByTab((current) => ({
      ...current,
      [id]: buildInvoiceEditDraft(sale, products),
    }));
  };

  const clearDraftForTab = (tabId) => {
    setDraftsByTab((current) => {
      if (!current[tabId]) return current;
      const next = { ...current };
      delete next[tabId];
      return next;
    });
  };

  const setRowAction = (invoiceId, action) => {
    setRowActionState((current) => ({ ...current, [invoiceId]: action }));
  };

  const clearRowAction = (invoiceId) => {
    setRowActionState((current) => {
      if (!current[invoiceId]) return current;
      const next = { ...current };
      delete next[invoiceId];
      return next;
    });
  };

  const handlePrint = async (invoiceId) => {
    if (!invoiceId || rowActionState[invoiceId]) return;
    setRowAction(invoiceId, 'print');
    try {
      await printInvoice(invoiceId, { customers });
    } catch (error) {
      console.error('[adwaa-invoice] Print failed', error);
      alert(explainInvoiceError(error, 'تعذر طباعة الفاتورة'));
    } finally {
      clearRowAction(invoiceId);
    }
  };

  const handleEdit = async (invoiceId) => {
    if (!invoiceId || rowActionState[invoiceId]) return;
    setRowAction(invoiceId, 'edit');
    try {
      const invoice = await getInvoiceById(invoiceId);
      repeatSaleIntoNewTab(invoice);
    } catch (error) {
      console.error('[adwaa-invoice] Edit load failed', error);
      alert(explainInvoiceError(error, 'تعذر تحميل الفاتورة للتعديل'));
    } finally {
      clearRowAction(invoiceId);
    }
  };

  const handleUpdateInvoice = async (draft) => {
    try {
      await updateInvoiceService(draft, { products, customers, user });
      const updatedInvoice = await getInvoiceById(draft.invoiceId);
      return updatedInvoice;
    } catch (error) {
      console.error('[adwaa-invoice] Update failed', error);
      throw new Error(explainInvoiceError(error, 'تعذر تحديث الفاتورة'));
    }
  };

  const closeTab=(id)=>{
    if(tabs.length===1)return;
    const idx=tabs.findIndex(t=>t.id===id);
    const newTabs=tabs.filter(t=>t.id!==id);
    setTabs(newTabs);
    clearDraftForTab(id);
    if(activeTab===id)setActiveTab(newTabs[Math.max(0,idx-1)].id);
  };

  const handleAdd=useCallback((p,sellType)=>{
    window.dispatchEvent(new CustomEvent('cartAdd',{detail:{tabId:activeTab,product:p,sellType}}));
    setSearch('');
  }, [activeTab]);

  const handleSearchEnter = (event) => {
    if (event.key !== 'Enter') return;
    event.preventDefault();
    const queryText = String(search || '').trim();
    if (!queryText) return;
    const normalized = queryText.toLowerCase();
    const exactMatch = products.find((p) => {
      const name = String(p.name || '').trim().toLowerCase();
      const barcode = String(p.barcode || '').trim().toLowerCase();
      const packageBarcode = String(p.packageBarcode || '').trim().toLowerCase();
      return name === normalized || barcode === normalized || packageBarcode === normalized;
    });
    if (exactMatch) {
      handleAdd(exactMatch, inferSellTypeFromSearch(exactMatch, queryText));
      return;
    }
    if (filtered[0]) {
      handleAdd(filtered[0], inferSellTypeFromSearch(filtered[0], queryText));
    }
  };

  const listSales = useMemo(() => {
    const q = String(listSearch || '').trim();
    if (!q) return sales;
    return sales.filter((sale) => (
      sale.invoiceNo?.includes(q)
      || sale.customer?.includes(q)
      || sale.dateISO?.includes(q)
      || sale.cashier?.includes(q)
      || sale.paymentMethod?.includes(q)
    ));
  }, [sales, listSearch]);

  const removeSale = async (sale) => {
    if (!sale?.id) return;
    if (!confirm(`حذف الفاتورة ${sale.invoiceNo || ''}؟ سيتم عكس أثرها على المخزون والحسابات.`)) return;
    try {
      if (hasLocalApi()) {
        await localDeleteSale({ id: sale.id });
        runLocalSync().catch(() => null);
        return;
      }
      const batch = writeBatch(db);
      for (const item of sale.items || []) {
        let product = productMap[item.id];
        if (!product) {
          const snap = await getDoc(doc(db, 'pos_products', item.id));
          if (snap.exists()) product = { id: snap.id, ...snap.data() };
        }
        if (!product) continue;
        const qtyUnits = item.isPackage
          ? Number(item.qty || 0) * Math.max(1, Number(item.packageQty || 1))
          : Number(item.qty || 0);
        batch.set(doc(db, 'pos_products', item.id), {
          stock: Number(product.stock || 0) + qtyUnits,
          soldCount: Math.max(0, Number(product.soldCount || 0) - qtyUnits),
        }, { merge: true });
      }

      const customerName = String(sale.customer || '').trim();
      if (customerName && customerName !== 'زبون عام') {
        let customerRef = null;
        if (sale.customerId) {
          const snap = await getDoc(doc(db, 'pos_customers', sale.customerId));
          if (snap.exists()) customerRef = { id: snap.id, data: snap.data() };
        }
        if (!customerRef) {
          const found = await getDocs(query(collection(db, 'pos_customers'), where('name', '==', customerName)));
          if (!found.empty) customerRef = { id: found.docs[0].id, data: found.docs[0].data() };
        }
        if (customerRef) {
          const currencyCode = sale.currency === 'USD' ? 'USD' : 'IQD';
          const rate = Number(sale.exchangeRate || 1) || 1;
          const totalDisplay = currencyCode === 'USD' ? Number(sale.total || 0) / rate : Number(sale.total || 0);
          const dueDisplay = currencyCode === 'USD' ? Number(sale.dueAmount || sale.remainingAmount || 0) / rate : Number(sale.dueAmount || sale.remainingAmount || 0);
          const nextTotalsByCurrency = applyCurrencyDelta(readTotalByCurrency(customerRef.data), currencyCode, -totalDisplay);
          const nextDebtByCurrency = applyCurrencyDelta(readDebtByCurrency(customerRef.data), currencyCode, -dueDisplay);
          batch.set(doc(db, 'pos_customers', customerRef.id), {
            totalPurchases: Math.max(0, Number(customerRef.data.totalPurchases || 0) - Number(sale.total || 0)),
            totalPurchasesByCurrency: nextTotalsByCurrency,
            debt: Math.max(0, Number(nextDebtByCurrency.IQD || 0)),
            debtByCurrency: nextDebtByCurrency,
          }, { merge: true });
        }
      }

      const linkedVouchers = await getDocs(query(collection(db, 'pos_vouchers'), where('linkedSaleId', '==', sale.id)));
      linkedVouchers.docs.forEach((voucherDoc) => batch.delete(doc(db, 'pos_vouchers', voucherDoc.id)));
      batch.delete(doc(db, 'pos_sales', sale.id));
      await batch.commit();
    } catch (error) {
      alert('تعذر حذف الفاتورة: ' + getErrorMessage(error));
    }
  };

  const productCards = useMemo(() => filtered.map((p) => (
    <PCard key={p.id} p={p} packageMap={packageMap} priceMode={priceMode}
      onAdd={handleAdd}
      onInfo={(e, product, pkg) => setPopup({product, pkg, pos:{x:Math.min(e.clientX,window.innerWidth-295),y:Math.min(e.clientY,window.innerHeight-390)}})}/>
  )), [filtered, packageMap, priceMode, handleAdd]);

  // قائمة المبيعات
  if(view==='list') return(
    <div style={{padding:20,fontFamily:"'Cairo'",direction:'rtl',background:UI.bg,minHeight:'100%'}}>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:16}}>
        <div style={{color:UI.text,fontSize:20,fontWeight:800}}>🧾 قائمة فواتير البيع</div>
        <button onClick={()=>setView('pos')} style={{background:UI.accent,color:'#fff',border:'none',borderRadius:12,padding:'9px 18px',fontWeight:800,cursor:'pointer',fontSize:13}}>+ بيع جديد</button>
      </div>
        <div style={{display:'grid',gridTemplateColumns:'1fr auto',gap:8,marginBottom:12}}>
        <input value={listSearchInput} onChange={(e)=>setListSearchInput(e.target.value)} placeholder="بحث برقم الفاتورة / الزبون / التاريخ / الكاشير"
          style={{width:'100%',background:'#fff',border:`1px solid ${UI.border}`,borderRadius:10,padding:'10px 12px',color:UI.text,fontSize:12,outline:'none',boxSizing:'border-box'}}/>
        <button onClick={()=>{setListSearchInput('');setListSearch('');}} style={{background:'#fff',border:`1px solid ${UI.border}`,borderRadius:10,padding:'10px 12px',color:UI.muted,cursor:'pointer',fontFamily:"'Cairo'",fontSize:12}}>
          إعادة ضبط
        </button>
      </div>
      <div style={{background:UI.panel,borderRadius:14,border:`1px solid ${UI.border}`,overflow:'hidden'}}>
        <div style={{display:'grid',gridTemplateColumns:'1fr 1.3fr 1fr 1fr 1fr 1fr 1fr 1fr auto auto auto',padding:'11px 18px',background:UI.soft,borderBottom:`1px solid ${UI.borderSoft}`}}>
          {['رقم الفاتورة','الزبون','المبلغ الكلي','الواصل','المتبقي','الدفع','الكاشير','التاريخ','','',''].map(h=>(
            <div key={h} style={{color:UI.muted,fontSize:10,fontWeight:700}}>{h}</div>
          ))}
        </div>
        {listSales.length===0?<div style={{color:UI.subtle,textAlign:'center',padding:60}}>لا توجد فواتير</div>
          :listSales.map((s,i)=>(
          <div key={s.id} style={{display:'grid',gridTemplateColumns:'1fr 1.3fr 1fr 1fr 1fr 1fr 1fr 1fr auto auto auto',padding:'10px 18px',borderBottom:i<listSales.length-1?`1px solid ${UI.borderSoft}`:'none',alignItems:'center',background:i%2===0?'transparent':UI.soft}}>
            <div style={{color:UI.success,fontSize:11,fontWeight:700}}>{s.invoiceNo}</div>
            <div style={{color:UI.text,fontSize:11}}>{s.customer}</div>
            <div style={{color:UI.accent,fontSize:12,fontWeight:800}}>{fmtCur(toDisplay(s.total||0,s.currency||'IQD',s.exchangeRate||1),s.currency||'IQD')}</div>
            <div style={{color:UI.info,fontSize:11,fontWeight:700}}>{fmtCur(toDisplay((s.receivedAmount ?? s.cash ?? 0),s.currency||'IQD',s.exchangeRate||1),s.currency||'IQD')}</div>
            <div style={{color:(s.remainingAmount||0)>0?'#f59e0b':UI.success,fontSize:11,fontWeight:700}}>{fmtCur(toDisplay((s.remainingAmount||0),s.currency||'IQD',s.exchangeRate||1),s.currency||'IQD')}</div>
            <span style={{background:s.paymentMethod==='آجل'?'#fff7ed':s.paymentMethod==='نقدي'?UI.successSoft:UI.infoSoft,borderRadius:20,padding:'2px 7px',color:s.paymentMethod==='آجل'?'#f59e0b':s.paymentMethod==='نقدي'?UI.success:UI.info,fontSize:9,fontWeight:700,display:'inline-block'}}>{s.paymentMethod}</span>
            <div style={{color:UI.muted,fontSize:10}}>{s.cashier}</div>
            <div style={{color:UI.subtle,fontSize:9}}>{s.dateISO}</div>
            <button disabled={Boolean(rowActionState[s.id])} onClick={() => handlePrint(s.id)} style={{background:UI.infoSoft,border:'1px solid #93c5fd',borderRadius:8,padding:'4px 10px',color:UI.info,fontSize:10,cursor:rowActionState[s.id]?'wait':'pointer',fontFamily:"'Cairo'",fontWeight:700,opacity:rowActionState[s.id]?0.7:1}}>
              {rowActionState[s.id] === 'print' ? '...' : 'طباعة'}
            </button>
            <button disabled={Boolean(rowActionState[s.id])} onClick={() => handleEdit(s.id)} style={{background:UI.accentSoft,border:'1px solid #fcd34d',borderRadius:8,padding:'4px 10px',color:UI.accent,fontSize:10,cursor:rowActionState[s.id]?'wait':'pointer',fontFamily:"'Cairo'",fontWeight:700,opacity:rowActionState[s.id]?0.7:1}}>
              {rowActionState[s.id] === 'edit' ? '...' : 'تعديل'}
            </button>
            <button onClick={() => removeSale(s)} style={{background:UI.dangerSoft,border:'1px solid #fca5a5',borderRadius:8,padding:'4px 10px',color:UI.danger,fontSize:10,cursor:'pointer',fontFamily:"'Cairo'",fontWeight:700}}>
              حذف
            </button>
          </div>
        ))}
      </div>
    </div>
  );

  return(
    <div style={{display:'flex',flexDirection:'column',height:'100%',minHeight:0,fontFamily:"'Cairo'",direction:'rtl',overflow:'hidden',background:UI.bg}}>
      {popup&&<ProductPopup {...popup} onClose={()=>setPopup(null)}/>}
      {showRate&&<div style={{position:'fixed',inset:0,zIndex:700}} onClick={()=>setShowRate(false)}/>}

      {/* شريط التبويبات */}
      <div style={{background:UI.panel,borderBottom:`1px solid ${UI.border}`,display:'flex',alignItems:'flex-end',padding:'4px 8px 0',flexShrink:0,gap:2,overflowX:'auto'}}>
        <button onClick={()=>setView('list')} style={{background:UI.soft,border:`1px solid ${UI.border}`,borderBottom:'none',borderRadius:'7px 7px 0 0',padding:'5px 12px',color:UI.muted,cursor:'pointer',fontSize:10,fontWeight:600,flexShrink:0,marginLeft:4}}>
          📋 القائمة
        </button>
        {tabs.map(tab=>(
          <div key={tab.id}
            style={{display:'flex',alignItems:'center',gap:5,background:activeTab===tab.id?UI.panel:UI.soft,border:`1px solid ${activeTab===tab.id?UI.accent:UI.border}`,borderBottom:'none',borderRadius:'7px 7px 0 0',padding:'5px 10px',cursor:'pointer',flexShrink:0,position:'relative',top:1}}>
            <span onClick={()=>setActiveTab(tab.id)} style={{color:activeTab===tab.id?UI.accent:UI.muted,fontSize:10,fontWeight:activeTab===tab.id?700:400,whiteSpace:'nowrap'}}>
              🧾 {tab.label}
            </span>
            {tabs.length>1&&<span onClick={e=>{e.stopPropagation();closeTab(tab.id);}} style={{color:UI.subtle,fontSize:11,cursor:'pointer',padding:'0 1px'}}>✕</span>}
          </div>
        ))}
        <button onClick={addTab} style={{background:'none',border:`1px solid ${UI.border}`,borderBottom:'none',borderRadius:'7px 7px 0 0',color:UI.muted,cursor:'pointer',fontSize:16,padding:'3px 10px',flexShrink:0}} title="فاتورة جديدة">＋</button>

        {/* العملة وسعر الصرف */}
        <div style={{marginRight:'auto',display:'flex',gap:6,alignItems:'center',paddingBottom:4,flexShrink:0}}>
          {Object.entries(PRICE_MODES).map(([mode, meta])=>(
            <button key={mode} onClick={()=>setPriceMode(mode)}
              style={{background:priceMode===mode?UI.purpleSoft:'transparent',color:priceMode===mode?UI.purple:UI.muted,border:`1px solid ${priceMode===mode?UI.purple:UI.border}`,borderRadius:7,padding:'3px 8px',fontSize:9,cursor:'pointer',fontWeight:priceMode===mode?700:400}}>
              {meta.label}
            </button>
          ))}
          {['IQD','USD'].map(c=>(
            <button key={c} onClick={()=>setCurrency(c)}
              style={{background:currency===c?UI.accentSoft:'transparent',color:currency===c?UI.accent:UI.muted,border:`1px solid ${currency===c?UI.accent:UI.border}`,borderRadius:7,padding:'3px 8px',fontSize:9,cursor:'pointer',fontWeight:currency===c?700:400}}>
              {c==='IQD'?'دينار':'دولار $'}
            </button>
          ))}
          {currency==='USD'&&(
            <div style={{position:'relative'}}>
              <button onClick={()=>setShowRate(!showRate)}
                style={{background:UI.infoSoft,border:`1px solid #93c5fd`,borderRadius:7,padding:'3px 8px',color:UI.info,fontSize:9,cursor:'pointer',fontWeight:700}}>
                1$={rate.toLocaleString()} د.ع
              </button>
              {showRate&&(
                <div style={{position:'absolute',bottom:'110%',left:0,background:UI.panel,border:`1px solid ${UI.border}`,borderRadius:10,padding:10,zIndex:800,boxShadow:'0 10px 30px rgba(15,23,42,0.12)'}}>
                  <div style={{color:UI.muted,fontSize:10,marginBottom:5}}>سعر الصرف</div>
                  <input type="text" inputMode="decimal" value={rate} onChange={e=>setRate(Number(e.target.value))} onDoubleClick={selectFieldValue} autoFocus
                    style={{width:90,background:'#fff',border:`1px solid #93c5fd`,borderRadius:6,padding:'5px 7px',color:UI.info,fontSize:13,outline:'none',fontWeight:700}}/>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* المحتوى */}
      <div style={{flex:1,display:'flex',overflow:'auto',flexWrap:'wrap',alignItems:'stretch',minHeight:0}}>
        {/* المنتجات */}
        <div style={{flex:'999 1 540px',minWidth:0,display:'flex',flexDirection:'column',overflow:'hidden'}}>
          <div style={{padding:'6px 10px',borderBottom:`1px solid ${UI.border}`}}>
            <input value={search} onChange={e=>setSearch(e.target.value)} onKeyDown={handleSearchEnter} placeholder="🔍 اسم / باركود..."
              style={{width:'100%',background:'#fff',border:`1px solid ${UI.border}`,borderRadius:9,padding:'7px 12px',color:UI.text,fontSize:12,outline:'none',boxSizing:'border-box',marginBottom:5}}/>
            <div style={{display:'flex',gap:5,overflowX:'auto',paddingBottom:2}}>
              {cats.map(c=>(
                <button key={c} onClick={()=>setCatFilter(c)}
                  style={{background:catFilter===c?UI.accent:'#fff',color:catFilter===c?'#fff':UI.muted,border:`1px solid ${catFilter===c?UI.accent:UI.border}`,borderRadius:20,padding:'3px 10px',fontSize:10,cursor:'pointer',whiteSpace:'nowrap',fontWeight:catFilter===c?700:400}}>
                  {c}
                </button>
              ))}
            </div>
          </div>
          <div style={{flex:1,overflowY:'auto',padding:8,minHeight:280}}>
            <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill, minmax(120px, 1fr))',gap:7}}>
              {productCards}
            </div>
          </div>
        </div>

        {/* فاتورة كل تبويب */}
        {tabs.map(tab=>(
            <div key={tab.id} style={{display:activeTab===tab.id?'flex':'none',flex:'1 1 340px',maxWidth:'100%'}}>
              <CartPanel key={`${tab.id}:${draftsByTab[tab.id]?.invoiceId || draftsByTab[tab.id]?.createdAt || 'blank'}`} tabId={tab.id} products={products} productMap={productMap} packageMap={packageMap}
                customers={customers} customerMap={customerMap} user={user} currency={currency} exchangeRate={rate} priceMode={priceMode}
                initialDraft={draftsByTab[tab.id] || null}
                onDraftApplied={clearDraftForTab}
                onUpdateInvoice={handleUpdateInvoice}
              onClose={()=>closeTab(tab.id)}/>
            </div>
        ))}
      </div>
    </div>
  );
}
