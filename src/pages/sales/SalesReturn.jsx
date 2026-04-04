import { useState, useEffect } from 'react';
import { collection, onSnapshot, addDoc, updateDoc, doc } from 'firebase/firestore';
import { db } from '../../firebase';
import { openProfessionalInvoicePrint } from '../../utils/invoicePrint';
import { hasLocalApi, localCreateSaleReturn, runLocalSync } from '../../data/api/localApi';

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

export default function SalesReturn({user}){
  const [sales,     setSales]     = useState([]);
  const [returns,   setReturns]   = useState([]);
  const [products,  setProducts]  = useState([]);
  const [customers, setCustomers] = useState([]);
  const [view,      setView]      = useState('list');
  const [selReturn, setSelReturn] = useState(null);
  const [saving,    setSaving]    = useState(false);
  const [search,    setSearch]    = useState('');
  const [searchInv, setSearchInv] = useState('');
  const [selSale,   setSelSale]   = useState(null);
  const [returnItems,setReturnItems]=useState([]);
  const [reason,       setReason]       = useState('');
  const [received,     setReceived]     = useState('');
  const [date,         setDate]         = useState(today());
  const [discount,     setDiscount]     = useState(0);
  const [discountType, setDiscountType] = useState('percent');

  useEffect(()=>{
    const us=[
      onSnapshot(collection(db,'pos_sales'),    s=>setSales(s.docs.map(d=>({...d.data(),id:d.id})).sort((a,b)=>new Date(b.createdAt)-new Date(a.createdAt)))),
      onSnapshot(collection(db,'pos_returns'),  s=>setReturns(s.docs.map(d=>({...d.data(),id:d.id})).sort((a,b)=>new Date(b.createdAt)-new Date(a.createdAt)))),
      onSnapshot(collection(db,'pos_products'), s=>setProducts(s.docs.map(d=>({...d.data(),id:d.id})))),
      onSnapshot(collection(db,'pos_customers'),s=>setCustomers(s.docs.map(d=>({...d.data(),id:d.id})))),
    ];
    return()=>us.forEach(u=>u());
  },[]);

  const filteredSales=sales.filter(s=>!searchInv||s.invoiceNo?.includes(searchInv)||s.customer?.includes(searchInv));
  const selectSale=(s)=>{setSelSale(s);setReturnItems((s.items||[]).map(i=>({...i,returnQty:0,maxQty:i.qty})));};
  const updateQty=(idx,v)=>setReturnItems(r=>r.map((i,ii)=>ii===idx?{...i,returnQty:Math.min(Number(v),i.maxQty)}:i));
  const returnSubtotal=returnItems.reduce((s,i)=>s+(i.price||0)*(i.returnQty||0),0);
  const returnDiscAmt=discountType==='percent'
    ? returnSubtotal*(Number(discount||0)/100)
    : Math.min(Number(discount||0), returnSubtotal);
  const returnTotal=returnSubtotal-returnDiscAmt;
  const receivedInputValue = received === '' ? returnTotal : received;
  const receivedAmount=Math.max(0, Number(received === '' ? returnTotal : received)||0);
  const settledAmount=Math.min(receivedAmount, returnTotal);
  const remainingAmount=Math.max(0, returnTotal-settledAmount);
  const refundMethod=remainingAmount>0?'آجل':'نقدي';
  const previousDebt=Number(customers.find(c=>c.id===selSale?.customerId)?.debt || 0);
  const accountTotal=Math.max(0, previousDebt-settledAmount);
  const hasReturn=returnItems.some(i=>(i.returnQty||0)>0);
  const reset=()=>{setSelSale(null);setReturnItems([]);setReason('');setReceived('');setDate(today());setSearchInv('');setDiscount(0);setDiscountType('percent');};

  const save=async()=>{
    if(!selSale||!hasReturn)return alert('اختر فاتورة وحدد كمية الإرجاع');
    if(receivedAmount > returnTotal)return alert('لا يمكن أن يكون المبلغ الواصل أكبر من مبلغ الإرجاع');
    setSaving(true);
    try{
      const returnNo='RET-'+Date.now().toString().slice(-6);
      const items=returnItems.filter(i=>(i.returnQty||0)>0);
      if (hasLocalApi()) {
        const localRet = await localCreateSaleReturn({
          returnNo,
          originalInvoice: selSale.invoiceNo,
          originalId: selSale.id,
          customer: selSale.customer,
          customerId: selSale.customerId || '',
          items: items.map((i) => ({ id:i.id, name:i.name, returnQty:Number(i.returnQty || 0), price:Number(i.price || 0), total:(Number(i.price || 0) * Number(i.returnQty || 0)) })),
          subtotal: returnSubtotal,
          discount,
          discountType,
          discountAmount: returnDiscAmt,
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
      const ret={returnNo,originalInvoice:selSale.invoiceNo,originalId:selSale.id,
        customer:selSale.customer,customerId:selSale.customerId||'',
        items:items.map(i=>({id:i.id,name:i.name,returnQty:i.returnQty,price:i.price,total:(i.price||0)*i.returnQty})),
        subtotal:returnSubtotal,discount,discountType,discountAmount:returnDiscAmt,
        total:returnTotal,receivedAmount,settledAmount,paidAmount:receivedAmount,remainingAmount,dueAmount:remainingAmount,refundMethod,previousDebt,accountTotal,reason,date:nowStr(),dateISO:date,
        addedBy:user.name,createdAt:new Date().toISOString()};
      const retRef = await addDoc(collection(db,'pos_returns'),ret);
      for(const item of items){
        const p=products.find(p=>p.id===item.id);
        if(p)await updateDoc(doc(db,'pos_products',item.id),{stock:(p.stock||0)+item.returnQty});
      }
      if(selSale.paymentMethod==='آجل'&&selSale.customerId){
        const c=customers.find(c=>c.id===selSale.customerId);
        if(c){
          const nextDebtByCurrency = { ...readDebtByCurrency(c), IQD: Math.max(0, Number(readDebtByCurrency(c).IQD || 0) - settledAmount) };
          await updateDoc(doc(db,'pos_customers',selSale.customerId),{
            debt:Math.max(0,(c.debt||0)-settledAmount),
            debtByCurrency:nextDebtByCurrency,
          });
        }
      }
      if (settledAmount > 0 && selSale.customerId) {
        const voucherNo = genCode('V-RS');
        await addDoc(collection(db,'pos_vouchers'),{
          voucherNo,
          type:'دفع',
          amount:settledAmount,
          amountIQD:settledAmount,
          amountIQDEntry:settledAmount,
          amountUSDEntry:0,
          currency:'دينار عراقي',
          exchangeRate:1,
          fromTo:selSale.customer || '',
          description:`تسوية تلقائية لإرجاع البيع ${returnNo}`,
          paymentMethod:'نقدي',
          dateISO:date,
          date:nowStr(),
          source:'sale_return_auto',
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
      customerPhone: customers.find((c)=>c.id===r.customerId || c.name===r.customer)?.phone || '',
      customerAddress: customers.find((c)=>c.id===r.customerId || c.name===r.customer)?.address || '',
      notes: r.reason || '',
    }, 'sale_return');
    if (!ok) alert('تعذر فتح نافذة الطباعة. تأكد من السماح بالنوافذ المنبثقة.');
  };

  if(view==='detail'&&selReturn) return(
    <div style={{padding:24,fontFamily:"'Cairo'",direction:'rtl'}}>
      <div style={{display:'flex',gap:12,alignItems:'center',marginBottom:20}}>
        <button onClick={()=>{setView('list');setSelReturn(null);}} style={{background:'#ffffff',border:'1px solid #cdd8ec',borderRadius:10,padding:'7px 14px',color:'#F5C800',cursor:'pointer',fontFamily:"'Cairo'"}}>← رجوع</button>
        <div style={{color:'#fff',fontSize:18,fontWeight:800}}>إرجاع #{selReturn.returnNo}</div>
      </div>
      <div style={{background:'#ffffff',borderRadius:16,padding:22,border:'1px solid #ef444433',maxWidth:560}}>
        <div style={{textAlign:'center',marginBottom:16,paddingBottom:14,borderBottom:'1px solid #d9e2f2'}}>
          <div style={{fontSize:44,marginBottom:6}}>↩️</div>
          <div style={{color:'#ef4444',fontSize:18,fontWeight:800}}>إرجاع بيع</div>
          <div style={{color:'#64748b',fontSize:12}}>{selReturn.returnNo}</div>
        </div>
        {[['الفاتورة الأصلية',selReturn.originalInvoice],['الزبون',selReturn.customer],['التاريخ',selReturn.dateISO||selReturn.date],['طريقة التسوية',selReturn.refundMethod],['الدين السابق',fmt(selReturn.previousDebt||0)],['المسوّى فعليًا',fmt(selReturn.settledAmount ?? selReturn.receivedAmount ?? 0)],['الحساب الكلي',fmt(selReturn.accountTotal||0)],['الواصل',fmt(selReturn.receivedAmount||0)],['المتبقي',fmt(selReturn.remainingAmount||0)],selReturn.reason&&['سبب الإرجاع',selReturn.reason]].filter(Boolean).map(([l,v])=>(
          <div key={l} style={{display:'flex',justifyContent:'space-between',padding:'9px 0',borderBottom:'1px solid #e2e8f7'}}>
            <span style={{color:'#64748b',fontSize:12}}>{l}</span><span style={{color:'#1e293b',fontSize:13,fontWeight:600}}>{v}</span>
          </div>
        ))}
        <div style={{marginTop:14}}>
          {(selReturn.items||[]).map((item,i)=>(
            <div key={i} style={{display:'flex',justifyContent:'space-between',padding:'7px 0',borderBottom:'1px solid #ffffff'}}>
              <span style={{color:'#aaa',fontSize:12}}>{item.name} × {item.returnQty}</span>
              <span style={{color:'#ef4444',fontSize:13,fontWeight:700}}>{fmt(item.total)}</span>
            </div>
          ))}
        </div>
        <div style={{background:'#ef444422',border:'1px solid #ef444444',borderRadius:11,padding:14,marginTop:14,textAlign:'center'}}>
          <div style={{color:'#ef4444',fontSize:11,marginBottom:3}}>إجمالي المُسترد</div>
          <div style={{color:'#ef4444',fontSize:26,fontWeight:900}}>{fmt(selReturn.total)}</div>
        </div>
        <button onClick={()=>printRet(selReturn)} style={{width:'100%',background:'#3b82f6',color:'#fff',border:'none',borderRadius:11,padding:11,fontWeight:700,cursor:'pointer',fontFamily:"'Cairo'",marginTop:14}}>🖨️ طباعة</button>
      </div>
    </div>
  );

  if(view==='new') return(
    <div style={{padding:24,fontFamily:"'Cairo'",direction:'rtl'}}>
      <div style={{display:'flex',gap:12,alignItems:'center',marginBottom:20}}>
        <button onClick={()=>{reset();setView('list');}} style={{background:'#ffffff',border:'1px solid #cdd8ec',borderRadius:10,padding:'7px 14px',color:'#64748b',cursor:'pointer',fontFamily:"'Cairo'"}}>← إلغاء</button>
        <div style={{color:'#fff',fontSize:18,fontWeight:800}}>↩️ إرجاع بيع جديد</div>
      </div>
      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:18}}>
        <div style={{background:'#ffffff',borderRadius:14,padding:18,border:'1px solid #d9e2f2'}}>
          <div style={{color:'#fff',fontSize:13,fontWeight:700,marginBottom:12}}>ابحث عن الفاتورة الأصلية</div>
          <input value={searchInv} onChange={e=>setSearchInv(e.target.value)} placeholder="🔍 رقم الفاتورة أو الزبون..."
            style={{width:'100%',color:'#0f172a',fontSize:12,outline:'none',marginBottom:10,boxSizing:'border-box',fontFamily:"'Cairo'"}}/>
          <div style={{maxHeight:320,overflowY:'auto'}}>
            {filteredSales.map(s=>(
              <div key={s.id} onClick={()=>selectSale(s)}
                style={{padding:11,borderRadius:11,marginBottom:7,cursor:'pointer',border:`2px solid ${selSale?.id===s.id?'#ef4444':'#d9e2f2'}`,background:selSale?.id===s.id?'#ef444411':'#f8fbff',transition:'all .12s'}}>
                <div style={{display:'flex',justifyContent:'space-between',marginBottom:3}}>
                  <span style={{color:'#F5C800',fontSize:11,fontWeight:700}}>{s.invoiceNo}</span>
                  <span style={{color:'#10b981',fontSize:11,fontWeight:700}}>{fmt(s.total)}</span>
                </div>
                <div style={{color:'#1e293b',fontSize:11}}>{s.customer}</div>
                <div style={{color:'#64748b',fontSize:10}}>{s.dateISO||s.date} • {s.paymentMethod}</div>
              </div>
            ))}
          </div>
        </div>
        <div>
          {!selSale
            ?<div style={{background:'#ffffff',borderRadius:14,padding:40,border:'1px solid #d9e2f2',textAlign:'center'}}>
              <div style={{fontSize:44,marginBottom:10}}>↩️</div>
              <div style={{color:'#64748b',fontSize:13}}>اختر فاتورة من اليسار</div>
            </div>
            :<div style={{background:'#ffffff',borderRadius:14,padding:18,border:'1px solid #ef444433'}}>
              <div style={{color:'#ef4444',fontSize:13,fontWeight:800,marginBottom:14}}>فاتورة #{selSale.invoiceNo} — {selSale.customer}</div>
              <div style={{marginBottom:14}}>
                <div style={{display:'grid',gridTemplateColumns:'2fr 1fr 1fr 1fr',gap:7,padding:'7px 0',borderBottom:'1px solid #e2e8f7',marginBottom:7}}>
                  {['المادة','السعر','الكمية','الإرجاع'].map(h=><div key={h} style={{color:'#64748b',fontSize:10,fontWeight:700}}>{h}</div>)}
                </div>
                {returnItems.map((item,idx)=>(
                  <div key={idx} style={{display:'grid',gridTemplateColumns:'2fr 1fr 1fr 1fr',gap:7,marginBottom:7,alignItems:'center'}}>
                    <div>
                      <div style={{color:'#1e293b',fontSize:11}}>{item.name}</div>
                      {item.isPackage&&<span style={{color:'#a78bfa',fontSize:9}}>📦 {item.packageName}</span>}
                    </div>
                    <div style={{color:'#F5C800',fontSize:11}}>{fmt(item.price)}</div>
                    <div style={{color:'#64748b',fontSize:11,textAlign:'center'}}>{item.maxQty}</div>
                    <input type="text" inputMode="numeric" value={item.returnQty} onChange={e=>updateQty(idx,e.target.value)} onDoubleClick={selectFieldValue}
                      style={{background:'#f8fbff',border:`1px solid ${(item.returnQty||0)>0?'#ef4444':'#cdd8ec'}`,borderRadius:7,padding:'5px 7px',color:'#ef4444',fontSize:12,outline:'none',fontWeight:700}}/>
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
              {selSale?.customerId && previousDebt>0 && <div style={{display:'flex',justifyContent:'space-between',background:'#fff7ed',border:'1px solid #fdba74',borderRadius:10,padding:'8px 10px',marginBottom:12}}>
                <span style={{color:'#64748b',fontSize:11}}>الدين السابق</span>
                <span style={{color:'#c2410c',fontSize:12,fontWeight:800}}>{fmt(previousDebt)}</span>
              </div>}
              <div style={{marginBottom:14}}>
                <label style={{color:'#64748b',fontSize:11,display:'block',marginBottom:4}}>سبب الإرجاع</label>
                <input value={reason} onChange={e=>setReason(e.target.value)} placeholder="مثال: منتج تالف..."
                  style={{width:'100%',color:'#0f172a',outline:'none',boxSizing:'border-box',fontFamily:"'Cairo'"}}/>
              </div>
              {hasReturn&&<>
                <div style={{display:'flex',justifyContent:'space-between',marginBottom:4}}>
                  <span style={{color:'#64748b',fontSize:11}}>المجموع</span>
                  <span style={{color:'#1e293b',fontSize:11}}>{fmt(returnSubtotal)}</span>
                </div>
                {/* خصم الإرجاع */}
                <div style={{display:'flex',alignItems:'center',gap:4,marginBottom:4}}>
                  <div style={{display:'flex',borderRadius:6,overflow:'hidden',border:'1px solid #cdd8ec',flexShrink:0}}>
                    <button onClick={()=>{setDiscountType('percent');setDiscount(0);}}
                      style={{padding:'3px 7px',background:discountType==='percent'?'#ef4444':'#fff',color:discountType==='percent'?'#fff':'#64748b',border:'none',cursor:'pointer',fontSize:10,fontWeight:700}}>%</button>
                    <button onClick={()=>{setDiscountType('fixed');setDiscount(0);}}
                      style={{padding:'3px 7px',background:discountType==='fixed'?'#ef4444':'#fff',color:discountType==='fixed'?'#fff':'#64748b',border:'none',cursor:'pointer',fontSize:10,fontWeight:700}}>مقطوع</button>
                  </div>
                  <span style={{color:'#64748b',fontSize:11}}>خصم</span>
                  <input type="number" value={discount} onChange={e=>setDiscount(Number(e.target.value))}
                    min={0} style={{flex:1,background:'#fff',border:'1px solid #cdd8ec',borderRadius:6,padding:'3px 5px',color:'#ef4444',fontSize:11,outline:'none',textAlign:'center'}}/>
                  <span style={{color:'#64748b',fontSize:10}}>{discountType==='percent'?'%':'د.ع'}</span>
                </div>
                {returnDiscAmt>0&&<div style={{display:'flex',justifyContent:'space-between',marginBottom:4}}>
                  <span style={{color:'#ef4444',fontSize:10}}>الخصم</span>
                  <span style={{color:'#ef4444',fontSize:10}}>- {fmt(returnDiscAmt)}</span>
                </div>}
                <div style={{background:'#ef444422',border:'1px solid #ef444444',borderRadius:10,padding:14,marginBottom:12,textAlign:'center'}}>
                  <div style={{color:'#ef4444',fontSize:11,marginBottom:3}}>المبلغ الكلي</div>
                  <div style={{color:'#ef4444',fontSize:24,fontWeight:900}}>{fmt(returnTotal)}</div>
                </div>
                <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8,marginBottom:12}}>
                  <div style={{background:'#dbeafe',border:'1px solid #93c5fd',borderRadius:10,padding:12,textAlign:'center'}}>
                    <div style={{color:'#2563eb',fontSize:10,marginBottom:3}}>المبلغ الواصل</div>
                    <div style={{color:'#1d4ed8',fontSize:18,fontWeight:900}}>{fmt(receivedAmount)}</div>
                  </div>
                  <div style={{background:remainingAmount>0?'#fff7ed':'#ecfdf5',border:`1px solid ${remainingAmount>0?'#fdba74':'#86efac'}`,borderRadius:10,padding:12,textAlign:'center'}}>
                    <div style={{color:remainingAmount>0?'#c2410c':'#047857',fontSize:10,marginBottom:3}}>المبلغ المتبقي</div>
                    <div style={{color:remainingAmount>0?'#c2410c':'#047857',fontSize:18,fontWeight:900}}>{fmt(remainingAmount)}</div>
                  </div>
                </div>
                {selSale?.customerId && <div style={{background:'#f3e8ff',border:'1px solid #d8b4fe',borderRadius:10,padding:10,marginBottom:12,textAlign:'center'}}>
                  <div style={{color:'#7C3AED',fontSize:10,marginBottom:3}}>مبلغ الحساب الكلي</div>
                  <div style={{color:'#6D28D9',fontSize:18,fontWeight:900}}>{fmt(accountTotal)}</div>
                </div>}
                <div style={{background:'#f8fbff',border:'1px solid #d9e2f2',borderRadius:10,padding:10,marginBottom:12,textAlign:'center',color:refundMethod==='آجل'?'#f59e0b':'#10b981',fontWeight:800,fontSize:12}}>
                  حالة الإرجاع: {refundMethod}
                </div>
              </>}
              <button onClick={save} disabled={saving||!hasReturn}
                style={{width:'100%',background:!hasReturn?'#ffffff':'linear-gradient(135deg,#ef4444,#dc2626)',color:!hasReturn?'#cdd8ec':'#fff',border:'none',borderRadius:11,padding:13,fontWeight:800,fontSize:14,cursor:!hasReturn?'not-allowed':'pointer'}}>
                {saving?'⏳ جاري...':hasReturn?`↩️ حفظ الإرجاع — ${fmt(returnTotal)}`:'↩️ حفظ الإرجاع'}
              </button>
            </div>
          }
        </div>
      </div>
    </div>
  );

  const filteredRet=returns.filter(r=>!search||r.returnNo?.includes(search)||r.customer?.includes(search)||r.originalInvoice?.includes(search));
  return(
    <div style={{padding:20,fontFamily:"'Cairo'",direction:'rtl'}}>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:16}}>
        <div>
          <div style={{color:'#fff',fontSize:20,fontWeight:800}}>↩️ إرجاع البيع</div>
          <div style={{color:'#64748b',fontSize:12}}>{returns.length} عملية إرجاع</div>
        </div>
        <button onClick={()=>setView('new')} style={{background:'#ef4444',color:'#fff',border:'none',borderRadius:12,padding:'9px 18px',fontWeight:800,cursor:'pointer',fontSize:13}}>+ إرجاع جديد</button>
      </div>
      <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="🔍 ابحث..."
        style={{width:'100%',color:'#0f172a',fontSize:12,outline:'none',marginBottom:14,boxSizing:'border-box'}}/>
      <div style={{background:'#ffffff',borderRadius:14,border:'1px solid #d9e2f2',overflow:'hidden'}}>
        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1.3fr 1fr 1fr 1fr 1fr 1fr',padding:'11px 18px',background:'#f8fbff',borderBottom:'1px solid #e2e8f7'}}>
          {['رقم الإرجاع','الفاتورة','الزبون','المواد','المبلغ الكلي','الحساب الكلي','الواصل','المتبقي','إجراء'].map(h=><div key={h} style={{color:'#64748b',fontSize:10,fontWeight:700}}>{h}</div>)}
        </div>
        {filteredRet.length===0?<div style={{color:'#cdd8ec',textAlign:'center',padding:50}}>لا توجد إرجاعات</div>
          :filteredRet.map((r,i)=>(
          <div key={r.id} style={{display:'grid',gridTemplateColumns:'1fr 1fr 1.3fr 1fr 1fr 1fr 1fr 1fr 1fr',padding:'10px 18px',borderBottom:i<filteredRet.length-1?'1px solid #ffffff':'none',alignItems:'center',background:i%2===0?'transparent':'#f8fbff'}}>
            <div style={{color:'#ef4444',fontSize:11,fontWeight:700}}>{r.returnNo}</div>
            <div style={{color:'#F5C800',fontSize:11}}>{r.originalInvoice}</div>
            <div style={{color:'#1e293b',fontSize:11}}>{r.customer}</div>
            <div style={{color:'#666',fontSize:11}}>{r.items?.length||0} صنف</div>
            <div style={{color:'#ef4444',fontSize:12,fontWeight:800}}>{fmt(r.total)}</div>
            <div style={{color:'#7C3AED',fontSize:11,fontWeight:700}}>{fmt(r.accountTotal||0)}</div>
            <div style={{color:'#2563eb',fontSize:11,fontWeight:700}}>{fmt(r.receivedAmount||0)}</div>
            <div style={{color:(r.remainingAmount||0)>0?'#c2410c':'#047857',fontSize:11,fontWeight:700}}>{fmt(r.remainingAmount||0)}</div>
            <div style={{display:'flex',gap:5}}>
              <button onClick={()=>{setSelReturn(r);setView('detail');}} style={{background:'#ef444422',border:'1px solid #ef444444',borderRadius:7,padding:'4px 8px',color:'#ef4444',fontSize:11,cursor:'pointer'}}>👁️</button>
              <button onClick={()=>printRet(r)} style={{background:'#3b82f622',border:'1px solid #3b82f644',borderRadius:7,padding:'4px 8px',color:'#3b82f6',fontSize:11,cursor:'pointer'}}>🖨️</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
