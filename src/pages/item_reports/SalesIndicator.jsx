import { useState, useEffect } from 'react';
import { collection, onSnapshot } from 'firebase/firestore';
import { db } from '../../firebase';
import { RadarChart, Radar, PolarGrid, PolarAngleAxis, ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip } from 'recharts';

const fmt = n=>(n||0).toLocaleString('ar-IQ')+' د.ع';

export default function SalesIndicator({ user }) {
  const [products, setProducts] = useState([]);
  const [sales,    setSales]    = useState([]);
  const [catFilter,setCatFilter]= useState('الكل');
  const [period,   setPeriod]   = useState(30);

  useEffect(()=>{
    const us=[onSnapshot(collection(db,'pos_products'),s=>setProducts(s.docs.map(d=>({...d.data(),id:d.id})))),onSnapshot(collection(db,'pos_sales'),s=>setSales(s.docs.map(d=>({...d.data(),id:d.id}))))];
    return()=>us.forEach(u=>u());
  },[]);

  const cutoff=new Date();cutoff.setDate(cutoff.getDate()-period);
  const fSales=sales.filter(s=>new Date(s.createdAt||s.dateISO||s.date)>=cutoff);

  // حساب مؤشر لكل مادة
  const itemStats={};
  fSales.forEach(inv=>{
    (inv.items||[]).forEach(it=>{
      const p=products.find(p=>p.id===it.id);
      if(!itemStats[it.id||it.name])itemStats[it.id||it.name]={id:it.id,name:it.name,img:p?.img||'📦',cat:p?.cat||'—',sellPrice:p?.sellPrice||0,buyPrice:p?.buyPrice||0,stock:p?.stock||0,qty:0,revenue:0,profit:0,invoiceCount:0};
      itemStats[it.id||it.name].qty+=it.qty||0;
      itemStats[it.id||it.name].revenue+=(it.price||0)*(it.qty||0);
      itemStats[it.id||it.name].profit+=(it.price||0)*(it.qty||0)-(p?.buyPrice||0)*(it.qty||0);
      itemStats[it.id||it.name].invoiceCount++;
    });
  });

  // حساب المؤشر (0-100) بناءً على الكمية والإيراد والربح
  const allData=Object.values(itemStats);
  const maxQty=Math.max(...allData.map(i=>i.qty),1);
  const maxRev=Math.max(...allData.map(i=>i.revenue),1);
  const maxProf=Math.max(...allData.map(i=>i.profit),1);

  const cats=['الكل',...new Set(products.map(p=>p.cat).filter(Boolean))];
  const data=allData.filter(i=>catFilter==='الكل'||i.cat===catFilter).map(i=>({
    ...i,
    indicator:Math.round((i.qty/maxQty*40)+(i.revenue/maxRev*30)+(Math.max(0,i.profit)/maxProf*30)),
  })).sort((a,b)=>b.indicator-a.indicator);

  const top5=data.slice(0,5).map(i=>({subject:i.name?.length>8?i.name.slice(0,8)+'...':i.name,كمية:Math.round(i.qty/maxQty*100),إيراد:Math.round(i.revenue/maxRev*100),ربح:Math.max(0,Math.round(i.profit/maxProf*100))}));
  const barData=data.slice(0,10).map(i=>({name:i.name?.length>10?i.name.slice(0,10)+'...':i.name,مؤشر:i.indicator}));

  const getColor=v=>v>=70?'#10b981':v>=40?'#F5C800':'#ef4444';
  const getLabel=v=>v>=70?'ممتاز':v>=40?'جيد':'ضعيف';

  return(
    <div style={{padding:24,fontFamily:"'Cairo'",direction:'rtl'}}>
      <div style={{color:'#fff',fontSize:22,fontWeight:800,marginBottom:20}}>📊 مؤشر المبيعات</div>
      <div style={{display:'flex',gap:14,marginBottom:20,background:'#ffffff',borderRadius:14,padding:16,border:'1px solid #d9e2f2',alignItems:'center',flexWrap:'wrap'}}>
        <span style={{color:'#64748b',fontSize:13}}>الفترة:</span>
        <select value={period} onChange={e=>setPeriod(Number(e.target.value))} style={{background:'#f8fbff',border:'1px solid #cdd8ec',borderRadius:10,padding:'8px 12px',color:'#F5C800',fontSize:13,fontWeight:700,outline:'none'}}>
          {[7,14,30,60,90].map(d=><option key={d} value={d}>آخر {d} يوم</option>)}
        </select>
        {cats.map(c=><button key={c} onClick={()=>setCatFilter(c)} style={{background:catFilter===c?'#F5C800':'#ffffff',color:catFilter===c?'#000':'#64748b',border:`1px solid ${catFilter===c?'#F5C800':'#cdd8ec'}`,borderRadius:20,padding:'6px 12px',fontSize:12,cursor:'pointer',fontWeight:catFilter===c?700:400}}>{c}</button>)}
      </div>

      <div style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:14,marginBottom:24}}>
        {[['📦','مواد نشطة',data.length,'#3b82f6'],['🟢','أداء ممتاز',data.filter(d=>d.indicator>=70).length,'#10b981'],['🟡','أداء جيد',data.filter(d=>d.indicator>=40&&d.indicator<70).length,'#F5C800'],['🔴','أداء ضعيف',data.filter(d=>d.indicator<40).length,'#ef4444']].map(([icon,label,val,color])=>(
          <div key={label} style={{background:'#ffffff',borderRadius:14,padding:16,border:`1px solid ${color}33`,textAlign:'center'}}>
            <div style={{fontSize:24,marginBottom:6}}>{icon}</div><div style={{color:'#64748b',fontSize:11,marginBottom:4}}>{label}</div><div style={{color,fontSize:18,fontWeight:800}}>{val}</div>
          </div>
        ))}
      </div>

      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:20,marginBottom:24}}>
        <div style={{background:'#ffffff',borderRadius:16,padding:20,border:'1px solid #d9e2f2'}}>
          <div style={{color:'#fff',fontSize:14,fontWeight:700,marginBottom:16}}>أفضل 10 مواد حسب المؤشر</div>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={barData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#d9e2f2"/>
              <XAxis dataKey="name" tick={{fill:'#64748b',fontSize:9}}/>
              <YAxis domain={[0,100]} tick={{fill:'#64748b',fontSize:9}}/>
              <Tooltip contentStyle={{color:'#0f172a'}}/>
              <Bar dataKey="مؤشر" fill="#F5C800" radius={[4,4,0,0]}/>
            </BarChart>
          </ResponsiveContainer>
        </div>
        {top5.length>=3&&(
          <div style={{background:'#ffffff',borderRadius:16,padding:20,border:'1px solid #d9e2f2'}}>
            <div style={{color:'#fff',fontSize:14,fontWeight:700,marginBottom:16}}>مقارنة أفضل 5 مواد</div>
            <ResponsiveContainer width="100%" height={200}>
              <RadarChart data={top5}>
                <PolarGrid stroke="#d9e2f2"/>
                <PolarAngleAxis dataKey="subject" tick={{fill:'#64748b',fontSize:9}}/>
                <Radar name="كمية" dataKey="كمية" stroke="#10b981" fill="#10b981" fillOpacity={0.2}/>
                <Radar name="إيراد" dataKey="إيراد" stroke="#F5C800" fill="#F5C800" fillOpacity={0.2}/>
                <Radar name="ربح" dataKey="ربح" stroke="#3b82f6" fill="#3b82f6" fillOpacity={0.2}/>
              </RadarChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>

      <div style={{background:'#ffffff',borderRadius:16,border:'1px solid #d9e2f2',overflow:'hidden'}}>
        <div style={{display:'grid',gridTemplateColumns:'auto 2fr 1fr 1fr 1fr 1fr 1fr',padding:'12px 20px',background:'#f8fbff',borderBottom:'1px solid #e2e8f7'}}>
          {['#','المادة','التصنيف','الكمية','الإيراد','الربح','مؤشر الأداء'].map(h=><div key={h} style={{color:'#64748b',fontSize:11,fontWeight:700}}>{h}</div>)}
        </div>
        {data.length===0?<div style={{color:'#cdd8ec',textAlign:'center',padding:60}}>لا توجد مبيعات في هذه الفترة</div>
          :data.map((item,i)=>(
          <div key={item.id||item.name} style={{display:'grid',gridTemplateColumns:'auto 2fr 1fr 1fr 1fr 1fr 1fr',padding:'12px 20px',borderBottom:i<data.length-1?'1px solid #ffffff':'none',alignItems:'center'}}>
            <div style={{width:26,height:26,borderRadius:6,background:getColor(item.indicator)+'22',display:'flex',alignItems:'center',justifyContent:'center',color:getColor(item.indicator),fontSize:11,fontWeight:800,marginLeft:10}}>#{i+1}</div>
            <div style={{display:'flex',gap:8,alignItems:'center'}}><span style={{fontSize:16}}>{item.img}</span><div style={{color:'#1e293b',fontSize:12,fontWeight:600}}>{item.name}</div></div>
            <div style={{color:'#666',fontSize:11}}>{item.cat}</div>
            <div style={{color:'#F5C800',fontSize:12,fontWeight:700}}>{item.qty}</div>
            <div style={{color:'#10b981',fontSize:12}}>{fmt(item.revenue)}</div>
            <div style={{color:item.profit>=0?'#10b981':'#ef4444',fontSize:12,fontWeight:700}}>{fmt(item.profit)}</div>
            <div style={{display:'flex',gap:8,alignItems:'center'}}>
              <div style={{flex:1,height:6,background:'#d9e2f2',borderRadius:3,overflow:'hidden'}}>
                <div style={{width:`${item.indicator}%`,height:'100%',background:getColor(item.indicator),borderRadius:3}}/>
              </div>
              <div>
                <div style={{color:getColor(item.indicator),fontSize:12,fontWeight:800}}>{item.indicator}</div>
                <div style={{color:getColor(item.indicator),fontSize:9}}>{getLabel(item.indicator)}</div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
