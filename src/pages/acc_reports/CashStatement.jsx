import { useState, useEffect } from 'react';
import { collection, onSnapshot } from 'firebase/firestore';
import { db } from '../../firebase';
import jsPDF from 'jspdf';
const fmt=n=>(n||0).toLocaleString('ar-IQ')+' د.ع';
const dateKey = (d) => String(d || '').slice(0, 10);
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
export default function CashStatement({user}){
  const [sales,setSales]=useState([]);
  const [expenses,setExpenses]=useState([]);
  const [vouchers,setVouchers]=useState([]);
  const [dateFrom,setDateFrom]=useState(()=>todayISO());
  const [dateTo,setDateTo]=useState(()=>todayISO());
  useEffect(()=>{
    const us=[
      onSnapshot(collection(db,'pos_sales'),    s=>setSales(s.docs.map(d=>({...d.data(),id:d.id})))),
      onSnapshot(collection(db,'pos_expenses'), s=>setExpenses(s.docs.map(d=>({...d.data(),id:d.id})))),
      onSnapshot(collection(db,'pos_vouchers'), s=>setVouchers(s.docs.map(d=>({...d.data(),id:d.id})))),
    ];
    return()=>us.forEach(u=>u());
  },[]);
  const inR=d=>{if(!d)return true;if(dateFrom&&d<dateFrom)return false;if(dateTo&&d>dateTo)return false;return true;};
  const isBeforeFrom = (d) => {
    const k = dateKey(d);
    if (!dateFrom || !k) return false;
    return k < dateFrom;
  };
  const cashSalesAll=sales.filter(s=>s.paymentMethod==='نقدي');
  const vouchInAll  =vouchers.filter(v=>v.type==='قبض');
  const fExpAll     =expenses;
  const vouchOutAll =vouchers.filter(v=>(v.type==='دفع'||v.type==='صرف'));

  const cashSales=cashSalesAll.filter(s=>inR(s.dateISO||s.date));
  const vouchIn  =vouchInAll.filter(v=>inR(v.dateISO||v.date));
  const fExp     =fExpAll.filter(e=>inR(e.date));
  const vouchOut =vouchOutAll.filter(v=>inR(v.dateISO||v.date));
  const totIn    =cashSales.reduce((s,i)=>s+(i.total||0),0)+vouchIn.reduce((s,v)=>s+voucherAmountIQD(v),0);
  const totOut   =fExp.reduce((s,e)=>s+(e.amount||0),0)+vouchOut.reduce((s,v)=>s+voucherAmountIQD(v),0);
  const netCash  =totIn-totOut;
  const allMoves=[
    ...cashSalesAll.map(s=>({date:s.dateISO||s.date,label:`مبيعات نقدية #${s.invoiceNo}`,in:s.total,out:0})),
    ...vouchInAll.map(v=>({date:v.dateISO||v.date,label:`سند قبض #${v.voucherNo}${v.fromTo?' — '+v.fromTo:''}`,in:voucherAmountIQD(v),out:0})),
    ...fExpAll.map(e=>({date:e.date,label:`مصروف: ${e.desc}`,in:0,out:e.amount})),
    ...vouchOutAll.map(v=>({date:v.dateISO||v.date,label:`سند ${v.type} #${v.voucherNo}`,in:0,out:voucherAmountIQD(v)})),
  ].sort((a,b)=>new Date(a.date)-new Date(b.date));
  const openingBalance = allMoves
    .filter((m)=>isBeforeFrom(m.date))
    .reduce((s,m)=>s+(m.in||0)-(m.out||0),0);
  const moves = allMoves.filter((m)=>inR(m.date));
  let run=openingBalance;
  const rows=moves.map(m=>{run+=(m.in||0)-(m.out||0);return{...m,balance:run};});
  const closingCash = openingBalance + netCash;
  const print=()=>{
    const d=new jsPDF({orientation:'p',unit:'mm',format:'a4'});
    d.setFont('helvetica','bold');d.setFontSize(14);d.text('Adwaa Al-Madina — Cash Statement',105,15,{align:'center'});
    d.setFontSize(9);d.setFont('helvetica','normal');d.text(`Period: ${dateFrom||'All'} to ${dateTo||'All'}`,105,22,{align:'center'});
    d.line(14,25,196,25);
    ['Date','Description','Cash In','Cash Out','Balance'].forEach((h,i)=>d.text(h,[14,50,120,148,172][i],31));
    d.line(14,33,196,33);let y=40;
    if (dateFrom) {
      d.setFont('helvetica','bold');
      d.text(`Opening Balance: ${openingBalance.toLocaleString()} IQD`,14,y);
      d.setFont('helvetica','normal');
      y += 8;
    }
    rows.forEach(r=>{if(y>275){d.addPage();y=20;}d.text((r.date||'').slice(0,10),14,y);d.text((r.label||'').slice(0,38),50,y);if(r.in>0)d.text(r.in.toLocaleString(),120,y);if(r.out>0)d.text(r.out.toLocaleString(),148,y);d.text(r.balance.toLocaleString(),172,y);y+=6;});
    d.line(14,y,196,y);y+=5;d.setFont('helvetica','bold');d.text(`Opening: ${openingBalance.toLocaleString()} | Period Net: ${netCash.toLocaleString()} | Closing: ${closingCash.toLocaleString()} IQD`,14,y);
    d.save('CashStatement.pdf');
  };
  return(
    <div style={{padding:24,fontFamily:"'Cairo'",direction:'rtl'}}>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:20}}>
        <div style={{color:'#fff',fontSize:22,fontWeight:800}}>💵 كشف النقدية</div>
        <button onClick={print} style={{background:'#3b82f622',border:'1px solid #3b82f644',borderRadius:12,padding:'10px 20px',color:'#3b82f6',cursor:'pointer',fontWeight:700}}>🖨️ طباعة</button>
      </div>
      <div style={{background:'#ffffff',borderRadius:14,padding:14,border:'1px solid #d9e2f2',marginBottom:20,display:'flex',gap:12,alignItems:'center',flexWrap:'wrap'}}>
        <span style={{color:'#64748b',fontSize:13}}>الفترة:</span>
        <input type="date" value={dateFrom} onChange={e=>setDateFrom(e.target.value)} style={{color:'#0f172a',outline:'none'}}/>
        <span style={{color:'#64748b'}}>—</span>
        <input type="date" value={dateTo} onChange={e=>setDateTo(e.target.value)} style={{color:'#0f172a',outline:'none'}}/>
        <button onClick={()=>{const t=todayISO();setDateFrom(t);setDateTo(t);}} style={{background:'#d9e2f2',border:'none',borderRadius:8,padding:'8px 14px',color:'#64748b',cursor:'pointer',fontSize:12}}>إعادة ضبط</button>
        <span style={{color:'#64748b',fontSize:12,marginRight:'auto'}}>{rows.length} حركة</span>
      </div>
      <div style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:14,marginBottom:20}}>
        {[['🟡','الرصيد السابق',openingBalance,'#f59e0b'],['📥','إجمالي الوارد',totIn,'#10b981'],['📤','إجمالي الصادر',totOut,'#ef4444'],[closingCash>=0?'✅':'⚠️','الرصيد الختامي',closingCash,closingCash>=0?'#F5C800':'#ef4444']].map(([icon,label,val,color])=>(
          <div key={label} style={{background:'#ffffff',borderRadius:16,padding:20,border:`1px solid ${color}33`,textAlign:'center'}}>
            <div style={{fontSize:28,marginBottom:8}}>{icon}</div><div style={{color:'#64748b',fontSize:12,marginBottom:6}}>{label}</div><div style={{color,fontSize:20,fontWeight:900}}>{fmt(val)}</div>
          </div>
        ))}
      </div>
      <div style={{background:'#ffffff',borderRadius:16,border:'1px solid #d9e2f2',overflow:'hidden'}}>
        <div style={{padding:'12px 20px',borderBottom:'1px solid #d9e2f2',color:'#fff',fontSize:14,fontWeight:700}}>سجل الحركات النقدية ({rows.length})</div>
        <div style={{display:'grid',gridTemplateColumns:'1fr 2.5fr 1fr 1fr 1fr',padding:'10px 20px',background:'#f8fbff',borderBottom:'1px solid #e2e8f7'}}>
          {['التاريخ','البيان','وارد','صادر','الرصيد'].map(h=><div key={h} style={{color:'#64748b',fontSize:11,fontWeight:700}}>{h}</div>)}
        </div>
        {rows.length===0?<div style={{color:'#cdd8ec',textAlign:'center',padding:40}}>لا توجد حركات</div>
          :rows.map((r,i)=>(
          <div key={i} style={{display:'grid',gridTemplateColumns:'1fr 2.5fr 1fr 1fr 1fr',padding:'10px 20px',borderBottom:i<rows.length-1?'1px solid #ffffff':'none',alignItems:'center',background:i%2?'#f8fbff':'transparent'}}>
            <div style={{color:'#64748b',fontSize:11}}>{(r.date||'').slice(0,10)}</div>
            <div style={{color:'#1e293b',fontSize:12}}>{r.label}</div>
            <div style={{color:r.in>0?'#10b981':'#cdd8ec',fontSize:12,fontWeight:700}}>{r.in>0?fmt(r.in):'—'}</div>
            <div style={{color:r.out>0?'#ef4444':'#cdd8ec',fontSize:12,fontWeight:700}}>{r.out>0?fmt(r.out):'—'}</div>
            <div style={{color:r.balance>=0?'#F5C800':'#ef4444',fontSize:12,fontWeight:800}}>{fmt(r.balance)}</div>
          </div>
        ))}
        <div style={{display:'grid',gridTemplateColumns:'1fr 2.5fr 1fr 1fr 1fr',padding:'12px 20px',background:'#ffffff',borderTop:'2px solid #d9e2f2'}}>
          <div style={{gridColumn:'1/3',color:'#666',fontSize:12,fontWeight:700}}>الإجمالي (مع الرصيد السابق)</div>
          <div style={{color:'#10b981',fontSize:14,fontWeight:800}}>{fmt(totIn)}</div>
          <div style={{color:'#ef4444',fontSize:14,fontWeight:800}}>{fmt(totOut)}</div>
          <div style={{color:closingCash>=0?'#F5C800':'#ef4444',fontSize:14,fontWeight:900}}>{fmt(closingCash)}</div>
        </div>
      </div>
    </div>
  );
}
