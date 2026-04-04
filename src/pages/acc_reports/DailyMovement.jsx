import { useState, useEffect } from 'react';
import { collection, onSnapshot } from 'firebase/firestore';
import { db } from '../../firebase';

const fmt = n=>(n||0).toLocaleString('ar-IQ')+' د.ع';
const normalizeCurrencyCode = (currency) => (currency === 'USD' || currency === 'دولار أمريكي' ? 'USD' : 'IQD');
const readVoucherEntryAmounts = (voucher = {}) => {
  const hasSplit = voucher?.amountIQDEntry != null || voucher?.amountUSDEntry != null;
  if (hasSplit) {
    return {
      iqd: Number(voucher?.amountIQDEntry || 0) || 0,
      usd: Number(voucher?.amountUSDEntry || 0) || 0,
    };
  }
  const code = normalizeCurrencyCode(voucher?.currency);
  const amount = Number(voucher?.amount || 0) || 0;
  return { iqd: code === 'IQD' ? amount : 0, usd: code === 'USD' ? amount : 0 };
};
const voucherAmountIQD = (voucher = {}, fallbackRate = 1480) => {
  if (voucher?.amountIQD != null) return Number(voucher.amountIQD || 0);
  const { iqd, usd } = readVoucherEntryAmounts(voucher);
  const rate = Number(voucher?.exchangeRate || fallbackRate || 1480) || 1480;
  return iqd + usd * rate;
};
const voucherAmountText = (voucher = {}) => {
  const { iqd, usd } = readVoucherEntryAmounts(voucher);
  if (iqd > 0 && usd > 0) return `IQD: ${fmt(iqd)} | USD: $${usd.toFixed(2)}`;
  if (usd > 0) return `$${usd.toFixed(2)}`;
  return fmt(iqd);
};

