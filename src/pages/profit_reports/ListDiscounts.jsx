import { useState, useEffect } from 'react';
import { collection, onSnapshot } from 'firebase/firestore';
import { db } from '../../firebase';

const fmt = n=>(n||0).toLocaleString('ar-IQ')+' د.ع';

export default function ListDiscounts({ user }) {
  const [sales,    setSales]    = useState([]);
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo,   setDateTo]   = useState('');
  const [search,   setSearch]   = useState('');

  useEffect(()=>{
    const u=onSnapshot(collection(db,'pos_sales'),s=>setSales(s.docs.map(d=>({...d.data(),id:d.id}))));
    return()=>u();
  },[]);

  const inRange=d=>{ if(!d)return true; if(dateFrom&&d<dateFrom)return false; if(dateTo&&d>dateTo)return false; return true; };

  const withDiscount = sales
    .filter(s=>inRange(s.dateISO||s.date))
    .filter(s=>(s.totalDiscount||s.discountAmount||0)>0||((s.discount||0)>0))
    .filter(s=>!search||s.invoiceNo?.includes(search)||s.customer?.includes(search))
    .sort((a,b)=>(b.totalDiscount||b.discountAmount||0)-(a.totalDiscount||a.discountAmount||0));

  const totalDiscount  = withDiscount.reduce((s,i)=>s+(i.totalDiscount||i.discountAmount||0),0);
  const totalSubtotal  = withDiscount.reduce((s,i)=>s+(i.subtotal||0),0);
  const totalAfterDisc = withDiscount.reduce((s,i)=>s+(i.total||0),0);
  const avgDiscPct     = withDiscount.length>0?(totalDiscount/totalSubtotal*100).toFixed(1):0;

  // خصم بالمادة
  const itemDiscounts = {};
  sales.filter(s=>inRange(s.dateISO||s.date)).forEach(inv=>{
    (inv.items||[]).forEach(it=>{
      if((it.discount||0)>0){
        if(!itemDiscounts[it.name])itemDiscounts[it.name]={name:it.name,totalDisc:0,count:0};
        itemDiscounts[it.name].totalDisc+=(it.price*(it.discount/100)*it.qty)||0;
        itemDiscounts[it.name].count++;
      }
    });
  });
  const itemDiscData=Object.values(itemDiscounts).sort((a,b)=>b.totalDisc-a.totalDisc).slice(0,10);

  return(
    <div style={{padding:24,fontFamily:"'Cairo'",direction:'rtl'}}>
      <div style={{color:'#fff',fontSize:22,fontWeight:800,marginBottom:20}}>🏷️ خصومات القوائم</div>

      <div style={{display:'flex',gap:14,marginBottom:20,background:'#ffffff',borderRadius:14,padding:16,border:'1px solid #d9e2f2',alignItems:'center',flexWrap:'wrap'}}>
        <span style={{color:'#64748b',fontSize:13}}>الفترة:</span>
        <input type="date" value={dateFrom} onChange={e=>setDateFrom(e.target.value)}
          style={{color:'#0f172a',outline:'none'}}/>
        <span style={{color:'#64748b'}}>—</span>
        <input type="date" value={dateTo} onChange={e=>setDateTo(e.target.value)}
          style={{color:'#0f172a',outline:'none'}}/>
        <button onClick={()=>{setDateFrom('');setDateTo('');}}
          style={{background:'#d9e2f2',border:'none',borderRadius:10,padding:'8px 14px',color:'#64748b',cursor:'pointer',fontFamily:"'Cairo'"}}>إعادة</button>
        <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="🔍 بحث..."
          style={{color:'#0f172a',outline:'none',fontFamily:"'Cairo'",flex:1}}/>
      </div>

      <div style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:14,marginBottom:20}}>
        {[['🏷️','فواتير بخصم',withDiscount.length,'#a78bfa'],['💸','إجمالي الخصومات',fmt(totalDiscount),'#ef4444'],['💰','الإيراد بعد الخصم',fmt(totalAfterDisc),'#10b981'],['📊','متوسط الخصم',`${avgDiscPct}%`,'#f59e0b']].map(([icon,label,val,color])=>(
          <div key={label} style={{background:'#ffffff',borderRadius:14,padding:16,border:'1px solid #d9e2f2',textAlign:'center'}}>
            <div style={{fontSize:24,marginBottom:6}}>{icon}</div>
            <div style={{color:'#64748b',fontSize:11,marginBottom:4}}>{label}</div>
            <div style={{color,fontSize:16,fontWeight:800}}>{val}</div>
          </div>
        ))}
      </div>

      <div style={{display:'grid',gridTemplateColumns:'2fr 1fr',gap:20,marginBottom:20}}>
        {/* الفواتير ذات الخصم */}
        <div style={{background:'#ffffff',borderRadius:16,border:'1px solid #d9e2f2',overflow:'hidden'}}>
          <div style={{padding:'14px 20px',borderBottom:'1px solid #d9e2f2',color:'#fff',fontSize:14,fontWeight:700}}>
            الفواتير ذات الخصم ({withDiscount.length})
          </div>
          <div style={{display:'grid',gridTemplateColumns:'1fr 1.2fr 1fr 1fr 1fr 1fr',padding:'10px 20px',background:'#f8fbff',borderBottom:'1px solid #e2e8f7'}}>
            {['الفاتورة','الزبون','قبل الخصم','الخصم','نسبة%','بعد الخصم'].map(h=><div key={h} style={{color:'#64748b',fontSize:10,fontWeight:700}}>{h}</div>)}
          </div>
          {withDiscount.length===0
            ?<div style={{color:'#cdd8ec',textAlign:'center',padding:40}}>لا توجد فواتير بخصم</div>
            :withDiscount.map((inv,i)=>{
              const discAmt=inv.totalDiscount||inv.discountAmount||0;
              const pct=inv.subtotal>0?(discAmt/inv.subtotal*100).toFixed(1):0;
              return(
                <div key={inv.id} style={{display:'grid',gridTemplateColumns:'1fr 1.2fr 1fr 1fr 1fr 1fr',padding:'10px 20px',borderBottom:i<withDiscount.length-1?'1px solid #ffffff':'none',alignItems:'center'}}>
                  <div style={{color:'#F5C800',fontSize:11,fontWeight:700}}>{inv.invoiceNo}</div>
                  <div style={{color:'#1e293b',fontSize:11}}>{inv.customer}</div>
                  <div style={{color:'#64748b',fontSize:11}}>{fmt(inv.subtotal)}</div>
                  <div style={{color:'#ef4444',fontSize:12,fontWeight:700}}>- {fmt(discAmt)}</div>
                  <span style={{background:'#ef444422',borderRadius:20,padding:'2px 6px',color:'#ef4444',fontSize:10,fontWeight:700}}>{pct}%</span>
                  <div style={{color:'#10b981',fontSize:12,fontWeight:700}}>{fmt(inv.total)}</div>
                </div>
              );
            })
          }
          {withDiscount.length>0&&(
            <div style={{display:'grid',gridTemplateColumns:'1fr 1.2fr 1fr 1fr 1fr 1fr',padding:'12px 20px',background:'#ffffff',borderTop:'2px solid #d9e2f2'}}>
              <div style={{color:'#1e293b',fontSize:12,fontWeight:800,gridColumn:'1/3'}}>الإجمالي</div>
              <div style={{color:'#64748b',fontSize:12}}>{fmt(totalSubtotal)}</div>
              <div style={{color:'#ef4444',fontSize:13,fontWeight:800}}>- {fmt(totalDiscount)}</div>
              <div style={{color:'#ef4444',fontSize:12}}>{avgDiscPct}%</div>
              <div style={{color:'#10b981',fontSize:13,fontWeight:800}}>{fmt(totalAfterDisc)}</div>
            </div>
          )}
        </div>

        {/* أكثر المواد خصماً */}
        <div style={{background:'#ffffff',borderRadius:16,padding:20,border:'1px solid #d9e2f2'}}>
          <div style={{color:'#fff',fontSize:14,fontWeight:700,marginBottom:14}}>📦 أكثر المواد خصماً</div>
          {itemDiscData.length===0
            ?<div style={{color:'#cdd8ec',textAlign:'center',padding:40}}>لا توجد خصومات على المواد</div>
            :itemDiscData.map((item,i)=>(
              <div key={i} style={{display:'flex',justifyContent:'space-between',padding:'8px 0',borderBottom:'1px solid #ffffff'}}>
                <div style={{display:'flex',gap:8,alignItems:'center'}}>
                  <span style={{color:'#a78bfa',fontSize:11,fontWeight:800}}>#{i+1}</span>
                  <span style={{color:'#1e293b',fontSize:12}}>{item.name}</span>
                </div>
                <div style={{textAlign:'left'}}>
                  <div style={{color:'#ef4444',fontSize:12,fontWeight:700}}>{fmt(item.totalDisc)}</div>
                  <div style={{color:'#64748b',fontSize:10}}>{item.count} مرة</div>
                </div>
              </div>
            ))
          }
        </div>
      </div>
    </div>
  );
}
