import { useState, useEffect } from 'react';
import { collection, onSnapshot } from 'firebase/firestore';
import { db } from '../../firebase';
const fmt=n=>(n||0).toLocaleString('ar-IQ')+' د.ع';
const TYPES=[{id:'قبض',color:'#10b981'},{id:'دفع',color:'#ef4444'},{id:'صرف',color:'#f59e0b'},{id:'تحويل',color:'#3b82f6'}];
const todayISO = () => {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};
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
export default function VoucherReport({user}){
  const [vouchers,setVouchers]=useState([]);
  const [filter,setFilter]=useState('الكل');
  const [search,setSearch]=useState('');
  const [dateFrom,setDateFrom]=useState(()=>todayISO());
  const [dateTo,setDateTo]=useState(()=>todayISO());
  useEffect(()=>{ const u=onSnapshot(collection(db,'pos_vouchers'),s=>setVouchers(s.docs.map(d=>({...d.data(),id:d.id})).sort((a,b)=>new Date(b.createdAt)-new Date(a.createdAt)))); return()=>u(); },[]);
  const f=vouchers.filter(v=>{
    if(filter!=='الكل'&&v.type!==filter)return false;
    if(dateFrom&&(v.dateISO||v.date)<dateFrom)return false;
    if(dateTo&&(v.dateISO||v.date)>dateTo)return false;
    if(search&&!v.fromTo?.includes(search)&&!v.voucherNo?.includes(search))return false;
    return true;
  });
  const totAmount=f.filter(v=>v.type!=='تحويل').reduce((s,v)=>s+voucherAmountIQD(v),0);
  return(
    <div style={{padding:24,fontFamily:"'Cairo'",direction:'rtl'}}>
      <div style={{color:'#fff',fontSize:22,fontWeight:800,marginBottom:20}}>🧾 تقرير السندات</div>
      <div style={{background:'#ffffff',borderRadius:14,padding:14,border:'1px solid #d9e2f2',marginBottom:16,display:'flex',gap:10,flexWrap:'wrap',alignItems:'center'}}>
        <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="🔍 ابحث برقم السند أو الطرف..." style={{flex:1,minWidth:150,color:'#0f172a',fontSize:12,outline:'none'}}/>
        <input type="date" value={dateFrom} onChange={e=>setDateFrom(e.target.value)} style={{color:'#0f172a',outline:'none'}}/>
        <span style={{color:'#64748b'}}>—</span>
        <input type="date" value={dateTo} onChange={e=>setDateTo(e.target.value)} style={{color:'#0f172a',outline:'none'}}/>
        {['الكل',...TYPES.map(t=>t.id)].map(t=>(
          <button key={t} onClick={()=>setFilter(t)} style={{background:filter===t?'#F5C800':'#ffffff',color:filter===t?'#000':'#64748b',border:`1px solid ${filter===t?'#F5C800':'#cdd8ec'}`,borderRadius:20,padding:'7px 14px',fontSize:12,cursor:'pointer',fontWeight:filter===t?700:400}}>{t}</button>
        ))}
      </div>
      <div style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:12,marginBottom:16}}>
        {TYPES.map(t=>{const tv=f.filter(v=>v.type===t.id);return(
          <div key={t.id} style={{background:'#ffffff',borderRadius:14,padding:14,border:`1px solid ${t.color}33`}}>
            <div style={{display:'flex',justifyContent:'space-between',marginBottom:6}}><span style={{color:t.color,fontSize:13,fontWeight:800}}>{t.id}</span><span style={{background:`${t.color}22`,borderRadius:20,padding:'1px 8px',color:t.color,fontSize:11}}>{tv.length}</span></div>
            <div style={{color:'#fff',fontSize:15,fontWeight:900}}>{fmt(tv.reduce((s,v)=>s+voucherAmountIQD(v),0))}</div>
          </div>
        );})}
      </div>
      <div style={{background:'#ffffff',borderRadius:16,border:'1px solid #d9e2f2',overflow:'hidden'}}>
        <div style={{display:'grid',gridTemplateColumns:'1fr 1.2fr 1.5fr 1fr 1fr 1fr',padding:'11px 20px',background:'#f8fbff',borderBottom:'1px solid #e2e8f7'}}>
          {['رقم السند','النوع','من/إلى','المبلغ','التاريخ','طريقة الدفع'].map(h=><div key={h} style={{color:'#64748b',fontSize:11,fontWeight:700}}>{h}</div>)}
        </div>
        {f.length===0?<div style={{color:'#cdd8ec',textAlign:'center',padding:60}}>لا توجد سندات</div>
          :f.map((v,i)=>{
          const type=TYPES.find(t=>t.id===v.type)||{color:'#64748b'};
          return(
            <div key={v.id} style={{display:'grid',gridTemplateColumns:'1fr 1.2fr 1.5fr 1fr 1fr 1fr',padding:'11px 20px',borderBottom:i<f.length-1?'1px solid #ffffff':'none',alignItems:'center',background:i%2?'#f8fbff':'transparent'}}>
              <div style={{color:'#F5C800',fontSize:12,fontWeight:700}}>{v.voucherNo}</div>
              <span style={{background:`${type.color}22`,border:`1px solid ${type.color}44`,borderRadius:20,padding:'2px 10px',color:type.color,fontSize:10,fontWeight:700,display:'inline-block'}}>{v.type}</span>
              <div style={{color:'#1e293b',fontSize:12}}>{v.type==='تحويل'?`${v.fromCurrency}→${v.toCurrency}`:v.fromTo||'—'}</div>
              <div style={{color:type.color,fontSize:13,fontWeight:800}}>{v.type==='تحويل'?`${(v.fromAmount||0).toLocaleString()}`:voucherAmountText(v)}</div>
              <div style={{color:'#64748b',fontSize:11}}>{(v.dateISO||v.date||'').slice(0,10)}</div>
              <div style={{color:'#666',fontSize:11}}>{v.paymentMethod||'—'}</div>
            </div>
          );
        })}
        <div style={{padding:'12px 20px',background:'#ffffff',borderTop:'2px solid #d9e2f2',display:'flex',justifyContent:'space-between'}}>
          <span style={{color:'#64748b',fontSize:12,fontWeight:700}}>{f.length} سند</span>
          <span style={{color:'#F5C800',fontSize:14,fontWeight:800}}>{fmt(totAmount)}</span>
        </div>
      </div>
    </div>
  );
}
