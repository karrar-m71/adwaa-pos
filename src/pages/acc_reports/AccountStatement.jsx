import { useState, useEffect } from 'react';
import { collection, onSnapshot } from 'firebase/firestore';
import { db } from '../../firebase';
import jsPDF from 'jspdf';

const fmt = n=>(n||0).toLocaleString('ar-IQ')+' د.ع';
const toNum = (v)=>Number(v||0)||0;
const readDueAmount = (row) => toNum(row?.dueAmount ?? row?.remainingAmount ?? row?.total);
const dateKey = (d) => String(d || '').slice(0, 10);
const todayISO = () => {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};
const isDebtAffectingVoucher = (v) => {
  const src = String(v?.source || '');
  if (!src) return true;
  if (src.startsWith('sales_auto') || src.startsWith('purchase_auto') || src.startsWith('sale_return_auto') || src.startsWith('purchase_return_auto')) return false;
  return true;
};

export default function AccountStatement({ user }) {
  const [customers,setCustomers]=useState([]);
  const [suppliers,setSuppliers]=useState([]);
  const [sales,    setSales]    =useState([]);
  const [purchases,setPurchases]=useState([]);
  const [returns,  setReturns]  =useState([]);
  const [purchaseReturns, setPurchaseReturns]=useState([]);
  const [vouchers, setVouchers] =useState([]);
  const [selParty, setSelParty] =useState('');
  const [partyType,setPartyType]=useState('customer');
  const [dateFrom, setDateFrom] =useState(()=>todayISO());
  const [dateTo,   setDateTo]   =useState(()=>todayISO());
  const [rate] = useState(()=>{
    try{ return Number(JSON.parse(localStorage.getItem('adwaa_settings')||'{}').exchangeRate||1480)||1480; }
    catch{ return 1480; }
  });

  useEffect(()=>{
    const us=[
      onSnapshot(collection(db,'pos_customers'),s=>setCustomers(s.docs.map(d=>({...d.data(),id:d.id})))),
      onSnapshot(collection(db,'pos_suppliers'),s=>setSuppliers(s.docs.map(d=>({...d.data(),id:d.id})))),
      onSnapshot(collection(db,'pos_sales'),    s=>setSales(s.docs.map(d=>({...d.data(),id:d.id})))),
      onSnapshot(collection(db,'pos_purchases'),s=>setPurchases(s.docs.map(d=>({...d.data(),id:d.id})))),
      onSnapshot(collection(db,'pos_returns'),  s=>setReturns(s.docs.map(d=>({...d.data(),id:d.id})))),
      onSnapshot(collection(db,'pos_purchase_returns'),s=>setPurchaseReturns(s.docs.map(d=>({...d.data(),id:d.id})))),
      onSnapshot(collection(db,'pos_vouchers'), s=>setVouchers(s.docs.map(d=>({...d.data(),id:d.id})))),
    ];
    return()=>us.forEach(u=>u());
  },[]);

  const parties = partyType==='customer' ? customers : suppliers;
  const selP = parties.find(p=>p.name===selParty||p.id===selParty);

  const inRange=d=>{ if(!d)return true; if(dateFrom&&d<dateFrom)return false; if(dateTo&&d>dateTo)return false; return true; };
  const isBeforeFrom = (d) => {
    const k = dateKey(d);
    if (!dateFrom || !k) return false;
    return k < dateFrom;
  };
  const voucherAmountIQD = (v) => {
    const ex = toNum(v?.exchangeRate || rate || 1480) || 1480;
    const amountIQDStored = toNum(v?.amountIQD ?? (toNum(v?.amountIQDEntry) + toNum(v?.amountUSDEntry) * ex));
    const discountIQDStored = toNum(v?.discountIQD ?? (toNum(v?.discountIQDEntry) + toNum(v?.discountUSDEntry) * ex));
    if (v?.amountIQD != null || v?.amountIQDEntry != null || v?.amountUSDEntry != null || v?.discountIQD != null || v?.discountIQDEntry != null || v?.discountUSDEntry != null) {
      return amountIQDStored + discountIQDStored;
    }
    const amount = toNum(v?.amount);
    const isUSD = v?.currency === 'دولار أمريكي' || v?.currency === 'USD';
    const discount = toNum(v?.discountAmount || 0);
    return (isUSD ? amount * ex : amount) + discount;
  };

  const allMoves=[];
    if(selP){
    if(partyType==='customer'){
      sales.filter(s=>s.customer===selP.name && s.paymentMethod==='آجل').forEach(s=>
        allMoves.push({date:s.dateISO||s.date,label:`فاتورة بيع آجلة #${s.invoiceNo}`,debit:readDueAmount(s),credit:0})
      );
      returns.filter(r=>r.customer===selP.name).forEach(r=>
        allMoves.push({date:r.dateISO||r.date,label:`إرجاع بيع #${r.returnNo}`,debit:0,credit:toNum(r.settledAmount ?? r.receivedAmount ?? 0)})
      );
    } else {
      purchases.filter(p=>p.supplier===selP.name && p.paymentMethod==='آجل').forEach(p=>
        allMoves.push({date:p.dateISO||p.date,label:`فاتورة شراء آجلة #${p.invoiceNo}`,debit:readDueAmount(p),credit:0})
      );
      purchaseReturns.filter(r=>r.supplier===selP.name).forEach(r=>
        allMoves.push({date:r.dateISO||r.date,label:`إرجاع شراء #${r.returnNo}`,debit:0,credit:toNum(r.settledAmount ?? r.receivedAmount ?? 0)})
      );
    }
    vouchers.filter(v=>v.fromTo===selP.name && (v.type==='قبض'||v.type==='دفع') && isDebtAffectingVoucher(v)).forEach(v=>{
      const amt = voucherAmountIQD(v);
      const debit = partyType==='customer'
        ? (v.type==='دفع' ? amt : 0)
        : (v.type==='قبض' ? amt : 0);
      const credit = partyType==='customer'
        ? (v.type==='قبض' ? amt : 0)
        : (v.type==='دفع' ? amt : 0);
      allMoves.push({date:v.dateISO||v.date,label:`${v.type==='قبض'?'سند قبض':'سند دفع'} #${v.voucherNo}`,debit,credit});
    });
    allMoves.sort((a,b)=>new Date(a.date)-new Date(b.date));
  }

  const actualIQD = toNum(selP?.debtByCurrency?.IQD ?? selP?.debt ?? 0);
  const actualStatus = actualIQD > 0 ? 'عليه دين' : actualIQD < 0 ? 'دائن' : 'مسدد';
  const futureNet = allMoves
    .filter((m) => dateTo && dateKey(m.date) > dateTo)
    .reduce((s, m) => s + (m.debit || 0) - (m.credit || 0), 0);
  const endingBalance = actualIQD - futureNet;
  const moves = allMoves.filter((m) => inRange(m.date));
  const periodNet = moves.reduce((s, m) => s + (m.debit || 0) - (m.credit || 0), 0);
  const openingBalance = endingBalance - periodNet;

  let run=openingBalance;
  const rows=moves.map(m=>{run+=(m.debit||0)-(m.credit||0);return{...m,balance:run};});
  const totD=rows.reduce((s,r)=>s+(r.debit||0),0);
  const totC=rows.reduce((s,r)=>s+(r.credit||0),0);
  const bal=endingBalance;

  const print=()=>{
    const d=new jsPDF({orientation:'p',unit:'mm',format:'a4'});
    d.setFont('helvetica','bold');d.setFontSize(14);d.text('Adwaa Al-Madina — Account Statement',105,15,{align:'center'});
    d.setFontSize(9);d.setFont('helvetica','normal');
    d.text(`Party: ${selP?.name}  |  Period: ${dateFrom||'All'} to ${dateTo||'All'}`,105,22,{align:'center'});
    d.line(14,25,196,25);
    d.setFont('helvetica','bold');
    ['Date','Description','Debit','Credit','Balance'].forEach((h,i)=>d.text(h,[14,50,110,145,170][i],32));
    d.line(14,34,196,34);d.setFont('helvetica','normal');
    let y=41;
    if (dateFrom) {
      d.setFont('helvetica','bold');
      d.text(`Opening Balance: ${openingBalance.toLocaleString()}`,14,40);
      d.setFont('helvetica','normal');
      y = 48;
    }
    rows.forEach(r=>{
      if(y>275){d.addPage();y=20;}
      d.text((r.date||'').slice(0,10),14,y);
      d.text((r.label||'').slice(0,38),50,y);
      if(r.debit>0)d.text(r.debit.toLocaleString(),110,y);
      if(r.credit>0)d.text(r.credit.toLocaleString(),145,y);
      d.text(r.balance.toLocaleString(),170,y);
      y+=6;
    });
    d.line(14,y,196,y);y+=6;d.setFont('helvetica','bold');
    d.text(`Opening: ${openingBalance.toLocaleString()} | Debit: ${totD.toLocaleString()} | Credit: ${totC.toLocaleString()} | Balance: ${bal.toLocaleString()} IQD`,14,y);
    d.save(`Statement-${selP?.name}.pdf`);
  };

  return(
    <div style={{padding:24,fontFamily:"'Cairo'",direction:'rtl'}}>
      <div style={{color:'#fff',fontSize:22,fontWeight:800,marginBottom:20}}>📄 كشف حساب</div>

      <div style={{background:'#ffffff',borderRadius:16,padding:20,border:'1px solid #d9e2f2',marginBottom:20}}>
        <div style={{display:'grid',gridTemplateColumns:'1fr 1.5fr 1fr 1fr',gap:14}}>
          <div>
            <label style={{color:'#64748b',fontSize:12,display:'block',marginBottom:6}}>نوع الحساب</label>
            <div style={{display:'flex',gap:6}}>
              {[['customer','👥 زبون'],['supplier','🏭 مورد']].map(([v,l])=>(
                <button key={v} onClick={()=>{setPartyType(v);setSelParty('');}}
                  style={{flex:1,background:partyType===v?'#3b82f6':'#f8fbff',color:partyType===v?'#fff':'#64748b',border:`1px solid ${partyType===v?'#3b82f6':'#cdd8ec'}`,borderRadius:10,padding:'9px 0',cursor:'pointer',fontWeight:700,fontSize:12}}>
                  {l}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label style={{color:'#64748b',fontSize:12,display:'block',marginBottom:6}}>الاسم *</label>
            <input value={selParty} onChange={e=>setSelParty(e.target.value)} list="pl"
              placeholder={`اختر ${partyType==='customer'?'زبوناً':'مورداً'}...`}
              style={{width:'100%',color:'#0f172a',outline:'none',fontFamily:"'Cairo'",boxSizing:'border-box'}}/>
            <datalist id="pl">{parties.map(p=><option key={p.id} value={p.name}/>)}</datalist>
          </div>
          <div>
            <label style={{color:'#64748b',fontSize:12,display:'block',marginBottom:6}}>من تاريخ</label>
            <input type="date" value={dateFrom} onChange={e=>setDateFrom(e.target.value)}
              style={{width:'100%',color:'#0f172a',outline:'none'}}/>
          </div>
          <div>
            <label style={{color:'#64748b',fontSize:12,display:'block',marginBottom:6}}>إلى تاريخ</label>
            <input type="date" value={dateTo} onChange={e=>setDateTo(e.target.value)}
              style={{width:'100%',color:'#0f172a',outline:'none'}}/>
          </div>
        </div>
      </div>

      {!selP
        ?<div style={{color:'#cdd8ec',textAlign:'center',padding:80,background:'#ffffff',borderRadius:16,border:'1px solid #d9e2f2'}}>
          <div style={{fontSize:48,marginBottom:12}}>📄</div>
          <div>اختر {partyType==='customer'?'زبوناً':'مورداً'} لعرض كشف حسابه</div>
        </div>
        :<div>
          <div style={{display:'grid',gridTemplateColumns:'repeat(6,1fr)',gap:14,marginBottom:16}}>
            {[
              [partyType==='customer'?'👥':'🏭','الطرف',selP.name,'#3b82f6'],
              ['📌','الرصيد الفعلي الحالي',fmt(actualIQD),'#0ea5e9'],
              ['⚖️','حالة الحساب',actualStatus,actualIQD > 0 ? '#ef4444' : actualIQD < 0 ? '#10b981' : '#64748b'],
              ['🟡','الرصيد السابق',fmt(openingBalance),'#f59e0b'],
              ['📤','إجمالي المديونية',fmt(totD),'#ef4444'],
              ['📥','إجمالي السداد',fmt(totC),'#10b981'],
              [bal>0?'🔴':'🟢',bal>0?'مدين':'دائن',fmt(Math.abs(bal)),bal>0?'#ef4444':'#10b981'],
            ].map(([icon,label,val,color])=>(
              <div key={label} style={{background:'#ffffff',borderRadius:14,padding:16,border:`1px solid ${color}33`,textAlign:'center'}}>
                <div style={{fontSize:22,marginBottom:4}}>{icon}</div>
                <div style={{color:'#64748b',fontSize:11,marginBottom:4}}>{label}</div>
                <div style={{color,fontSize:15,fontWeight:800}}>{val}</div>
              </div>
            ))}
          </div>

          <div style={{background:'#ffffff',borderRadius:16,border:'1px solid #d9e2f2',overflow:'hidden',marginBottom:14}}>
            <div style={{display:'grid',gridTemplateColumns:'1fr 2.5fr 1fr 1fr 1fr',padding:'11px 20px',background:'#f8fbff',borderBottom:'1px solid #e2e8f7'}}>
              {['التاريخ','البيان','مدين','دائن','الرصيد'].map(h=><div key={h} style={{color:'#64748b',fontSize:11,fontWeight:700}}>{h}</div>)}
            </div>
            {rows.length===0
              ?<div style={{color:'#cdd8ec',textAlign:'center',padding:40}}>لا توجد حركات</div>
              :rows.map((r,i)=>(
                <div key={i} style={{display:'grid',gridTemplateColumns:'1fr 2.5fr 1fr 1fr 1fr',padding:'10px 20px',borderBottom:i<rows.length-1?'1px solid #ffffff':'none',background:i%2?'#f8fbff':'transparent',alignItems:'center'}}>
                  <div style={{color:'#64748b',fontSize:11}}>{(r.date||'').slice(0,10)}</div>
                  <div style={{color:'#1e293b',fontSize:12,fontWeight:600}}>{r.label}</div>
                  <div style={{color:r.debit>0?'#ef4444':'#cdd8ec',fontSize:12,fontWeight:700}}>{r.debit>0?fmt(r.debit):'—'}</div>
                  <div style={{color:r.credit>0?'#10b981':'#cdd8ec',fontSize:12,fontWeight:700}}>{r.credit>0?fmt(r.credit):'—'}</div>
                  <div style={{color:r.balance>0?'#ef4444':r.balance<0?'#10b981':'#64748b',fontSize:12,fontWeight:800}}>
                    {r.balance>0?`${fmt(r.balance)} مدين`:r.balance<0?`${fmt(Math.abs(r.balance))} دائن`:'صفر'}
                  </div>
                </div>
              ))
            }
            <div style={{display:'grid',gridTemplateColumns:'1fr 2.5fr 1fr 1fr 1fr',padding:'13px 20px',background:'#ffffff',borderTop:'2px solid #d9e2f2'}}>
              <div style={{gridColumn:'1/3',color:'#666',fontSize:12,fontWeight:700}}>الإجمالي (مع الرصيد السابق)</div>
              <div style={{color:'#ef4444',fontSize:14,fontWeight:800}}>{fmt(totD)}</div>
              <div style={{color:'#10b981',fontSize:14,fontWeight:800}}>{fmt(totC)}</div>
              <div style={{color:bal>0?'#ef4444':bal<0?'#10b981':'#64748b',fontSize:14,fontWeight:900}}>
                {bal>0?`${fmt(bal)} مدين`:bal<0?`${fmt(Math.abs(bal))} دائن`:'صفر'}
              </div>
            </div>
          </div>
          <button onClick={print} style={{background:'#3b82f6',color:'#fff',border:'none',borderRadius:12,padding:'12px 24px',fontWeight:700,cursor:'pointer',fontFamily:"'Cairo'",fontSize:14}}>
            🖨️ طباعة كشف الحساب
          </button>
        </div>
      }
    </div>
  );
}
