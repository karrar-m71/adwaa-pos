import { useState, useEffect } from 'react';
import { collection, onSnapshot, updateDoc, doc } from 'firebase/firestore';
import { db } from '../../firebase';

const fmt = n=>(n||0).toLocaleString('ar-IQ')+' د.ع';

export default function MinStockItems({ user }) {
  const [products, setProducts] = useState([]);
  const [catFilter,setCatFilter]= useState('الكل');
  const [editMin, setEditMin]   = useState(null);
  const [newMin,  setNewMin]    = useState('');

  useEffect(()=>{
    const u=onSnapshot(collection(db,'pos_products'),s=>setProducts(s.docs.map(d=>({...d.data(),id:d.id}))));
    return()=>u();
  },[]);

  const cats=['الكل',...new Set(products.map(p=>p.cat).filter(Boolean))];
  const lowItems=products.filter(p=>(p.stock||0)<=(p.minStock||5)&&(catFilter==='الكل'||p.cat===catFilter)).sort((a,b)=>(a.stock||0)-(b.stock||0));
  const criticalItems=lowItems.filter(p=>(p.stock||0)===0);

  const saveMin=async(id)=>{
    if(!newMin)return;
    await updateDoc(doc(db,'pos_products',id),{minStock:Number(newMin)});
    setEditMin(null);setNewMin('');
  };

  return(
    <div style={{padding:24,fontFamily:"'Cairo'",direction:'rtl'}}>
      <div style={{color:'#fff',fontSize:22,fontWeight:800,marginBottom:20}}>🔴 مواد الحد الأدنى</div>
      <div style={{display:'flex',gap:10,marginBottom:20,flexWrap:'wrap',alignItems:'center'}}>
        {cats.map(c=><button key={c} onClick={()=>setCatFilter(c)} style={{background:catFilter===c?'#ef4444':'#ffffff',color:catFilter===c?'#fff':'#64748b',border:`1px solid ${catFilter===c?'#ef4444':'#cdd8ec'}`,borderRadius:20,padding:'7px 14px',fontSize:12,cursor:'pointer',fontWeight:catFilter===c?700:400}}>{c}</button>)}
      </div>
      <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:14,marginBottom:20}}>
        {[['🔴','وصلت الحد الأدنى',lowItems.length,'#ef4444'],['⛔','نفدت من المخزن',criticalItems.length,'#ef4444'],['💰','قيمة المخزون المنخفض',fmt(lowItems.reduce((s,p)=>s+(p.stock||0)*(p.buyPrice||0),0)),'#f59e0b']].map(([icon,label,val,color])=>(
          <div key={label} style={{background:'#ffffff',borderRadius:14,padding:16,border:`1px solid ${color}33`,textAlign:'center'}}>
            <div style={{fontSize:24,marginBottom:6}}>{icon}</div><div style={{color:'#64748b',fontSize:11,marginBottom:4}}>{label}</div><div style={{color,fontSize:18,fontWeight:800}}>{val}</div>
          </div>
        ))}
      </div>
      {lowItems.length===0
        ?<div style={{background:'#10b98111',border:'1px solid #10b98133',borderRadius:16,padding:60,textAlign:'center'}}>
          <div style={{fontSize:48,marginBottom:12}}>✅</div>
          <div style={{color:'#10b981',fontSize:16,fontWeight:700}}>كل المواد فوق الحد الأدنى!</div>
        </div>
        :<div style={{background:'#ffffff',borderRadius:16,border:'1px solid #ef444433',overflow:'hidden'}}>
          <div style={{display:'grid',gridTemplateColumns:'2.5fr 1fr 1fr 1fr 1fr 1fr',padding:'12px 20px',background:'#f8fbff',borderBottom:'1px solid #e2e8f7'}}>
            {['المادة','التصنيف','المخزون الحالي','الحد الأدنى','الناقص','إجراء'].map(h=><div key={h} style={{color:'#64748b',fontSize:11,fontWeight:700}}>{h}</div>)}
          </div>
          {lowItems.map((p,i)=>(
            <div key={p.id} style={{display:'grid',gridTemplateColumns:'2.5fr 1fr 1fr 1fr 1fr 1fr',padding:'11px 20px',borderBottom:i<lowItems.length-1?'1px solid #ffffff':'none',alignItems:'center',background:(p.stock||0)===0?'#ef444415':'#ef444408'}}>
              <div style={{display:'flex',gap:8,alignItems:'center'}}>
                <span style={{fontSize:18}}>{p.img||'📦'}</span>
                <div>
                  <div style={{color:'#1e293b',fontSize:12,fontWeight:600}}>{p.name}</div>
                  {(p.stock||0)===0&&<span style={{background:'#ef444422',borderRadius:20,padding:'1px 6px',color:'#ef4444',fontSize:9,fontWeight:700}}>نفد المخزون</span>}
                </div>
              </div>
              <div style={{color:'#666',fontSize:11}}>{p.cat}</div>
              <div style={{color:(p.stock||0)===0?'#ef4444':'#f59e0b',fontSize:14,fontWeight:900}}>{p.stock||0}</div>
              <div>
                {editMin===p.id
                  ?<div style={{display:'flex',gap:4}}>
                    <input type="number" value={newMin} onChange={e=>setNewMin(e.target.value)} autoFocus
                      style={{width:50,background:'#f8fbff',border:'1px solid #F5C800',borderRadius:6,padding:'3px 6px',color:'#F5C800',fontSize:12,outline:'none',textAlign:'center'}}/>
                    <button onClick={()=>saveMin(p.id)} style={{background:'#10b981',border:'none',borderRadius:6,padding:'3px 7px',color:'#000',cursor:'pointer',fontSize:11,fontWeight:700}}>✓</button>
                    <button onClick={()=>{setEditMin(null);setNewMin('');}} style={{background:'#ef4444',border:'none',borderRadius:6,padding:'3px 7px',color:'#fff',cursor:'pointer',fontSize:11}}>✕</button>
                  </div>
                  :<div style={{display:'flex',gap:6,alignItems:'center'}}>
                    <span style={{color:'#64748b',fontSize:12}}>{p.minStock||5}</span>
                    <button onClick={()=>{setEditMin(p.id);setNewMin(String(p.minStock||5));}} style={{background:'#F5C80022',border:'1px solid #F5C80044',borderRadius:6,padding:'2px 6px',color:'#F5C800',cursor:'pointer',fontSize:10}}>✏️</button>
                  </div>
                }
              </div>
              <div style={{color:'#ef4444',fontSize:13,fontWeight:700}}>{Math.max(0,(p.minStock||5)-(p.stock||0))}</div>
              <div style={{color:'#64748b',fontSize:11}}>{fmt(p.buyPrice)}</div>
            </div>
          ))}
        </div>
      }
    </div>
  );
}
