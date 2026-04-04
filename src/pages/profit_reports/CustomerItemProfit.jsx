import { useState, useEffect } from 'react';
import { collection, onSnapshot } from 'firebase/firestore';
import { db } from '../../firebase';

const fmt = n=>(n||0).toLocaleString('ar-IQ')+' د.ع';

// ── أرباح زبون بالنسبة للمواد ─────────────────
export default function CustomerItemProfit({ user }) {
  const [sales,    setSales]    = useState([]);
  const [products, setProducts] = useState([]);
  const [customers,setCustomers]= useState([]);
  const [selCust,  setSelCust]  = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo,   setDateTo]   = useState('');

  useEffect(()=>{
    const us=[
      onSnapshot(collection(db,'pos_sales'),    s=>setSales(s.docs.map(d=>({...d.data(),id:d.id})))),
      onSnapshot(collection(db,'pos_products'), s=>setProducts(s.docs.map(d=>({...d.data(),id:d.id})))),
      onSnapshot(collection(db,'pos_customers'),s=>setCustomers(s.docs.map(d=>({...d.data(),id:d.id})))),
    ];
    return()=>us.forEach(u=>u());
  },[]);

  const inRange=d=>{ if(!d)return true; if(dateFrom&&d<dateFrom)return false; if(dateTo&&d>dateTo)return false; return true; };
  const custSales=sales.filter(s=>inRange(s.dateISO||s.date)&&(!selCust||s.customer===selCust));

  const itemMap={};
  custSales.forEach(inv=>{
    (inv.items||[]).forEach(it=>{
      const p=products.find(p=>p.id===it.id);
      const cost=(p?.buyPrice||0)*it.qty;
      const rev=(it.price||0)*it.qty;
      if(!itemMap[it.name])itemMap[it.name]={name:it.name,qty:0,revenue:0,cost:0,profit:0};
      itemMap[it.name].qty+=it.qty;
      itemMap[it.name].revenue+=rev;
      itemMap[it.name].cost+=cost;
      itemMap[it.name].profit+=rev-cost;
    });
  });
  const data=Object.values(itemMap).sort((a,b)=>b.profit-a.profit);
  const totProfit=data.reduce((s,d)=>s+d.profit,0);
  const totRevenue=data.reduce((s,d)=>s+d.revenue,0);

  return(
    <div style={{padding:24,fontFamily:"'Cairo'",direction:'rtl'}}>
      <div style={{color:'#fff',fontSize:22,fontWeight:800,marginBottom:20}}>🔍 أرباح زبون بالنسبة للمواد</div>
      <div style={{display:'flex',gap:14,marginBottom:20,background:'#ffffff',borderRadius:14,padding:16,border:'1px solid #d9e2f2',alignItems:'center',flexWrap:'wrap'}}>
        <div style={{flex:1}}>
          <label style={{color:'#64748b',fontSize:12,display:'block',marginBottom:5}}>اختر الزبون</label>
          <select value={selCust} onChange={e=>setSelCust(e.target.value)} style={{width:'100%',color:'#0f172a',outline:'none'}}>
            <option value="">كل الزبائن</option>
            {[...new Set(sales.map(s=>s.customer))].filter(Boolean).map(c=><option key={c} value={c}>{c}</option>)}
          </select>
        </div>
        <input type="date" value={dateFrom} onChange={e=>setDateFrom(e.target.value)} style={{color:'#0f172a',outline:'none'}}/>
        <span style={{color:'#64748b'}}>—</span>
        <input type="date" value={dateTo} onChange={e=>setDateTo(e.target.value)} style={{color:'#0f172a',outline:'none'}}/>
        <button onClick={()=>{setDateFrom('');setDateTo('');setSelCust('');}} style={{background:'#d9e2f2',border:'none',borderRadius:10,padding:'8px 14px',color:'#64748b',cursor:'pointer',fontFamily:"'Cairo'"}}>إعادة</button>
      </div>
      <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:14,marginBottom:20}}>
        {[['📦','عدد الأصناف',data.length,'#a78bfa'],['💰','إجمالي الإيراد',fmt(totRevenue),'#10b981'],['📈','إجمالي الربح',fmt(totProfit),totProfit>=0?'#10b981':'#ef4444']].map(([icon,label,val,color])=>(
          <div key={label} style={{background:'#ffffff',borderRadius:14,padding:16,border:'1px solid #d9e2f2',textAlign:'center'}}>
            <div style={{fontSize:24,marginBottom:6}}>{icon}</div><div style={{color:'#64748b',fontSize:11,marginBottom:4}}>{label}</div><div style={{color,fontSize:18,fontWeight:800}}>{val}</div>
          </div>
        ))}
      </div>
      <div style={{background:'#ffffff',borderRadius:16,border:'1px solid #d9e2f2',overflow:'hidden'}}>
        <div style={{display:'grid',gridTemplateColumns:'auto 2fr 1fr 1fr 1fr 1fr 1fr',padding:'12px 20px',background:'#f8fbff',borderBottom:'1px solid #e2e8f7'}}>
          {['#','المادة','الكمية','الإيراد','التكلفة','الربح','الهامش%'].map(h=><div key={h} style={{color:'#64748b',fontSize:11,fontWeight:700}}>{h}</div>)}
        </div>
        {data.length===0?<div style={{color:'#cdd8ec',textAlign:'center',padding:60}}>لا توجد بيانات — اختر زبوناً</div>
          :data.map((item,i)=>{
          const m=item.revenue>0?(item.profit/item.revenue*100).toFixed(1):0;
          return(
            <div key={item.name} style={{display:'grid',gridTemplateColumns:'auto 2fr 1fr 1fr 1fr 1fr 1fr',padding:'11px 20px',borderBottom:i<data.length-1?'1px solid #ffffff':'none',alignItems:'center',background:item.profit<0?'#ef444408':'transparent'}}>
              <div style={{color:'#a78bfa',fontSize:12,fontWeight:800,marginLeft:12}}>#{i+1}</div>
              <div style={{color:'#1e293b',fontSize:13,fontWeight:600}}>{item.name}</div>
              <div style={{color:'#64748b',fontSize:12}}>{item.qty}</div>
              <div style={{color:'#10b981',fontSize:12}}>{fmt(item.revenue)}</div>
              <div style={{color:'#f59e0b',fontSize:12}}>{fmt(item.cost)}</div>
              <div style={{color:item.profit>=0?'#10b981':'#ef4444',fontSize:13,fontWeight:800}}>{fmt(item.profit)}</div>
              <span style={{background:`${Number(m)>=20?'#10b981':Number(m)>=10?'#F5C800':'#ef4444'}22`,borderRadius:20,padding:'2px 8px',color:Number(m)>=20?'#10b981':Number(m)>=10?'#F5C800':'#ef4444',fontSize:11,fontWeight:700}}>{m}%</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
