import { useState, useEffect } from 'react';
import { collection, onSnapshot } from 'firebase/firestore';
import { db } from '../../firebase';
import jsPDF from 'jspdf';
const fmt=n=>(n||0).toLocaleString('ar-IQ')+' د.ع';
const fmtUsd=n=>`$${(Number(n||0)).toFixed(2)}`;
const toNum=v=>Number(v||0)||0;
export default function CustomerDebts({user}){
  const [list,setList]=useState([]);
  const [search,setSearch]=useState('');
  const [sort,setSort]=useState('debt');
  const [rate] = useState(()=>{
    try{ return Number(JSON.parse(localStorage.getItem('adwaa_settings')||'{}').exchangeRate||1480)||1480; }
    catch{ return 1480; }
  });
  useEffect(()=>{ const u=onSnapshot(collection(db,'pos_customers'),s=>setList(s.docs.map(d=>({...d.data(),id:d.id})))); return()=>u(); },[]);
  const enrich=(p)=>{
    const iqd=toNum(p?.debtByCurrency?.IQD ?? p?.debtByCurrency?.iqd ?? p?.debt ?? 0);
    const usd=toNum(p?.debtByCurrency?.USD ?? p?.debtByCurrency?.usd ?? 0);
    return {...p,debtIQD:iqd,debtUSD:usd,debtEqIQD:iqd + (usd*rate)};
  };
  const withDebt=list.map(enrich).filter(p=>(p.debtIQD||0)>0 || (p.debtUSD||0)>0).filter(p=>!search||p.name?.includes(search)||p.phone?.includes(search));
  const sorted=[...withDebt].sort((a,b)=>sort==='debt'?(b.debtEqIQD||0)-(a.debtEqIQD||0):a.name?.localeCompare(b.name));
  const totalIQD=sorted.reduce((s,p)=>s+(p.debtIQD||0),0);
  const totalUSD=sorted.reduce((s,p)=>s+(p.debtUSD||0),0);
  const print=()=>{
    const d=new jsPDF({orientation:'p',unit:'mm',format:'a4'});
    d.setFont('helvetica','bold');d.setFontSize(14);d.text('Adwaa Al-Madina — Customer Debts',105,15,{align:'center'});
    d.setFontSize(9);d.setFont('helvetica','normal');d.line(14,19,196,19);
    ['Name','Phone','Debt IQD','Debt USD'].forEach((h,i)=>d.text(h,[14,70,130,170][i],25));d.line(14,27,196,27);
    let y=34;sorted.forEach(p=>{if(y>275){d.addPage();y=20;}d.text(p.name||'',14,y);d.text(p.phone||'',70,y);d.text((p.debtIQD||0).toLocaleString(),130,y);d.text((p.debtUSD||0).toFixed(2),170,y);y+=6;});
    d.line(14,y,196,y);y+=5;d.setFont('helvetica','bold');d.text(`Total: ${totalIQD.toLocaleString()} IQD + ${totalUSD.toFixed(2)} USD`,14,y);d.save('CustomerDebts.pdf');
  };
  return(
    <div style={{padding:24,fontFamily:"'Cairo'",direction:'rtl'}}>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:20}}>
        <div><div style={{color:'#fff',fontSize:22,fontWeight:800}}>👥 ديون الزبائن</div><div style={{color:'#64748b',fontSize:13}}>{sorted.length} زبون مدين — {fmt(totalIQD)} + {fmtUsd(totalUSD)}</div></div>
        <button onClick={print} style={{background:'#3b82f622',border:'1px solid #3b82f644',borderRadius:12,padding:'10px 20px',color:'#3b82f6',cursor:'pointer',fontWeight:700}}>🖨️ طباعة</button>
      </div>
      <div style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:14,marginBottom:16}}>
        {[['👥','عدد المدينين',sorted.length,'#3b82f6'],['💰','إجمالي الديون (IQD)',fmt(totalIQD),'#ef4444'],['💵','إجمالي الديون (USD)',fmtUsd(totalUSD),'#f59e0b'],['✅','بدون ديون',list.filter(p=>!toNum(p.debtByCurrency?.IQD??p.debt??0)&&!toNum(p.debtByCurrency?.USD)).length,'#10b981']].map(([icon,label,val,color])=>(
          <div key={label} style={{background:'#ffffff',borderRadius:14,padding:16,border:'1px solid #d9e2f2',textAlign:'center'}}>
            <div style={{fontSize:22,marginBottom:4}}>{icon}</div><div style={{color:'#64748b',fontSize:11,marginBottom:4}}>{label}</div><div style={{color,fontSize:16,fontWeight:800}}>{val}</div>
          </div>
        ))}
      </div>
      <div style={{display:'flex',gap:10,marginBottom:14}}>
        <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="🔍 ابحث..." style={{flex:1,color:'#0f172a',fontSize:13,outline:'none'}}/>
        {[['debt','ترتيب بالدين'],['name','ترتيب بالاسم']].map(([v,l])=>(
          <button key={v} onClick={()=>setSort(v)} style={{background:sort===v?'#F5C800':'#ffffff',color:sort===v?'#000':'#64748b',border:`1px solid ${sort===v?'#F5C800':'#cdd8ec'}`,borderRadius:20,padding:'8px 14px',fontSize:12,cursor:'pointer',fontWeight:sort===v?700:400}}>{l}</button>
        ))}
      </div>
      <div style={{background:'#ffffff',borderRadius:16,border:'1px solid #d9e2f2',overflow:'hidden'}}>
        <div style={{display:'grid',gridTemplateColumns:'2fr 1fr 1fr 1fr 1fr',padding:'11px 20px',background:'#f8fbff',borderBottom:'1px solid #e2e8f7'}}>
          {['الاسم','الهاتف','دين IQD','دين USD','نسبة من الإجمالي'].map(h=><div key={h} style={{color:'#64748b',fontSize:11,fontWeight:700}}>{h}</div>)}
        </div>
        {sorted.length===0?<div style={{color:'#10b981',textAlign:'center',padding:60,fontSize:15}}>✅ لا توجد ديون على الزبائن!</div>
          :sorted.map((p,i)=>(
          <div key={p.id} style={{display:'grid',gridTemplateColumns:'2fr 1fr 1fr 1fr 1fr',padding:'11px 20px',borderBottom:i<sorted.length-1?'1px solid #ffffff':'none',alignItems:'center',background:i%2?'#f8fbff':'transparent'}}>
            <div><div style={{color:'#1e293b',fontSize:13,fontWeight:600}}>{p.name}</div><div style={{color:'#475569',fontSize:10}}>{p.address||'—'}</div></div>
            <div style={{color:'#64748b',fontSize:12}}>{p.phone||'—'}</div>
            <div style={{color:'#ef4444',fontSize:14,fontWeight:800}}>{fmt(p.debtIQD)}</div>
            <div style={{color:'#f59e0b',fontSize:14,fontWeight:800}}>{fmtUsd(p.debtUSD)}</div>
            <div>
              <div style={{height:6,background:'#d9e2f2',borderRadius:3,overflow:'hidden',marginBottom:2}}>
                <div style={{width:`${Math.min(100,(p.debtEqIQD/(sorted.reduce((s,x)=>s+(x.debtEqIQD||0),0)||1))*100)}%`,height:'100%',background:'#ef4444',borderRadius:3}}/>
              </div>
              <div style={{color:'#475569',fontSize:10}}>{((p.debtEqIQD/(sorted.reduce((s,x)=>s+(x.debtEqIQD||0),0)||1))*100).toFixed(1)}%</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
