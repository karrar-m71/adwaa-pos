import { useState, useEffect } from 'react';
import { collection, onSnapshot } from 'firebase/firestore';
import { db } from '../../firebase';

const fmt = n=>(n||0).toLocaleString('ar-IQ')+' د.ع';
const toN=v=>{const x=+v;return Number.isFinite(x)?x:0};

export default function WarehouseProfits({ user }) {
  const [sales,      setSales]      = useState([]);
  const [products,   setProducts]   = useState([]);
  const [warehouses, setWarehouses] = useState([]);
  const [dateFrom,   setDateFrom]   = useState('');
  const [dateTo,     setDateTo]     = useState('');

  useEffect(()=>{
    const us=[
      onSnapshot(collection(db,'pos_sales'),     s=>setSales(s.docs.map(d=>({...d.data(),id:d.id})))),
      onSnapshot(collection(db,'pos_products'),  s=>setProducts(s.docs.map(d=>({...d.data(),id:d.id})))),
      onSnapshot(collection(db,'pos_warehouses'),s=>setWarehouses(s.docs.map(d=>({...d.data(),id:d.id})))),
    ];
    return()=>us.forEach(u=>u());
  },[]);

  const inRange=d=>{ if(!d)return true; if(dateFrom&&d<dateFrom)return false; if(dateTo&&d>dateTo)return false; return true; };
  const fSales=sales.filter(s=>inRange(s.dateISO||s.date));

  // تجميع حسب المخزن
  const whMap={};
  fSales.forEach(inv=>{
    const wh=inv.warehouse||'غير محدد';
    const cogs=inv.cogs!=null?toN(inv.cogs):(inv.items||[]).reduce((s,it)=>{const qtyUnits=toN(it?.qtyUnits)||(it?.isPackage?toN(it?.qty)*toN(it?.packageQty||1):toN(it?.qty));const savedCost=toN(it?.buyPrice??it?.costPrice);const productCost=toN(products.find(p=>p.id===it?.id)?.buyPrice);return s+(savedCost||productCost)*qtyUnits;},0);
    if(!whMap[wh])whMap[wh]={name:wh,revenue:0,cogs:0,profit:0,invoiceCount:0};
    whMap[wh].revenue+=(inv.total||0);
    whMap[wh].cogs+=cogs;
    whMap[wh].profit+=(inv.total||0)-cogs;
    whMap[wh].invoiceCount++;
  });

  const data=Object.values(whMap).sort((a,b)=>b.profit-a.profit);
  const totRevenue=data.reduce((s,w)=>s+w.revenue,0);
  const totProfit =data.reduce((s,w)=>s+w.profit,0);

  // المخازن بدون مبيعات
  const noSales=warehouses.filter(w=>!whMap[w.name]);

  return(
    <div style={{padding:24,fontFamily:"'Cairo'",direction:'rtl'}}>
      <div style={{color:'#fff',fontSize:22,fontWeight:800,marginBottom:20}}>🏪 أرباح المخازن</div>
      <div style={{display:'flex',gap:14,marginBottom:20,background:'#ffffff',borderRadius:14,padding:16,border:'1px solid #d9e2f2',alignItems:'center'}}>
        <span style={{color:'#64748b',fontSize:13}}>الفترة:</span>
        <input type="date" value={dateFrom} onChange={e=>setDateFrom(e.target.value)} style={{color:'#0f172a',outline:'none'}}/>
        <span style={{color:'#64748b'}}>—</span>
        <input type="date" value={dateTo} onChange={e=>setDateTo(e.target.value)} style={{color:'#0f172a',outline:'none'}}/>
        <button onClick={()=>{setDateFrom('');setDateTo('');}} style={{background:'#d9e2f2',border:'none',borderRadius:10,padding:'8px 14px',color:'#64748b',cursor:'pointer',fontFamily:"'Cairo'"}}>إعادة</button>
      </div>
      <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:14,marginBottom:24}}>
        {[['🏪','المخازن النشطة',data.length,'#3b82f6'],['💰','إجمالي الإيرادات',fmt(totRevenue),'#10b981'],['📈','إجمالي الأرباح',fmt(totProfit),totProfit>=0?'#10b981':'#ef4444']].map(([icon,label,val,color])=>(
          <div key={label} style={{background:'#ffffff',borderRadius:14,padding:16,border:'1px solid #d9e2f2',textAlign:'center'}}>
            <div style={{fontSize:24,marginBottom:6}}>{icon}</div><div style={{color:'#64748b',fontSize:11,marginBottom:4}}>{label}</div><div style={{color,fontSize:18,fontWeight:800}}>{val}</div>
          </div>
        ))}
      </div>
      <div style={{display:'grid',gridTemplateColumns:'repeat(2,1fr)',gap:16,marginBottom:20}}>
        {data.map(wh=>{
          const m=wh.revenue>0?(wh.profit/wh.revenue*100).toFixed(1):0;
          return(
            <div key={wh.name} style={{background:'#ffffff',borderRadius:16,padding:20,border:`1px solid ${wh.profit>=0?'#10b98133':'#ef444433'}`}}>
              <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:16}}>
                <div style={{display:'flex',gap:10,alignItems:'center'}}>
                  <div style={{width:44,height:44,borderRadius:12,background:'#3b82f622',display:'flex',alignItems:'center',justifyContent:'center',fontSize:24}}>🏪</div>
                  <div>
                    <div style={{color:'#fff',fontSize:15,fontWeight:800}}>{wh.name}</div>
                    <div style={{color:'#64748b',fontSize:11}}>{wh.invoiceCount} فاتورة</div>
                  </div>
                </div>
                <span style={{background:`${Number(m)>=20?'#10b981':Number(m)>=10?'#F5C800':'#ef4444'}22`,border:`1px solid ${Number(m)>=20?'#10b981':Number(m)>=10?'#F5C800':'#ef4444'}44`,borderRadius:20,padding:'4px 12px',color:Number(m)>=20?'#10b981':Number(m)>=10?'#F5C800':'#ef4444',fontSize:13,fontWeight:800}}>{m}%</span>
              </div>
              <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:10}}>
                {[['إيراد',fmt(wh.revenue),'#10b981'],['تكلفة',fmt(wh.cogs),'#f59e0b'],['ربح',fmt(wh.profit),wh.profit>=0?'#10b981':'#ef4444']].map(([l,v,c])=>(
                  <div key={l} style={{textAlign:'center',background:'#f8fbff',borderRadius:10,padding:10}}>
                    <div style={{color:'#64748b',fontSize:10,marginBottom:4}}>{l}</div>
                    <div style={{color:c,fontSize:13,fontWeight:800}}>{v}</div>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
      {noSales.length>0&&(
        <div style={{background:'#ffffff',borderRadius:14,padding:16,border:'1px solid #d9e2f2'}}>
          <div style={{color:'#64748b',fontSize:13,marginBottom:10}}>مخازن بدون مبيعات مسجّلة:</div>
          <div style={{display:'flex',gap:8,flexWrap:'wrap'}}>
            {noSales.map(w=><span key={w.id} style={{background:'#d9e2f2',borderRadius:20,padding:'4px 14px',color:'#64748b',fontSize:12}}>🏭 {w.name}</span>)}
          </div>
        </div>
      )}
    </div>
  );
}
