import { useState, useEffect } from 'react';
import { collection, onSnapshot } from 'firebase/firestore';
import { db } from '../../firebase';

const fmt = n=>(n||0).toLocaleString('ar-IQ')+' د.ع';

export default function DeletedLists({ user }) {
  const [sales,     setSales]     = useState([]);
  const [purchases, setPurchases] = useState([]);
  const [quotes,    setQuotes]    = useState([]);
  const [returns,   setReturns]   = useState([]);
  const [search,    setSearch]    = useState('');
  const [dateFrom,  setDateFrom]  = useState('');
  const [dateTo,    setDateTo]    = useState('');
  const [tab,       setTab]       = useState('sales');

  useEffect(()=>{
    const us=[
      onSnapshot(collection(db,'pos_sales'),    s=>setSales(s.docs.map(d=>({...d.data(),id:d.id})).sort((a,b)=>new Date(b.createdAt)-new Date(a.createdAt)))),
      onSnapshot(collection(db,'pos_purchases'),s=>setPurchases(s.docs.map(d=>({...d.data(),id:d.id})).sort((a,b)=>new Date(b.createdAt)-new Date(a.createdAt)))),
      onSnapshot(collection(db,'pos_quotes'),   s=>setQuotes(s.docs.map(d=>({...d.data(),id:d.id})).sort((a,b)=>new Date(b.createdAt)-new Date(a.createdAt)))),
      onSnapshot(collection(db,'pos_returns'),  s=>setReturns(s.docs.map(d=>({...d.data(),id:d.id})).sort((a,b)=>new Date(b.createdAt)-new Date(a.createdAt)))),
    ];
    return()=>us.forEach(u=>u());
  },[]);

  const inRange=d=>{ const ds=d?.slice(0,10)||''; if(dateFrom&&ds<dateFrom)return false; if(dateTo&&ds>dateTo)return false; return true; };

  const allSales    = sales.filter(s=>inRange(s.createdAt)&&(!search||s.invoiceNo?.includes(search)||s.customer?.includes(search)));
  const allPurch    = purchases.filter(p=>inRange(p.createdAt)&&(!search||p.invoiceNo?.includes(search)||p.supplier?.includes(search)));
  const allQuotes   = quotes.filter(q=>inRange(q.createdAt)&&(!search||q.quoteNo?.includes(search)||q.customer?.includes(search)));
  const allReturns  = returns.filter(r=>inRange(r.createdAt)&&(!search||r.returnNo?.includes(search)||r.customer?.includes(search)));

  const TABS=[['sales',`🧾 فواتير البيع (${allSales.length})`],['purchases',`🛍️ فواتير الشراء (${allPurch.length})`],['quotes',`💬 عروض الأسعار (${allQuotes.length})`],['returns',`↩️ الإرجاعات (${allReturns.length})`]];

  return(
    <div style={{padding:24,fontFamily:"'Cairo'",direction:'rtl'}}>
      <div style={{color:'#fff',fontSize:22,fontWeight:800,marginBottom:20}}>🗑️ سجل القوائم الكامل</div>
      <div style={{background:'#3b82f611',border:'1px solid #3b82f633',borderRadius:12,padding:12,marginBottom:20}}>
        <div style={{color:'#3b82f6',fontSize:13,textAlign:'center'}}>ℹ️ سجل كامل بجميع فواتير البيع والشراء وعروض الأسعار</div>
      </div>

      <div style={{display:'flex',gap:10,marginBottom:16,flexWrap:'wrap'}}>
        <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="🔍 ابحث برقم الفاتورة أو الاسم..."
          style={{flex:1,color:'#0f172a',fontSize:13,outline:'none'}}/>
        <input type="date" value={dateFrom} onChange={e=>setDateFrom(e.target.value)} style={{color:'#0f172a',outline:'none'}}/>
        <span style={{color:'#64748b',alignSelf:'center'}}>—</span>
        <input type="date" value={dateTo} onChange={e=>setDateTo(e.target.value)} style={{color:'#0f172a',outline:'none'}}/>
      </div>

      <div style={{display:'flex',gap:8,marginBottom:20,flexWrap:'wrap'}}>
        {TABS.map(([v,l])=>(
          <button key={v} onClick={()=>setTab(v)} style={{background:tab===v?'#3b82f6':'#ffffff',color:tab===v?'#fff':'#64748b',border:`1px solid ${tab===v?'#3b82f6':'#cdd8ec'}`,borderRadius:20,padding:'8px 14px',fontSize:12,cursor:'pointer',fontWeight:tab===v?700:400}}>{l}</button>
        ))}
      </div>

      {tab==='sales'&&(
        <ListTable data={allSales} cols={[{k:'invoiceNo',l:'رقم الفاتورة',c:'#10b981'},{k:'customer',l:'الزبون'},{k:'paymentMethod',l:'الدفع'},{k:'total',l:'الإجمالي',c:'#F5C800',f:fmt},{k:'cashier',l:'الكاشير'},{k:'dateISO',l:'التاريخ',altK:'date'}]}/>
      )}
      {tab==='purchases'&&(
        <ListTable data={allPurch} cols={[{k:'invoiceNo',l:'رقم الفاتورة',c:'#f59e0b'},{k:'supplier',l:'المورد'},{k:'paymentMethod',l:'الدفع'},{k:'total',l:'الإجمالي',c:'#F5C800',f:fmt},{k:'addedBy',l:'بواسطة'},{k:'dateISO',l:'التاريخ',altK:'date'}]}/>
      )}
      {tab==='quotes'&&(
        <ListTable data={allQuotes} cols={[{k:'quoteNo',l:'رقم العرض',c:'#a78bfa'},{k:'customer',l:'الزبون'},{k:'validDays',l:'صالح (يوم)'},{k:'total',l:'الإجمالي',c:'#F5C800',f:fmt},{k:'createdBy',l:'بواسطة'},{k:'dateISO',l:'التاريخ',altK:'date'}]}/>
      )}
      {tab==='returns'&&(
        <ListTable data={allReturns} cols={[{k:'returnNo',l:'رقم الإرجاع',c:'#ef4444'},{k:'originalInvoice',l:'الفاتورة الأصلية'},{k:'customer',l:'الزبون'},{k:'total',l:'المُسترد',c:'#ef4444',f:fmt},{k:'refundMethod',l:'طريقة الاسترداد'},{k:'dateISO',l:'التاريخ',altK:'date'}]}/>
      )}
    </div>
  );
}

