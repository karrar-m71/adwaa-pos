import { useState, useEffect } from 'react';
import { collection, onSnapshot } from 'firebase/firestore';
import { db } from '../../firebase';
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid } from 'recharts';

const fmt = n=>(n||0).toLocaleString('ar-IQ')+' د.ع';
const COLORS=['#F5C800','#10b981','#3b82f6','#ef4444','#a78bfa','#f59e0b','#06b6d4','#84cc16'];

export default function GroupProfits({ user }) {
  const [sales,    setSales]    = useState([]);
  const [products, setProducts] = useState([]);
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo,   setDateTo]   = useState('');

  useEffect(()=>{
    const us=[onSnapshot(collection(db,'pos_sales'),s=>setSales(s.docs.map(d=>({...d.data(),id:d.id})))),onSnapshot(collection(db,'pos_products'),s=>setProducts(s.docs.map(d=>({...d.data(),id:d.id}))))];
    return()=>us.forEach(u=>u());
  },[]);

  const inRange=d=>{ if(!d)return true; if(dateFrom&&d<dateFrom)return false; if(dateTo&&d>dateTo)return false; return true; };
  const fSales=sales.filter(s=>inRange(s.dateISO||s.date));

  // تجميع حسب التصنيف
  const grpMap={};
  fSales.forEach(inv=>{
    (inv.items||[]).forEach(it=>{
      const p=products.find(p=>p.id===it.id);
      const cat=p?.cat||'أخرى';
      const cost=(p?.buyPrice||0)*it.qty;
      const rev=(it.price||0)*it.qty;
      if(!grpMap[cat])grpMap[cat]={name:cat,qty:0,revenue:0,cost:0,profit:0,items:new Set()};
      grpMap[cat].qty+=it.qty;grpMap[cat].revenue+=rev;grpMap[cat].cost+=cost;grpMap[cat].profit+=rev-cost;
      grpMap[cat].items.add(it.name);
    });
  });

  const data=Object.values(grpMap).map(g=>({...g,items:g.items.size,margin:g.revenue>0?(g.profit/g.revenue*100).toFixed(1):0})).sort((a,b)=>b.profit-a.profit);
  const totRevenue=data.reduce((s,g)=>s+g.revenue,0);
  const totProfit =data.reduce((s,g)=>s+g.profit,0);
  const pieData   =data.filter(g=>g.profit>0).map(g=>({name:g.name,value:g.profit}));
  const barData   =data.map(g=>({name:g.name,إيراد:g.revenue,ربح:g.profit}));

  return(
    <div style={{padding:24,fontFamily:"'Cairo'",direction:'rtl'}}>
      <div style={{color:'#fff',fontSize:22,fontWeight:800,marginBottom:20}}>📂 أرباح المجاميع (التصنيفات)</div>
      <div style={{display:'flex',gap:14,marginBottom:20,background:'#ffffff',borderRadius:14,padding:16,border:'1px solid #d9e2f2',alignItems:'center'}}>
        <span style={{color:'#64748b',fontSize:13}}>الفترة:</span>
        <input type="date" value={dateFrom} onChange={e=>setDateFrom(e.target.value)} style={{color:'#0f172a',outline:'none'}}/>
        <span style={{color:'#64748b'}}>—</span>
        <input type="date" value={dateTo} onChange={e=>setDateTo(e.target.value)} style={{color:'#0f172a',outline:'none'}}/>
        <button onClick={()=>{setDateFrom('');setDateTo('');}} style={{background:'#d9e2f2',border:'none',borderRadius:10,padding:'8px 14px',color:'#64748b',cursor:'pointer',fontFamily:"'Cairo'"}}>إعادة</button>
      </div>

      <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:14,marginBottom:24}}>
        {[['📂','عدد التصنيفات',data.length,'#F5C800'],['💰','إجمالي الإيرادات',fmt(totRevenue),'#10b981'],['📈','إجمالي الأرباح',fmt(totProfit),totProfit>=0?'#10b981':'#ef4444']].map(([icon,label,val,color])=>(
          <div key={label} style={{background:'#ffffff',borderRadius:14,padding:16,border:'1px solid #d9e2f2',textAlign:'center'}}>
            <div style={{fontSize:24,marginBottom:6}}>{icon}</div><div style={{color:'#64748b',fontSize:11,marginBottom:4}}>{label}</div><div style={{color,fontSize:18,fontWeight:800}}>{val}</div>
          </div>
        ))}
      </div>

      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:20,marginBottom:24}}>
        <div style={{background:'#ffffff',borderRadius:16,padding:20,border:'1px solid #d9e2f2'}}>
          <div style={{color:'#fff',fontSize:14,fontWeight:700,marginBottom:16}}>توزيع الأرباح حسب التصنيف</div>
          {pieData.length===0?<div style={{color:'#cdd8ec',textAlign:'center',padding:40}}>لا توجد بيانات</div>
            :<ResponsiveContainer width="100%" height={220}>
              <PieChart>
                <Pie data={pieData} cx="50%" cy="50%" outerRadius={90} dataKey="value" label={({name,percent})=>`${name} ${(percent*100).toFixed(0)}%`}>
                  {pieData.map((_,i)=><Cell key={i} fill={COLORS[i%COLORS.length]}/>)}
                </Pie>
                <Tooltip formatter={v=>fmt(v)} contentStyle={{color:'#0f172a'}}/>
              </PieChart>
            </ResponsiveContainer>
          }
        </div>
        <div style={{background:'#ffffff',borderRadius:16,padding:20,border:'1px solid #d9e2f2'}}>
          <div style={{color:'#fff',fontSize:14,fontWeight:700,marginBottom:16}}>مقارنة الإيرادات والأرباح</div>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={barData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#d9e2f2"/>
              <XAxis dataKey="name" tick={{fill:'#64748b',fontSize:9}}/>
              <YAxis tick={{fill:'#64748b',fontSize:9}}/>
              <Tooltip contentStyle={{color:'#0f172a'}}/>
              <Bar dataKey="إيراد" fill="#3b82f6" radius={[4,4,0,0]}/>
              <Bar dataKey="ربح"   fill="#10b981" radius={[4,4,0,0]}/>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div style={{background:'#ffffff',borderRadius:16,border:'1px solid #d9e2f2',overflow:'hidden'}}>
        <div style={{display:'grid',gridTemplateColumns:'auto 1.5fr 1fr 1fr 1fr 1fr 1fr 1fr',padding:'12px 20px',background:'#f8fbff',borderBottom:'1px solid #e2e8f7'}}>
          {['#','التصنيف','الأصناف','الكمية','الإيراد','التكلفة','الربح','الهامش%'].map(h=><div key={h} style={{color:'#64748b',fontSize:10,fontWeight:700}}>{h}</div>)}
        </div>
        {data.length===0?<div style={{color:'#cdd8ec',textAlign:'center',padding:60}}>لا توجد بيانات</div>
          :data.map((g,i)=>(
          <div key={g.name} style={{display:'grid',gridTemplateColumns:'auto 1.5fr 1fr 1fr 1fr 1fr 1fr 1fr',padding:'12px 20px',borderBottom:i<data.length-1?'1px solid #ffffff':'none',alignItems:'center',background:g.profit<0?'#ef444408':'transparent'}}>
            <div style={{width:28,height:28,borderRadius:8,background:`${COLORS[i%COLORS.length]}22`,display:'flex',alignItems:'center',justifyContent:'center',color:COLORS[i%COLORS.length],fontSize:12,fontWeight:800,marginLeft:12}}>#{i+1}</div>
            <div style={{display:'flex',gap:8,alignItems:'center'}}>
              <div style={{width:10,height:10,borderRadius:2,background:COLORS[i%COLORS.length]}}/>
              <span style={{color:'#1e293b',fontSize:13,fontWeight:700}}>{g.name}</span>
            </div>
            <div style={{color:'#64748b',fontSize:12}}>{g.items} صنف</div>
            <div style={{color:'#666',fontSize:12}}>{g.qty}</div>
            <div style={{color:'#10b981',fontSize:12}}>{fmt(g.revenue)}</div>
            <div style={{color:'#f59e0b',fontSize:12}}>{fmt(g.cost)}</div>
            <div style={{color:g.profit>=0?'#10b981':'#ef4444',fontSize:13,fontWeight:800}}>{fmt(g.profit)}</div>
            <span style={{background:`${Number(g.margin)>=20?'#10b981':Number(g.margin)>=10?'#F5C800':'#ef4444'}22`,borderRadius:20,padding:'2px 6px',color:Number(g.margin)>=20?'#10b981':Number(g.margin)>=10?'#F5C800':'#ef4444',fontSize:10,fontWeight:700}}>{g.margin}%</span>
          </div>
        ))}
        <div style={{display:'grid',gridTemplateColumns:'auto 1.5fr 1fr 1fr 1fr 1fr 1fr 1fr',padding:'14px 20px',background:'#ffffff',borderTop:'2px solid #d9e2f2'}}>
          <div/><div style={{color:'#1e293b',fontSize:13,fontWeight:800}}>الإجمالي</div>
          <div/><div/><div style={{color:'#10b981',fontSize:13,fontWeight:800}}>{fmt(totRevenue)}</div>
          <div/><div style={{color:'#10b981',fontSize:14,fontWeight:900}}>{fmt(totProfit)}</div>
          <div style={{color:'#F5C800',fontSize:12}}>{totRevenue>0?((totProfit/totRevenue)*100).toFixed(1):0}%</div>
        </div>
      </div>
    </div>
  );
}
