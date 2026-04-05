import { useState, useEffect } from 'react';
import { collection, onSnapshot } from 'firebase/firestore';
import { db } from '../../firebase';

const fmt = n=>(n||0).toLocaleString('ar-IQ')+' د.ع';
const n=v=>{const x=+v;return Number.isFinite(x)?x:0};
export default function LossSales({ user }) {
  const [sales,    setSales]    = useState([]);
  const [products, setProducts] = useState([]);
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo,   setDateTo]   = useState('');
  useEffect(()=>{
    const us=[onSnapshot(collection(db,'pos_sales'),s=>setSales(s.docs.map(d=>({...d.data(),id:d.id})))),onSnapshot(collection(db,'pos_products'),s=>setProducts(s.docs.map(d=>({...d.data(),id:d.id}))))];
    return()=>us.forEach(u=>u());
  },[]);
  const inRange=d=>{ if(!d)return true; if(dateFrom&&d<dateFrom)return false; if(dateTo&&d>dateTo)return false; return true; };
  const lossSales=sales.filter(s=>inRange(s.dateISO||s.date)).map(inv=>{
    const cogs=n(inv.cogs)!=null&&inv.cogs!=null?n(inv.cogs):(inv.items||[]).reduce((s,it)=>{const qtyUnits=n(it?.qtyUnits)||(it?.isPackage?n(it?.qty)*n(it?.packageQty||1):n(it?.qty));const savedCost=n(it?.buyPrice??it?.costPrice);const productCost=n(products.find(p=>p.id===it?.id)?.buyPrice);return s+(savedCost||productCost)*qtyUnits;},0);
    const profit=(inv.total||0)-cogs;
    return{...inv,cogs,profit,margin:(inv.total||0)>0?(profit/(inv.total||0)*100).toFixed(1):0};
  }).filter(inv=>inv.profit<0).sort((a,b)=>a.profit-b.profit);
  const totalLoss=lossSales.reduce((s,i)=>s+i.profit,0);
  return(
    <div style={{padding:24,fontFamily:"'Cairo'",direction:'rtl'}}>
      <div style={{color:'#fff',fontSize:22,fontWeight:800,marginBottom:20}}>📉 المبيعات الخاسرة</div>
      <div style={{display:'flex',gap:14,marginBottom:20,background:'#ffffff',borderRadius:14,padding:16,border:'1px solid #d9e2f2',alignItems:'center'}}>
        <span style={{color:'#64748b',fontSize:13}}>الفترة:</span>
        <input type="date" value={dateFrom} onChange={e=>setDateFrom(e.target.value)} style={{color:'#0f172a',outline:'none'}}/>
        <span style={{color:'#64748b'}}>—</span>
        <input type="date" value={dateTo} onChange={e=>setDateTo(e.target.value)} style={{color:'#0f172a',outline:'none'}}/>
        <button onClick={()=>{setDateFrom('');setDateTo('');}} style={{background:'#d9e2f2',border:'none',borderRadius:10,padding:'8px 14px',color:'#64748b',cursor:'pointer',fontFamily:"'Cairo'"}}>إعادة</button>
      </div>
      <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:14,marginBottom:20}}>
        {[['📉','عدد الفواتير الخاسرة',lossSales.length,'#ef4444'],['💸','إجمالي الخسارة',fmt(Math.abs(totalLoss)),'#ef4444'],['📊','متوسط الخسارة',lossSales.length>0?fmt(Math.abs(totalLoss/lossSales.length)):'—','#f59e0b']].map(([icon,label,val,color])=>(
          <div key={label} style={{background:'#ffffff',borderRadius:14,padding:16,border:'1px solid #ef444433',textAlign:'center'}}>
            <div style={{fontSize:24,marginBottom:6}}>{icon}</div><div style={{color:'#64748b',fontSize:11,marginBottom:4}}>{label}</div>
            <div style={{color,fontSize:18,fontWeight:800}}>{val}</div>
          </div>
        ))}
      </div>
      {lossSales.length===0
        ?<div style={{background:'#10b98111',border:'1px solid #10b98133',borderRadius:16,padding:60,textAlign:'center'}}>
          <div style={{fontSize:48,marginBottom:12}}>✅</div>
          <div style={{color:'#10b981',fontSize:16,fontWeight:700}}>لا توجد مبيعات خاسرة في هذه الفترة!</div>
        </div>
        :<div style={{background:'#ffffff',borderRadius:16,border:'1px solid #ef444433',overflow:'hidden'}}>
          <div style={{display:'grid',gridTemplateColumns:'1fr 1.5fr 1fr 1fr 1fr 1fr',padding:'12px 20px',background:'#f8fbff',borderBottom:'1px solid #e2e8f7'}}>
            {['الفاتورة','الزبون','الإيراد','التكلفة','الخسارة','الهامش%'].map(h=><div key={h} style={{color:'#64748b',fontSize:11,fontWeight:700}}>{h}</div>)}
          </div>
          {lossSales.map((inv,i)=>(
            <div key={inv.id} style={{display:'grid',gridTemplateColumns:'1fr 1.5fr 1fr 1fr 1fr 1fr',padding:'11px 20px',borderBottom:i<lossSales.length-1?'1px solid #ffffff':'none',alignItems:'center',background:'#ef444408'}}>
              <div style={{color:'#F5C800',fontSize:12,fontWeight:700}}>{inv.invoiceNo}</div>
              <div style={{color:'#1e293b',fontSize:12}}>{inv.customer}</div>
              <div style={{color:'#64748b',fontSize:12}}>{fmt(inv.total)}</div>
              <div style={{color:'#f59e0b',fontSize:12}}>{fmt(inv.cogs)}</div>
              <div style={{color:'#ef4444',fontSize:13,fontWeight:800}}>{fmt(inv.profit)}</div>
              <span style={{background:'#ef444422',borderRadius:20,padding:'2px 8px',color:'#ef4444',fontSize:11,fontWeight:700}}>{inv.margin}%</span>
            </div>
          ))}
        </div>
      }
    </div>
  );
}
