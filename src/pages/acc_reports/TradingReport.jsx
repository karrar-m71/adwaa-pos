import { useState, useEffect } from 'react';
import { collection, onSnapshot } from 'firebase/firestore';
import { db } from '../../firebase';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import jsPDF from 'jspdf';
const fmt=n=>(n||0).toLocaleString('ar-IQ')+' د.ع';
const todayISO = () => {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};
export default function TradingReport({user}){
  const [sales,    setSales]    =useState([]);
  const [purchases,setPurchases]=useState([]);
  const [expenses, setExpenses] =useState([]);
  const [products, setProducts] =useState([]);
  const [dateFrom, setDateFrom] =useState(()=>todayISO());
  const [dateTo,   setDateTo]   =useState(()=>todayISO());
  useEffect(()=>{
    const us=[
      onSnapshot(collection(db,'pos_sales'),    s=>setSales(s.docs.map(d=>({...d.data(),id:d.id})))),
      onSnapshot(collection(db,'pos_purchases'),s=>setPurchases(s.docs.map(d=>({...d.data(),id:d.id})))),
      onSnapshot(collection(db,'pos_expenses'), s=>setExpenses(s.docs.map(d=>({...d.data(),id:d.id})))),
      onSnapshot(collection(db,'pos_products'), s=>setProducts(s.docs.map(d=>({...d.data(),id:d.id})))),
    ];
    return()=>us.forEach(u=>u());
  },[]);
  const inR=d=>{ if(!d)return true; if(dateFrom&&d<dateFrom)return false; if(dateTo&&d>dateTo)return false; return true; };
  const fSales   =sales.filter(s=>inR(s.dateISO||s.date));
  const fPurch   =purchases.filter(p=>inR(p.dateISO||p.date));
  const fExpenses=expenses.filter(e=>inR(e.date));
  const revenue  =fSales.reduce((s,i)=>s+(i.total||0),0);
  const cogs     =fSales.reduce((s,inv)=>s+(inv.items||[]).reduce((ss,it)=>{ const p=products.find(p=>p.id===it.id); return ss+(p?.buyPrice||0)*it.qty; },0),0);
  const grossP   =revenue-cogs;
  const totalExp =fExpenses.reduce((s,e)=>s+(e.amount||0),0);
  const totalPurch=fPurch.reduce((s,p)=>s+(p.total||0),0);
  const netProfit=grossP-totalExp;
  const margin   =revenue>0?((netProfit/revenue)*100).toFixed(1):0;
  // بيانات يومية
  const days=Array.from({length:14},(_,i)=>{
    const d=new Date();d.setDate(d.getDate()-i);
    const ds=d.toISOString().split('T')[0];
    const rev=sales.filter(s=>(s.dateISO||s.date)===ds||(s.dateISO||s.date)?.slice(0,10)===ds).reduce((s,i)=>s+(i.total||0),0);
    const cost=sales.filter(s=>(s.dateISO||s.date)===ds||(s.dateISO||s.date)?.slice(0,10)===ds).reduce((s,inv)=>s+(inv.items||[]).reduce((ss,it)=>{ const p=products.find(p=>p.id===it.id); return ss+(p?.buyPrice||0)*it.qty; },0),0);
    return{name:d.toLocaleDateString('ar-IQ',{month:'short',day:'numeric'}),مبيعات:rev,تكلفة:cost,ربح:rev-cost};
  }).reverse();
  const print=()=>{
    const d=new jsPDF({orientation:'p',unit:'mm',format:'a4'});
    d.setFont('helvetica','bold');d.setFontSize(14);d.text('Adwaa Al-Madina — Trading Report',105,15,{align:'center'});
    d.setFontSize(9);d.setFont('helvetica','normal');
    d.text(`Period: ${dateFrom||'All'} to ${dateTo||'All'}`,105,22,{align:'center'});
    d.line(14,25,196,25);
    const rows=[['Total Revenue:',revenue],['Cost of Goods Sold:',cogs],['Gross Profit:',grossP],['Total Purchases:',totalPurch],['Total Expenses:',totalExp],['NET PROFIT:',netProfit],['Profit Margin:',`${margin}%`]];
    let y=32;
    rows.forEach(([l,v])=>{
      d.setFont('helvetica',l.includes('NET')||l.includes('Gross')?'bold':'normal');
      d.text(l,14,y);d.text(typeof v==='string'?v:v.toLocaleString()+' IQD',196,y,{align:'right'});y+=7;
    });
    d.save('TradingReport.pdf');
  };
  return(
    <div style={{padding:24,fontFamily:"'Cairo'",direction:'rtl'}}>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:20}}>
        <div style={{color:'#fff',fontSize:22,fontWeight:800}}>📈 تقرير المتاجرة</div>
        <button onClick={print} style={{background:'#3b82f622',border:'1px solid #3b82f644',borderRadius:12,padding:'10px 20px',color:'#3b82f6',cursor:'pointer',fontWeight:700}}>🖨️ طباعة</button>
      </div>
      <div style={{background:'#ffffff',borderRadius:14,padding:14,border:'1px solid #d9e2f2',marginBottom:20,display:'flex',gap:12,alignItems:'center',flexWrap:'wrap'}}>
        <span style={{color:'#64748b',fontSize:13}}>الفترة:</span>
        <input type="date" value={dateFrom} onChange={e=>setDateFrom(e.target.value)} style={{color:'#0f172a',outline:'none'}}/>
        <span style={{color:'#64748b'}}>—</span>
        <input type="date" value={dateTo} onChange={e=>setDateTo(e.target.value)} style={{color:'#0f172a',outline:'none'}}/>
        <button onClick={()=>{const t=todayISO();setDateFrom(t);setDateTo(t);}} style={{background:'#d9e2f2',border:'none',borderRadius:8,padding:'8px 14px',color:'#64748b',cursor:'pointer',fontSize:12}}>إعادة ضبط</button>
        <span style={{color:'#64748b',fontSize:12,marginRight:'auto'}}>{fSales.length} فاتورة</span>
      </div>
      {/* قائمة المتاجرة */}
      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:20,marginBottom:20}}>
        <div style={{background:'#ffffff',borderRadius:16,border:'1px solid #d9e2f2',overflow:'hidden'}}>
          <div style={{padding:'12px 20px',background:'#10b98111',borderBottom:'1px solid #10b98133',color:'#10b981',fontSize:14,fontWeight:800}}>📥 الإيرادات</div>
          <div style={{padding:16}}>
            {[['إجمالي المبيعات',revenue,'#10b981',true],['مردودات البيع',0,'#ef4444',false],['صافي المبيعات',revenue,'#10b981',true]].map(([l,v,c,b])=>(
              <div key={l} style={{display:'flex',justifyContent:'space-between',padding:'9px 0',borderBottom:'1px solid #ffffff'}}>
                <span style={{color:b?'#1e293b':'#666',fontSize:13,fontWeight:b?700:400}}>{l}</span>
                <span style={{color:c,fontSize:14,fontWeight:b?800:600}}>{fmt(v)}</span>
              </div>
            ))}
          </div>
        </div>
        <div style={{background:'#ffffff',borderRadius:16,border:'1px solid #d9e2f2',overflow:'hidden'}}>
          <div style={{padding:'12px 20px',background:'#ef444411',borderBottom:'1px solid #ef444433',color:'#ef4444',fontSize:14,fontWeight:800}}>📤 التكاليف والمصروفات</div>
          <div style={{padding:16}}>
            {[['تكلفة البضاعة المباعة',cogs,'#ef4444',false],['إجمالي المشتريات',totalPurch,'#f59e0b',false],['المصروفات التشغيلية',totalExp,'#ef4444',false]].map(([l,v,c,b])=>(
              <div key={l} style={{display:'flex',justifyContent:'space-between',padding:'9px 0',borderBottom:'1px solid #ffffff'}}>
                <span style={{color:'#666',fontSize:13}}>{l}</span>
                <span style={{color:c,fontSize:14,fontWeight:600}}>{fmt(v)}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
      {/* النتيجة */}
      <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:14,marginBottom:20}}>
        {[['مجمل الربح',grossP,grossP>=0?'#10b981':'#ef4444'],['صافي الربح',netProfit,netProfit>=0?'#10b981':'#ef4444'],['هامش الربح',`${margin}%`,Number(margin)>=20?'#10b981':Number(margin)>=10?'#F5C800':'#ef4444']].map(([l,v,c])=>(
          <div key={l} style={{background:'#ffffff',borderRadius:16,padding:20,border:`1px solid ${c}33`,textAlign:'center'}}>
            <div style={{color:'#64748b',fontSize:12,marginBottom:8}}>{l}</div>
            <div style={{color:c,fontSize:28,fontWeight:900}}>{typeof v==='string'?v:fmt(v)}</div>
          </div>
        ))}
      </div>
      {/* رسم بياني */}
      <div style={{background:'#ffffff',borderRadius:16,padding:20,border:'1px solid #d9e2f2'}}>
        <div style={{color:'#fff',fontSize:14,fontWeight:700,marginBottom:14}}>📊 المبيعات والأرباح — آخر 14 يوم</div>
        <ResponsiveContainer width="100%" height={220}>
          <LineChart data={days}>
            <CartesianGrid strokeDasharray="3 3" stroke="#d9e2f2"/>
            <XAxis dataKey="name" tick={{fill:'#64748b',fontSize:10}}/>
            <YAxis tick={{fill:'#64748b',fontSize:10}}/>
            <Tooltip contentStyle={{color:'#0f172a',fontFamily:'Cairo'}} formatter={v=>fmt(v)}/>
            <Legend/>
            <Line type="monotone" dataKey="مبيعات" stroke="#10b981" strokeWidth={2} dot={false}/>
            <Line type="monotone" dataKey="تكلفة"  stroke="#ef4444" strokeWidth={2} dot={false}/>
            <Line type="monotone" dataKey="ربح"    stroke="#F5C800" strokeWidth={2} dot={false}/>
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
