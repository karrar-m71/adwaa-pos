import { useState, useEffect } from 'react';
import { collection, onSnapshot } from 'firebase/firestore';
import { db } from '../../firebase';

const fmt = n=>(n||0).toLocaleString('ar-IQ')+' د.ع';

export default function AdjustedLists({ user }) {
  const [settlements, setSettlements] = useState([]);
  const [returns,     setReturns]     = useState([]);
  const [prReturns,   setPrReturns]   = useState([]);
  const [search,      setSearch]      = useState('');
  const [dateFrom,    setDateFrom]    = useState('');
  const [dateTo,      setDateTo]      = useState('');
  const [tab,         setTab]         = useState('returns');

  useEffect(()=>{
    const us=[
      onSnapshot(collection(db,'pos_settlements'),      s=>setSettlements(s.docs.map(d=>({...d.data(),id:d.id})).sort((a,b)=>new Date(b.createdAt)-new Date(a.createdAt)))),
      onSnapshot(collection(db,'pos_returns'),          s=>setReturns(s.docs.map(d=>({...d.data(),id:d.id})).sort((a,b)=>new Date(b.createdAt)-new Date(a.createdAt)))),
      onSnapshot(collection(db,'pos_purchase_returns'), s=>setPrReturns(s.docs.map(d=>({...d.data(),id:d.id})).sort((a,b)=>new Date(b.createdAt)-new Date(a.createdAt)))),
    ];
    return()=>us.forEach(u=>u());
  },[]);

  const inRange=d=>{ const ds=d?.slice(0,10)||''; if(dateFrom&&ds<dateFrom)return false; if(dateTo&&ds>dateTo)return false; return true; };

  const filteredReturns   = returns.filter(r=>inRange(r.createdAt)&&(!search||r.returnNo?.includes(search)||r.customer?.includes(search)||r.originalInvoice?.includes(search)));
  const filteredPrReturns = prReturns.filter(r=>inRange(r.createdAt)&&(!search||r.returnNo?.includes(search)||r.supplier?.includes(search)||r.originalInvoice?.includes(search)));
  const filteredSettles   = settlements.filter(s=>inRange(s.createdAt)&&(!search||s.settleNo?.includes(search)||s.addedBy?.includes(search)));

  const totalReturnVal  = filteredReturns.reduce((s,r)=>s+(r.total||0),0);
  const totalPrReturnVal= filteredPrReturns.reduce((s,r)=>s+(r.total||0),0);

  const TABS=[['returns',`↩️ إرجاع المبيعات (${filteredReturns.length})`],['pr_returns',`↩️ إرجاع المشتريات (${filteredPrReturns.length})`],['settlements',`⚖️ التسويات المخزنية (${filteredSettles.length})`]];

  return(
    <div style={{padding:24,fontFamily:"'Cairo'",direction:'rtl'}}>
      <div style={{color:'#fff',fontSize:22,fontWeight:800,marginBottom:20}}>📋 القوائم المعدّلة</div>

      <div style={{display:'flex',gap:10,marginBottom:16,flexWrap:'wrap'}}>
        <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="🔍 ابحث..."
          style={{flex:1,color:'#0f172a',fontSize:13,outline:'none'}}/>
        <input type="date" value={dateFrom} onChange={e=>setDateFrom(e.target.value)} style={{color:'#0f172a',outline:'none'}}/>
        <span style={{color:'#64748b',alignSelf:'center'}}>—</span>
        <input type="date" value={dateTo} onChange={e=>setDateTo(e.target.value)} style={{color:'#0f172a',outline:'none'}}/>
        <button onClick={()=>{setDateFrom('');setDateTo('');}} style={{background:'#d9e2f2',border:'none',borderRadius:10,padding:'10px 14px',color:'#64748b',cursor:'pointer',fontFamily:"'Cairo'"}}>إعادة</button>
      </div>

      <div style={{display:'flex',gap:10,marginBottom:20}}>
        {TABS.map(([v,l])=>(
          <button key={v} onClick={()=>setTab(v)}
            style={{background:tab===v?'#f59e0b':'#ffffff',color:tab===v?'#000':'#64748b',border:`1px solid ${tab===v?'#f59e0b':'#cdd8ec'}`,borderRadius:20,padding:'8px 16px',fontSize:12,cursor:'pointer',fontWeight:tab===v?700:400}}>{l}</button>
        ))}
      </div>

      {/* إرجاع المبيعات */}
      {tab==='returns'&&(
        <div>
          <div style={{background:'#ef444411',border:'1px solid #ef444433',borderRadius:12,padding:14,marginBottom:16,display:'flex',justifyContent:'space-between'}}>
            <span style={{color:'#ef4444',fontSize:14,fontWeight:700}}>إجمالي مبالغ الإرجاع</span>
            <span style={{color:'#ef4444',fontSize:18,fontWeight:900}}>{fmt(totalReturnVal)}</span>
          </div>
          <div style={{background:'#ffffff',borderRadius:16,border:'1px solid #d9e2f2',overflow:'hidden'}}>
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1.5fr 1fr 1fr 1fr 1fr',padding:'12px 20px',background:'#f8fbff',borderBottom:'1px solid #e2e8f7'}}>
              {['رقم الإرجاع','الفاتورة الأصلية','الزبون','المواد','المُسترد','طريقة الاسترداد','التاريخ'].map(h=><div key={h} style={{color:'#64748b',fontSize:11,fontWeight:700}}>{h}</div>)}
            </div>
            {filteredReturns.length===0?<div style={{color:'#cdd8ec',textAlign:'center',padding:40}}>لا توجد إرجاعات</div>
              :filteredReturns.map((r,i)=>(
              <div key={r.id} style={{display:'grid',gridTemplateColumns:'1fr 1fr 1.5fr 1fr 1fr 1fr 1fr',padding:'11px 20px',borderBottom:i<filteredReturns.length-1?'1px solid #ffffff':'none',alignItems:'center'}}>
                <div style={{color:'#ef4444',fontSize:12,fontWeight:700}}>{r.returnNo}</div>
                <div style={{color:'#F5C800',fontSize:12}}>{r.originalInvoice}</div>
                <div style={{color:'#1e293b',fontSize:12}}>{r.customer}</div>
                <div style={{color:'#666',fontSize:12}}>{r.items?.length||0} صنف</div>
                <div style={{color:'#ef4444',fontSize:13,fontWeight:800}}>{fmt(r.total)}</div>
                <div style={{color:'#64748b',fontSize:11}}>{r.refundMethod}</div>
                <div style={{color:'#64748b',fontSize:11}}>{r.dateISO||r.date}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* إرجاع المشتريات */}
      {tab==='pr_returns'&&(
        <div>
          <div style={{background:'#f59e0b11',border:'1px solid #f59e0b33',borderRadius:12,padding:14,marginBottom:16,display:'flex',justifyContent:'space-between'}}>
            <span style={{color:'#f59e0b',fontSize:14,fontWeight:700}}>إجمالي مبالغ إرجاع الشراء</span>
            <span style={{color:'#f59e0b',fontSize:18,fontWeight:900}}>{fmt(totalPrReturnVal)}</span>
          </div>
          <div style={{background:'#ffffff',borderRadius:16,border:'1px solid #d9e2f2',overflow:'hidden'}}>
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1.5fr 1fr 1fr 1fr 1fr',padding:'12px 20px',background:'#f8fbff',borderBottom:'1px solid #e2e8f7'}}>
              {['رقم الإرجاع','الفاتورة الأصلية','المورد','المواد','المُسترد','طريقة الاسترداد','التاريخ'].map(h=><div key={h} style={{color:'#64748b',fontSize:11,fontWeight:700}}>{h}</div>)}
            </div>
            {filteredPrReturns.length===0?<div style={{color:'#cdd8ec',textAlign:'center',padding:40}}>لا توجد إرجاعات شراء</div>
              :filteredPrReturns.map((r,i)=>(
              <div key={r.id} style={{display:'grid',gridTemplateColumns:'1fr 1fr 1.5fr 1fr 1fr 1fr 1fr',padding:'11px 20px',borderBottom:i<filteredPrReturns.length-1?'1px solid #ffffff':'none',alignItems:'center'}}>
                <div style={{color:'#f59e0b',fontSize:12,fontWeight:700}}>{r.returnNo}</div>
                <div style={{color:'#F5C800',fontSize:12}}>{r.originalInvoice}</div>
                <div style={{color:'#1e293b',fontSize:12}}>{r.supplier}</div>
                <div style={{color:'#666',fontSize:12}}>{r.items?.length||0} صنف</div>
                <div style={{color:'#f59e0b',fontSize:13,fontWeight:800}}>{fmt(r.total)}</div>
                <div style={{color:'#64748b',fontSize:11}}>{r.refundMethod}</div>
                <div style={{color:'#64748b',fontSize:11}}>{r.dateISO||r.date}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* التسويات المخزنية */}
      {tab==='settlements'&&(
        <div style={{background:'#ffffff',borderRadius:16,border:'1px solid #d9e2f2',overflow:'hidden'}}>
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr 1fr 1fr 1fr 1fr',padding:'12px 20px',background:'#f8fbff',borderBottom:'1px solid #e2e8f7'}}>
            {['رقم التسوية','التاريخ','المخزن','المواد','فائض','نقص','بواسطة'].map(h=><div key={h} style={{color:'#64748b',fontSize:11,fontWeight:700}}>{h}</div>)}
          </div>
          {filteredSettles.length===0?<div style={{color:'#cdd8ec',textAlign:'center',padding:40}}>لا توجد تسويات</div>
            :filteredSettles.map((s,i)=>(
            <div key={s.id} style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr 1fr 1fr 1fr 1fr',padding:'11px 20px',borderBottom:i<filteredSettles.length-1?'1px solid #ffffff':'none',alignItems:'center'}}>
              <div style={{color:'#F5C800',fontSize:12,fontWeight:700}}>{s.settleNo}</div>
              <div style={{color:'#64748b',fontSize:11}}>{s.dateISO||s.date}</div>
              <div style={{color:'#1e293b',fontSize:12}}>{s.warehouse||'الكل'}</div>
              <div style={{color:'#3b82f6',fontSize:12}}>{s.items?.length||0}</div>
              <div style={{color:'#10b981',fontSize:12,fontWeight:700}}>{s.surplusCount||0}</div>
              <div style={{color:'#ef4444',fontSize:12,fontWeight:700}}>{s.shortageCount||0}</div>
              <div style={{color:'#64748b',fontSize:11}}>{s.addedBy}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
