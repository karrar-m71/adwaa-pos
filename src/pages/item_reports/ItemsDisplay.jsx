import { useState, useEffect } from 'react';
import { collection, onSnapshot } from 'firebase/firestore';
import { db } from '../../firebase';
import jsPDF from 'jspdf';

const fmt = n=>(n||0).toLocaleString('ar-IQ')+' د.ع';

export default function ItemsDisplay({ user }) {
  const [products, setProducts] = useState([]);
  const [packages, setPackages] = useState([]);
  const [search,   setSearch]   = useState('');
  const [catFilter,setCatFilter]= useState('الكل');
  const [viewMode, setViewMode] = useState('table'); // table | grid
  const [showPkg,  setShowPkg]  = useState(false);

  useEffect(()=>{
    const u1=onSnapshot(collection(db,'pos_products'), s=>setProducts(s.docs.map(d=>({...d.data(),id:d.id}))));
    const u2=onSnapshot(collection(db,'pos_packages'), s=>setPackages(s.docs.map(d=>({...d.data(),id:d.id}))));
    return()=>{u1();u2();};
  },[]);

  const cats=['الكل',...new Set(products.map(p=>p.cat).filter(Boolean))];
  const filtered=products.filter(p=>{
    const mS=!search||p.name?.includes(search)||p.barcode?.includes(search);
    const mC=catFilter==='الكل'||p.cat===catFilter;
    return mS&&mC;
  });

  const inventoryValue=filtered.reduce((s,p)=>s+(p.stock||0)*(p.buyPrice||0),0);
  const inventorySell =filtered.reduce((s,p)=>s+(p.stock||0)*(p.sellPrice||0),0);

  const print=()=>{
    const doc2=new jsPDF({orientation:'l',unit:'mm',format:'a4'});
    doc2.setFont('helvetica','bold');
    doc2.setFontSize(14);doc2.text('Adwaa Al-Madina — Items Report',148,15,{align:'center'});
    doc2.setFontSize(9);doc2.setFont('helvetica','normal');
    doc2.text(`Total: ${filtered.length} items | Stock Value: ${inventoryValue.toLocaleString()} IQD`,14,23);
    doc2.line(14,26,283,26);
    doc2.setFont('helvetica','bold');
    doc2.text('Item',14,33);doc2.text('Barcode',80,33);doc2.text('Category',110,33);
    doc2.text('Buy',145,33);doc2.text('Sell',165,33);doc2.text('Wholesale',190,33);doc2.text('Stock',220,33);doc2.text('Value',245,33);
    doc2.line(14,35,283,35);
    doc2.setFont('helvetica','normal');
    let y=42;
    filtered.forEach((p,i)=>{
      if(y>185){doc2.addPage();y=20;}
      const name=p.name?.length>28?p.name.slice(0,28)+'...':p.name;
      doc2.text(name,14,y);doc2.text(p.barcode||'—',80,y);doc2.text(p.cat||'—',110,y);
      doc2.text((p.buyPrice||0).toLocaleString(),145,y);doc2.text((p.sellPrice||0).toLocaleString(),165,y);
      doc2.text((p.wholesalePrice||0).toLocaleString(),190,y);doc2.text(String(p.stock||0),220,y);
      doc2.text(((p.stock||0)*(p.buyPrice||0)).toLocaleString(),245,y);
      y+=6;
    });
    doc2.save(`Items-Report.pdf`);
  };

  return(
    <div style={{padding:24,fontFamily:"'Cairo'",direction:'rtl'}}>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:20}}>
        <div>
          <div style={{color:'#fff',fontSize:22,fontWeight:800}}>📋 عرض المواد</div>
          <div style={{color:'#64748b',fontSize:13}}>{filtered.length} من {products.length} مادة</div>
        </div>
        <button onClick={print} style={{background:'#3b82f6',color:'#fff',border:'none',borderRadius:12,padding:'10px 20px',fontWeight:700,cursor:'pointer',fontFamily:"'Cairo'",fontSize:13}}>🖨️ طباعة PDF</button>
      </div>

      {/* ملخص */}
      <div style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:14,marginBottom:20}}>
        {[['📦','إجمالي الأصناف',filtered.length,'#3b82f6'],['💰','قيمة الشراء',fmt(inventoryValue),'#f59e0b'],['📈','قيمة البيع',fmt(inventorySell),'#10b981'],['⚠️','تحت الحد',filtered.filter(p=>(p.stock||0)<=(p.minStock||5)).length,'#ef4444']].map(([icon,label,val,color])=>(
          <div key={label} style={{background:'#ffffff',borderRadius:14,padding:16,border:'1px solid #d9e2f2',textAlign:'center'}}>
            <div style={{fontSize:24,marginBottom:6}}>{icon}</div>
            <div style={{color:'#64748b',fontSize:11,marginBottom:4}}>{label}</div>
            <div style={{color,fontSize:16,fontWeight:800}}>{val}</div>
          </div>
        ))}
      </div>

      {/* أدوات */}
      <div style={{display:'flex',gap:10,marginBottom:16,flexWrap:'wrap',alignItems:'center'}}>
        <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="🔍 ابحث بالاسم أو الباركود..."
          style={{flex:1,minWidth:200,color:'#0f172a',fontSize:13,outline:'none'}}/>
        {cats.map(c=>(
          <button key={c} onClick={()=>setCatFilter(c)} style={{background:catFilter===c?'#F5C800':'#ffffff',color:catFilter===c?'#000':'#64748b',border:`1px solid ${catFilter===c?'#F5C800':'#cdd8ec'}`,borderRadius:20,padding:'7px 14px',fontSize:12,cursor:'pointer',fontWeight:catFilter===c?700:400}}>{c}</button>
        ))}
        <div style={{display:'flex',gap:6,marginRight:'auto'}}>
          {[['table','☰'],['grid','⊞']].map(([v,l])=>(
            <button key={v} onClick={()=>setViewMode(v)} style={{background:viewMode===v?'#F5C800':'#ffffff',color:viewMode===v?'#000':'#64748b',border:`1px solid ${viewMode===v?'#F5C800':'#cdd8ec'}`,borderRadius:8,padding:'7px 12px',fontSize:14,cursor:'pointer'}}>{l}</button>
          ))}
        </div>
        <label style={{display:'flex',gap:8,alignItems:'center',cursor:'pointer'}}>
          <div onClick={()=>setShowPkg(!showPkg)} style={{width:36,height:20,borderRadius:10,background:showPkg?'#a78bfa':'#cdd8ec',position:'relative',cursor:'pointer',transition:'background .2s'}}>
            <div style={{position:'absolute',top:2,left:showPkg?18:2,width:16,height:16,borderRadius:8,background:'#fff',transition:'left .2s'}}/>
          </div>
          <span style={{color:'#64748b',fontSize:12}}>عرض التعبئة</span>
        </label>
      </div>

      {/* جدول */}
      {viewMode==='table'&&(
        <div style={{background:'#ffffff',borderRadius:16,border:'1px solid #d9e2f2',overflow:'hidden'}}>
          <div style={{display:'grid',gridTemplateColumns:`2.5fr 1fr 1fr 1fr ${showPkg?'1fr ':''} 1fr 1fr 1fr`,padding:'12px 20px',background:'#f8fbff',borderBottom:'1px solid #e2e8f7'}}>
            {['المادة','الباركود','التصنيف','سعر الشراء',showPkg&&'سعر التعبئة','سعر البيع','سعر الجملة','المخزون'].filter(Boolean).map(h=>(
              <div key={h} style={{color:'#64748b',fontSize:11,fontWeight:700}}>{h}</div>
            ))}
          </div>
          {filtered.length===0
            ?<div style={{color:'#cdd8ec',textAlign:'center',padding:60}}>لا توجد مواد</div>
            :filtered.map((p,i)=>{
              const pkg=packages.find(pk=>pk.id===p.packageTypeId);
              return(
                <div key={p.id} style={{display:'grid',gridTemplateColumns:`2.5fr 1fr 1fr 1fr ${showPkg?'1fr ':''}1fr 1fr 1fr`,padding:'11px 20px',borderBottom:i<filtered.length-1?'1px solid #ffffff':'none',alignItems:'center',background:(p.stock||0)<=(p.minStock||5)?'#ef444408':'transparent'}}>
                  <div style={{display:'flex',gap:8,alignItems:'center'}}>
                    <span style={{fontSize:18}}>{p.img||'📦'}</span>
                    <div>
                      <div style={{color:'#1e293b',fontSize:12,fontWeight:600}}>{p.name}</div>
                      {p.hasPackage&&<span style={{background:'#a78bfa22',borderRadius:20,padding:'1px 6px',color:'#a78bfa',fontSize:9,fontWeight:700}}>معبأ</span>}
                    </div>
                  </div>
                  <div style={{color:'#475569',fontSize:10,fontFamily:'monospace'}}>{p.barcode||'—'}</div>
                  <div style={{color:'#666',fontSize:11}}>{p.cat}</div>
                  <div style={{color:'#f59e0b',fontSize:12}}>{fmt(p.buyPrice)}</div>
                  {showPkg&&<div style={{color:'#a78bfa',fontSize:12}}>{p.hasPackage&&pkg?fmt(p.packagePrice||(p.sellPrice*(p.packageQty||pkg.qty))):'—'}</div>}
                  <div style={{color:'#F5C800',fontSize:12,fontWeight:700}}>{fmt(p.sellPrice)}</div>
                  <div style={{color:'#3b82f6',fontSize:12}}>{fmt(p.wholesalePrice)}</div>
                  <div>
                    <span style={{background:(p.stock||0)<=(p.minStock||5)?'#ef444422':'#10b98122',border:`1px solid ${(p.stock||0)<=(p.minStock||5)?'#ef444444':'#10b98144'}`,borderRadius:20,padding:'2px 8px',color:(p.stock||0)<=(p.minStock||5)?'#ef4444':'#10b981',fontSize:11,fontWeight:700}}>
                      {p.stock||0}
                    </span>
                  </div>
                </div>
              );
            })
          }
        </div>
      )}

      {/* شبكة */}
      {viewMode==='grid'&&(
        <div style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:12}}>
          {filtered.map(p=>{
            const pkg=packages.find(pk=>pk.id===p.packageTypeId);
            const low=(p.stock||0)<=(p.minStock||5);
            return(
              <div key={p.id} style={{background:'#ffffff',borderRadius:14,padding:16,border:`1px solid ${low?'#ef444433':'#d9e2f2'}`}}>
                <div style={{display:'flex',justifyContent:'space-between',marginBottom:10}}>
                  <span style={{fontSize:32}}>{p.img||'📦'}</span>
                  <span style={{background:low?'#ef444422':'#10b98122',border:`1px solid ${low?'#ef444444':'#10b98144'}`,borderRadius:20,padding:'3px 10px',color:low?'#ef4444':'#10b981',fontSize:12,fontWeight:800,alignSelf:'flex-start'}}>{p.stock||0}</span>
                </div>
                <div style={{color:'#1e293b',fontSize:13,fontWeight:700,marginBottom:4}}>{p.name}</div>
                <div style={{color:'#64748b',fontSize:10,marginBottom:8}}>{p.cat} {p.barcode&&`• ${p.barcode}`}</div>
                <div style={{display:'flex',justifyContent:'space-between'}}>
                  <div><div style={{color:'#475569',fontSize:9}}>شراء</div><div style={{color:'#f59e0b',fontSize:11,fontWeight:700}}>{fmt(p.buyPrice)}</div></div>
                  <div><div style={{color:'#475569',fontSize:9}}>بيع</div><div style={{color:'#F5C800',fontSize:12,fontWeight:800}}>{fmt(p.sellPrice)}</div></div>
                  {p.hasPackage&&pkg&&showPkg&&<div><div style={{color:'#475569',fontSize:9}}>تعبئة</div><div style={{color:'#a78bfa',fontSize:11,fontWeight:700}}>{fmt(p.packagePrice||(p.sellPrice*(p.packageQty||pkg.qty)))}</div></div>}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