export default function DailyMovement({ user }) {
  const [sales,     setSales]     = useState([]);
  const [purchases, setPurchases] = useState([]);
  const [expenses,  setExpenses]  = useState([]);
  const [vouchers,  setVouchers]  = useState([]);
  const [returns,   setReturns]   = useState([]);
  const [purchaseReturns, setPurchaseReturns] = useState([]);
  const [selDate,   setSelDate]   = useState(new Date().toISOString().split('T')[0]);

  useEffect(()=>{
    const us=[
      onSnapshot(collection(db,'pos_sales'),           s=>setSales(s.docs.map(d=>({...d.data(),id:d.id})))),
      onSnapshot(collection(db,'pos_purchases'),       s=>setPurchases(s.docs.map(d=>({...d.data(),id:d.id})))),
      onSnapshot(collection(db,'pos_expenses'),        s=>setExpenses(s.docs.map(d=>({...d.data(),id:d.id})))),
      onSnapshot(collection(db,'pos_vouchers'),        s=>setVouchers(s.docs.map(d=>({...d.data(),id:d.id})))),
      onSnapshot(collection(db,'pos_returns'),         s=>setReturns(s.docs.map(d=>({...d.data(),id:d.id})))),
      onSnapshot(collection(db,'pos_purchase_returns'),s=>setPurchaseReturns(s.docs.map(d=>({...d.data(),id:d.id})))),
    ];
    return()=>us.forEach(u=>u());
  },[]);

  const inDay=(d)=>d===selDate;

  const daySales    = sales.filter(s=>(s.dateISO||s.date)===selDate);
  const dayPurch    = purchases.filter(p=>(p.dateISO||p.date)===selDate);
  const dayExpenses = expenses.filter(e=>e.date===selDate);
  const dayVouchers = vouchers.filter(v=>(v.dateISO||v.date)===selDate);
  const dayReturns  = returns.filter(r=>(r.dateISO||r.date)===selDate);
  const dayPurchaseReturns = purchaseReturns.filter(r=>(r.dateISO||r.date)===selDate);

  const totalSales   = daySales.reduce((s,i)=>s+(i.total||0),0);
  const cashSales    = daySales.filter(s=>s.paymentMethod==='نقدي').reduce((s,i)=>s+(i.total||0),0);
  const creditSales  = daySales.filter(s=>s.paymentMethod==='آجل').reduce((s,i)=>s+(i.total||0),0);
  const totalPurch   = dayPurch.reduce((s,p)=>s+(p.total||0),0);
  const totalExp     = dayExpenses.reduce((s,e)=>s+(e.amount||0),0);
  const totalVin     = dayVouchers.filter(v=>v.type==='قبض').reduce((s,v)=>s+voucherAmountIQD(v),0);
  const totalVout    = dayVouchers.filter(v=>v.type==='دفع'||v.type==='صرف').reduce((s,v)=>s+voucherAmountIQD(v),0);
  const totalRet     = dayReturns.reduce((s,r)=>s+(r.total||0),0);
  const totalPurchaseRet = dayPurchaseReturns.reduce((s,r)=>s+(r.total||0),0);
  const netCash      = cashSales + totalVin - totalExp - totalVout;

  // كل الحركات مرتبة
  const allMovements=[
    ...daySales.map(s=>({time:s.createdAt,type:'بيع',icon:'🧾',label:`فاتورة بيع #${s.invoiceNo}`,party:s.customer,amount:s.total,method:s.paymentMethod,color:'#10b981'})),
    ...dayPurch.map(p=>({time:p.createdAt,type:'شراء',icon:'🛍️',label:`فاتورة شراء #${p.invoiceNo}`,party:p.supplier,amount:p.total,method:p.paymentMethod,color:'#f59e0b'})),
    ...dayExpenses.map(e=>({time:e.createdAt,type:'مصروف',icon:'💸',label:`مصروف — ${e.desc}`,party:'—',amount:e.amount,method:'نقدي',color:'#ef4444'})),
    ...dayVouchers.map(v=>({time:v.createdAt,type:`سند ${v.type}`,icon:v.type==='قبض'?'📥':'📤',label:`سند ${v.type} #${v.voucherNo}`,party:v.fromTo||'—',amount:voucherAmountIQD(v),amountLabel:voucherAmountText(v),method:v.paymentMethod||'—',color:v.type==='قبض'?'#10b981':'#ef4444'})),
    ...dayReturns.map(r=>({time:r.createdAt,type:'إرجاع',icon:'↩️',label:`إرجاع #${r.returnNo}`,party:r.customer,amount:r.total,method:r.refundMethod,color:'#a78bfa'})),
    ...dayPurchaseReturns.map(r=>({time:r.createdAt,type:'إرجاع شراء',icon:'↩️',label:`إرجاع شراء #${r.returnNo}`,party:r.supplier,amount:r.total,method:r.refundMethod,color:'#f59e0b'})),
  ].sort((a,b)=>new Date(b.time)-new Date(a.time));

  return(
    <div style={{padding:24,fontFamily:"'Cairo'",direction:'rtl'}}>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:20}}>
        <div style={{color:'#fff',fontSize:22,fontWeight:800}}>📅 الحركة اليومية</div>
        <input type="date" value={selDate} onChange={e=>setSelDate(e.target.value)}
          style={{background:'#ffffff',border:'1px solid #cdd8ec',borderRadius:12,padding:'10px 16px',color:'#F5C800',fontSize:14,fontWeight:700,outline:'none'}}/>
      </div>

      {/* ملخص اليوم */}
      <div style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:12,marginBottom:20}}>
        {[
          ['🧾','فواتير البيع',`${daySales.length} فاتورة`,fmt(totalSales),'#10b981'],
          ['🛍️','فواتير الشراء',`${dayPurch.length} فاتورة`,fmt(totalPurch),'#f59e0b'],
          ['↩️','إرجاع البيع/الشراء',`${dayReturns.length + dayPurchaseReturns.length} حركة`,fmt(totalRet + totalPurchaseRet),'#a78bfa'],
          ['🧾','السندات',`${dayVouchers.length} سند`,fmt(totalVin-totalVout),'#3b82f6'],
        ].map(([icon,label,sub,val,color])=>(
          <div key={label} style={{background:'#ffffff',borderRadius:14,padding:14,border:'1px solid #d9e2f2',textAlign:'center'}}>
            <div style={{fontSize:22,marginBottom:4}}>{icon}</div>
            <div style={{color:'#64748b',fontSize:11,marginBottom:2}}>{label}</div>
            <div style={{color:'#666',fontSize:10,marginBottom:6}}>{sub}</div>
            <div style={{color,fontSize:15,fontWeight:800}}>{val}</div>
          </div>
        ))}
      </div>

      {/* ملخص النقدية */}
      <div style={{background:'#ffffff',borderRadius:16,padding:20,border:'1px solid #F5C80033',marginBottom:20}}>
        <div style={{color:'#F5C800',fontSize:14,fontWeight:800,marginBottom:14}}>💵 ملخص النقدية لهذا اليوم</div>
        <div style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:14}}>
          {[
            ['مبيعات نقدية',fmt(cashSales),'#10b981'],
            ['مبيعات آجلة',fmt(creditSales),'#f59e0b'],
            ['مقبوضات (سندات)',fmt(totalVin),'#10b981'],
            ['مدفوعات + مصروفات',fmt(totalExp+totalVout),'#ef4444'],
          ].map(([l,v,c])=>(
            <div key={l} style={{textAlign:'center'}}>
              <div style={{color:'#64748b',fontSize:11,marginBottom:4}}>{l}</div>
              <div style={{color:c,fontSize:14,fontWeight:800}}>{v}</div>
            </div>
          ))}
        </div>
        <div style={{borderTop:'1px solid #d9e2f2',marginTop:14,paddingTop:14,display:'flex',justifyContent:'space-between',alignItems:'center'}}>
          <span style={{color:'#1e293b',fontSize:15,fontWeight:800}}>صافي النقدية لهذا اليوم</span>
          <span style={{color:netCash>=0?'#F5C800':'#ef4444',fontSize:22,fontWeight:900}}>{fmt(netCash)}</span>
        </div>
      </div>

      {/* سجل الحركات */}
      <div style={{background:'#ffffff',borderRadius:16,border:'1px solid #d9e2f2',overflow:'hidden'}}>
        <div style={{padding:'14px 20px',borderBottom:'1px solid #d9e2f2',display:'flex',justifyContent:'space-between'}}>
          <div style={{color:'#fff',fontSize:14,fontWeight:700}}>سجل الحركات ({allMovements.length})</div>
          <div style={{color:'#64748b',fontSize:12}}>{selDate}</div>
        </div>
        {allMovements.length===0
          ?<div style={{color:'#cdd8ec',textAlign:'center',padding:60,fontSize:15}}>
            <div style={{fontSize:48,marginBottom:12}}>📭</div>
            لا توجد حركات في هذا اليوم
          </div>
          :<>
            <div style={{display:'grid',gridTemplateColumns:'auto 1fr 1fr 1fr 1fr',padding:'10px 20px',background:'#f8fbff',borderBottom:'1px solid #e2e8f7'}}>
              {['النوع','البيان','الطرف','المبلغ','الدفع'].map(h=><div key={h} style={{color:'#64748b',fontSize:11,fontWeight:700}}>{h}</div>)}
            </div>
            {allMovements.map((m,i)=>(
              <div key={i} style={{display:'grid',gridTemplateColumns:'auto 1fr 1fr 1fr 1fr',padding:'11px 20px',borderBottom:i<allMovements.length-1?'1px solid #ffffff':'none',alignItems:'center',background:i%2===0?'transparent':'#f8fbff'}}>
                <div style={{marginLeft:12}}>
                  <span style={{background:`${m.color}22`,border:`1px solid ${m.color}44`,borderRadius:20,padding:'3px 10px',color:m.color,fontSize:11,fontWeight:700,display:'flex',gap:4,alignItems:'center',whiteSpace:'nowrap'}}>
                    {m.icon} {m.type}
                  </span>
                </div>
                <div style={{color:'#1e293b',fontSize:12,fontWeight:600}}>{m.label}</div>
                <div style={{color:'#64748b',fontSize:12}}>{m.party}</div>
                <div style={{color:m.color,fontSize:13,fontWeight:800}}>{m.amountLabel || fmt(m.amount)}</div>
                <div style={{color:'#64748b',fontSize:11}}>{m.method}</div>
              </div>
            ))}
          </>
        }
      </div>
    </div>
  );
}
