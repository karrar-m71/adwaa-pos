import { useState, useEffect } from 'react';
import { collection, onSnapshot } from 'firebase/firestore';
import { db } from '../../firebase';
import jsPDF from 'jspdf';

const fmt = n=>(n||0).toLocaleString('ar-IQ')+' د.ع';

export default function StockShortage({ user }) {
  const [products,   setProducts]   = useState([]);
  const [purchases,  setPurchases]  = useState([]);
  const [catFilter,  setCatFilter]  = useState('الكل');
  const [search,     setSearch]     = useState('');
  const [showZero,   setShowZero]   = useState(false);

  useEffect(()=>{
    const us=[
      onSnapshot(collection(db,'pos_products'),  s=>setProducts(s.docs.map(d=>({...d.data(),id:d.id})))),
      onSnapshot(collection(db,'pos_purchases'), s=>setPurchases(s.docs.map(d=>({...d.data(),id:d.id})))),
    ];
    return()=>us.forEach(u=>u());
  },[]);

  const cats=['الكل',...new Set(products.map(p=>p.cat).filter(Boolean))];

  // المواد الناقصة
  const shortItems=products.filter(p=>{
    const mCat=catFilter==='الكل'||p.cat===catFilter;
    const mSearch=!search||p.name?.includes(search);
    const isShort=(p.stock||0)<(p.minStock||5);
    const isZero=(p.stock||0)===0;
    if(showZero)return isZero&&mCat&&mSearch;
    return isShort&&mCat&&mSearch;
  }).sort((a,b)=>(a.stock||0)-(b.stock||0));

  // آخر شراء لكل مادة
  const lastPurchase={};
  purchases.forEach(purch=>{(purch.items||[]).forEach(it=>{if(!lastPurchase[it.id]||new Date(purch.createdAt)>new Date(lastPurchase[it.id].date))lastPurchase[it.id]={date:purch.dateISO||purch.date,supplier:purch.supplier,price:it.buyPrice};});});

  const totalShortValue=shortItems.reduce((s,p)=>s+Math.max(0,(p.minStock||5)-(p.stock||0))*(p.buyPrice||0),0);

  const print=()=>{
    const doc2=new jsPDF({orientation:'p',unit:'mm',format:'a4'});
    doc2.setFont('helvetica','bold');
    doc2.setFontSize(14);doc2.text('Adwaa Al-Madina — Stock Shortage Report',105,15,{align:'center'});
    doc2.setFontSize(9);doc2.setFont('helvetica','normal');
    doc2.text(`${shortItems.length} items need reordering | Required Value: ${totalShortValue.toLocaleString()} IQD`,14,23);
    doc2.line(14,26,196,26);
    doc2.setFont('helvetica','bold');
    ['Item','Category','Current','Min','Needed','Buy Price','Value'].forEach((h,i)=>doc2.text(h,[14,60,90,110,130,150,170][i],33));
    doc2.line(14,35,196,35);doc2.setFont('helvetica','normal');
    let y=42;
    shortItems.forEach((p,i)=>{
      if(y>275){doc2.addPage();y=20;}
      const needed=Math.max(0,(p.minStock||5)-(p.stock||0));
      const name=p.name?.length>25?p.name.slice(0,25)+'...':p.name;
      [name,p.cat||'—',String(p.stock||0),String(p.minStock||5),String(needed),(p.buyPrice||0).toLocaleString(),(needed*(p.buyPrice||0)).toLocaleString()].forEach((v,j)=>doc2.text(v,[14,60,90,110,130,150,170][j],y));
      y+=6;
    });
    doc2.save(`Stock-Shortage.pdf`);
  };

  return(
    <div style={{padding:24,fontFamily:"'Cairo'",direction:'rtl'}}>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:20}}>
        <div>
          <div style={{color:'#fff',fontSize:22,fontWeight:800}}>❗ نواقص المخزن</div>
          <div style={{color:'#64748b',fontSize:13}}>مواد تحتاج إعادة تموين</div>
        </div>
        <button onClick={print} style={{background:'#3b82f6',color:'#fff',border:'none',borderRadius:12,padding:'10px 20px',fontWeight:700,cursor:'pointer',fontFamily:"'Cairo'",fontSize:13}}>🖨️ طباعة قائمة الطلب</button>
      </div>

      <div style={{display:'flex',gap:10,marginBottom:16,flexWrap:'wrap',alignItems:'center'}}>
        <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="🔍 ابحث..."
          style={{flex:1,minWidth:180,color:'#0f172a',fontSize:13,outline:'none'}}/>
        {cats.map(c=><button key={c} onClick={()=>setCatFilter(c)} style={{background:catFilter===c?'#ef4444':'#ffffff',color:catFilter===c?'#fff':'#64748b',border:`1px solid ${catFilter===c?'#ef4444':'#cdd8ec'}`,borderRadius:20,padding:'6px 12px',fontSize:12,cursor:'pointer',fontWeight:catFilter===c?700:400}}>{c}</button>)}
        <label style={{display:'flex',gap:8,alignItems:'center',cursor:'pointer',marginRight:'auto'}}>
          <div onClick={()=>setShowZero(!showZero)} style={{width:36,height:20,borderRadius:10,background:showZero?'#ef4444':'#cdd8ec',position:'relative',cursor:'pointer',transition:'background .2s'}}>
            <div style={{position:'absolute',top:2,left:showZero?18:2,width:16,height:16,borderRadius:8,background:'#fff',transition:'left .2s'}}/>
          </div>
          <span style={{color:'#64748b',fontSize:12}}>نفد المخزون فقط</span>
        </label>
      </div>

      <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:14,marginBottom:20}}>
        {[['❗','مواد تحتاج تموين',shortItems.length,'#ef4444'],['⛔','نفد المخزون',products.filter(p=>(p.stock||0)===0).length,'#ef4444'],['💰','قيمة المطلوب',fmt(totalShortValue),'#f59e0b']].map(([icon,label,val,color])=>(
          <div key={label} style={{background:'#ffffff',borderRadius:14,padding:16,border:`1px solid ${color}33`,textAlign:'center'}}>
            <div style={{fontSize:24,marginBottom:6}}>{icon}</div><div style={{color:'#64748b',fontSize:11,marginBottom:4}}>{label}</div><div style={{color,fontSize:18,fontWeight:800}}>{val}</div>
          </div>
        ))}
      </div>

      {shortItems.length===0
        ?<div style={{background:'#10b98111',border:'1px solid #10b98133',borderRadius:16,padding:60,textAlign:'center'}}>
          <div style={{fontSize:48,marginBottom:12}}>✅</div>
          <div style={{color:'#10b981',fontSize:16,fontWeight:700}}>المخزون بمستوى جيد!</div>
        </div>
        :<div style={{background:'#ffffff',borderRadius:16,border:'1px solid #ef444433',overflow:'hidden'}}>
          <div style={{display:'grid',gridTemplateColumns:'2fr 1fr 1fr 1fr 1fr 1fr 1fr',padding:'12px 20px',background:'#f8fbff',borderBottom:'1px solid #e2e8f7'}}>
            {['المادة','التصنيف','الحالي','الحد الأدنى','المطلوب','آخر مورد','قيمة المطلوب'].map(h=><div key={h} style={{color:'#64748b',fontSize:11,fontWeight:700}}>{h}</div>)}
          </div>
          {shortItems.map((p,i)=>{
            const needed=Math.max(0,(p.minStock||5)-(p.stock||0));
            const lp=lastPurchase[p.id];
            return(
              <div key={p.id} style={{display:'grid',gridTemplateColumns:'2fr 1fr 1fr 1fr 1fr 1fr 1fr',padding:'12px 20px',borderBottom:i<shortItems.length-1?'1px solid #ffffff':'none',alignItems:'center',background:(p.stock||0)===0?'#ef444415':'#ef444408'}}>
                <div style={{display:'flex',gap:8,alignItems:'center'}}>
                  <span style={{fontSize:18}}>{p.img||'📦'}</span>
                  <div>
                    <div style={{color:'#1e293b',fontSize:12,fontWeight:600}}>{p.name}</div>
                    {(p.stock||0)===0&&<span style={{background:'#ef444422',borderRadius:20,padding:'1px 6px',color:'#ef4444',fontSize:9,fontWeight:700}}>نفد</span>}
                  </div>
                </div>
                <div style={{color:'#666',fontSize:11}}>{p.cat}</div>
                <div style={{color:(p.stock||0)===0?'#ef4444':'#f59e0b',fontSize:14,fontWeight:900}}>{p.stock||0}</div>
                <div style={{color:'#64748b',fontSize:12}}>{p.minStock||5}</div>
                <div style={{color:'#ef4444',fontSize:13,fontWeight:800}}>{needed}</div>
                <div>
                  {lp?<div>
                    <div style={{color:'#1e293b',fontSize:10}}>{lp.supplier}</div>
                    <div style={{color:'#f59e0b',fontSize:9}}>{lp.date} • {fmt(lp.price)}</div>
                  </div>:<span style={{color:'#cdd8ec',fontSize:10}}>—</span>}
                </div>
                <div style={{color:'#ef4444',fontSize:12,fontWeight:700}}>{fmt(needed*(p.buyPrice||0))}</div>
              </div>
            );
          })}
          <div style={{display:'grid',gridTemplateColumns:'2fr 1fr 1fr 1fr 1fr 1fr 1fr',padding:'14px 20px',background:'#ffffff',borderTop:'2px solid #ef444433'}}>
            <div style={{color:'#1e293b',fontSize:13,fontWeight:800,gridColumn:'1/7'}}>الإجمالي ({shortItems.length} مادة)</div>
            <div style={{color:'#ef4444',fontSize:14,fontWeight:900}}>{fmt(totalShortValue)}</div>
          </div>
        </div>
      }
    </div>
  );
}
