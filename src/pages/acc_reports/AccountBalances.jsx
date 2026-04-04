import { useState, useEffect } from 'react';
import { collection, onSnapshot } from 'firebase/firestore';
import { db } from '../../firebase';
import jsPDF from 'jspdf';
const fmt=n=>(n||0).toLocaleString('ar-IQ')+' د.ع';
const toNum=v=>Number(v||0)||0;
export default function AccountBalances({user}){
  const [customers,setCustomers]=useState([]);
  const [suppliers,setSuppliers]=useState([]);
  const [filter,setFilter]=useState('all');
  const [search,setSearch]=useState('');
  const [tab,setTab]=useState('customers');
  const [rate] = useState(()=>{
    try{ return Number(JSON.parse(localStorage.getItem('adwaa_settings')||'{}').exchangeRate||1480)||1480; }
    catch{ return 1480; }
  });
  useEffect(()=>{
    const us=[
      onSnapshot(collection(db,'pos_customers'),s=>setCustomers(s.docs.map(d=>({...d.data(),id:d.id})))),
      onSnapshot(collection(db,'pos_suppliers'),s=>setSuppliers(s.docs.map(d=>({...d.data(),id:d.id})))),
    ];
    return()=>us.forEach(u=>u());
  },[]);
  const getBal=(party)=>{
    const debtIQD = toNum(party?.debtByCurrency?.IQD ?? party?.debtByCurrency?.iqd ?? party?.debt ?? 0);
    const debtUSD = toNum(party?.debtByCurrency?.USD ?? party?.debtByCurrency?.usd ?? 0);
    const eq = toNum(party?.debt ?? (debtIQD + debtUSD * rate));
    return{debit:eq,credit:0,balance:eq,debtIQD,debtUSD};
  };
  const parties=tab==='customers'?customers:suppliers;
  const withBal=parties.map(p=>({...p,...getBal(p)}))
    .filter(p=>filter==='all'||(filter==='debit'&&p.balance>0)||(filter==='credit'&&p.balance<0)||(filter==='zero'&&p.balance===0))
    .filter(p=>!search||p.name?.includes(search)||p.phone?.includes(search));
  const totD=withBal.reduce((s,p)=>s+(p.balance>0?p.balance:0),0);
  const totC=withBal.reduce((s,p)=>s+(p.balance<0?Math.abs(p.balance):0),0);
  const print=()=>{
    const d=new jsPDF({orientation:'p',unit:'mm',format:'a4'});
    d.setFont('helvetica','bold');d.setFontSize(13);d.text(`Adwaa Al-Madina — Account Balances (${tab==='customers'?'Customers':'Suppliers'})`,105,15,{align:'center'});
    d.setFontSize(9);d.setFont('helvetica','normal');d.line(14,19,196,19);
    ['Name','Phone','Debt IQD','Debt USD','Balance IQD'].forEach((h,i)=>d.text(h,[14,60,110,145,172][i],25));
    d.line(14,27,196,27);let y=34;
    withBal.forEach(p=>{
      if(y>275){d.addPage();y=20;}
      d.text(p.name||'',14,y);d.text(p.phone||'',60,y);
      d.text((p.debtIQD||0).toLocaleString(),110,y);
      d.text((p.debtUSD||0).toFixed(2),145,y);
      d.text((p.balance||0).toLocaleString(),172,y);y+=6;
    });
    d.line(14,y,196,y);y+=5;d.setFont('helvetica','bold');
    d.text(`Net Receivable: ${(totD-totC).toLocaleString()} IQD`,14,y);
    d.save('AccountBalances.pdf');
  };
  return(
    <div style={{padding:24,fontFamily:"'Cairo'",direction:'rtl'}}>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:20}}>
        <div style={{color:'#fff',fontSize:22,fontWeight:800}}>⚖️ أرصدة الحسابات</div>
        <button onClick={print} style={{background:'#3b82f622',border:'1px solid #3b82f644',borderRadius:12,padding:'10px 20px',color:'#3b82f6',cursor:'pointer',fontWeight:700}}>🖨️ طباعة</button>
      </div>
      <div style={{display:'flex',gap:10,marginBottom:16}}>
        {[['customers','👥 الزبائن'],['suppliers','🏭 الموردون']].map(([v,l])=>(
          <button key={v} onClick={()=>setTab(v)} style={{background:tab===v?'#3b82f6':'#ffffff',color:tab===v?'#fff':'#64748b',border:`1px solid ${tab===v?'#3b82f6':'#cdd8ec'}`,borderRadius:20,padding:'8px 20px',cursor:'pointer',fontWeight:700,fontSize:13}}>{l}</button>
        ))}
      </div>
      <div style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:14,marginBottom:16}}>
        {[['👥','الأطراف',parties.length,'#3b82f6'],['🔴','إجمالي المدينين',fmt(totD),'#ef4444'],['🟢','إجمالي الدائنين',fmt(totC),'#10b981'],['⚖️','صافي المطلوب',fmt(totD-totC),'#F5C800']].map(([icon,label,val,color])=>(
          <div key={label} style={{background:'#ffffff',borderRadius:14,padding:14,border:'1px solid #d9e2f2',textAlign:'center'}}>
            <div style={{fontSize:22,marginBottom:4}}>{icon}</div><div style={{color:'#64748b',fontSize:11,marginBottom:4}}>{label}</div><div style={{color,fontSize:14,fontWeight:800}}>{val}</div>
          </div>
        ))}
      </div>
      <div style={{display:'flex',gap:10,marginBottom:14}}>
        <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="🔍 ابحث..." style={{flex:1,color:'#0f172a',fontSize:13,outline:'none'}}/>
        {[['all','الكل'],['debit','مدين 🔴'],['credit','دائن 🟢'],['zero','مسوّى ✅']].map(([v,l])=>(
          <button key={v} onClick={()=>setFilter(v)} style={{background:filter===v?'#F5C800':'#ffffff',color:filter===v?'#000':'#64748b',border:`1px solid ${filter===v?'#F5C800':'#cdd8ec'}`,borderRadius:20,padding:'8px 14px',fontSize:12,cursor:'pointer',fontWeight:filter===v?700:400}}>{l}</button>
        ))}
      </div>
      <div style={{background:'#ffffff',borderRadius:16,border:'1px solid #d9e2f2',overflow:'hidden'}}>
        <div style={{display:'grid',gridTemplateColumns:'2fr 1fr 1fr 1fr 1fr',padding:'11px 20px',background:'#f8fbff',borderBottom:'1px solid #e2e8f7'}}>
          {['الاسم','الهاتف','دين IQD','دين USD','الرصيد IQD'].map(h=><div key={h} style={{color:'#64748b',fontSize:11,fontWeight:700}}>{h}</div>)}
        </div>
        {withBal.length===0?<div style={{color:'#cdd8ec',textAlign:'center',padding:60}}>لا توجد نتائج</div>
          :withBal.map((p,i)=>(
          <div key={p.id} style={{display:'grid',gridTemplateColumns:'2fr 1fr 1fr 1fr 1fr',padding:'11px 20px',borderBottom:i<withBal.length-1?'1px solid #ffffff':'none',alignItems:'center',background:i%2?'#f8fbff':'transparent'}}>
            <div style={{display:'flex',gap:8,alignItems:'center'}}>
              <div style={{width:8,height:8,borderRadius:4,background:p.balance>0?'#ef4444':p.balance<0?'#10b981':'#64748b'}}/>
              <div><div style={{color:'#1e293b',fontSize:13,fontWeight:600}}>{p.name}</div><div style={{color:'#475569',fontSize:10}}>{p.phone||'—'}</div></div>
            </div>
            <div style={{color:'#64748b',fontSize:12}}>{p.phone||'—'}</div>
            <div style={{color:'#ef4444',fontSize:12,fontWeight:700}}>{fmt(p.debtIQD)}</div>
            <div style={{color:'#3b82f6',fontSize:12,fontWeight:700}}>${(p.debtUSD||0).toFixed(2)}</div>
            <span style={{background:p.balance>0?'#ef444422':p.balance<0?'#10b98122':'#33333322',borderRadius:8,padding:'3px 10px',color:p.balance>0?'#ef4444':p.balance<0?'#10b981':'#64748b',fontSize:12,fontWeight:800}}>
              {p.balance>0?`${fmt(p.balance)} م`:p.balance<0?`${fmt(Math.abs(p.balance))} ئ`:'مسوّى ✅'}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
