import { useState, useEffect } from 'react';
import { collection, onSnapshot } from 'firebase/firestore';
import { db } from '../../firebase';

const fmt = n=>(n||0).toLocaleString('ar-IQ')+' د.ع';

export default function MaxStockItems({ user }) {
  const [products, setProducts] = useState([]);
  const [catFilter,setCatFilter]= useState('الكل');

  useEffect(()=>{
    const u=onSnapshot(collection(db,'pos_products'),s=>setProducts(s.docs.map(d=>({...d.data(),id:d.id}))));
    return()=>u();
  },[]);

  const cats=['الكل',...new Set(products.map(p=>p.cat).filter(Boolean))];
  // مواد تجاوزت الحد الأعلى (3 × الحد الأدنى كافتراضي)
  const maxItems=products.filter(p=>{
    const max=p.maxStock||(p.minStock||5)*3;
    return(p.stock||0)>max&&(catFilter==='الكل'||p.cat===catFilter);
  }).sort((a,b)=>(b.stock||0)-(a.stock||0));

  const totalExcessValue=maxItems.reduce((s,p)=>{const max=p.maxStock||(p.minStock||5)*3;return s+Math.max(0,(p.stock||0)-max)*(p.buyPrice||0);},0);

  return(
    <div style={{padding:24,fontFamily:"'Cairo'",direction:'rtl'}}>
      <div style={{color:'#fff',fontSize:22,fontWeight:800,marginBottom:20}}>🟡 مواد الحد الأعلى</div>
      <div style={{background:'#f59e0b11',border:'1px solid #f59e0b33',borderRadius:12,padding:12,marginBottom:20,textAlign:'center'}}>
        <div style={{color:'#f59e0b',fontSize:13}}>⚠️ المواد التي تجاوز مخزونها الحد الأعلى — الحد الأعلى = الحد الأدنى × 3 (أو maxStock إن وُجد)</div>
      </div>
      <div style={{display:'flex',gap:10,marginBottom:16,flexWrap:'wrap'}}>
        {cats.map(c=><button key={c} onClick={()=>setCatFilter(c)} style={{background:catFilter===c?'#f59e0b':'#ffffff',color:catFilter===c?'#000':'#64748b',border:`1px solid ${catFilter===c?'#f59e0b':'#cdd8ec'}`,borderRadius:20,padding:'7px 14px',fontSize:12,cursor:'pointer',fontWeight:catFilter===c?700:400}}>{c}</button>)}
      </div>
      <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:14,marginBottom:20}}>
        {[['🟡','مواد تجاوزت الحد',maxItems.length,'#f59e0b'],['💰','قيمة الفائض',fmt(totalExcessValue),'#f59e0b'],['📦','إجمالي وحدات فائضة',maxItems.reduce((s,p)=>{const max=p.maxStock||(p.minStock||5)*3;return s+Math.max(0,(p.stock||0)-max);},0),'#1e293b']].map(([icon,label,val,color])=>(
          <div key={label} style={{background:'#ffffff',borderRadius:14,padding:16,border:`1px solid ${color}33`,textAlign:'center'}}>
            <div style={{fontSize:24,marginBottom:6}}>{icon}</div><div style={{color:'#64748b',fontSize:11,marginBottom:4}}>{label}</div><div style={{color,fontSize:18,fontWeight:800}}>{val}</div>
          </div>
        ))}
      </div>
      {maxItems.length===0
        ?<div style={{background:'#10b98111',border:'1px solid #10b98133',borderRadius:16,padding:60,textAlign:'center'}}>
          <div style={{fontSize:48,marginBottom:12}}>✅</div>
          <div style={{color:'#10b981',fontSize:16,fontWeight:700}}>لا توجد مواد تجاوزت الحد الأعلى</div>
        </div>
        :<div style={{background:'#ffffff',borderRadius:16,border:'1px solid #f59e0b33',overflow:'hidden'}}>
          <div style={{display:'grid',gridTemplateColumns:'2.5fr 1fr 1fr 1fr 1fr 1fr',padding:'12px 20px',background:'#f8fbff',borderBottom:'1px solid #e2e8f7'}}>
            {['المادة','التصنيف','المخزون','الحد الأعلى','الفائض','قيمة الفائض'].map(h=><div key={h} style={{color:'#64748b',fontSize:11,fontWeight:700}}>{h}</div>)}
          </div>
          {maxItems.map((p,i)=>{
            const max=p.maxStock||(p.minStock||5)*3;
            const excess=Math.max(0,(p.stock||0)-max);
            return(
              <div key={p.id} style={{display:'grid',gridTemplateColumns:'2.5fr 1fr 1fr 1fr 1fr 1fr',padding:'11px 20px',borderBottom:i<maxItems.length-1?'1px solid #ffffff':'none',alignItems:'center',background:'#f59e0b08'}}>
                <div style={{display:'flex',gap:8,alignItems:'center'}}><span style={{fontSize:18}}>{p.img||'📦'}</span><div style={{color:'#1e293b',fontSize:12,fontWeight:600}}>{p.name}</div></div>
                <div style={{color:'#666',fontSize:11}}>{p.cat}</div>
                <div style={{color:'#f59e0b',fontSize:14,fontWeight:800}}>{p.stock||0}</div>
                <div style={{color:'#64748b',fontSize:12}}>{max}</div>
                <div style={{color:'#f59e0b',fontSize:13,fontWeight:700}}>+{excess}</div>
                <div style={{color:'#ef4444',fontSize:12}}>{fmt(excess*(p.buyPrice||0))}</div>
              </div>
            );
          })}
        </div>
      }
    </div>
  );
}
