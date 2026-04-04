import { useState, useEffect } from 'react';
import { collection, onSnapshot } from 'firebase/firestore';
import { db } from '../../firebase';

const fmt = n=>(n||0).toLocaleString('ar-IQ')+' د.ع';

export default function SellBelowCost() {
  const [products, setProducts] = useState([]);
  const [sales,    setSales]    = useState([]);
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo,   setDateTo]   = useState('');

  useEffect(()=>{
    const us=[onSnapshot(collection(db,'pos_products'),s=>setProducts(s.docs.map(d=>({...d.data(),id:d.id})))),onSnapshot(collection(db,'pos_sales'),s=>setSales(s.docs.map(d=>({...d.data(),id:d.id}))))];
    return()=>us.forEach(u=>u());
  },[]);

  const inRange2=d=>{ const ds=d?.slice(0,10)||''; if(dateFrom&&ds<dateFrom)return false; if(dateTo&&ds>dateTo)return false; return true; };
  const fSales=sales.filter(s=>inRange2(s.createdAt||s.dateISO||s.date));

  // مواد بيعت بأقل من سعر الشراء
  const belowCostItems=[];
  fSales.forEach(inv=>{
    (inv.items||[]).forEach(it=>{
      const p=products.find(p=>p.id===it.id);
      if(p&&(it.price||0)<(p.buyPrice||0)){
        belowCostItems.push({
          invoiceNo:inv.invoiceNo,date:inv.dateISO||inv.date,customer:inv.customer,
          name:it.name,img:p.img||'📦',qty:it.qty,
          sellPrice:it.price,buyPrice:p.buyPrice,
          diff:it.price-p.buyPrice,loss:(it.price-p.buyPrice)*it.qty,
        });
      }
    });
  });
  belowCostItems.sort((a,b)=>a.loss-b.loss);
  const totalLoss=belowCostItems.reduce((s,i)=>s+i.loss,0);

  return(
    <div style={{padding:24,fontFamily:"'Cairo'",direction:'rtl'}}>
      <div style={{color:'#fff',fontSize:22,fontWeight:800,marginBottom:20}}>⚠️ البيع أقل من الشراء</div>
      <div style={{display:'flex',gap:14,marginBottom:20,background:'#ffffff',borderRadius:14,padding:16,border:'1px solid #ef444433',alignItems:'center'}}>
        <span style={{color:'#64748b',fontSize:13}}>الفترة:</span>
        <input type="date" value={dateFrom} onChange={e=>setDateFrom(e.target.value)} style={{color:'#0f172a',outline:'none'}}/>
        <span style={{color:'#64748b'}}>—</span>
        <input type="date" value={dateTo} onChange={e=>setDateTo(e.target.value)} style={{color:'#0f172a',outline:'none'}}/>
        <button onClick={()=>{setDateFrom('');setDateTo('');}} style={{background:'#d9e2f2',border:'none',borderRadius:10,padding:'8px 14px',color:'#64748b',cursor:'pointer',fontFamily:"'Cairo'"}}>إعادة</button>
      </div>
      <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:14,marginBottom:20}}>
        {[['⚠️','حالات البيع بخسارة',belowCostItems.length,'#ef4444'],['💸','إجمالي الخسارة',fmt(Math.abs(totalLoss)),'#ef4444'],['📦','مواد متأثرة',[...new Set(belowCostItems.map(i=>i.name))].length,'#f59e0b']].map(([icon,label,val,color])=>(
          <div key={label} style={{background:'#ffffff',borderRadius:14,padding:16,border:`1px solid ${color}33`,textAlign:'center'}}>
            <div style={{fontSize:24,marginBottom:6}}>{icon}</div><div style={{color:'#64748b',fontSize:11,marginBottom:4}}>{label}</div><div style={{color,fontSize:18,fontWeight:800}}>{val}</div>
          </div>
        ))}
      </div>
      {belowCostItems.length===0
        ?<div style={{background:'#10b98111',border:'1px solid #10b98133',borderRadius:16,padding:60,textAlign:'center'}}>
          <div style={{fontSize:48,marginBottom:12}}>✅</div>
          <div style={{color:'#10b981',fontSize:16,fontWeight:700}}>ممتاز! لا توجد مبيعات بأقل من سعر الشراء</div>
        </div>
        :<div style={{background:'#ffffff',borderRadius:16,border:'1px solid #ef444433',overflow:'hidden'}}>
          <div style={{display:'grid',gridTemplateColumns:'1fr 1.5fr 1.5fr 1fr 1fr 1fr 1fr 1fr',padding:'12px 20px',background:'#f8fbff',borderBottom:'1px solid #e2e8f7'}}>
            {['الفاتورة','المادة','الزبون','الكمية','سعر الشراء','سعر البيع','الفرق/وحدة','الخسارة'].map(h=><div key={h} style={{color:'#64748b',fontSize:10,fontWeight:700}}>{h}</div>)}
          </div>
          {belowCostItems.map((item,i)=>(
            <div key={i} style={{display:'grid',gridTemplateColumns:'1fr 1.5fr 1.5fr 1fr 1fr 1fr 1fr 1fr',padding:'11px 20px',borderBottom:i<belowCostItems.length-1?'1px solid #ffffff':'none',alignItems:'center',background:'#ef444408'}}>
              <div style={{color:'#F5C800',fontSize:11,fontWeight:700}}>{item.invoiceNo}</div>
              <div style={{display:'flex',gap:6,alignItems:'center'}}><span style={{fontSize:16}}>{item.img}</span><span style={{color:'#1e293b',fontSize:11}}>{item.name}</span></div>
              <div style={{color:'#64748b',fontSize:11}}>{item.customer}</div>
              <div style={{color:'#1e293b',fontSize:12}}>{item.qty}</div>
              <div style={{color:'#10b981',fontSize:12}}>{fmt(item.buyPrice)}</div>
              <div style={{color:'#ef4444',fontSize:12}}>{fmt(item.sellPrice)}</div>
              <div style={{color:'#ef4444',fontSize:12,fontWeight:700}}>- {fmt(Math.abs(item.diff))}</div>
              <div style={{color:'#ef4444',fontSize:13,fontWeight:800}}>- {fmt(Math.abs(item.loss))}</div>
            </div>
          ))}
          <div style={{display:'grid',gridTemplateColumns:'1fr 1.5fr 1.5fr 1fr 1fr 1fr 1fr 1fr',padding:'14px 20px',background:'#ffffff',borderTop:'2px solid #ef444433'}}>
            <div style={{color:'#1e293b',fontSize:13,fontWeight:800,gridColumn:'1/8'}}>الإجمالي ({belowCostItems.length} حالة)</div>
            <div style={{color:'#ef4444',fontSize:14,fontWeight:900}}>- {fmt(Math.abs(totalLoss))}</div>
          </div>
        </div>
      }
    </div>
  );
}
