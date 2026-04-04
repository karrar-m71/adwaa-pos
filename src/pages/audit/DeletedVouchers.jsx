import { useState, useEffect } from 'react';
import { collection, onSnapshot } from 'firebase/firestore';
import { db } from '../../firebase';

const fmt = n=>(n||0).toLocaleString('ar-IQ')+' د.ع';
const TYPES=[{id:'قبض',icon:'📥',color:'#10b981'},{id:'دفع',icon:'📤',color:'#ef4444'},{id:'صرف',icon:'💸',color:'#f59e0b'},{id:'تحويل',icon:'💱',color:'#3b82f6'}];
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

export default function DeletedVouchers({ user }) {
  const [vouchers, setVouchers] = useState([]);
  const [search,   setSearch]   = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo,   setDateTo]   = useState('');
  const [typeFilter,setTypeFilter]=useState('الكل');

  useEffect(()=>{
    const u=onSnapshot(collection(db,'pos_vouchers'),s=>setVouchers(s.docs.map(d=>({...d.data(),id:d.id})).sort((a,b)=>new Date(b.createdAt)-new Date(a.createdAt))));
    return()=>u();
  },[]);

  const inRange=d=>{ const ds=d?.slice(0,10)||''; if(dateFrom&&ds<dateFrom)return false; if(dateTo&&ds>dateTo)return false; return true; };
  const filtered=vouchers.filter(v=>{
    const mD=inRange(v.createdAt);
    const mT=typeFilter==='الكل'||v.type===typeFilter;
    const mS=!search||v.voucherNo?.includes(search)||v.fromTo?.includes(search);
    return mD&&mT&&mS;
  });

  const totalIn  = filtered.filter(v=>v.type==='قبض').reduce((s,v)=>s+voucherAmountIQD(v),0);
  const totalOut = filtered.filter(v=>v.type==='دفع'||v.type==='صرف').reduce((s,v)=>s+voucherAmountIQD(v),0);

  return(
    <div style={{padding:24,fontFamily:"'Cairo'",direction:'rtl'}}>
      <div style={{color:'#fff',fontSize:22,fontWeight:800,marginBottom:20}}>🗑️ سجل السندات الكامل</div>
      <div style={{background:'#3b82f611',border:'1px solid #3b82f633',borderRadius:12,padding:12,marginBottom:20}}>
        <div style={{color:'#3b82f6',fontSize:13,textAlign:'center'}}>ℹ️ سجل كامل بجميع السندات المسجّلة في النظام</div>
      </div>

      <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:14,marginBottom:20}}>
        {[['🧾','إجمالي السندات',filtered.length,'#3b82f6'],['📥','إجمالي القبض',fmt(totalIn),'#10b981'],['📤','إجمالي الدفع',fmt(totalOut),'#ef4444']].map(([icon,label,val,color])=>(
          <div key={label} style={{background:'#ffffff',borderRadius:14,padding:14,border:'1px solid #d9e2f2',textAlign:'center'}}>
            <div style={{fontSize:22,marginBottom:6}}>{icon}</div><div style={{color:'#64748b',fontSize:11,marginBottom:4}}>{label}</div><div style={{color,fontSize:16,fontWeight:800}}>{val}</div>
          </div>
        ))}
      </div>

      <div style={{display:'flex',gap:10,marginBottom:16,flexWrap:'wrap'}}>
        <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="🔍 ابحث برقم السند أو الاسم..."
          style={{flex:1,color:'#0f172a',fontSize:13,outline:'none'}}/>
        {['الكل',...TYPES.map(t=>t.id)].map(t=>(
          <button key={t} onClick={()=>setTypeFilter(t)} style={{background:typeFilter===t?'#3b82f6':'#ffffff',color:typeFilter===t?'#fff':'#64748b',border:`1px solid ${typeFilter===t?'#3b82f6':'#cdd8ec'}`,borderRadius:20,padding:'7px 12px',fontSize:11,cursor:'pointer',fontWeight:typeFilter===t?700:400}}>{t}</button>
        ))}
        <input type="date" value={dateFrom} onChange={e=>setDateFrom(e.target.value)} style={{color:'#0f172a',outline:'none'}}/>
        <span style={{color:'#64748b',alignSelf:'center'}}>—</span>
        <input type="date" value={dateTo} onChange={e=>setDateTo(e.target.value)} style={{color:'#0f172a',outline:'none'}}/>
      </div>

      <div style={{background:'#ffffff',borderRadius:16,border:'1px solid #d9e2f2',overflow:'hidden'}}>
        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1.2fr 1fr 1fr 1fr 1fr',padding:'12px 20px',background:'#f8fbff',borderBottom:'1px solid #e2e8f7'}}>
          {['رقم السند','النوع','من/إلى','المبلغ','طريقة الدفع','أضافه','التاريخ'].map(h=><div key={h} style={{color:'#64748b',fontSize:11,fontWeight:700}}>{h}</div>)}
        </div>
        {filtered.length===0?<div style={{color:'#cdd8ec',textAlign:'center',padding:60}}>لا توجد سندات</div>
          :filtered.map((v,i)=>{
          const type=TYPES.find(t=>t.id===v.type)||{icon:'📄',color:'#1e293b'};
          return(
            <div key={v.id} style={{display:'grid',gridTemplateColumns:'1fr 1fr 1.2fr 1fr 1fr 1fr 1fr',padding:'11px 20px',borderBottom:i<filtered.length-1?'1px solid #ffffff':'none',alignItems:'center',background:i%2===0?'transparent':'#f8fbff'}}>
              <div style={{color:'#F5C800',fontSize:12,fontWeight:700}}>{v.voucherNo}</div>
              <span style={{background:`${type.color}22`,border:`1px solid ${type.color}44`,borderRadius:20,padding:'2px 7px',color:type.color,fontSize:10,fontWeight:700,display:'inline-flex',gap:3,alignItems:'center'}}>{type.icon} {v.type}</span>
              <div style={{color:'#1e293b',fontSize:11}}>{v.type==='تحويل'?`${v.fromCurrency}→${v.toCurrency}`:v.fromTo||'—'}</div>
              <div style={{color:type.color,fontSize:12,fontWeight:700}}>{v.type==='تحويل'?`${(v.fromAmount||0).toLocaleString()}`:voucherAmountText(v)}</div>
              <div style={{color:'#64748b',fontSize:11}}>{v.paymentMethod||'—'}</div>
              <div style={{color:'#64748b',fontSize:11}}>{v.addedBy||'—'}</div>
              <div style={{color:'#475569',fontSize:10}}>{v.dateISO||v.date}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
