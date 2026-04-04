import { useState, useEffect } from 'react';
import { collection, onSnapshot } from 'firebase/firestore';
import { db } from '../../firebase';

const fmt = n=>(n||0).toLocaleString('ar-IQ')+' د.ع';

export default function DeletedItems({ user }) {
  const [products,  setProducts]  = useState([]);
  const [packages,  setPackages]  = useState([]);
  const [search,    setSearch]    = useState('');
  const [catFilter, setCatFilter] = useState('الكل');
  const [showZero,  setShowZero]  = useState(false);
  const [sortBy,    setSortBy]    = useState('name');
  const [dateFrom,  setDateFrom]  = useState('');
  const [dateTo,    setDateTo]    = useState('');

  useEffect(()=>{
    const us=[
      onSnapshot(collection(db,'pos_products'),s=>setProducts(s.docs.map(d=>({...d.data(),id:d.id})))),
      onSnapshot(collection(db,'pos_packages'),s=>setPackages(s.docs.map(d=>({...d.data(),id:d.id})))),
    ];
    return()=>us.forEach(u=>u());
  },[]);

  const inRange=d=>{ const ds=(d||'').slice(0,10); if(dateFrom&&ds<dateFrom)return false; if(dateTo&&ds>dateTo)return false; return true; };
  const cats=['الكل',...new Set(products.map(p=>p.cat).filter(Boolean))];

  const filtered=products.filter(p=>{
    const mCat=catFilter==='الكل'||p.cat===catFilter;
    const mSearch=!search||p.name?.includes(search)||p.barcode?.includes(search);
    const mZero=showZero?(p.stock||0)===0:true;
    const mDate=inRange(p.createdAt);
    return mCat&&mSearch&&mZero&&mDate;
  }).sort((a,b)=>sortBy==='name'?a.name?.localeCompare(b.name,'ar'):sortBy==='stock'?b.stock-a.stock:sortBy==='sold'?(b.soldCount||0)-(a.soldCount||0):new Date(b.createdAt)-new Date(a.createdAt));

  const totalValue=filtered.reduce((s,p)=>s+(p.stock||0)*(p.buyPrice||0),0);
  const totalSell =filtered.reduce((s,p)=>s+(p.stock||0)*(p.sellPrice||0),0);

  return(
    <div style={{padding:24,fontFamily:"'Cairo'",direction:'rtl'}}>
      <div style={{color:'#fff',fontSize:22,fontWeight:800,marginBottom:20}}>🗑️ سجل المواد الكامل</div>
      <div style={{background:'#3b82f611',border:'1px solid #3b82f633',borderRadius:12,padding:12,marginBottom:20}}>
        <div style={{color:'#3b82f6',fontSize:13,textAlign:'center'}}>ℹ️ سجل شامل بجميع المواد المضافة للنظام مع إمكانية الفلترة والترتيب</div>
      </div>

      <div style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:14,marginBottom:20}}>
        {[['📦','إجمالي الأصناف',filtered.length,'#3b82f6'],['💰','قيمة المخزون (شراء)',fmt(totalValue),'#f59e0b'],['📈','قيمة المخزون (بيع)',fmt(totalSell),'#10b981'],['⛔','المخزون صفر',products.filter(p=>(p.stock||0)===0).length,'#ef4444']].map(([icon,label,val,color])=>(
          <div key={label} style={{background:'#ffffff',borderRadius:14,padding:14,border:'1px solid #d9e2f2',textAlign:'center'}}>
            <div style={{fontSize:22,marginBottom:6}}>{icon}</div><div style={{color:'#64748b',fontSize:11,marginBottom:4}}>{label}</div><div style={{color,fontSize:16,fontWeight:800}}>{val}</div>
          </div>
        ))}
      </div>

      <div style={{display:'flex',gap:10,marginBottom:16,flexWrap:'wrap',alignItems:'center'}}>
        <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="🔍 ابحث بالاسم أو الباركود..."
          style={{flex:1,color:'#0f172a',fontSize:13,outline:'none'}}/>
        {cats.map(c=><button key={c} onClick={()=>setCatFilter(c)} style={{background:catFilter===c?'#3b82f6':'#ffffff',color:catFilter===c?'#fff':'#64748b',border:`1px solid ${catFilter===c?'#3b82f6':'#cdd8ec'}`,borderRadius:20,padding:'6px 12px',fontSize:11,cursor:'pointer',fontWeight:catFilter===c?700:400}}>{c}</button>)}
        <select value={sortBy} onChange={e=>setSortBy(e.target.value)} style={{color:'#0f172a',outline:'none',fontSize:12}}>
          <option value="name">ترتيب: الاسم</option>
          <option value="stock">ترتيب: المخزون الأعلى</option>
          <option value="sold">ترتيب: الأكثر مبيعاً</option>
          <option value="date">ترتيب: الأحدث</option>
        </select>
        <label style={{display:'flex',gap:6,alignItems:'center',cursor:'pointer'}}>
          <div onClick={()=>setShowZero(!showZero)} style={{width:32,height:18,borderRadius:9,background:showZero?'#ef4444':'#cdd8ec',position:'relative',cursor:'pointer',transition:'background .2s'}}>
            <div style={{position:'absolute',top:1,left:showZero?15:1,width:16,height:16,borderRadius:8,background:'#fff',transition:'left .2s'}}/>
          </div>
          <span style={{color:'#64748b',fontSize:11}}>صفر فقط</span>
        </label>
      </div>

      <div style={{background:'#ffffff',borderRadius:16,border:'1px solid #d9e2f2',overflow:'hidden'}}>
        <div style={{display:'grid',gridTemplateColumns:'2.5fr 1fr 1fr 1fr 1fr 1fr 1fr 1fr',padding:'12px 20px',background:'#f8fbff',borderBottom:'1px solid #e2e8f7'}}>
          {['المادة','الباركود','التصنيف','سعر الشراء','سعر البيع','المخزون','تم بيعه','تاريخ الإضافة'].map(h=><div key={h} style={{color:'#64748b',fontSize:10,fontWeight:700}}>{h}</div>)}
        </div>
        {filtered.length===0?<div style={{color:'#cdd8ec',textAlign:'center',padding:60}}>لا توجد مواد</div>
          :filtered.map((p,i)=>{
          const pkg=packages.find(pk=>pk.id===p.packageTypeId);
          return(
            <div key={p.id} style={{display:'grid',gridTemplateColumns:'2.5fr 1fr 1fr 1fr 1fr 1fr 1fr 1fr',padding:'11px 20px',borderBottom:i<filtered.length-1?'1px solid #ffffff':'none',alignItems:'center',background:(p.stock||0)===0?'#ef444408':i%2===0?'transparent':'#f8fbff'}}>
              <div style={{display:'flex',gap:8,alignItems:'center'}}>
                <span style={{fontSize:18}}>{p.img||'📦'}</span>
                <div>
                  <div style={{color:'#1e293b',fontSize:12,fontWeight:600}}>{p.name}</div>
                  <div style={{display:'flex',gap:4}}>
                    {p.hasPackage&&<span style={{background:'#a78bfa22',borderRadius:20,padding:'0 5px',color:'#a78bfa',fontSize:9}}>معبأ</span>}
                  </div>
                </div>
              </div>
              <div style={{color:'#475569',fontSize:9,fontFamily:'monospace'}}>{p.barcode||'—'}</div>
              <div style={{color:'#666',fontSize:11}}>{p.cat}</div>
              <div style={{color:'#f59e0b',fontSize:11}}>{fmt(p.buyPrice)}</div>
              <div style={{color:'#F5C800',fontSize:11,fontWeight:700}}>{fmt(p.sellPrice)}</div>
              <div>
                <span style={{background:(p.stock||0)===0?'#ef444422':'#10b98122',border:`1px solid ${(p.stock||0)===0?'#ef444444':'#10b98144'}`,borderRadius:20,padding:'2px 8px',color:(p.stock||0)===0?'#ef4444':'#10b981',fontSize:11,fontWeight:700}}>{p.stock||0}</span>
              </div>
              <div style={{color:'#3b82f6',fontSize:11}}>{p.soldCount||0}</div>
              <div style={{color:'#475569',fontSize:9}}>{p.createdAt?.slice(0,10)||'—'}</div>
            </div>
          );
        })}
        <div style={{display:'grid',gridTemplateColumns:'2.5fr 1fr 1fr 1fr 1fr 1fr 1fr 1fr',padding:'14px 20px',background:'#ffffff',borderTop:'2px solid #d9e2f2'}}>
          <div style={{color:'#1e293b',fontSize:13,fontWeight:800}}>{filtered.length} مادة</div>
          <div/><div/>
          <div style={{color:'#f59e0b',fontSize:12}}>{fmt(filtered.reduce((s,p)=>s+p.buyPrice,0)/Math.max(filtered.length,1))} متوسط</div>
          <div style={{color:'#F5C800',fontSize:12}}>{fmt(filtered.reduce((s,p)=>s+p.sellPrice,0)/Math.max(filtered.length,1))} متوسط</div>
          <div style={{color:'#10b981',fontSize:13,fontWeight:800}}>{filtered.reduce((s,p)=>s+(p.stock||0),0)} مجموع</div>
          <div style={{color:'#3b82f6',fontSize:13,fontWeight:800}}>{filtered.reduce((s,p)=>s+(p.soldCount||0),0)}</div>
          <div/>
        </div>
      </div>
    </div>
  );
}
