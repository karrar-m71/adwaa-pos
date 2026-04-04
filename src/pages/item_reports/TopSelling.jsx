import { useState, useEffect } from 'react';
import { collection, onSnapshot } from 'firebase/firestore';
import { db } from '../../firebase';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

const fmt = n=>(n||0).toLocaleString('ar-IQ')+' د.ع';

export default function TopSelling({ user }) {
  const [products, setProducts] = useState([]);
  const [sales,    setSales]    = useState([]);
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo,   setDateTo]   = useState('');
  const [catFilter,setCatFilter]= useState('الكل');
  const [topN,     setTopN]     = useState(10);

  useEffect(()=>{
    const us=[onSnapshot(collection(db,'pos_products'),s=>setProducts(s.docs.map(d=>({...d.data(),id:d.id})))),onSnapshot(collection(db,'pos_sales'),s=>setSales(s.docs.map(d=>({...d.data(),id:d.id}))))];
    return()=>us.forEach(u=>u());
  },[]);

  const inRange=d=>{ const ds=d?.slice(0,10)||''; if(dateFrom&&ds<dateFrom)return false; if(dateTo&&ds>dateTo)return false; return true; };
  const fSales=sales.filter(s=>inRange(s.createdAt||s.dateISO||s.date));

  const itemMap={};
  fSales.forEach(inv=>{
    (inv.items||[]).forEach(it=>{
      const p=products.find(p=>p.id===it.id);
      if(!itemMap[it.id||it.name])itemMap[it.id||it.name]={id:it.id,name:it.name,img:p?.img||'📦',cat:p?.cat||'—',qty:0,revenue:0,profit:0};
      itemMap[it.id||it.name].qty+=it.qty||0;
      itemMap[it.id||it.name].revenue+=(it.price||0)*(it.qty||0);
      const cogs=(p?.buyPrice||0)*(it.qty||0);
      itemMap[it.id||it.name].profit+=(it.price||0)*(it.qty||0)-cogs;
    });
  });

  const cats=['الكل',...new Set(products.map(p=>p.cat).filter(Boolean))];
  const allData=Object.values(itemMap).filter(i=>catFilter==='الكل'||i.cat===catFilter).sort((a,b)=>b.qty-a.qty);
  const data=allData.slice(0,topN);
  const chartData=data.slice(0,10).map(i=>({name:i.name?.length>10?i.name.slice(0,10)+'...':i.name,كمية:i.qty,إيراد:i.revenue}));

  return(
    <div style={{padding:24,fontFamily:"'Cairo'",direction:'rtl'}}>
      <div style={{color:'#fff',fontSize:22,fontWeight:800,marginBottom:20}}>🏆 الأكثر مبيعاً</div>
      <div style={{display:'flex',gap:14,marginBottom:20,background:'#ffffff',borderRadius:14,padding:16,border:'1px solid #d9e2f2',alignItems:'center',flexWrap:'wrap'}}>
        <span style={{color:'#64748b',fontSize:13}}>الفترة:</span>
        <input type="date" value={dateFrom} onChange={e=>setDateFrom(e.target.value)} style={{color:'#0f172a',outline:'none'}}/>
        <span style={{color:'#64748b'}}>—</span>
        <input type="date" value={dateTo} onChange={e=>setDateTo(e.target.value)} style={{color:'#0f172a',outline:'none'}}/>
        <button onClick={()=>{setDateFrom('');setDateTo('');}} style={{background:'#d9e2f2',border:'none',borderRadius:10,padding:'8px 14px',color:'#64748b',cursor:'pointer',fontFamily:"'Cairo'"}}>إعادة</button>
        {cats.map(c=><button key={c} onClick={()=>setCatFilter(c)} style={{background:catFilter===c?'#F5C800':'#ffffff',color:catFilter===c?'#000':'#64748b',border:`1px solid ${catFilter===c?'#F5C800':'#cdd8ec'}`,borderRadius:20,padding:'6px 12px',fontSize:12,cursor:'pointer',fontWeight:catFilter===c?700:400}}>{c}</button>)}
        <select value={topN} onChange={e=>setTopN(Number(e.target.value))} style={{color:'#0f172a',outline:'none',marginRight:'auto'}}>
          {[5,10,20,50].map(n=><option key={n} value={n}>أفضل {n}</option>)}
        </select>
      </div>
      {chartData.length>0&&(
        <div style={{background:'#ffffff',borderRadius:16,padding:20,border:'1px solid #d9e2f2',marginBottom:20}}>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#d9e2f2"/>
              <XAxis dataKey="name" tick={{fill:'#64748b',fontSize:9}}/>
              <YAxis tick={{fill:'#64748b',fontSize:9}}/>
              <Tooltip contentStyle={{color:'#0f172a'}}/>
              <Bar dataKey="كمية" fill="#F5C800" radius={[4,4,0,0]}/>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
      <div style={{background:'#ffffff',borderRadius:16,border:'1px solid #d9e2f2',overflow:'hidden'}}>
        <div style={{display:'grid',gridTemplateColumns:'auto 2.5fr 1fr 1fr 1fr 1fr',padding:'12px 20px',background:'#f8fbff',borderBottom:'1px solid #e2e8f7'}}>
          {['#','المادة','التصنيف','الكمية المباعة','الإيراد','الربح'].map(h=><div key={h} style={{color:'#64748b',fontSize:11,fontWeight:700}}>{h}</div>)}
        </div>
        {data.length===0?<div style={{color:'#cdd8ec',textAlign:'center',padding:60}}>لا توجد مبيعات</div>
          :data.map((item,i)=>(
          <div key={item.id} style={{display:'grid',gridTemplateColumns:'auto 2.5fr 1fr 1fr 1fr 1fr',padding:'12px 20px',borderBottom:i<data.length-1?'1px solid #ffffff':'none',alignItems:'center',background:i===0?'#F5C80008':i===1?'#88888808':i===2?'#CD7F3208':'transparent'}}>
            <div style={{width:28,height:28,borderRadius:8,background:i===0?'#F5C80022':i===1?'#88888822':i===2?'#CD7F3222':'#d9e2f2',display:'flex',alignItems:'center',justifyContent:'center',color:i===0?'#F5C800':i===1?'#aaa':i===2?'#CD7F32':'#64748b',fontSize:12,fontWeight:800,marginLeft:12}}>
              {i===0?'🥇':i===1?'🥈':i===2?'🥉':`#${i+1}`}
            </div>
            <div style={{display:'flex',gap:8,alignItems:'center'}}>
              <span style={{fontSize:18}}>{item.img}</span>
              <div>
                <div style={{color:'#1e293b',fontSize:13,fontWeight:600}}>{item.name}</div>
              </div>
            </div>
            <div style={{color:'#666',fontSize:11}}>{item.cat}</div>
            <div style={{color:'#F5C800',fontSize:14,fontWeight:800}}>{item.qty}</div>
            <div style={{color:'#10b981',fontSize:12}}>{fmt(item.revenue)}</div>
            <div style={{color:item.profit>=0?'#10b981':'#ef4444',fontSize:12,fontWeight:700}}>{fmt(item.profit)}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
