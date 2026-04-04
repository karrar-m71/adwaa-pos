import { useState, useEffect } from 'react';
import { collection, onSnapshot } from 'firebase/firestore';
import { db } from '../../firebase';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

const fmt = n=>(n||0).toLocaleString('ar-IQ')+' د.ع';

export default function ProfitReport() {
  const [sales,    setSales]    = useState([]);
  const [products, setProducts] = useState([]);
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo,   setDateTo]   = useState('');
  const [search,   setSearch]   = useState('');
  const [sortBy,   setSortBy]   = useState('profit');

  useEffect(()=>{
    const us=[
      onSnapshot(collection(db,'pos_sales'),    s=>setSales(s.docs.map(d=>({...d.data(),id:d.id})))),
      onSnapshot(collection(db,'pos_products'), s=>setProducts(s.docs.map(d=>({...d.data(),id:d.id})))),
    ];
    return()=>us.forEach(u=>u());
  },[]);

  const inRange=d=>{ if(!d)return true; if(dateFrom&&d<dateFrom)return false; if(dateTo&&d>dateTo)return false; return true; };
  const fSales=sales.filter(s=>inRange(s.dateISO||s.date));

  // حساب ربح كل فاتورة
  const invoiceData = fSales.map(inv=>{
    const cogs=inv.cogs ?? (inv.items||[]).reduce((s,it)=>{const p=products.find(p=>p.id===it.id);return s+(p?.buyPrice||0)*it.qty;},0);
    const profit=inv.grossProfit ?? ((inv.total||0)-cogs);
    const margin=(inv.total||0)>0?(profit/(inv.total||0)*100).toFixed(1):0;
    return{...inv,cogs,profit,margin:Number(margin)};
  }).filter(inv=>!search||inv.invoiceNo?.includes(search)||inv.customer?.includes(search));

  const sorted=[...invoiceData].sort((a,b)=>sortBy==='profit'?b.profit-a.profit:sortBy==='margin'?b.margin-a.margin:new Date(b.createdAt)-new Date(a.createdAt));

  const totalRevenue=invoiceData.reduce((s,i)=>s+(i.total||0),0);
  const totalCOGS   =invoiceData.reduce((s,i)=>s+i.cogs,0);
  const totalProfit =invoiceData.reduce((s,i)=>s+i.profit,0);
  const avgMargin   =invoiceData.length>0?(totalProfit/totalRevenue*100).toFixed(1):0;

  // رسم بياني أفضل 10 فواتير ربحاً
  const top10=sorted.slice(0,10).map(i=>({name:i.invoiceNo,ربح:i.profit,إيراد:i.total||0}));

  return(
    <div style={{padding:24,fontFamily:"'Cairo'",direction:'rtl'}}>
      <div style={{color:'#fff',fontSize:22,fontWeight:800,marginBottom:20}}>📈 تقرير الأرباح (بالفواتير)</div>

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

      <div style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:14,marginBottom:24}}>
        {[['🧾','عدد الفواتير',fSales.length,'#3b82f6'],['💰','إجمالي الإيرادات',fmt(totalRevenue),'#10b981'],['📦','تكلفة البضاعة',fmt(totalCOGS),'#f59e0b'],['📈','إجمالي الربح',fmt(totalProfit),totalProfit>=0?'#10b981':'#ef4444']].map(([icon,label,val,color])=>(
          <div key={label} style={{background:'#ffffff',borderRadius:14,padding:16,border:'1px solid #d9e2f2',textAlign:'center'}}>
            <div style={{fontSize:24,marginBottom:6}}>{icon}</div>
            <div style={{color:'#64748b',fontSize:11,marginBottom:4}}>{label}</div>
            <div style={{color,fontSize:16,fontWeight:800}}>{val}</div>
          </div>
        ))}
      </div>

      {top10.length>0&&(
        <div style={{background:'#ffffff',borderRadius:16,padding:20,border:'1px solid #d9e2f2',marginBottom:20}}>
          <div style={{color:'#fff',fontSize:14,fontWeight:700,marginBottom:16}}>أفضل 10 فواتير ربحاً</div>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={top10}>
              <CartesianGrid strokeDasharray="3 3" stroke="#d9e2f2"/>
              <XAxis dataKey="name" tick={{fill:'#64748b',fontSize:9}}/>
              <YAxis tick={{fill:'#64748b',fontSize:9}}/>
              <Tooltip contentStyle={{color:'#0f172a'}}/>
              <Bar dataKey="ربح"   fill="#10b981" radius={[4,4,0,0]}/>
              <Bar dataKey="إيراد" fill="#3b82f6" radius={[4,4,0,0]}/>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      <div style={{display:'flex',gap:10,marginBottom:14,justifyContent:'flex-end'}}>
        {[['profit','الأعلى ربحاً'],['margin','الأعلى هامشاً'],['date','الأحدث']].map(([v,l])=>(
          <button key={v} onClick={()=>setSortBy(v)}
            style={{background:sortBy===v?'#10b981':'#ffffff',color:sortBy===v?'#fff':'#64748b',border:`1px solid ${sortBy===v?'#10b981':'#cdd8ec'}`,borderRadius:20,padding:'7px 14px',fontSize:12,cursor:'pointer',fontWeight:sortBy===v?700:400}}>
            {l}
          </button>
        ))}
      </div>

      <div style={{background:'#ffffff',borderRadius:16,border:'1px solid #d9e2f2',overflow:'hidden'}}>
        <div style={{display:'grid',gridTemplateColumns:'1fr 1.5fr 1fr 1fr 1fr 1fr',padding:'12px 20px',background:'#f8fbff',borderBottom:'1px solid #e2e8f7'}}>
          {['رقم الفاتورة','الزبون','الإيراد','التكلفة','الربح','الهامش%'].map(h=>(
            <div key={h} style={{color:'#64748b',fontSize:11,fontWeight:700}}>{h}</div>
          ))}
        </div>
        {sorted.length===0
          ?<div style={{color:'#cdd8ec',textAlign:'center',padding:60}}>لا توجد فواتير</div>
          :sorted.map((inv,i)=>(
            <div key={inv.id} style={{display:'grid',gridTemplateColumns:'1fr 1.5fr 1fr 1fr 1fr 1fr',padding:'11px 20px',borderBottom:i<sorted.length-1?'1px solid #ffffff':'none',alignItems:'center',background:inv.profit<0?'#ef444408':'transparent'}}>
              <div style={{color:'#F5C800',fontSize:12,fontWeight:700}}>{inv.invoiceNo}</div>
              <div style={{color:'#1e293b',fontSize:12}}>{inv.customer}</div>
              <div style={{color:'#10b981',fontSize:12,fontWeight:600}}>{fmt(inv.total)}</div>
              <div style={{color:'#f59e0b',fontSize:12}}>{fmt(inv.cogs)}</div>
              <div style={{color:inv.profit>=0?'#10b981':'#ef4444',fontSize:13,fontWeight:800}}>{fmt(inv.profit)}</div>
              <div>
                <span style={{background:`${inv.margin>=20?'#10b981':inv.margin>=10?'#F5C800':'#ef4444'}22`,border:`1px solid ${inv.margin>=20?'#10b981':inv.margin>=10?'#F5C800':'#ef4444'}44`,borderRadius:20,padding:'2px 8px',color:inv.margin>=20?'#10b981':inv.margin>=10?'#F5C800':'#ef4444',fontSize:11,fontWeight:700}}>
                  {inv.margin}%
                </span>
              </div>
            </div>
          ))
        }
        <div style={{display:'grid',gridTemplateColumns:'1fr 1.5fr 1fr 1fr 1fr 1fr',padding:'14px 20px',background:'#ffffff',borderTop:'2px solid #d9e2f2'}}>
          <div style={{color:'#1e293b',fontSize:13,fontWeight:800,gridColumn:'1/3'}}>الإجمالي</div>
          <div style={{color:'#10b981',fontSize:14,fontWeight:900}}>{fmt(totalRevenue)}</div>
          <div style={{color:'#f59e0b',fontSize:14,fontWeight:900}}>{fmt(totalCOGS)}</div>
          <div style={{color:'#10b981',fontSize:14,fontWeight:900}}>{fmt(totalProfit)}</div>
          <div style={{color:'#F5C800',fontSize:13,fontWeight:800}}>{avgMargin}%</div>
        </div>
      </div>
    </div>
  );
}
