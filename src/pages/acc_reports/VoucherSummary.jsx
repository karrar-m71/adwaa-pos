import { useState, useEffect } from 'react';
import { collection, onSnapshot } from 'firebase/firestore';
import { db } from '../../firebase';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
const fmt=n=>(n||0).toLocaleString('ar-IQ')+' د.ع';
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
export default function VoucherSummary({user}){
  const [vouchers,setVouchers]=useState([]);
  const [dateFrom,setDateFrom]=useState(()=>todayISO());
  const [dateTo,setDateTo]=useState(()=>todayISO());
  useEffect(()=>{ const u=onSnapshot(collection(db,'pos_vouchers'),s=>setVouchers(s.docs.map(d=>({...d.data(),id:d.id})))); return()=>u(); },[]);
  const f=vouchers.filter(v=>{ if(dateFrom&&(v.dateISO||v.date)<dateFrom)return false; if(dateTo&&(v.dateISO||v.date)>dateTo)return false; return true; });
  const TYPES=[{id:'قبض',color:'#10b981'},{id:'دفع',color:'#ef4444'},{id:'صرف',color:'#f59e0b'},{id:'تحويل',color:'#3b82f6'}];
  const byType=TYPES.map(t=>({name:t.id,color:t.color,count:f.filter(v=>v.type===t.id).length,total:f.filter(v=>v.type===t.id).reduce((s,v)=>s+voucherAmountIQD(v),0)}));
  const totalIn=f.filter(v=>v.type==='قبض').reduce((s,v)=>s+voucherAmountIQD(v),0);
  const totalOut=f.filter(v=>v.type==='دفع'||v.type==='صرف').reduce((s,v)=>s+voucherAmountIQD(v),0);
  const parties={};
  f.filter(v=>v.fromTo).forEach(v=>{ if(!parties[v.fromTo])parties[v.fromTo]={name:v.fromTo,in:0,out:0,count:0}; if(v.type==='قبض')parties[v.fromTo].in+=voucherAmountIQD(v); else parties[v.fromTo].out+=voucherAmountIQD(v); parties[v.fromTo].count++; });
  const top=Object.values(parties).sort((a,b)=>(b.in+b.out)-(a.in+a.out)).slice(0,8);
  return(
    <div style={{padding:24,fontFamily:"'Cairo'",direction:'rtl'}}>
      <div style={{color:'#fff',fontSize:22,fontWeight:800,marginBottom:20}}>📊 ملخص السندات</div>
      <div style={{background:'#ffffff',borderRadius:14,padding:14,border:'1px solid #d9e2f2',marginBottom:20,display:'flex',gap:12,alignItems:'center',flexWrap:'wrap'}}>
        <span style={{color:'#64748b',fontSize:13}}>الفترة:</span>
        <input type="date" value={dateFrom} onChange={e=>setDateFrom(e.target.value)} style={{color:'#0f172a',outline:'none'}}/>
        <span style={{color:'#64748b'}}>—</span>
        <input type="date" value={dateTo} onChange={e=>setDateTo(e.target.value)} style={{color:'#0f172a',outline:'none'}}/>
        <button onClick={()=>{const t=todayISO();setDateFrom(t);setDateTo(t);}} style={{background:'#d9e2f2',border:'none',borderRadius:8,padding:'8px 14px',color:'#64748b',cursor:'pointer',fontSize:12}}>إعادة ضبط</button>
        <span style={{color:'#64748b',fontSize:12,marginRight:'auto'}}>{f.length} سند</span>
      </div>
      <div style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:12,marginBottom:20}}>
        {byType.map(t=>(
          <div key={t.name} style={{background:'#ffffff',borderRadius:14,padding:16,border:`1px solid ${t.color}33`}}>
            <div style={{display:'flex',justifyContent:'space-between',marginBottom:8}}>
              <span style={{color:t.color,fontSize:14,fontWeight:800}}>{t.name}</span>
              <span style={{background:`${t.color}22`,borderRadius:20,padding:'1px 10px',color:t.color,fontSize:11}}>{t.count}</span>
            </div>
            <div style={{color:'#fff',fontSize:17,fontWeight:900}}>{fmt(t.total)}</div>
          </div>
        ))}
      </div>
      <div style={{background:totalIn-totalOut>=0?'#10b98122':'#ef444422',border:`1px solid ${totalIn-totalOut>=0?'#10b98144':'#ef444444'}`,borderRadius:14,padding:16,marginBottom:20,display:'flex',justifyContent:'space-between',alignItems:'center'}}>
        <span style={{color:'#64748b',fontSize:14}}>📊 صافي التدفق النقدي للفترة</span>
        <span style={{color:totalIn-totalOut>=0?'#10b981':'#ef4444',fontSize:24,fontWeight:900}}>{totalIn-totalOut>=0?'+':''}{fmt(totalIn-totalOut)}</span>
      </div>
      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:14}}>
        <div style={{background:'#ffffff',borderRadius:16,padding:20,border:'1px solid #d9e2f2'}}>
          <div style={{color:'#fff',fontSize:14,fontWeight:700,marginBottom:14}}>توزيع السندات</div>
          <ResponsiveContainer width="100%" height={180}>
            <BarChart data={byType}>
              <CartesianGrid strokeDasharray="3 3" stroke="#d9e2f2"/>
              <XAxis dataKey="name" tick={{fill:'#64748b',fontSize:12}}/>
              <YAxis tick={{fill:'#64748b',fontSize:10}}/>
              <Tooltip contentStyle={{color:'#0f172a'}} formatter={v=>fmt(v)}/>
              <Bar dataKey="total" radius={[6,6,0,0]} fill="#F5C800"/>
            </BarChart>
          </ResponsiveContainer>
        </div>
        <div style={{background:'#ffffff',borderRadius:16,border:'1px solid #d9e2f2',overflow:'hidden'}}>
          <div style={{padding:'12px 16px',borderBottom:'1px solid #d9e2f2',color:'#fff',fontSize:13,fontWeight:700}}>أكثر الأطراف تعاملاً</div>
          {top.length===0?<div style={{color:'#cdd8ec',textAlign:'center',padding:40}}>لا توجد بيانات</div>
            :top.map((p,i)=>(
            <div key={p.name} style={{display:'flex',justifyContent:'space-between',padding:'9px 16px',borderBottom:i<top.length-1?'1px solid #ffffff':'none',alignItems:'center'}}>
              <div><div style={{color:'#1e293b',fontSize:12,fontWeight:600}}>{p.name}</div><div style={{color:'#64748b',fontSize:10}}>{p.count} سند</div></div>
              <div style={{textAlign:'left'}}><div style={{color:'#10b981',fontSize:11}}>+{fmt(p.in)}</div><div style={{color:'#ef4444',fontSize:11}}>-{fmt(p.out)}</div></div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
