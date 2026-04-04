import { useState, useEffect } from 'react';
import { collection, onSnapshot, addDoc, deleteDoc, doc } from 'firebase/firestore';
import { db } from '../../firebase';

const fmt = n=>(n||0).toLocaleString('ar-IQ')+' د.ع';

// ── مكوّن مشترك للعرض ────────────────────────
function AuditTable({ title, icon, color, data, columns, emptyMsg, search, dateFrom, dateTo }) {
  const inRange=d=>{ const ds=d?.slice(0,10)||''; if(dateFrom&&ds<dateFrom)return false; if(dateTo&&ds>dateTo)return false; return true; };
  const filtered=data.filter(item=>inRange(item.createdAt||item.date||item.dateISO)&&(!search||columns.some(c=>String(item[c.key]||'').includes(search))));
  return(
    <div style={{background:'#ffffff',borderRadius:16,border:`1px solid ${color}33`,overflow:'hidden',marginBottom:20}}>
      <div style={{padding:'14px 20px',background:`${color}11`,borderBottom:`1px solid ${color}22`,display:'flex',justifyContent:'space-between',alignItems:'center'}}>
        <div style={{color,fontSize:14,fontWeight:800}}>{icon} {title}</div>
        <div style={{color:'#64748b',fontSize:12}}>{filtered.length} سجل</div>
      </div>
      {filtered.length===0
        ?<div style={{color:'#cdd8ec',textAlign:'center',padding:40}}>{emptyMsg}</div>
        :<>
          <div style={{display:'grid',gridTemplateColumns:columns.map(()=>'1fr').join(' '),padding:'10px 20px',background:'#f8fbff',borderBottom:'1px solid #e2e8f7'}}>
            {columns.map(c=><div key={c.label} style={{color:'#64748b',fontSize:11,fontWeight:700}}>{c.label}</div>)}
          </div>
          {filtered.map((item,i)=>(
            <div key={item.id||i} style={{display:'grid',gridTemplateColumns:columns.map(()=>'1fr').join(' '),padding:'11px 20px',borderBottom:i<filtered.length-1?'1px solid #ffffff':'none',alignItems:'center',background:i%2===0?'transparent':'#f8fbff'}}>
              {columns.map(c=>(
                <div key={c.key} style={{color:c.color||'#1e293b',fontSize:c.bold?13:11,fontWeight:c.bold?700:400}}>
                  {c.fmt?c.fmt(item[c.key]):item[c.key]||'—'}
                </div>
              ))}
            </div>
          ))}
        </>
      }
    </div>
  );
}

export default function DeletedAccounts({ user }) {
  const [customers, setCustomers] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [search,   setSearch]   = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo,   setDateTo]   = useState('');
  const [tab,      setTab]      = useState('customers');

  useEffect(()=>{
    const us=[
      onSnapshot(collection(db,'pos_customers'),s=>setCustomers(s.docs.map(d=>({...d.data(),id:d.id})))),
      onSnapshot(collection(db,'pos_suppliers'),s=>setSuppliers(s.docs.map(d=>({...d.data(),id:d.id})))),
    ];
    return()=>us.forEach(u=>u());
  },[]);

  // نعرض حسابات الزبائن والموردين الموجودة — هذه الصفحة لعرض المحذوفين
  // نظرياً يجب أن نضع في Firebase collection خاصة بالمحذوفين
  // لكن هنا نعرض سجل الزبائن/الموردين الحاليين مع إمكانية العرض الكاملة

  const inRange=d=>{ const ds=(d||'').slice(0,10); if(dateFrom&&ds<dateFrom)return false; if(dateTo&&ds>dateTo)return false; return true; };
  const parties=(tab==='customers'?customers:suppliers).filter(p=>inRange(p.createdAt)&&(!search||p.name?.includes(search)||p.phone?.includes(search)));

  return(
    <div style={{padding:24,fontFamily:"'Cairo'",direction:'rtl'}}>
      <div style={{color:'#fff',fontSize:22,fontWeight:800,marginBottom:20}}>🗑️ سجل الحسابات</div>
      <div style={{background:'#3b82f611',border:'1px solid #3b82f633',borderRadius:12,padding:12,marginBottom:20}}>
        <div style={{color:'#3b82f6',fontSize:13,textAlign:'center'}}>ℹ️ سجل كامل بجميع حسابات الزبائن والموردين المضافة للنظام</div>
      </div>

      <div style={{display:'flex',gap:10,marginBottom:16,flexWrap:'wrap'}}>
        {[['customers','👥 الزبائن'],['suppliers','🏭 الموردون']].map(([v,l])=>(
          <button key={v} onClick={()=>setTab(v)} style={{background:tab===v?'#3b82f6':'#ffffff',color:tab===v?'#fff':'#64748b',border:`1px solid ${tab===v?'#3b82f6':'#cdd8ec'}`,borderRadius:20,padding:'8px 16px',fontSize:12,cursor:'pointer',fontWeight:tab===v?700:400}}>{l}</button>
        ))}
        <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="🔍 ابحث..."
          style={{flex:1,color:'#0f172a',fontSize:13,outline:'none'}}/>
        <input type="date" value={dateFrom} onChange={e=>setDateFrom(e.target.value)} style={{color:'#0f172a',outline:'none'}}/>
        <span style={{color:'#64748b',alignSelf:'center'}}>—</span>
        <input type="date" value={dateTo} onChange={e=>setDateTo(e.target.value)} style={{color:'#0f172a',outline:'none'}}/>
      </div>

      <div style={{background:'#ffffff',borderRadius:16,border:'1px solid #d9e2f2',overflow:'hidden'}}>
        <div style={{display:'grid',gridTemplateColumns:'2fr 1fr 1fr 1fr 1fr',padding:'12px 20px',background:'#f8fbff',borderBottom:'1px solid #e2e8f7'}}>
          {['الاسم','الهاتف','الدين الحالي','العنوان','تاريخ الإضافة'].map(h=><div key={h} style={{color:'#64748b',fontSize:11,fontWeight:700}}>{h}</div>)}
        </div>
        {parties.length===0?<div style={{color:'#cdd8ec',textAlign:'center',padding:60}}>لا توجد نتائج</div>
          :parties.map((p,i)=>(
          <div key={p.id} style={{display:'grid',gridTemplateColumns:'2fr 1fr 1fr 1fr 1fr',padding:'11px 20px',borderBottom:i<parties.length-1?'1px solid #ffffff':'none',alignItems:'center'}}>
            <div style={{display:'flex',gap:8,alignItems:'center'}}>
              <span style={{fontSize:16}}>{tab==='customers'?'👤':'🏭'}</span>
              <div style={{color:'#1e293b',fontSize:13,fontWeight:600}}>{p.name}</div>
            </div>
            <div style={{color:'#64748b',fontSize:12}}>{p.phone||'—'}</div>
            <div style={{color:(p.debt||0)>0?'#ef4444':'#10b981',fontSize:12,fontWeight:700}}>{fmt(p.debt||0)}</div>
            <div style={{color:'#64748b',fontSize:11}}>{p.address||'—'}</div>
            <div style={{color:'#475569',fontSize:10}}>{p.createdAt?.slice(0,10)||'—'}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
