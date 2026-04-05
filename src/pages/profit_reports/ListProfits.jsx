import { useState, useEffect } from 'react';
import { collection, onSnapshot } from 'firebase/firestore';
import { db } from '../../firebase';

const fmt = n=>(n||0).toLocaleString('ar-IQ')+' د.ع';
const toN=v=>{const x=+v;return Number.isFinite(x)?x:0};
export default function ListProfits() {
  const [sales,    setSales]    = useState([]);
  const [products, setProducts] = useState([]);
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo,   setDateTo]   = useState('');
  const [search,   setSearch]   = useState('');
  useEffect(()=>{
    const us=[onSnapshot(collection(db,'pos_sales'),s=>setSales(s.docs.map(d=>({...d.data(),id:d.id})))),onSnapshot(collection(db,'pos_products'),s=>setProducts(s.docs.map(d=>({...d.data(),id:d.id}))))];
    return()=>us.forEach(u=>u());
  },[]);
  const inRange=d=>{ if(!d)return true; if(dateFrom&&d<dateFrom)return false; if(dateTo&&d>dateTo)return false; return true; };
  const data=sales.filter(s=>inRange(s.dateISO||s.date)).filter(s=>!search||s.invoiceNo?.includes(search)||s.customer?.includes(search)).map(inv=>{
    const cogs=inv.cogs!=null?toN(inv.cogs):(inv.items||[]).reduce((s,it)=>{const qtyUnits=toN(it?.qtyUnits)||(it?.isPackage?toN(it?.qty)*toN(it?.packageQty||1):toN(it?.qty));const savedCost=toN(it?.buyPrice??it?.costPrice);const productCost=toN(products.find(p=>p.id===it?.id)?.buyPrice);return s+(savedCost||productCost)*qtyUnits;},0);
    const profit=inv.grossProfit ?? ((inv.total||0)-cogs);
    return{...inv,cogs,profit,margin:(inv.total||0)>0?((profit/(inv.total||0))*100).toFixed(1):0};
  }).sort((a,b)=>b.profit-a.profit);
  const totRev=data.reduce((s,i)=>s+(i.total||0),0);
  const totCOGS=data.reduce((s,i)=>s+i.cogs,0);
  const totProfit=data.reduce((s,i)=>s+i.profit,0);
  return(
    <div style={{padding:24,fontFamily:"'Cairo'",direction:'rtl'}}>
      <div style={{color:'#fff',fontSize:22,fontWeight:800,marginBottom:20}}>🧾 أرباح القوائم (الفواتير)</div>
      <div style={{display:'flex',gap:14,marginBottom:20,background:'#ffffff',borderRadius:14,padding:16,border:'1px solid #d9e2f2',alignItems:'center',flexWrap:'wrap'}}>
        <span style={{color:'#64748b',fontSize:13}}>الفترة:</span>
        <input type="date" value={dateFrom} onChange={e=>setDateFrom(e.target.value)} style={{color:'#0f172a',outline:'none'}}/>
        <span style={{color:'#64748b'}}>—</span>
        <input type="date" value={dateTo} onChange={e=>setDateTo(e.target.value)} style={{color:'#0f172a',outline:'none'}}/>
        <button onClick={()=>{setDateFrom('');setDateTo('');}} style={{background:'#d9e2f2',border:'none',borderRadius:10,padding:'8px 14px',color:'#64748b',cursor:'pointer',fontFamily:"'Cairo'"}}>إعادة</button>
        <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="🔍 بحث..." style={{color:'#0f172a',outline:'none',fontFamily:"'Cairo'",flex:1}}/>
      </div>
      <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:14,marginBottom:20}}>
        {[['💰','إجمالي الإيرادات',fmt(totRev),'#10b981'],['📦','تكلفة البضاعة',fmt(totCOGS),'#f59e0b'],['📈','إجمالي الربح',fmt(totProfit),totProfit>=0?'#10b981':'#ef4444']].map(([icon,label,val,color])=>(
          <div key={label} style={{background:'#ffffff',borderRadius:14,padding:16,border:'1px solid #d9e2f2',textAlign:'center'}}>
            <div style={{fontSize:24,marginBottom:6}}>{icon}</div><div style={{color:'#64748b',fontSize:11,marginBottom:4}}>{label}</div>
            <div style={{color,fontSize:18,fontWeight:800}}>{val}</div>
          </div>
        ))}
      </div>
      <div style={{background:'#ffffff',borderRadius:16,border:'1px solid #d9e2f2',overflow:'hidden'}}>
        <div style={{display:'grid',gridTemplateColumns:'1fr 1.5fr 1fr 1fr 1fr 1fr 1fr',padding:'12px 20px',background:'#f8fbff',borderBottom:'1px solid #e2e8f7'}}>
          {['رقم الفاتورة','الزبون','التاريخ','الإيراد','التكلفة','الربح','الهامش%'].map(h=><div key={h} style={{color:'#64748b',fontSize:11,fontWeight:700}}>{h}</div>)}
        </div>
        {data.length===0?<div style={{color:'#cdd8ec',textAlign:'center',padding:60}}>لا توجد بيانات</div>
          :data.map((inv,i)=>(
          <div key={inv.id} style={{display:'grid',gridTemplateColumns:'1fr 1.5fr 1fr 1fr 1fr 1fr 1fr',padding:'11px 20px',borderBottom:i<data.length-1?'1px solid #ffffff':'none',alignItems:'center',background:inv.profit<0?'#ef444408':'transparent'}}>
            <div style={{color:'#F5C800',fontSize:12,fontWeight:700}}>{inv.invoiceNo}</div>
            <div style={{color:'#1e293b',fontSize:12}}>{inv.customer}</div>
            <div style={{color:'#64748b',fontSize:11}}>{inv.dateISO||inv.date}</div>
            <div style={{color:'#10b981',fontSize:12}}>{fmt(inv.total)}</div>
            <div style={{color:'#f59e0b',fontSize:12}}>{fmt(inv.cogs)}</div>
            <div style={{color:inv.profit>=0?'#10b981':'#ef4444',fontSize:13,fontWeight:800}}>{fmt(inv.profit)}</div>
            <span style={{background:`${Number(inv.margin)>=20?'#10b981':Number(inv.margin)>=10?'#F5C800':'#ef4444'}22`,borderRadius:20,padding:'2px 8px',color:Number(inv.margin)>=20?'#10b981':Number(inv.margin)>=10?'#F5C800':'#ef4444',fontSize:11,fontWeight:700}}>
              {inv.margin}%
            </span>
          </div>
        ))}
        <div style={{display:'grid',gridTemplateColumns:'1fr 1.5fr 1fr 1fr 1fr 1fr 1fr',padding:'14px 20px',background:'#ffffff',borderTop:'2px solid #d9e2f2'}}>
          <div style={{color:'#1e293b',fontSize:13,fontWeight:800,gridColumn:'1/4'}}>الإجمالي ({data.length})</div>
          <div style={{color:'#10b981',fontSize:13,fontWeight:800}}>{fmt(totRev)}</div>
          <div style={{color:'#f59e0b',fontSize:13,fontWeight:800}}>{fmt(totCOGS)}</div>
          <div style={{color:'#10b981',fontSize:14,fontWeight:900}}>{fmt(totProfit)}</div>
          <div style={{color:'#F5C800',fontSize:12}}>{totRev>0?((totProfit/totRev)*100).toFixed(1):0}%</div>
        </div>
      </div>
    </div>
  );
}
