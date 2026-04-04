import { useState, useEffect } from 'react';
import { collection, onSnapshot } from 'firebase/firestore';
import { db } from '../../firebase';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

const fmt = n=>(n||0).toLocaleString('ar-IQ')+' د.ع';

export default function ItemProfits({ user }) {
  const [sales,    setSales]    = useState([]);
  const [products, setProducts] = useState([]);
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo,   setDateTo]   = useState('');
  const [search,   setSearch]   = useState('');
  const [sortBy,   setSortBy]   = useState('profit');
  const [catFilter,setCatFilter]= useState('الكل');

  useEffect(()=>{
    const us=[onSnapshot(collection(db,'pos_sales'),s=>setSales(s.docs.map(d=>({...d.data(),id:d.id})))),onSnapshot(collection(db,'pos_products'),s=>setProducts(s.docs.map(d=>({...d.data(),id:d.id}))))];
    return()=>us.forEach(u=>u());
  },[]);

  const inRange=d=>{ if(!d)return true; if(dateFrom&&d<dateFrom)return false; if(dateTo&&d>dateTo)return false; return true; };
  const fSales=sales.filter(s=>inRange(s.dateISO||s.date));

  // تجميع حسب المادة
  const itemMap={};
  fSales.forEach(inv=>{
    (inv.items||[]).forEach(it=>{
      const p=products.find(p=>p.id===it.id);
      const cost=(p?.buyPrice||0)*it.qty;
      const rev=(it.price||0)*it.qty;
      const key=it.id||it.name;
      if(!itemMap[key])itemMap[key]={id:key,name:it.name,cat:p?.cat||'أخرى',img:p?.img||'📦',qty:0,revenue:0,cost:0,profit:0};
      itemMap[key].qty+=it.qty;
      itemMap[key].revenue+=rev;
      itemMap[key].cost+=cost;
      itemMap[key].profit+=rev-cost;
    });
  });

  const cats=['الكل',...new Set(Object.values(itemMap).map(i=>i.cat))];
  const data=Object.values(itemMap)
    .filter(i=>catFilter==='الكل'||i.cat===catFilter)
    .filter(i=>!search||i.name.includes(search))
    .sort((a,b)=>sortBy==='profit'?b.profit-a.profit:sortBy==='revenue'?b.revenue-a.revenue:sortBy==='qty'?b.qty-a.qty:b.profit/b.revenue-a.profit/a.revenue);

  const totRevenue=data.reduce((s,i)=>s+i.revenue,0);
  const totProfit =data.reduce((s,i)=>s+i.profit,0);
  const top8=data.slice(0,8).map(i=>({name:i.name?.length>10?i.name.slice(0,10)+'...':i.name,ربح:i.profit,إيراد:i.revenue}));

  return(
    <div style={{padding:24,fontFamily:"'Cairo'",direction:'rtl'}}>
      <div style={{color:'#fff',fontSize:22,fontWeight:800,marginBottom:20}}>📦 أرباح المواد</div>
      <div style={{display:'flex',gap:14,marginBottom:20,background:'#ffffff',borderRadius:14,padding:16,border:'1px solid #d9e2f2',alignItems:'center',flexWrap:'wrap'}}>
        <span style={{color:'#64748b',fontSize:13}}>الفترة:</span>
        <input type="date" value={dateFrom} onChange={e=>setDateFrom(e.target.value)} style={{color:'#0f172a',outline:'none'}}/>
        <span style={{color:'#64748b'}}>—</span>
        <input type="date" value={dateTo} onChange={e=>setDateTo(e.target.value)} style={{color:'#0f172a',outline:'none'}}/>
        <button onClick={()=>{setDateFrom('');setDateTo('');}} style={{background:'#d9e2f2',border:'none',borderRadius:10,padding:'8px 14px',color:'#64748b',cursor:'pointer',fontFamily:"'Cairo'"}}>إعادة</button>
        <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="🔍 بحث..." style={{color:'#0f172a',outline:'none',fontFamily:"'Cairo'",flex:1}}/>
      </div>
      <div style={{display:'flex',gap:10,marginBottom:16,flexWrap:'wrap'}}>
        {cats.map(c=>(
          <button key={c} onClick={()=>setCatFilter(c)} style={{background:catFilter===c?'#a78bfa':'#ffffff',color:catFilter===c?'#fff':'#64748b',border:`1px solid ${catFilter===c?'#a78bfa':'#cdd8ec'}`,borderRadius:20,padding:'6px 14px',fontSize:12,cursor:'pointer',fontWeight:catFilter===c?700:400}}>{c}</button>
        ))}
      </div>
      <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:14,marginBottom:20}}>
        {[['📦','عدد الأصناف',data.length,'#a78bfa'],['💰','إجمالي الإيراد',fmt(totRevenue),'#10b981'],['📈','إجمالي الربح',fmt(totProfit),totProfit>=0?'#10b981':'#ef4444']].map(([icon,label,val,color])=>(
          <div key={label} style={{background:'#ffffff',borderRadius:14,padding:16,border:'1px solid #d9e2f2',textAlign:'center'}}>
            <div style={{fontSize:24,marginBottom:6}}>{icon}</div><div style={{color:'#64748b',fontSize:11,marginBottom:4}}>{label}</div><div style={{color,fontSize:18,fontWeight:800}}>{val}</div>
          </div>
        ))}
      </div>
      {top8.length>0&&(
        <div style={{background:'#ffffff',borderRadius:16,padding:20,border:'1px solid #d9e2f2',marginBottom:20}}>
          <div style={{color:'#fff',fontSize:14,fontWeight:700,marginBottom:16}}>أفضل 8 مواد ربحاً</div>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={top8}>
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
        {[['profit','الأعلى ربحاً'],['revenue','الأعلى إيراداً'],['qty','الأكثر مبيعاً']].map(([v,l])=>(
          <button key={v} onClick={()=>setSortBy(v)} style={{background:sortBy===v?'#a78bfa':'#ffffff',color:sortBy===v?'#fff':'#64748b',border:`1px solid ${sortBy===v?'#a78bfa':'#cdd8ec'}`,borderRadius:20,padding:'7px 14px',fontSize:12,cursor:'pointer',fontWeight:sortBy===v?700:400}}>{l}</button>
        ))}
      </div>
      <div style={{background:'#ffffff',borderRadius:16,border:'1px solid #d9e2f2',overflow:'hidden'}}>
        <div style={{display:'grid',gridTemplateColumns:'auto 2fr 1fr 1fr 1fr 1fr 1fr 1fr',padding:'12px 20px',background:'#f8fbff',borderBottom:'1px solid #e2e8f7'}}>
          {['#','المادة','التصنيف','الكمية','الإيراد','التكلفة','الربح','الهامش%'].map(h=><div key={h} style={{color:'#64748b',fontSize:10,fontWeight:700}}>{h}</div>)}
        </div>
        {data.length===0?<div style={{color:'#cdd8ec',textAlign:'center',padding:60}}>لا توجد بيانات</div>
          :data.map((item,i)=>{
          const m=item.revenue>0?(item.profit/item.revenue*100).toFixed(1):0;
          return(
            <div key={item.id} style={{display:'grid',gridTemplateColumns:'auto 2fr 1fr 1fr 1fr 1fr 1fr 1fr',padding:'11px 20px',borderBottom:i<data.length-1?'1px solid #ffffff':'none',alignItems:'center',background:item.profit<0?'#ef444408':'transparent'}}>
              <div style={{color:'#F5C800',fontSize:12,fontWeight:800,marginLeft:12}}>#{i+1}</div>
              <div style={{display:'flex',gap:8,alignItems:'center'}}>
                <span style={{fontSize:16}}>{item.img}</span>
                <div style={{color:'#1e293b',fontSize:12,fontWeight:600}}>{item.name}</div>
              </div>
              <div style={{color:'#475569',fontSize:11}}>{item.cat}</div>
              <div style={{color:'#64748b',fontSize:12}}>{item.qty}</div>
              <div style={{color:'#10b981',fontSize:12}}>{fmt(item.revenue)}</div>
              <div style={{color:'#f59e0b',fontSize:12}}>{fmt(item.cost)}</div>
              <div style={{color:item.profit>=0?'#10b981':'#ef4444',fontSize:13,fontWeight:800}}>{fmt(item.profit)}</div>
              <span style={{background:`${Number(m)>=20?'#10b981':Number(m)>=10?'#F5C800':'#ef4444'}22`,borderRadius:20,padding:'2px 6px',color:Number(m)>=20?'#10b981':Number(m)>=10?'#F5C800':'#ef4444',fontSize:10,fontWeight:700}}>{m}%</span>
            </div>
          );
        })}
        <div style={{display:'grid',gridTemplateColumns:'auto 2fr 1fr 1fr 1fr 1fr 1fr 1fr',padding:'14px 20px',background:'#ffffff',borderTop:'2px solid #d9e2f2'}}>
          <div/><div style={{color:'#1e293b',fontSize:13,fontWeight:800}}>الإجمالي ({data.length})</div>
          <div/><div/><div style={{color:'#10b981',fontSize:13,fontWeight:800}}>{fmt(totRevenue)}</div>
          <div/><div style={{color:'#10b981',fontSize:14,fontWeight:900}}>{fmt(totProfit)}</div>
          <div style={{color:'#F5C800',fontSize:12}}>{totRevenue>0?((totProfit/totRevenue)*100).toFixed(1):0}%</div>
        </div>
      </div>
    </div>
  );
}
