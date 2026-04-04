import { useState, useEffect } from 'react';
import { collection, onSnapshot } from 'firebase/firestore';
import { db } from '../../firebase';

const fmt = n=>(n||0).toLocaleString('ar-IQ')+' د.ع';

export default function SlowMoving({ user }) {
  const [products, setProducts] = useState([]);
  const [sales,    setSales]    = useState([]);
  const [days,     setDays]     = useState(30);
  const [catFilter,setCatFilter]= useState('الكل');

  useEffect(()=>{
    const us=[onSnapshot(collection(db,'pos_products'),s=>setProducts(s.docs.map(d=>({...d.data(),id:d.id})))),onSnapshot(collection(db,'pos_sales'),s=>setSales(s.docs.map(d=>({...d.data(),id:d.id}))))];
    return()=>us.forEach(u=>u());
  },[]);

  const cutoff=new Date();cutoff.setDate(cutoff.getDate()-days);
  const recentSales=sales.filter(s=>new Date(s.createdAt||s.dateISO||s.date)>=cutoff);
  const soldRecently=new Set(recentSales.flatMap(s=>(s.items||[]).map(it=>it.id)));

  const cats=['الكل',...new Set(products.map(p=>p.cat).filter(Boolean))];
  const slowItems=products.filter(p=>!soldRecently.has(p.id)&&(p.stock||0)>0&&(catFilter==='الكل'||p.cat===catFilter));
  const totalStuckValue=slowItems.reduce((s,p)=>s+(p.stock||0)*(p.buyPrice||0),0);

  return(
    <div style={{padding:24,fontFamily:"'Cairo'",direction:'rtl'}}>
      <div style={{color:'#fff',fontSize:22,fontWeight:800,marginBottom:20}}>🐌 المواد الراكدة</div>
      <div style={{display:'flex',gap:14,marginBottom:20,background:'#ffffff',borderRadius:14,padding:16,border:'1px solid #d9e2f2',alignItems:'center',flexWrap:'wrap'}}>
        <span style={{color:'#64748b',fontSize:13}}>مواد لم تُباع خلال:</span>
        <select value={days} onChange={e=>setDays(Number(e.target.value))} style={{background:'#f8fbff',border:'1px solid #cdd8ec',borderRadius:10,padding:'8px 12px',color:'#F5C800',fontSize:14,fontWeight:700,outline:'none'}}>
          {[7,14,30,60,90,180].map(d=><option key={d} value={d}>{d} يوم</option>)}
        </select>
        {cats.map(c=><button key={c} onClick={()=>setCatFilter(c)} style={{background:catFilter===c?'#f59e0b':'#ffffff',color:catFilter===c?'#000':'#64748b',border:`1px solid ${catFilter===c?'#f59e0b':'#cdd8ec'}`,borderRadius:20,padding:'6px 12px',fontSize:12,cursor:'pointer',fontWeight:catFilter===c?700:400}}>{c}</button>)}
      </div>
      <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:14,marginBottom:20}}>
        {[['🐌','مواد راكدة',slowItems.length,'#f59e0b'],['💰','قيمة المخزون الراكد',fmt(totalStuckValue),'#ef4444'],['📦','من إجمالي المواد',`${products.filter(p=>(p.stock||0)>0).length>0?(slowItems.length/products.filter(p=>(p.stock||0)>0).length*100).toFixed(0):0}%`,'#f59e0b']].map(([icon,label,val,color])=>(
          <div key={label} style={{background:'#ffffff',borderRadius:14,padding:16,border:`1px solid ${color}33`,textAlign:'center'}}>
            <div style={{fontSize:24,marginBottom:6}}>{icon}</div><div style={{color:'#64748b',fontSize:11,marginBottom:4}}>{label}</div><div style={{color,fontSize:18,fontWeight:800}}>{val}</div>
          </div>
        ))}
      </div>
      {slowItems.length===0
        ?<div style={{background:'#10b98111',border:'1px solid #10b98133',borderRadius:16,padding:60,textAlign:'center'}}>
          <div style={{fontSize:48,marginBottom:12}}>✅</div>
          <div style={{color:'#10b981',fontSize:16,fontWeight:700}}>كل المواد تحركت خلال آخر {days} يوم!</div>
        </div>
        :<div style={{background:'#ffffff',borderRadius:16,border:'1px solid #f59e0b33',overflow:'hidden'}}>
          <div style={{display:'grid',gridTemplateColumns:'2.5fr 1fr 1fr 1fr 1fr',padding:'12px 20px',background:'#f8fbff',borderBottom:'1px solid #e2e8f7'}}>
            {['المادة','التصنيف','المخزون','سعر الشراء','قيمة المخزون'].map(h=><div key={h} style={{color:'#64748b',fontSize:11,fontWeight:700}}>{h}</div>)}
          </div>
          {slowItems.map((p,i)=>(
            <div key={p.id} style={{display:'grid',gridTemplateColumns:'2.5fr 1fr 1fr 1fr 1fr',padding:'11px 20px',borderBottom:i<slowItems.length-1?'1px solid #ffffff':'none',alignItems:'center',background:'#f59e0b08'}}>
              <div style={{display:'flex',gap:8,alignItems:'center'}}><span style={{fontSize:18}}>{p.img||'📦'}</span><div style={{color:'#1e293b',fontSize:12,fontWeight:600}}>{p.name}</div></div>
              <div style={{color:'#666',fontSize:11}}>{p.cat}</div>
              <div style={{color:'#f59e0b',fontSize:13,fontWeight:700}}>{p.stock||0}</div>
              <div style={{color:'#64748b',fontSize:12}}>{fmt(p.buyPrice)}</div>
              <div style={{color:'#ef4444',fontSize:13,fontWeight:700}}>{fmt((p.stock||0)*(p.buyPrice||0))}</div>
            </div>
          ))}
        </div>
      }
    </div>
  );
}