function ListTable({data,cols}){
  return(
    <div style={{background:'#ffffff',borderRadius:16,border:'1px solid #d9e2f2',overflow:'hidden'}}>
      <div style={{display:'grid',gridTemplateColumns:cols.map(()=>'1fr').join(' '),padding:'12px 20px',background:'#f8fbff',borderBottom:'1px solid #e2e8f7'}}>
        {cols.map(c=><div key={c.l} style={{color:'#64748b',fontSize:11,fontWeight:700}}>{c.l}</div>)}
      </div>
      {data.length===0?<div style={{color:'#cdd8ec',textAlign:'center',padding:60}}>لا توجد بيانات</div>
        :data.map((item,i)=>(
        <div key={item.id} style={{display:'grid',gridTemplateColumns:cols.map(()=>'1fr').join(' '),padding:'11px 20px',borderBottom:i<data.length-1?'1px solid #ffffff':'none',alignItems:'center',background:i%2===0?'transparent':'#f8fbff'}}>
          {cols.map(c=><div key={c.k} style={{color:c.c||'#1e293b',fontSize:12,fontWeight:c.c?700:400}}>{c.f?c.f(item[c.k]):(item[c.k]||item[c.altK]||'—')}</div>)}
        </div>
      ))}
    </div>
  );
}
