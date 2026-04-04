import { useState, useEffect } from 'react';
import { collection, onSnapshot } from 'firebase/firestore';
import { db } from '../../firebase';

const fmt = n=>(n||0).toLocaleString('ar-IQ')+' د.ع';

export default function ItemCustomerProfit({ user }) {
  const [sales,    setSales]    = useState([]);
  const [products, setProducts] = useState([]);
  const [selItem,  setSelItem]  = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo,   setDateTo]   = useState('');

  useEffect(()=>{
    const us=[onSnapshot(collection(db,'pos_sales'),s=>setSales(s.docs.map(d=>({...d.data(),id:d.id})))),onSnapshot(collection(db,'pos_products'),s=>setProducts(s.docs.map(d=>({...d.data(),id:d.id}))))];
    return()=>us.forEach(u=>u());
  },[]);

  // كل المواد المباعة
  const allItems=[...new Set(sales.flatMap(s=>(s.items||[]).map(it=>it.name)).filter(Boolean))].sort();
  const inRange=d=>{ if(!d)return true; if(dateFrom&&d<dateFrom)return false; if(dateTo&&d>dateTo)return false; return true; };
  const fSales=sales.filter(s=>inRange(s.dateISO||s.date));

  const custMap={};
  fSales.forEach(inv=>{
    (inv.items||[]).filter(it=>!selItem||it.name===selItem).forEach(it=>{
      const p=products.find(p=>p.id===it.id);
      const cost=(p?.buyPrice||0)*it.qty;
      const rev=(it.price||0)*it.qty;
      const cust=inv.customer||'زبون عام';
      if(!custMap[cust])custMap[cust]={name:cust,qty:0,revenue:0,cost:0,profit:0};
      custMap[cust].qty+=it.qty;custMap[cust].revenue+=rev;custMap[cust].cost+=cost;custMap[cust].profit+=rev-cost;
    });
  });
  const data=Object.values(custMap).sort((a,b)=>b.profit-a.profit);

  return(
    <div style={{padding:24,fontFamily:"'Cairo'",direction:'rtl'}}>
      <div style={{color:'#fff',fontSize:22,fontWeight:800,marginBottom:20}}>🔍 أرباح مادة بالنسبة للزبائن</div>
      <div style={{display:'flex',gap:14,marginBottom:20,background:'#ffffff',borderRadius:14,padding:16,border:'1px solid #d9e2f2',alignItems:'center',flexWrap:'wrap'}}>
        <div style={{flex:1}}>
          <label style={{color:'#64748b',fontSize:12,display:'block',marginBottom:5}}>اختر المادة</label>
          <select value={selItem} onChange={e=>setSelItem(e.target.value)} style={{width:'100%',color:'#0f172a',outline:'none'}}>
            <option value="">كل المواد</option>
            {allItems.map(i=><option key={i} value={i}>{i}</option>)}
          </select>
        </div>
        <input type="date" value={dateFrom} onChange={e=>setDateFrom(e.target.value)} style={{color:'#0f172a',outline:'none'}}/>
        <span style={{color:'#64748b'}}>—</span>
        <input type="date" value={dateTo} onChange={e=>setDateTo(e.target.value)} style={{color:'#0f172a',outline:'none'}}/>
        <button onClick={()=>{setDateFrom('');setDateTo('');setSelItem('');}} style={{background:'#d9e2f2',border:'none',borderRadius:10,padding:'8px 14px',color:'#64748b',cursor:'pointer',fontFamily:"'Cairo'"}}>إعادة</button>
      </div>
      <div style={{background:'#ffffff',borderRadius:16,border:'1px solid #d9e2f2',overflow:'hidden'}}>
        <div style={{display:'grid',gridTemplateColumns:'auto 2fr 1fr 1fr 1fr 1fr 1fr',padding:'12px 20px',background:'#f8fbff',borderBottom:'1px solid #e2e8f7'}}>
          {['#','الزبون','الكمية','الإيراد','التكلفة','الربح','الهامش%'].map(h=><div key={h} style={{color:'#64748b',fontSize:11,fontWeight:700}}>{h}</div>)}
        </div>
        {data.length===0?<div style={{color:'#cdd8ec',textAlign:'center',padding:60}}>لا توجد بيانات</div>
          :data.map((c,i)=>{
          const m=c.revenue>0?(c.profit/c.revenue*100).toFixed(1):0;
          return(
            <div key={c.name} style={{display:'grid',gridTemplateColumns:'auto 2fr 1fr 1fr 1fr 1fr 1fr',padding:'11px 20px',borderBottom:i<data.length-1?'1px solid #ffffff':'none',alignItems:'center'}}>
              <div style={{color:'#F5C800',fontSize:12,fontWeight:800,marginLeft:12}}>#{i+1}</div>
              <div style={{color:'#1e293b',fontSize:13,fontWeight:600}}>{c.name}</div>
              <div style={{color:'#64748b',fontSize:12}}>{c.qty}</div>
              <div style={{color:'#10b981',fontSize:12}}>{fmt(c.revenue)}</div>
              <div style={{color:'#f59e0b',fontSize:12}}>{fmt(c.cost)}</div>
              <div style={{color:c.profit>=0?'#10b981':'#ef4444',fontSize:13,fontWeight:800}}>{fmt(c.profit)}</div>
              <span style={{background:`${Number(m)>=20?'#10b981':Number(m)>=10?'#F5C800':'#ef4444'}22`,borderRadius:20,padding:'2px 8px',color:Number(m)>=20?'#10b981':Number(m)>=10?'#F5C800':'#ef4444',fontSize:11,fontWeight:700}}>{m}%</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
