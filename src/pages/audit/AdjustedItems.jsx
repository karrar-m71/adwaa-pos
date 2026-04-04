import { useState, useEffect } from 'react';
import { collection, onSnapshot } from 'firebase/firestore';
import { db } from '../../firebase';

const fmt = n=>(n||0).toLocaleString('ar-IQ')+' د.ع';

export default function AdjustedItems({ user }) {
  const [movements, setMovements] = useState([]);
  const [products,  setProducts]  = useState([]);
  const [search,    setSearch]    = useState('');
  const [dateFrom,  setDateFrom]  = useState('');
  const [dateTo,    setDateTo]    = useState('');
  const [typeFilter,setTypeFilter]= useState('الكل');

  useEffect(()=>{
    const us=[
      onSnapshot(collection(db,'pos_inventory_movements'),s=>setMovements(s.docs.map(d=>({...d.data(),id:d.id})).sort((a,b)=>new Date(b.createdAt)-new Date(a.createdAt)))),
      onSnapshot(collection(db,'pos_products'),s=>setProducts(s.docs.map(d=>({...d.data(),id:d.id})))),
    ];
    return()=>us.forEach(u=>u());
  },[]);

  const inRange=d=>{ const ds=d?.slice(0,10)||''; if(dateFrom&&ds<dateFrom)return false; if(dateTo&&ds>dateTo)return false; return true; };
  const filtered=movements.filter(m=>{
    const mS=!search||m.productName?.includes(search)||m.addedBy?.includes(search);
    const mD=inRange(m.createdAt);
    const mT=typeFilter==='الكل'||m.type===typeFilter;
    return mS&&mD&&mT;
  });

  const totalAdded   = filtered.filter(m=>m.type==='إضافة'||m.type==='إدخال').reduce((s,m)=>s+(m.qty||0),0);
  const totalDeducted= filtered.filter(m=>m.type==='خصم'||m.type==='إخراج').reduce((s,m)=>s+(m.qty||0),0);

  return(
    <div style={{padding:24,fontFamily:"'Cairo'",direction:'rtl'}}>
      <div style={{color:'#fff',fontSize:22,fontWeight:800,marginBottom:20}}>📦 المواد المعدّلة</div>
      <div style={{background:'#3b82f611',border:'1px solid #3b82f633',borderRadius:12,padding:12,marginBottom:20,textAlign:'center'}}>
        <div style={{color:'#3b82f6',fontSize:13}}>ℹ️ سجل كامل لجميع التعديلات اليدوية على المخزون</div>
      </div>

      <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:14,marginBottom:20}}>
        {[['📋','إجمالي التعديلات',filtered.length,'#3b82f6'],['📈','إجمالي المضاف',totalAdded,'#10b981'],['📉','إجمالي المخصوم',totalDeducted,'#ef4444']].map(([icon,label,val,color])=>(
          <div key={label} style={{background:'#ffffff',borderRadius:14,padding:16,border:'1px solid #d9e2f2',textAlign:'center'}}>
            <div style={{fontSize:24,marginBottom:6}}>{icon}</div><div style={{color:'#64748b',fontSize:11,marginBottom:4}}>{label}</div><div style={{color,fontSize:18,fontWeight:800}}>{val}</div>
          </div>
        ))}
      </div>

      <div style={{display:'flex',gap:10,marginBottom:16,flexWrap:'wrap'}}>
        <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="🔍 ابحث بالمادة أو المستخدم..."
          style={{flex:1,color:'#0f172a',fontSize:13,outline:'none'}}/>
        {['الكل','إضافة','خصم','إدخال','إخراج'].map(t=>(
          <button key={t} onClick={()=>setTypeFilter(t)}
            style={{background:typeFilter===t?'#3b82f6':'#ffffff',color:typeFilter===t?'#fff':'#64748b',border:`1px solid ${typeFilter===t?'#3b82f6':'#cdd8ec'}`,borderRadius:20,padding:'7px 14px',fontSize:12,cursor:'pointer',fontWeight:typeFilter===t?700:400}}>{t}</button>
        ))}
        <input type="date" value={dateFrom} onChange={e=>setDateFrom(e.target.value)} style={{color:'#0f172a',outline:'none'}}/>
        <span style={{color:'#64748b',alignSelf:'center'}}>—</span>
        <input type="date" value={dateTo} onChange={e=>setDateTo(e.target.value)} style={{color:'#0f172a',outline:'none'}}/>
      </div>

      <div style={{background:'#ffffff',borderRadius:16,border:'1px solid #d9e2f2',overflow:'hidden'}}>
        <div style={{display:'grid',gridTemplateColumns:'2fr 1fr 1fr 1fr 1fr 1fr 1.5fr',padding:'12px 20px',background:'#f8fbff',borderBottom:'1px solid #e2e8f7'}}>
          {['المادة','نوع التعديل','الكمية','قبل','بعد','بواسطة','التاريخ / السبب'].map(h=><div key={h} style={{color:'#64748b',fontSize:11,fontWeight:700}}>{h}</div>)}
        </div>
        {filtered.length===0
          ?<div style={{color:'#cdd8ec',textAlign:'center',padding:60}}>لا توجد تعديلات</div>
          :filtered.map((m,i)=>(
            <div key={m.id} style={{display:'grid',gridTemplateColumns:'2fr 1fr 1fr 1fr 1fr 1fr 1.5fr',padding:'11px 20px',borderBottom:i<filtered.length-1?'1px solid #ffffff':'none',alignItems:'center',background:i%2===0?'transparent':'#f8fbff'}}>
              <div style={{color:'#1e293b',fontSize:12,fontWeight:600}}>{m.productName}</div>
              <span style={{background:(m.type==='إضافة'||m.type==='إدخال')?'#10b98122':'#ef444422',border:`1px solid ${(m.type==='إضافة'||m.type==='إدخال')?'#10b98144':'#ef444444'}`,borderRadius:20,padding:'2px 8px',color:(m.type==='إضافة'||m.type==='إدخال')?'#10b981':'#ef4444',fontSize:10,fontWeight:700,display:'inline-block'}}>{m.type}</span>
              <div style={{color:(m.type==='إضافة'||m.type==='إدخال')?'#10b981':'#ef4444',fontSize:13,fontWeight:800}}>{(m.type==='إضافة'||m.type==='إدخال')?'+':'-'}{m.qty}</div>
              <div style={{color:'#64748b',fontSize:12}}>{m.prevStock}</div>
              <div style={{color:'#F5C800',fontSize:12,fontWeight:700}}>{m.newStock}</div>
              <div style={{color:'#64748b',fontSize:11}}>{m.addedBy}</div>
              <div>
                <div style={{color:'#475569',fontSize:10}}>{m.date||m.createdAt?.slice(0,10)}</div>
                {m.note&&<div style={{color:'#666',fontSize:9}}>{m.note}</div>}
              </div>
            </div>
          ))
        }
      </div>
    </div>
  );
}
