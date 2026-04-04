import { useState, useEffect } from 'react';
import { collection, onSnapshot, addDoc, updateDoc, doc } from 'firebase/firestore';
import { db } from '../../firebase';
import { openProfessionalInvoicePrint } from '../../utils/invoicePrint';
import { hasLocalApi, localCreatePurchaseReturn, runLocalSync } from '../../data/api/localApi';

const fmt = n=>(n||0).toLocaleString('ar-IQ')+' د.ع';
const today=()=>new Date().toISOString().split('T')[0];
const nowStr=()=>new Date().toLocaleDateString('ar-IQ',{year:'numeric',month:'short',day:'numeric'});
const genCode = (prefix) => `${prefix}-${Date.now().toString().slice(-6)}${Math.floor(Math.random() * 90 + 10)}`;
const selectFieldValue = (event) => {
  event.currentTarget.select?.();
};
const readDebtByCurrency = (entity = {}) => ({
  IQD: Number(entity?.debtByCurrency?.IQD ?? entity?.debtByCurrency?.iqd ?? entity?.debt ?? 0) || 0,
  USD: Number(entity?.debtByCurrency?.USD ?? entity?.debtByCurrency?.usd ?? 0) || 0,
});

export default function PurchaseReturn({user}){
  const [purchases, setPurchases] = useState([]);
  const [returns,   setReturns]   = useState([]);
  const [products,  setProducts]  = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [view,      setView]      = useState('list');
  const [selReturn, setSelReturn] = useState(null);
  const [saving,    setSaving]    = useState(false);
  const [search,    setSearch]    = useState('');
  const [searchInv, setSearchInv] = useState('');
  const [selPurch,  setSelPurch]  = useState(null);
  const [returnItems,setReturnItems]=useState([]);
  const [reason,    setReason]    = useState('');
  const [received,  setReceived]  = useState('');
  const [date,      setDate]      = useState(today());

  useEffect(()=>{
    const us=[
      onSnapshot(collection(db,'pos_purchases'),        s=>setPurchases(s.docs.map(d=>({...d.data(),id:d.id})).sort((a,b)=>new Date(b.createdAt)-new Date(a.createdAt)))),
      onSnapshot(collection(db,'pos_purchase_returns'), s=>setReturns(s.docs.map(d=>({...d.data(),id:d.id})).sort((a,b)=>new Date(b.createdAt)-new Date(a.createdAt)))),
      onSnapshot(collection(db,'pos_products'),         s=>setProducts(s.docs.map(d=>({...d.data(),id:d.id})))),
      onSnapshot(collection(db,'pos_suppliers'),        s=>setSuppliers(s.docs.map(d=>({...d.data(),id:d.id})))),
    ];
    return()=>us.forEach(u=>u());
  },[]);

  const filteredPurch=purchases.filter(p=>!searchInv||p.invoiceNo?.includes(searchInv)||p.supplier?.includes(searchInv));
  const selectPurch=(p)=>{setSelPurch(p);setReturnItems((p.items||[]).map(i=>({...i,returnQty:0,maxQty:i.qty})));};
  const updateQty=(idx,v)=>setReturnItems(r=>r.map((i,ii)=>ii===idx?{...i,returnQty:Math.min(Number(v),i.maxQty)}:i));
  const returnTotal=returnItems.reduce((s,i)=>s+(i.buyPrice||0)*(i.returnQty||0),0);
  const receivedInputValue = received === '' ? returnTotal : received;
  const receivedAmount=Math.max(0, Number(received === '' ? returnTotal : received)||0);
  const settledAmount=Math.min(receivedAmount, returnTotal);
  const remainingAmount=Math.max(0, returnTotal-settledAmount);
  const refundMethod=remainingAmount>0?'آجل':'نقدي';
  const previousDebt=Number(suppliers.find(s=>s.id===selPurch?.supplierId)?.debt || 0);
  const accountTotal=Math.max(0, previousDebt-settledAmount);
  const hasReturn=returnItems.some(i=>(i.returnQty||0)>0);
  const reset=()=>{setSelPurch(null);setReturnItems([]);setReason('');setReceived('');setDate(today());setSearchInv('');};

  const save=async()=>{
    if(!selPurch||!hasReturn)return alert('اختر فاتورة وحدد كمية الإرجاع');
    if(receivedAmount > returnTotal)return alert('لا يمكن أن يكون المبلغ الواصل أكبر من مبلغ الإرجاع');
    setSaving(true);
    try{
      const returnNo='PRET-'+Date.now().toString().slice(-6);
      const items=returnItems.filter(i=>(i.returnQty||0)>0);
      if (hasLocalApi()) {
        const localRet = await localCreatePurchaseReturn({
          returnNo,
          originalInvoice: selPurch.invoiceNo,
          originalId: selPurch.id,
          supplier: selPurch.supplier,
          supplierId: selPurch.supplierId || '',
          items: items.map((i) => ({ id:i.id, name:i.name, returnQty:Number(i.returnQty || 0), buyPrice:Number(i.buyPrice || 0), total:(Number(i.buyPrice || 0) * Number(i.returnQty || 0)) })),
          total: returnTotal,
          receivedAmount,
          settledAmount,
          paidAmount: receivedAmount,
          remainingAmount,
          dueAmount: remainingAmount,
          refundMethod,
          previousDebt,
          accountTotal,
          reason,
          date: nowStr(),
          dateISO: date,
          addedBy: user.name,
        });
        runLocalSync().catch(() => null);
        reset();setView('list');alert('✅ تم الإرجاع');
        setSaving(false);
        return localRet;
      }
      const ret={returnNo,originalInvoice:selPurch.invoiceNo,originalId:selPurch.id,
        supplier:selPurch.supplier,supplierId:selPurch.supplierId||'',
        items:items.map(i=>({id:i.id,name:i.name,returnQty:i.returnQty,buyPrice:i.buyPrice,total:(i.buyPrice||0)*i.returnQty})),
        total:returnTotal,receivedAmount,settledAmount,paidAmount:receivedAmount,remainingAmount,dueAmount:remainingAmount,refundMethod,previousDebt,accountTotal,reason,date:nowStr(),dateISO:date,
        addedBy:user.name,createdAt:new Date().toISOString()};
      const retRef = await addDoc(collection(db,'pos_purchase_returns'),ret);
      for(const item of items){
        const p=products.find(p=>p.id===item.id);
        if(p)await updateDoc(doc(db,'pos_products',item.id),{stock:Math.max(0,(p.stock||0)-item.returnQty)});
      }
      if(selPurch.paymentMethod==='آجل'&&selPurch.supplierId){
        const s=suppliers.find(s=>s.id===selPurch.supplierId);
        if(s){
          const nextDebtByCurrency = { ...readDebtByCurrency(s), IQD: Math.max(0, Number(readDebtByCurrency(s).IQD || 0) - settledAmount) };
          await updateDoc(doc(db,'pos_suppliers',selPurch.supplierId),{
            debt:Math.max(0,(s.debt||0)-settledAmount),
            debtByCurrency:nextDebtByCurrency,
          });
        }
      }
      if (settledAmount > 0 && selPurch.supplierId) {
        const voucherNo = genCode('V-RP');
        await addDoc(collection(db,'pos_vouchers'),{
          voucherNo,
          type:'قبض',
          amount:settledAmount,
          amountIQD:settledAmount,
          amountIQDEntry:settledAmount,
          amountUSDEntry:0,
          currency:'دينار عراقي',
          exchangeRate:1,
          fromTo:selPurch.supplier || '',
          description:`تسوية تلقائية لإرجاع الشراء ${returnNo}`,
          paymentMethod:'نقدي',
          dateISO:date,
          date:nowStr(),
          source:'purchase_return_auto',
          linkedReturnId:retRef.id,
          linkedReturnNo:returnNo,
          addedBy:user.name,
          status:'مؤكد',
          createdAt:new Date().toISOString(),
        });
        await updateDoc(retRef,{ linkedVoucherNo:voucherNo });
      }
      reset();setView('list');alert('✅ تم الإرجاع');
    }catch(e){alert('خطأ!');}
    setSaving(false);
  };

  const printRet=(r)=>{
    const ok = openProfessionalInvoicePrint({
      ...r,
      invoiceNo: r.originalInvoice,
      returnNo: r.returnNo,
      paymentMethod: r.refundMethod,
      paidAmount: r.receivedAmount || 0,
      dueAmount: r.remainingAmount || 0,
      supplierPhone: suppliers.find((s)=>s.id===r.supplierId || s.name===r.supplier)?.phone || '',
      supplierAddress: suppliers.find((s)=>s.id===r.supplierId || s.name===r.supplier)?.address || '',
      notes: r.reason || '',
    }, 'purchase_return');
    if (!ok) alert('تعذر فتح نافذة الطباعة. تأكد من السماح بالنوافذ المنبثقة.');
  };

  if(view==='detail'&&selReturn) return(
    <div style={{padding:24,fontFamily:"'Cairo'",direction:'rtl'}}>
      <div style={{display:'flex',gap:12,alignItems:'center',marginBottom:20}}>
        <button onClick={()=>{setView('list');setSelReturn(null);}} style={{background:'#ffffff',border:'1px solid #cdd8ec',borderRadius:10,padding:'7px 14px',color:'#F5C800',cursor:'pointer',fontFamily:"'Cairo'"}}>← رجوع</button>
        <div style={{color:'#fff',fontSize:18,fontWeight:800}}>إرجاع شراء #{selReturn.returnNo}</div>
      </div>
      <div style={{background:'#ffffff',borderRadius:16,padding:22,border:'1px solid #f59e0b33',maxWidth:560}}>
        <div style={{textAlign:'center',marginBottom:16,paddingBottom:14,borderBottom:'1px solid #d9e2f2'}}>
          <div style={{fontSize:44,marginBottom:6}}>↩️</div>
          <div style={{color:'#f59e0b',fontSize:18,fontWeight:800}}>إرجاع شراء</div>
          <div style={{color:'#64748b',fontSize:12}}>{selReturn.returnNo}</div>
        </div>
        {[['الفاتورة الأصلية',selReturn.originalInvoice],['المورد',selReturn.supplier],['التاريخ',selReturn.dateISO||selReturn.date],['طريقة التسوية',selReturn.refundMethod],['الدين السابق',fmt(selReturn.previousDebt||0)],['المسوّى فعليًا',fmt(selReturn.settledAmount ?? selReturn.receivedAmount ?? 0)],['الحساب الكلي',fmt(selReturn.accountTotal||0)],['الواصل',fmt(selReturn.receivedAmount||0)],['المتبقي',fmt(selReturn.remainingAmount||0)],selReturn.reason&&['السبب',selReturn.reason]].filter(Boolean).map(([l,v])=>(
          <div key={l} style={{display:'flex',justifyContent:'space-between',padding:'9px 0',borderBottom:'1px solid #e2e8f7'}}>
            <span style={{color:'#64748b',fontSize:12}}>{l}</span><span style={{color:'#1e293b',fontSize:13,fontWeight:600}}>{v}</span>
          </div>
        ))}
        <div style={{marginTop:14}}>
          {(selReturn.items||[]).map((item,i)=>(
            <div key={i} style={{display:'flex',justifyContent:'space-between',padding:'7px 0',borderBottom:'1px solid #ffffff'}}>
              <span style={{color:'#aaa',fontSize:12}}>{item.name} × {item.returnQty}</span>
              <span style={{color:'#f59e0b',fontSize:13,fontWeight:700}}>{fmt(item.total)}</span>
            </div>
          ))}
        </div>
        <div style={{background:'#f59e0b22',border:'1px solid #f59e0b44',borderRadius:11,padding:14,marginTop:14,textAlign:'center'}}>
          <div style={{color:'#f59e0b',fontSize:11,marginBottom:3}}>إجمالي المُسترد من المورد</div>
          <div style={{color:'#f59e0b',fontSize:26,fontWeight:900}}>{fmt(selReturn.total)}</div>
        </div>
        <button onClick={()=>printRet(selReturn)} style={{width:'100%',background:'#3b82f6',color:'#fff',border:'none',borderRadius:11,padding:11,fontWeight:700,cursor:'pointer',fontFamily:"'Cairo'",marginTop:14}}>🖨️ طباعة</button>
      </div>
    </div>
  );

  if(view==='new') return(
    <div style={{padding:24,fontFamily:"'Cairo'",direction:'rtl'}}>
      <div style={{display:'flex',gap:12,alignItems:'center',marginBottom:20}}>
        <button onClick={()=>{reset();setView('list');}} style={{background:'#ffffff',border:'1px solid #cdd8ec',borderRadius:10,padding:'7px 14px',color:'#64748b',cursor:'pointer',fontFamily:"'Cairo'"}}>← إلغاء</button>
        <div style={{color:'#fff',fontSize:18,fontWeight:800}}>↩️ إرجاع شراء جديد</div>
      </div>
      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:18}}>
        <div style={{background:'#ffffff',borderRadius:14,padding:18,border:'1px solid #d9e2f2'}}>
          <div style={{color:'#fff',fontSize:13,fontWeight:700,marginBottom:12}}>ابحث عن فاتورة الشراء</div>
          <input value={searchInv} onChange={e=>setSearchInv(e.target.value)} placeholder="🔍 رقم الفاتورة أو المورد..."
            style={{width:'100%',color:'#0f172a',fontSize:12,outline:'none',marginBottom:10,boxSizing:'border-box',fontFamily:"'Cairo'"}}/>
          <div style={{maxHeight:320,overflowY:'auto'}}>
            {filteredPurch.map(p=>(
              <div key={p.id} onClick={()=>selectPurch(p)}
                style={{padding:11,borderRadius:11,marginBottom:7,cursor:'pointer',border:`2px solid ${selPurch?.id===p.id?'#f59e0b':'#d9e2f2'}`,background:selPurch?.id===p.id?'#f59e0b11':'#f8fbff',transition:'all .12s'}}>
                <div style={{display:'flex',justifyContent:'space-between',marginBottom:3}}>
                  <span style={{color:'#f59e0b',fontSize:11,fontWeight:700}}>{p.invoiceNo}</span>
                  <span style={{color:'#F5C800',fontSize:11,fontWeight:700}}>{fmt(p.total)}</span>
                </div>
                <div style={{color:'#1e293b',fontSize:11}}>{p.supplier}</div>
                <div style={{color:'#64748b',fontSize:10}}>{p.dateISO||p.date} • {p.paymentMethod}</div>
              </div>
            ))}
          </div>
        </div>
        <div>
          {!selPurch
            ?<div style={{background:'#ffffff',borderRadius:14,padding:40,border:'1px solid #d9e2f2',textAlign:'center'}}>
              <div style={{fontSize:44,marginBottom:10}}>↩️</div>
              <div style={{color:'#64748b',fontSize:13}}>اختر فاتورة شراء من اليسار</div>
            </div>
            :<div style={{background:'#ffffff',borderRadius:14,padding:18,border:'1px solid #f59e0b33'}}>
              <div style={{color:'#f59e0b',fontSize:13,fontWeight:800,marginBottom:14}}>فاتورة #{selPurch.invoiceNo} — {selPurch.supplier}</div>
              <div style={{marginBottom:14}}>
                <div style={{display:'grid',gridTemplateColumns:'2fr 1fr 1fr 1fr',gap:7,padding:'7px 0',borderBottom:'1px solid #e2e8f7',marginBottom:7}}>
                  {['المادة','سعر الشراء','الكمية','الإرجاع'].map(h=><div key={h} style={{color:'#64748b',fontSize:10,fontWeight:700}}>{h}</div>)}
                </div>
                {returnItems.map((item,idx)=>(
                  <div key={idx} style={{display:'grid',gridTemplateColumns:'2fr 1fr 1fr 1fr',gap:7,marginBottom:7,alignItems:'center'}}>
                    <div style={{color:'#1e293b',fontSize:11}}>{item.name}</div>
                    <div style={{color:'#f59e0b',fontSize:11}}>{fmt(item.buyPrice)}</div>
                    <div style={{color:'#64748b',fontSize:11,textAlign:'center'}}>{item.maxQty}</div>
                    <input type="text" inputMode="numeric" value={item.returnQty} onChange={e=>updateQty(idx,e.target.value)} onDoubleClick={selectFieldValue}
                      style={{background:'#f8fbff',border:`1px solid ${(item.returnQty||0)>0?'#f59e0b':'#cdd8ec'}`,borderRadius:7,padding:'5px 7px',color:'#f59e0b',fontSize:12,outline:'none',fontWeight:700}}/>
                  </div>
                ))}
              </div>
              <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10,marginBottom:12}}>
                <div>
                  <label style={{color:'#64748b',fontSize:11,display:'block',marginBottom:4}}>التاريخ</label>
                  <input type="date" value={date} onChange={e=>setDate(e.target.value)} style={{width:'100%',color:'#0f172a',outline:'none',boxSizing:'border-box'}}/>
                </div>
                <div>
                  <label style={{color:'#64748b',fontSize:11,display:'block',marginBottom:4}}>الواصل</label>
                  <input
                    type="text"
                    inputMode="decimal"
                    value={receivedInputValue}
                    onChange={e=>{
                      const nextValue = e.target.value;
                      if(nextValue === ''){ setReceived(''); return; }
                      if(Number(nextValue) > returnTotal){
                        setReceived(String(returnTotal));
                        return;
                      }
                      setReceived(nextValue);
                    }}
                    onDoubleClick={selectFieldValue}
                    placeholder="0"
                    style={{width:'100%',color:'#0f172a',outline:'none',boxSizing:'border-box'}}/>
                </div>
              </div>
              {selPurch?.supplierId && previousDebt>0 && <div style={{display:'flex',justifyContent:'space-between',background:'#fff7ed',border:'1px solid #fdba74',borderRadius:10,padding:'8px 10px',marginBottom:12}}>
                <span style={{color:'#64748b',fontSize:11}}>الدين السابق</span>
                <span style={{color:'#c2410c',fontSize:12,fontWeight:800}}>{fmt(previousDebt)}</span>
              </div>}
              <div style={{marginBottom:14}}>
                <label style={{color:'#64748b',fontSize:11,display:'block',marginBottom:4}}>سبب الإرجاع</label>
                <input value={reason} onChange={e=>setReason(e.target.value)} placeholder="سبب الإرجاع..."
                  style={{width:'100%',color:'#0f172a',outline:'none',boxSizing:'border-box',fontFamily:"'Cairo'"}}/>
              </div>
              {hasReturn&&<div style={{background:'#f59e0b22',border:'1px solid #f59e0b44',borderRadius:10,padding:14,marginBottom:12,textAlign:'center'}}>
                <div style={{color:'#f59e0b',fontSize:11,marginBottom:3}}>المبلغ الكلي</div>
                <div style={{color:'#f59e0b',fontSize:24,fontWeight:900}}>{fmt(returnTotal)}</div>
              </div>}
              {hasReturn&&<div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8,marginBottom:12}}>
                <div style={{background:'#dbeafe',border:'1px solid #93c5fd',borderRadius:10,padding:12,textAlign:'center'}}>
                  <div style={{color:'#2563eb',fontSize:10,marginBottom:3}}>المبلغ الواصل</div>
                  <div style={{color:'#1d4ed8',fontSize:18,fontWeight:900}}>{fmt(receivedAmount)}</div>
                </div>
                <div style={{background:remainingAmount>0?'#fff7ed':'#ecfdf5',border:`1px solid ${remainingAmount>0?'#fdba74':'#86efac'}`,borderRadius:10,padding:12,textAlign:'center'}}>
                  <div style={{color:remainingAmount>0?'#c2410c':'#047857',fontSize:10,marginBottom:3}}>المبلغ المتبقي</div>
                  <div style={{color:remainingAmount>0?'#c2410c':'#047857',fontSize:18,fontWeight:900}}>{fmt(remainingAmount)}</div>
                </div>
              </div>}
              {selPurch?.supplierId && hasReturn && <div style={{background:'#f3e8ff',border:'1px solid #d8b4fe',borderRadius:10,padding:10,marginBottom:12,textAlign:'center'}}>
                <div style={{color:'#7C3AED',fontSize:10,marginBottom:3}}>مبلغ الحساب الكلي</div>
                <div style={{color:'#6D28D9',fontSize:18,fontWeight:900}}>{fmt(accountTotal)}</div>
              </div>}
              {hasReturn&&<div style={{background:'#f8fbff',border:'1px solid #d9e2f2',borderRadius:10,padding:10,marginBottom:12,textAlign:'center',color:refundMethod==='آجل'?'#f59e0b':'#10b981',fontWeight:800,fontSize:12}}>
                حالة الإرجاع: {refundMethod}
              </div>}
              <button onClick={save} disabled={saving||!hasReturn}
                style={{width:'100%',background:!hasReturn?'#ffffff':'linear-gradient(135deg,#f59e0b,#d97706)',color:!hasReturn?'#cdd8ec':'#000',border:'none',borderRadius:11,padding:13,fontWeight:800,fontSize:14,cursor:!hasReturn?'not-allowed':'pointer'}}>
                {saving?'⏳ جاري...':`↩️ حفظ إرجاع الشراء — ${fmt(returnTotal)}`}
              </button>
            </div>
          }
        </div>
      </div>
    </div>
  );

  const filteredRet=returns.filter(r=>!search||r.returnNo?.includes(search)||r.supplier?.includes(search)||r.originalInvoice?.includes(search));
  return(
    <div style={{padding:20,fontFamily:"'Cairo'",direction:'rtl'}}>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:16}}>
        <div>
          <div style={{color:'#fff',fontSize:20,fontWeight:800}}>↩️ إرجاع الشراء</div>
          <div style={{color:'#64748b',fontSize:12}}>{returns.length} عملية إرجاع</div>
        </div>
        <button onClick={()=>setView('new')} style={{background:'#f59e0b',color:'#000',border:'none',borderRadius:12,padding:'9px 18px',fontWeight:800,cursor:'pointer',fontSize:13}}>+ إرجاع شراء</button>
      </div>
      <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="🔍 ابحث..."
        style={{width:'100%',color:'#0f172a',fontSize:12,outline:'none',marginBottom:14,boxSizing:'border-box'}}/>
      <div style={{background:'#ffffff',borderRadius:14,border:'1px solid #d9e2f2',overflow:'hidden'}}>
        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1.3fr 1fr 1fr 1fr 1fr 1fr',padding:'11px 18px',background:'#f8fbff',borderBottom:'1px solid #e2e8f7'}}>
          {['رقم الإرجاع','الفاتورة','المورد','المواد','المبلغ الكلي','الحساب الكلي','الواصل','المتبقي','إجراء'].map(h=><div key={h} style={{color:'#64748b',fontSize:10,fontWeight:700}}>{h}</div>)}
        </div>
        {filteredRet.length===0?<div style={{color:'#cdd8ec',textAlign:'center',padding:50}}>لا توجد إرجاعات</div>
          :filteredRet.map((r,i)=>(
          <div key={r.id} style={{display:'grid',gridTemplateColumns:'1fr 1fr 1.3fr 1fr 1fr 1fr 1fr 1fr 1fr',padding:'10px 18px',borderBottom:i<filteredRet.length-1?'1px solid #ffffff':'none',alignItems:'center',background:i%2===0?'transparent':'#f8fbff'}}>
            <div style={{color:'#f59e0b',fontSize:11,fontWeight:700}}>{r.returnNo}</div>
            <div style={{color:'#F5C800',fontSize:11}}>{r.originalInvoice}</div>
            <div style={{color:'#1e293b',fontSize:11}}>{r.supplier}</div>
            <div style={{color:'#666',fontSize:11}}>{r.items?.length||0} صنف</div>
            <div style={{color:'#f59e0b',fontSize:12,fontWeight:800}}>{fmt(r.total)}</div>
            <div style={{color:'#7C3AED',fontSize:11,fontWeight:700}}>{fmt(r.accountTotal||0)}</div>
            <div style={{color:'#2563eb',fontSize:11,fontWeight:700}}>{fmt(r.receivedAmount||0)}</div>
            <div style={{color:(r.remainingAmount||0)>0?'#c2410c':'#047857',fontSize:11,fontWeight:700}}>{fmt(r.remainingAmount||0)}</div>
            <div style={{display:'flex',gap:5}}>
              <button onClick={()=>{setSelReturn(r);setView('detail');}} style={{background:'#f59e0b22',border:'1px solid #f59e0b44',borderRadius:7,padding:'4px 8px',color:'#f59e0b',fontSize:11,cursor:'pointer'}}>👁️</button>
              <button onClick={()=>printRet(r)} style={{background:'#3b82f622',border:'1px solid #3b82f644',borderRadius:7,padding:'4px 8px',color:'#3b82f6',fontSize:11,cursor:'pointer'}}>🖨️</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
