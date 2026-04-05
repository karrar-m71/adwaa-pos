import { useState, useEffect } from 'react';
import { collection, onSnapshot } from 'firebase/firestore';
import { db } from '../../firebase';

const fmt = n=>(n||0).toLocaleString('ar-IQ')+' د.ع';
const toN=v=>{const x=+v;return Number.isFinite(x)?x:0};

export default function CustomerProfits({ user }) {
  const [sales,    setSales]    = useState([]);
  const [products, setProducts] = useState([]);
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo,   setDateTo]   = useState('');
  const [search,   setSearch]   = useState('');
  const [sortBy,   setSortBy]   = useState('profit');

  useEffect(()=>{
    const us=[onSnapshot(collection(db,'pos_sales'),s=>setSales(s.docs.map(d=>({...d.data(),id:d.id})))),onSnapshot(collection(db,'pos_products'),s=>setProducts(s.docs.map(d=>({...d.data(),id:d.id}))))];
    return()=>us.forEach(u=>u());
  },[]);

  const inRange=d=>{ if(!d)return true; if(dateFrom&&d<dateFrom)return false; if(dateTo&&d>dateTo)return false; return true; };
  const fSales=sales.filter(s=>inRange(s.dateISO||s.date));

  // تجميع حسب الزبون
  const custMap={};
  fSales.forEach(inv=>{
    const cust=inv.customer||'زبون عام';
    const cogs=inv.cogs!=null?toN(inv.cogs):(inv.items||[]).reduce((s,it)=>{const qtyUnits=toN(it?.qtyUnits)||(it?.isPackage?toN(it?.qty)*toN(it?.packageQty||1):toN(it?.qty));const savedCost=toN(it?.buyPrice??it?.costPrice);const productCost=toN(products.find(p=>p.id===it?.id)?.buyPrice);return s+(savedCost||productCost)*qtyUnits;},0);
    if(!custMap[cust])custMap[cust]={name:cust,revenue:0,cogs:0,profit:0,invoiceCount:0};
    custMap[cust].revenue+=(inv.total||0);
    custMap[cust].cogs+=cogs;
    custMap[cust].profit+=(inv.total||0)-cogs;
    custMap[cust].invoiceCount++;
  });

  const data=Object.values(custMap)
    .filter(c=>!search||c.name.includes(search))
    .sort((a,b)=>sortBy==='profit'?b.profit-a.profit:sortBy==='revenue'?b.revenue-a.revenue:b.invoiceCount-a.invoiceCount);

  const totRevenue=data.reduce((s,c)=>s+c.revenue,0);
  const totProfit =data.reduce((s,c)=>s+c.profit,0);

  return(
    <div style={{padding:24,fontFamily:"'Cairo'",direction:'rtl'}}>
      <div style={{color:'#fff',fontSize:22,fontWeight:800,marginBottom:20}}>👥 أرباح الزبائن</div>
      <div style={{display:'flex',gap:14,marginBottom:20,background:'#ffffff',borderRadius:14,padding:16,border:'1px solid #d9e2f2',alignItems:'center',flexWrap:'wrap'}}>
        <span style={{color:'#64748b',fontSize:13}}>الفترة:</span>
        <input type="date" value={dateFrom} onChange={e=>setDateFrom(e.target.value)} style={{color:'#0f172a',outline:'none'}}/>
        <span style={{color:'#64748b'}}>—</span>
        <input type="date" value={dateTo} onChange={e=>setDateTo(e.target.value)} style={{color:'#0f172a',outline:'none'}}/>
        <button onClick={()=>{setDateFrom('');setDateTo('');}} style={{background:'#d9e2f2',border:'none',borderRadius:10,padding:'8px 14px',color:'#64748b',cursor:'pointer',fontFamily:"'Cairo'"}}>إعادة</button>
        <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="🔍 ابحث بالزبون..." style={{color:'#0f172a',outline:'none',fontFamily:"'Cairo'",flex:1}}/>
      </div>
      <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:14,marginBottom:20}}>
        {[['👥','عدد الزبائن',data.length,'#3b82f6'],['💰','إجمالي الإيرادات',fmt(totRevenue),'#10b981'],['📈','إجمالي الربح',fmt(totProfit),totProfit>=0?'#10b981':'#ef4444']].map(([icon,label,val,color])=>(
          <div key={label} style={{background:'#ffffff',borderRadius:14,padding:16,border:'1px solid #d9e2f2',textAlign:'center'}}>
            <div style={{fontSize:24,marginBottom:6}}>{icon}</div><div style={{color:'#64748b',fontSize:11,marginBottom:4}}>{label}</div><div style={{color,fontSize:18,fontWeight:800}}>{val}</div>
          </div>
        ))}
      </div>
      <div style={{display:'flex',gap:10,marginBottom:14,justifyContent:'flex-end'}}>
        {[['profit','الأعلى ربحاً'],['revenue','الأعلى إيراداً'],['invoiceCount','الأكثر شراءً']].map(([v,l])=>(
          <button key={v} onClick={()=>setSortBy(v)} style={{background:sortBy===v?'#3b82f6':'#ffffff',color:sortBy===v?'#fff':'#64748b',border:`1px solid ${sortBy===v?'#3b82f6':'#cdd8ec'}`,borderRadius:20,padding:'7px 14px',fontSize:12,cursor:'pointer',fontWeight:sortBy===v?700:400}}>{l}</button>
        ))}
      </div>
      <div style={{background:'#ffffff',borderRadius:16,border:'1px solid #d9e2f2',overflow:'hidden'}}>
        <div style={{display:'grid',gridTemplateColumns:'auto 2fr 1fr 1fr 1fr 1fr 1fr',padding:'12px 20px',background:'#f8fbff',borderBottom:'1px solid #e2e8f7'}}>
          {['#','الزبون','الفواتير','الإيراد','التكلفة','الربح','الهامش%'].map(h=><div key={h} style={{color:'#64748b',fontSize:11,fontWeight:700}}>{h}</div>)}
        </div>
        {data.length===0?<div style={{color:'#cdd8ec',textAlign:'center',padding:60}}>لا توجد بيانات</div>
          :data.map((c,i)=>{
          const margin=c.revenue>0?(c.profit/c.revenue*100).toFixed(1):0;
          return(
            <div key={c.name} style={{display:'grid',gridTemplateColumns:'auto 2fr 1fr 1fr 1fr 1fr 1fr',padding:'12px 20px',borderBottom:i<data.length-1?'1px solid #ffffff':'none',alignItems:'center',background:c.profit<0?'#ef444408':'transparent'}}>
              <div style={{color:'#F5C800',fontSize:13,fontWeight:800,marginLeft:12}}>#{i+1}</div>
              <div style={{display:'flex',gap:8,alignItems:'center'}}>
                <div style={{width:30,height:30,borderRadius:8,background:'#3b82f622',display:'flex',alignItems:'center',justifyContent:'center',fontSize:14}}>👤</div>
                <div style={{color:'#1e293b',fontSize:13,fontWeight:600}}>{c.name}</div>
              </div>
              <div style={{color:'#64748b',fontSize:12}}>{c.invoiceCount} فاتورة</div>
              <div style={{color:'#10b981',fontSize:12}}>{fmt(c.revenue)}</div>
              <div style={{color:'#f59e0b',fontSize:12}}>{fmt(c.cogs)}</div>
              <div style={{color:c.profit>=0?'#10b981':'#ef4444',fontSize:13,fontWeight:800}}>{fmt(c.profit)}</div>
              <span style={{background:`${Number(margin)>=20?'#10b981':Number(margin)>=10?'#F5C800':'#ef4444'}22`,borderRadius:20,padding:'2px 8px',color:Number(margin)>=20?'#10b981':Number(margin)>=10?'#F5C800':'#ef4444',fontSize:11,fontWeight:700}}>{margin}%</span>
            </div>
          );
        })}
        <div style={{display:'grid',gridTemplateColumns:'auto 2fr 1fr 1fr 1fr 1fr 1fr',padding:'14px 20px',background:'#ffffff',borderTop:'2px solid #d9e2f2'}}>
          <div/><div style={{color:'#1e293b',fontSize:13,fontWeight:800}}>الإجمالي ({data.length})</div>
          <div style={{color:'#64748b',fontSize:12}}>{fSales.length} فاتورة</div>
          <div style={{color:'#10b981',fontSize:13,fontWeight:800}}>{fmt(totRevenue)}</div>
          <div/><div style={{color:'#10b981',fontSize:14,fontWeight:900}}>{fmt(totProfit)}</div>
          <div style={{color:'#F5C800',fontSize:12}}>{totRevenue>0?((totProfit/totRevenue)*100).toFixed(1):0}%</div>
        </div>
      </div>
    </div>
  );
}
