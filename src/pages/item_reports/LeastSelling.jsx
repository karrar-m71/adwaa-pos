import { useState, useEffect } from 'react';
import { collection, onSnapshot } from 'firebase/firestore';
import { db } from '../../firebase';

const fmt = n=>(n||0).toLocaleString('ar-IQ')+' د.ع';

export default function LeastSelling({ user }) {
  const [products, setProducts] = useState([]);
  const [sales,    setSales]    = useState([]);
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo,   setDateTo]   = useState('');
  const [catFilter,setCatFilter]= useState('الكل');

  useEffect(()=>{
    const us=[onSnapshot(collection(db,'pos_products'),s=>setProducts(s.docs.map(d=>({...d.data(),id:d.id})))),onSnapshot(collection(db,'pos_sales'),s=>setSales(s.docs.map(d=>({...d.data(),id:d.id}))))];
    return()=>us.forEach(u=>u());
  },[]);

  const inRange=d=>{ const ds=d?.slice(0,10)||''; if(dateFrom&&ds<dateFrom)return false; if(dateTo&&ds>dateTo)return false; return true; };
  const fSales=sales.filter(s=>inRange(s.createdAt||s.dateISO||s.date));

  const soldMap={};
  fSales.forEach(inv=>(inv.items||[]).forEach(it=>{soldMap[it.id||it.name]=(soldMap[it.id||it.name]||0)+it.qty;}));

  const cats=['الكل',...new Set(products.map(p=>p.cat).filter(Boolean))];
  const data=products.filter(p=>catFilter==='الكل'||p.cat===catFilter).map(p=>({...p,soldQty:soldMap[p.id]||0})).sort((a,b)=>a.soldQty-b.soldQty);

  return(
    <div style={{padding:24,fontFamily:"'Cairo'",direction:'rtl'}}>
      <div style={{color:'#fff',fontSize:22,fontWeight:800,marginBottom:20}}>📉 الأقل مبيعاً</div>
      <div style={{display:'flex',gap:14,marginBottom:20,background:'#ffffff',borderRadius:14,padding:16,border:'1px solid #d9e2f2',alignItems:'center',flexWrap:'wrap'}}>
        <span style={{color:'#64748b',fontSize:13}}>الفترة:</span>
        <input type="date" value={dateFrom} onChange={e=>setDateFrom(e.target.value)} style={{color:'#0f172a',outline:'none'}}/>
        <span style={{color:'#64748b'}}>—</span>
        <input type="date" value={dateTo} onChange={e=>setDateTo(e.target.value)} style={{color:'#0f172a',outline:'none'}}/>
        <button onClick={()=>{setDateFrom('');setDateTo('');}} style={{background:'#d9e2f2',border:'none',borderRadius:10,padding:'8px 14px',color:'#64748b',cursor:'pointer',fontFamily:"'Cairo'"}}>إعادة</button>
        {cats.map(c=><button key={c} onClick={()=>setCatFilter(c)} style={{background:catFilter===c?'#ef4444':'#ffffff',color:catFilter===c?'#fff':'#64748b',border:`1px solid ${catFilter===c?'#ef4444':'#cdd8ec'}`,borderRadius:20,padding:'6px 12px',fontSize:12,cursor:'pointer',fontWeight:catFilter===c?700:400}}>{c}</button>)}
      </div>
      <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:14,marginBottom:20}}>
        {[['📦','إجمالي الأصناف',data.length,'#3b82f6'],['🚫','لم تُباع أبداً',data.filter(p=>p.soldQty===0).length,'#ef4444'],['📉','أقل من 5 مبيعات',data.filter(p=>p.soldQty>0&&p.soldQty<5).length,'#f59e0b']].map(([icon,label,val,color])=>(
          <div key={label} style={{background:'#ffffff',borderRadius:14,padding:16,border:'1px solid #d9e2f2',textAlign:'center'}}>
            <div style={{fontSize:24,marginBottom:6}}>{icon}</div><div style={{color:'#64748b',fontSize:11,marginBottom:4}}>{label}</div><div style={{color,fontSize:18,fontWeight:800}}>{val}</div>
          </div>
        ))}
      </div>
      <div style={{background:'#ffffff',borderRadius:16,border:'1px solid #d9e2f2',overflow:'hidden'}}>
        <div style={{display:'grid',gridTemplateColumns:'2.5fr 1fr 1fr 1fr 1fr 1fr',padding:'12px 20px',background:'#f8fbff',borderBottom:'1px solid #e2e8f7'}}>
          {['المادة','التصنيف','المخزون','الكمية المباعة','سعر البيع','قيمة المخزون'].map(h=><div key={h} style={{color:'#64748b',fontSize:11,fontWeight:700}}>{h}</div>)}
        </div>
        {data.map((p,i)=>(
          <div key={p.id} style={{display:'grid',gridTemplateColumns:'2.5fr 1fr 1fr 1fr 1fr 1fr',padding:'11px 20px',borderBottom:i<data.length-1?'1px solid #ffffff':'none',alignItems:'center',background:p.soldQty===0?'#ef444408':'transparent'}}>
            <div style={{display:'flex',gap:8,alignItems:'center'}}>
              <span style={{fontSize:18}}>{p.img||'📦'}</span>
              <div>
                <div style={{color:'#1e293b',fontSize:12,fontWeight:600}}>{p.name}</div>
                {p.soldQty===0&&<span style={{background:'#ef444422',borderRadius:20,padding:'1px 6px',color:'#ef4444',fontSize:9,fontWeight:700}}>لم تُباع</span>}
              </div>
            </div>
            <div style={{color:'#666',fontSize:11}}>{p.cat}</div>
            <div style={{color:'#1e293b',fontSize:12}}>{p.stock||0}</div>
            <div style={{color:p.soldQty===0?'#ef4444':p.soldQty<5?'#f59e0b':'#10b981',fontSize:13,fontWeight:700}}>{p.soldQty}</div>
            <div style={{color:'#F5C800',fontSize:12}}>{fmt(p.sellPrice)}</div>
            <div style={{color:'#64748b',fontSize:12}}>{fmt((p.stock||0)*(p.buyPrice||0))}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
