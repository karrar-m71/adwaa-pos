import { useState, useEffect } from 'react';
import { collection, onSnapshot, addDoc, updateDoc, doc } from 'firebase/firestore';
import { db } from '../../firebase';
import jsPDF from 'jspdf';

const fmt = n=>(n||0).toLocaleString('ar-IQ')+' د.ع';
const today=()=>new Date().toISOString().split('T')[0];
const nowStr=()=>new Date().toLocaleDateString('ar-IQ',{year:'numeric',month:'short',day:'numeric',hour:'2-digit',minute:'2-digit'});

export default function StockSettle({user}){
  const [products,   setProducts]   = useState([]);
  const [warehouses, setWarehouses] = useState([]);
  const [settles,    setSettles]    = useState([]);
  const [view,       setView]       = useState('list'); // list | new | detail
  const [selSettle,  setSelSettle]  = useState(null);
  const [saving,     setSaving]     = useState(false);
  const [search,     setSearch]     = useState('');

  // نموذج التسوية
  const [warehouse, setWarehouse] = useState('');
  const [date,      setDate]      = useState(today());
  const [notes,     setNotes]     = useState('');
  const [items,     setItems]     = useState([]); // { productId, productName, systemQty, actualQty, diff, unit }
  const [searchProd,setSearchProd]= useState('');
  const [step,      setStep]      = useState(1); // 1=اختيار المواد, 2=إدخال الكميات, 3=مراجعة

  useEffect(()=>{
    const u1=onSnapshot(collection(db,'pos_products'),  s=>setProducts(s.docs.map(d=>({...d.data(),id:d.id}))));
    const u2=onSnapshot(collection(db,'pos_warehouses'),s=>setWarehouses(s.docs.map(d=>({...d.data(),id:d.id}))));
    const u3=onSnapshot(collection(db,'pos_settlements'),s=>setSettles(s.docs.map(d=>({...d.data(),id:d.id})).sort((a,b)=>new Date(b.createdAt)-new Date(a.createdAt))));
    return()=>{u1();u2();u3();};
  },[]);

  const filteredProds=products.filter(p=>
    !searchProd||p.name?.includes(searchProd)||p.barcode?.includes(searchProd)
  );

  const addProduct=(p)=>{
    if(items.find(i=>i.productId===p.id))return;
    setItems(its=>[...its,{
      productId:p.id, productName:p.name, img:p.img,
      unit:p.unit||'قطعة', cat:p.cat,
      systemQty:p.stock||0, actualQty:p.stock||0, diff:0,
      buyPrice:p.buyPrice||0, sellPrice:p.sellPrice||0,
    }]);
    setSearchProd('');
  };

  const removeItem=(id)=>setItems(its=>its.filter(i=>i.productId!==id));

  const updateActual=(id,val)=>{
    const qty=Number(val);
    setItems(its=>its.map(i=>i.productId===id
      ?{...i,actualQty:qty,diff:qty-(i.systemQty||0)}
      :i
    ));
  };

  // إضافة كل المواد دفعة واحدة
  const addAllProducts=()=>{
    const existing=new Set(items.map(i=>i.productId));
    const toAdd=products.filter(p=>!existing.has(p.id));
    setItems(its=>[...its,...toAdd.map(p=>({
      productId:p.id, productName:p.name, img:p.img,
      unit:p.unit||'قطعة', cat:p.cat,
      systemQty:p.stock||0, actualQty:p.stock||0, diff:0,
      buyPrice:p.buyPrice||0, sellPrice:p.sellPrice||0,
    }))]);
  };

  const resetForm=()=>{setWarehouse('');setDate(today());setNotes('');setItems([]);setStep(1);setSearchProd('');};

  // إحصائيات التسوية
  const surplus=items.filter(i=>i.diff>0);
  const shortage=items.filter(i=>i.diff<0);
  const matched=items.filter(i=>i.diff===0);
  const totalDiffValue=items.reduce((s,i)=>s+(i.diff*i.buyPrice),0);

  const save=async()=>{
    if(items.length===0)return alert('لم تضف أي مواد للتسوية');
    const changed=items.filter(i=>i.diff!==0);
    setSaving(true);
    try{
      const settleNo='STL-'+Date.now().toString().slice(-6);
      const settle={
        settleNo, warehouse, date:nowStr(), dateISO:date, notes,
        items:items.map(i=>({...i})),
        changedCount:changed.length,
        surplusCount:surplus.length,
        shortageCount:shortage.length,
        totalDiffValue,
        addedBy:user.name,
        createdAt:new Date().toISOString(),
        status:'مكتملة',
      };
      await addDoc(collection(db,'pos_settlements'),settle);
      // تحديث المخزون للمواد التي تغيرت
      for(const item of changed){
        await updateDoc(doc(db,'pos_products',item.productId),{stock:item.actualQty});
      }
      resetForm();setView('list');
      alert(`✅ تم حفظ التسوية وتحديث ${changed.length} مادة`);
    }catch(e){console.log(e);alert('حدث خطأ!');}
    setSaving(false);
  };

  const printSettle=(s)=>{
    const doc2=new jsPDF({orientation:'p',unit:'mm',format:'a4'});
    doc2.setFont('helvetica','bold');
    doc2.setFontSize(16);doc2.text('Adwaa Al-Madina',105,15,{align:'center'});
    doc2.setFontSize(12);doc2.text('STOCK SETTLEMENT REPORT',105,23,{align:'center'});
    doc2.setFontSize(9);doc2.setFont('helvetica','normal');
    doc2.line(14,27,196,27);
    doc2.text(`No: ${s.settleNo}`,14,34);
    doc2.text(`Date: ${s.dateISO||s.date}`,80,34);
    doc2.text(`Warehouse: ${s.warehouse||'All'}`,14,40);
    doc2.text(`Added by: ${s.addedBy}`,140,40);
    doc2.line(14,43,196,43);
    // رأس الجدول
    doc2.setFont('helvetica','bold');
    doc2.text('Item',14,50);
    doc2.text('System',100,50);
    doc2.text('Actual',125,50);
    doc2.text('Diff',150,50);
    doc2.text('Value',170,50);
    doc2.line(14,53,196,53);
    doc2.setFont('helvetica','normal');
    let y=60;
    (s.items||[]).filter(i=>i.diff!==0).forEach((item,idx)=>{
      if(y>270){doc2.addPage();y=20;}
      const name=item.productName?.length>35?item.productName.slice(0,35)+'...':item.productName;
      doc2.text(name,14,y);
      doc2.text(String(item.systemQty),100,y);
      doc2.text(String(item.actualQty),125,y);
      const diff=item.diff>0?`+${item.diff}`:String(item.diff);
      doc2.setTextColor(item.diff>0?'0,128,0':'red');
      doc2.text(diff,150,y);
      doc2.setTextColor(0,0,0);
      doc2.text(`${(item.diff*item.buyPrice).toLocaleString()}`,170,y);
      y+=6;
      if(idx<s.items.filter(i=>i.diff!==0).length-1)doc2.line(14,y-3,196,y-3);
    });
    doc2.line(14,y,196,y);y+=8;
    doc2.setFont('helvetica','bold');
    doc2.text(`Surplus: ${s.surplusCount} items | Shortage: ${s.shortageCount} items`,14,y);y+=6;
    doc2.text(`Net Diff Value: ${s.totalDiffValue?.toLocaleString()} IQD`,14,y);
    if(s.notes){y+=6;doc2.setFont('helvetica','normal');doc2.text(`Notes: ${s.notes}`,14,y);}
    doc2.save(`${s.settleNo}.pdf`);
  };

  // ── تفاصيل تسوية ──────────────────────────────
  if(view==='detail'&&selSettle) return(
    <div style={{padding:24,fontFamily:"'Cairo'",direction:'rtl'}}>
      <div style={{display:'flex',alignItems:'center',gap:12,marginBottom:24}}>
        <button onClick={()=>{setView('list');setSelSettle(null);}}
          style={{background:'#ffffff',border:'1px solid #cdd8ec',borderRadius:10,padding:'8px 16px',color:'#F5C800',cursor:'pointer',fontFamily:"'Cairo'"}}>← رجوع</button>
        <div style={{color:'#fff',fontSize:20,fontWeight:800}}>تسوية #{selSettle.settleNo}</div>
      </div>

      {/* ملخص */}
      <div style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:14,marginBottom:20}}>
        {[
          ['📦','إجمالي المواد',selSettle.items?.length||0,'#3b82f6'],
          ['✅','مطابق',selSettle.items?.filter(i=>i.diff===0).length||0,'#10b981'],
          ['📈','فائض',selSettle.surplusCount||0,'#F5C800'],
          ['📉','نقص',selSettle.shortageCount||0,'#ef4444'],
        ].map(([icon,label,val,color])=>(
          <div key={label} style={{background:'#ffffff',borderRadius:14,padding:16,border:'1px solid #d9e2f2',textAlign:'center'}}>
            <div style={{fontSize:24,marginBottom:6}}>{icon}</div>
            <div style={{color:'#64748b',fontSize:11,marginBottom:4}}>{label}</div>
            <div style={{color,fontSize:20,fontWeight:800}}>{val}</div>
          </div>
        ))}
      </div>

      {/* معلومات التسوية */}
      <div style={{display:'grid',gridTemplateColumns:'2fr 1fr',gap:20,marginBottom:20}}>
        <div style={{background:'#ffffff',borderRadius:16,border:'1px solid #d9e2f2',overflow:'hidden'}}>
          <div style={{padding:'12px 20px',borderBottom:'1px solid #d9e2f2',background:'#f8fbff',display:'flex',justifyContent:'space-between'}}>
            <div style={{color:'#fff',fontSize:14,fontWeight:700}}>المواد المتغيرة ({selSettle.changedCount||0})</div>
            <div style={{color:selSettle.totalDiffValue>=0?'#10b981':'#ef4444',fontSize:13,fontWeight:700}}>
              فرق القيمة: {selSettle.totalDiffValue>=0?'+':''}{(selSettle.totalDiffValue||0).toLocaleString('ar-IQ')} د.ع
            </div>
          </div>
          <div style={{display:'grid',gridTemplateColumns:'2fr 1fr 1fr 1fr 1fr',padding:'10px 20px',background:'#ffffff',borderBottom:'1px solid #f8fbff'}}>
            {['المادة','نظام','فعلي','الفرق','قيمة الفرق'].map(h=>(
              <div key={h} style={{color:'#64748b',fontSize:11,fontWeight:700}}>{h}</div>
            ))}
          </div>
          {(selSettle.items||[]).filter(i=>i.diff!==0).length===0
            ?<div style={{color:'#10b981',textAlign:'center',padding:40,fontSize:15}}>✅ جميع المواد مطابقة!</div>
            :(selSettle.items||[]).filter(i=>i.diff!==0).map((item,i,arr)=>(
              <div key={item.productId} style={{display:'grid',gridTemplateColumns:'2fr 1fr 1fr 1fr 1fr',padding:'10px 20px',borderBottom:i<arr.length-1?'1px solid #ffffff':'none',alignItems:'center'}}>
                <div style={{display:'flex',gap:8,alignItems:'center'}}>
                  <span style={{fontSize:16}}>{item.img||'📦'}</span>
                  <div>
                    <div style={{color:'#1e293b',fontSize:12,fontWeight:600}}>{item.productName}</div>
                    <div style={{color:'#64748b',fontSize:10}}>{item.cat}</div>
                  </div>
                </div>
                <div style={{color:'#64748b',fontSize:13}}>{item.systemQty}</div>
                <div style={{color:'#1e293b',fontSize:13,fontWeight:700}}>{item.actualQty}</div>
                <div style={{color:item.diff>0?'#10b981':'#ef4444',fontSize:14,fontWeight:800}}>
                  {item.diff>0?'+':''}{item.diff}
                </div>
                <div style={{color:item.diff>0?'#10b981':'#ef4444',fontSize:12}}>
                  {item.diff>0?'+':''}{(item.diff*(item.buyPrice||0)).toLocaleString('ar-IQ')} د.ع
                </div>
              </div>
            ))
          }
        </div>

        <div>
          <div style={{background:'#ffffff',borderRadius:16,padding:20,border:'1px solid #d9e2f2',marginBottom:14}}>
            {[['التاريخ',selSettle.dateISO||selSettle.date],['المخزن',selSettle.warehouse||'الكل'],['أجراه',selSettle.addedBy],['الحالة',selSettle.status||'مكتملة'],selSettle.notes&&['ملاحظات',selSettle.notes]].filter(Boolean).map(([l,v])=>(
              <div key={l} style={{display:'flex',justifyContent:'space-between',padding:'8px 0',borderBottom:'1px solid #e2e8f7'}}>
                <span style={{color:'#64748b',fontSize:12}}>{l}</span>
                <span style={{color:'#1e293b',fontSize:13,fontWeight:600}}>{v}</span>
              </div>
            ))}
          </div>
          <button onClick={()=>printSettle(selSettle)}
            style={{width:'100%',background:'#3b82f6',color:'#fff',border:'none',borderRadius:12,padding:12,fontWeight:700,cursor:'pointer',fontFamily:"'Cairo'"}}>
            🖨️ طباعة تقرير التسوية
          </button>
        </div>
      </div>
    </div>
  );

  // ── نموذج تسوية جديدة ─────────────────────────
  if(view==='new') return(
    <div style={{padding:24,fontFamily:"'Cairo'",direction:'rtl'}}>
      <div style={{display:'flex',alignItems:'center',gap:12,marginBottom:20}}>
        <button onClick={()=>{resetForm();setView('list');}}
          style={{background:'#ffffff',border:'1px solid #cdd8ec',borderRadius:10,padding:'8px 16px',color:'#64748b',cursor:'pointer',fontFamily:"'Cairo'"}}>← إلغاء</button>
        <div style={{color:'#fff',fontSize:20,fontWeight:800}}>⚖️ تسوية مخزنية جديدة</div>
      </div>

      {/* شريط الخطوات */}
      <div style={{display:'flex',gap:0,marginBottom:24,background:'#ffffff',borderRadius:12,overflow:'hidden',border:'1px solid #d9e2f2'}}>
        {[['1','اختيار المواد'],['2','إدخال الكميات'],['3','المراجعة والحفظ']].map(([n,l])=>(
          <div key={n} onClick={()=>Number(n)<=step&&setStep(Number(n))}
            style={{flex:1,padding:'12px 0',textAlign:'center',background:step===Number(n)?'#F5C800':step>Number(n)?'#F5C80022':'transparent',cursor:Number(n)<=step?'pointer':'default',borderLeft:n!=='1'?'1px solid #d9e2f2':'none'}}>
            <div style={{color:step===Number(n)?'#000':step>Number(n)?'#F5C800':'#64748b',fontSize:13,fontWeight:700}}>{n}. {l}</div>
          </div>
        ))}
      </div>

      {/* ── الخطوة ١: اختيار المواد ── */}
      {step===1&&(
        <div>
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:16,marginBottom:16}}>
            <div>
              <label style={{color:'#64748b',fontSize:12,display:'block',marginBottom:6}}>المخزن (اختياري)</label>
              <select value={warehouse} onChange={e=>setWarehouse(e.target.value)}
                style={{width:'100%',color:'#0f172a',outline:'none'}}>
                <option value="">كل المخازن</option>
                {warehouses.map(w=><option key={w.id} value={w.name}>{w.name}</option>)}
              </select>
            </div>
            <div>
              <label style={{color:'#64748b',fontSize:12,display:'block',marginBottom:6}}>تاريخ التسوية</label>
              <input type="date" value={date} onChange={e=>setDate(e.target.value)}
                style={{width:'100%',color:'#0f172a',outline:'none'}}/>
            </div>
          </div>

          <div style={{display:'flex',gap:10,marginBottom:14}}>
            <input value={searchProd} onChange={e=>setSearchProd(e.target.value)} placeholder="🔍 ابحث عن مادة..."
              style={{flex:1,color:'#0f172a',fontSize:13,outline:'none'}}/>
            <button onClick={addAllProducts}
              style={{background:'#F5C80022',border:'1px solid #F5C80044',borderRadius:10,padding:'10px 16px',color:'#F5C800',cursor:'pointer',fontSize:12,fontWeight:700,whiteSpace:'nowrap'}}>
              + إضافة كل المواد ({products.length})
            </button>
          </div>

          <div style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:10,maxHeight:350,overflowY:'auto',marginBottom:16}}>
            {filteredProds.map(p=>{
              const added=items.find(i=>i.productId===p.id);
              return(
                <div key={p.id} onClick={()=>added?removeItem(p.id):addProduct(p)}
                  style={{background:'#ffffff',borderRadius:12,padding:12,border:`2px solid ${added?'#F5C800':'#d9e2f2'}`,cursor:'pointer',textAlign:'center',transition:'all .15s'}}>
                  <div style={{fontSize:24,marginBottom:4}}>{p.img||'📦'}</div>
                  <div style={{color:'#1e293b',fontSize:11,fontWeight:600,marginBottom:2}}>{p.name?.length>14?p.name.slice(0,14)+'...':p.name}</div>
                  <div style={{color:'#64748b',fontSize:10}}>نظام: {p.stock||0}</div>
                  {added&&<div style={{color:'#F5C800',fontSize:10,marginTop:4}}>✓ مضاف</div>}
                </div>
              );
            })}
          </div>

          <div style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}>
            <div style={{color:'#64748b',fontSize:13}}>تم اختيار {items.length} مادة</div>
            <button onClick={()=>items.length>0&&setStep(2)} disabled={items.length===0}
              style={{background:items.length===0?'#ffffff':'#F5C800',color:items.length===0?'#cdd8ec':'#000',border:'none',borderRadius:12,padding:'12px 24px',fontWeight:800,cursor:items.length===0?'not-allowed':'pointer',fontSize:14}}>
              التالي ←
            </button>
          </div>
        </div>
      )}

      {/* ── الخطوة ٢: إدخال الكميات الفعلية ── */}
      {step===2&&(
        <div>
          <div style={{background:'#F5C80011',border:'1px solid #F5C80033',borderRadius:12,padding:12,marginBottom:16,textAlign:'center'}}>
            <div style={{color:'#F5C800',fontSize:13,fontWeight:700}}>⚖️ أدخل الكميات الفعلية التي وجدتها في المخزن</div>
            <div style={{color:'#64748b',fontSize:11,marginTop:4}}>الكمية النظامية = ما يقول النظام / الكمية الفعلية = ما وجدت فعلياً</div>
          </div>

          <div style={{background:'#ffffff',borderRadius:16,border:'1px solid #d9e2f2',overflow:'hidden',marginBottom:16}}>
            <div style={{display:'grid',gridTemplateColumns:'2.5fr 1fr 1fr 1fr 1fr',padding:'12px 20px',background:'#f8fbff',borderBottom:'1px solid #e2e8f7'}}>
              {['المادة','الوحدة','كمية النظام','الكمية الفعلية','الفرق'].map(h=>(
                <div key={h} style={{color:'#64748b',fontSize:11,fontWeight:700}}>{h}</div>
              ))}
            </div>
            {items.map((item,i)=>(
              <div key={item.productId} style={{display:'grid',gridTemplateColumns:'2.5fr 1fr 1fr 1fr 1fr',padding:'10px 20px',borderBottom:i<items.length-1?'1px solid #ffffff':'none',alignItems:'center',background:item.diff!==0?item.diff>0?'#10b98108':'#ef444408':'transparent'}}>
                <div style={{display:'flex',gap:8,alignItems:'center'}}>
                  <span style={{fontSize:18}}>{item.img||'📦'}</span>
                  <div>
                    <div style={{color:'#1e293b',fontSize:12,fontWeight:600}}>{item.productName}</div>
                    <div style={{color:'#64748b',fontSize:10}}>{item.cat}</div>
                  </div>
                </div>
                <div style={{color:'#666',fontSize:12}}>{item.unit}</div>
                <div style={{color:'#64748b',fontSize:14,fontWeight:700}}>{item.systemQty}</div>
                <div>
                  <input
                    type="number"
                    value={item.actualQty}
                    onChange={e=>updateActual(item.productId,e.target.value)}
                    min={0}
                    style={{
                      width:80,
                      background:'#f8fbff',
                      border:`2px solid ${item.diff!==0?item.diff>0?'#10b981':'#ef4444':'#cdd8ec'}`,
                      borderRadius:8,
                      padding:'6px 10px',
                      color:'#fff',
                      fontSize:14,
                      fontWeight:700,
                      outline:'none',
                      textAlign:'center',
                    }}
                  />
                </div>
                <div style={{color:item.diff>0?'#10b981':item.diff<0?'#ef4444':'#64748b',fontSize:15,fontWeight:800}}>
                  {item.diff>0?`+${item.diff}`:item.diff===0?'—':item.diff}
                </div>
              </div>
            ))}
          </div>

          <div style={{display:'flex',justifyContent:'space-between'}}>
            <button onClick={()=>setStep(1)}
              style={{background:'#ffffff',border:'1px solid #cdd8ec',borderRadius:12,padding:'12px 24px',color:'#64748b',cursor:'pointer',fontSize:13}}>
              ← رجوع
            </button>
            <button onClick={()=>setStep(3)}
              style={{background:'#F5C800',color:'#000',border:'none',borderRadius:12,padding:'12px 24px',fontWeight:800,cursor:'pointer',fontSize:14}}>
              مراجعة التسوية ←
            </button>
          </div>
        </div>
      )}

      {/* ── الخطوة ٣: المراجعة والحفظ ── */}
      {step===3&&(
        <div>
          {/* إحصائيات */}
          <div style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:14,marginBottom:20}}>
            {[
              ['📦','إجمالي المواد',items.length,'#3b82f6'],
              ['✅','مطابقة',matched.length,'#10b981'],
              ['📈','فائض',surplus.length,'#F5C800'],
              ['📉','نقص',shortage.length,'#ef4444'],
            ].map(([icon,label,val,color])=>(
              <div key={label} style={{background:'#ffffff',borderRadius:14,padding:16,border:`1px solid ${color}33`,textAlign:'center'}}>
                <div style={{fontSize:28,marginBottom:6}}>{icon}</div>
                <div style={{color:'#64748b',fontSize:11,marginBottom:4}}>{label}</div>
                <div style={{color,fontSize:22,fontWeight:800}}>{val}</div>
              </div>
            ))}
          </div>

          {/* قيمة الفرق */}
          <div style={{background:'#ffffff',borderRadius:14,padding:16,border:`1px solid ${totalDiffValue>=0?'#10b98133':'#ef444433'}`,marginBottom:20,display:'flex',justifyContent:'space-between',alignItems:'center'}}>
            <div style={{color:'#64748b',fontSize:14}}>صافي قيمة الفرق (بسعر الشراء)</div>
            <div style={{color:totalDiffValue>=0?'#10b981':'#ef4444',fontSize:22,fontWeight:900}}>
              {totalDiffValue>=0?'+':''}{totalDiffValue.toLocaleString('ar-IQ')} د.ع
            </div>
          </div>

          {/* الفائض */}
          {surplus.length>0&&(
            <div style={{background:'#ffffff',borderRadius:14,border:'1px solid #10b98133',overflow:'hidden',marginBottom:14}}>
              <div style={{padding:'12px 20px',background:'#10b98111',borderBottom:'1px solid #10b98133',color:'#10b981',fontSize:13,fontWeight:700}}>
                📈 مواد فائضة ({surplus.length}) — سيُضاف للمخزون
              </div>
              {surplus.map((item,i)=>(
                <div key={item.productId} style={{display:'flex',justifyContent:'space-between',padding:'10px 20px',borderBottom:i<surplus.length-1?'1px solid #ffffff':'none',alignItems:'center'}}>
                  <div style={{display:'flex',gap:8,alignItems:'center'}}>
                    <span style={{fontSize:16}}>{item.img||'📦'}</span>
                    <span style={{color:'#1e293b',fontSize:13}}>{item.productName}</span>
                  </div>
                  <div style={{display:'flex',gap:16,alignItems:'center'}}>
                    <span style={{color:'#64748b',fontSize:12}}>{item.systemQty} → {item.actualQty}</span>
                    <span style={{color:'#10b981',fontSize:14,fontWeight:800}}>+{item.diff} {item.unit}</span>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* النقص */}
          {shortage.length>0&&(
            <div style={{background:'#ffffff',borderRadius:14,border:'1px solid #ef444433',overflow:'hidden',marginBottom:14}}>
              <div style={{padding:'12px 20px',background:'#ef444411',borderBottom:'1px solid #ef444433',color:'#ef4444',fontSize:13,fontWeight:700}}>
                📉 مواد ناقصة ({shortage.length}) — سيُخفَّض المخزون
              </div>
              {shortage.map((item,i)=>(
                <div key={item.productId} style={{display:'flex',justifyContent:'space-between',padding:'10px 20px',borderBottom:i<shortage.length-1?'1px solid #ffffff':'none',alignItems:'center'}}>
                  <div style={{display:'flex',gap:8,alignItems:'center'}}>
                    <span style={{fontSize:16}}>{item.img||'📦'}</span>
                    <span style={{color:'#1e293b',fontSize:13}}>{item.productName}</span>
                  </div>
                  <div style={{display:'flex',gap:16,alignItems:'center'}}>
                    <span style={{color:'#64748b',fontSize:12}}>{item.systemQty} → {item.actualQty}</span>
                    <span style={{color:'#ef4444',fontSize:14,fontWeight:800}}>{item.diff} {item.unit}</span>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* ملاحظات */}
          <div style={{marginBottom:20}}>
            <label style={{color:'#64748b',fontSize:12,display:'block',marginBottom:6}}>ملاحظات (اختياري)</label>
            <textarea value={notes} onChange={e=>setNotes(e.target.value)} rows={2} placeholder="ملاحظات على التسوية..."
              style={{width:'100%',color:'#0f172a',outline:'none',resize:'none',fontFamily:"'Cairo'",boxSizing:'border-box'}}/>
          </div>

          <div style={{display:'flex',gap:10}}>
            <button onClick={()=>setStep(2)}
              style={{flex:1,background:'#ffffff',border:'1px solid #cdd8ec',borderRadius:12,padding:14,color:'#64748b',cursor:'pointer',fontSize:13}}>
              ← رجوع للتعديل
            </button>
            <button onClick={save} disabled={saving}
              style={{flex:3,background:saving?'#ffffff':'linear-gradient(135deg,#F5C800,#d4a800)',color:saving?'#cdd8ec':'#000',border:'none',borderRadius:12,padding:14,fontWeight:800,fontSize:15,cursor:saving?'not-allowed':'pointer'}}>
              {saving?'⏳ جاري الحفظ...`':`⚖️ حفظ التسوية وتحديث المخزون (${items.filter(i=>i.diff!==0).length} مادة)`}
            </button>
          </div>
        </div>
      )}
    </div>
  );

  // ── قائمة التسويات ────────────────────────────
  const filteredSettles=settles.filter(s=>!search||s.settleNo?.includes(search)||s.addedBy?.includes(search));

  return(
    <div style={{padding:24,fontFamily:"'Cairo'",direction:'rtl'}}>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:20}}>
        <div>
          <div style={{color:'#fff',fontSize:22,fontWeight:800}}>⚖️ التسوية المخزنية</div>
          <div style={{color:'#64748b',fontSize:13}}>{settles.length} تسوية</div>
        </div>
        <button onClick={()=>setView('new')}
          style={{background:'#F5C800',color:'#000',border:'none',borderRadius:12,padding:'10px 20px',fontWeight:800,cursor:'pointer',fontFamily:"'Cairo'",fontSize:14}}>
          + تسوية مخزنية جديدة
        </button>
      </div>

      <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="🔍 ابحث برقم التسوية..."
        style={{width:'100%',color:'#0f172a',fontSize:13,outline:'none',marginBottom:16,boxSizing:'border-box',fontFamily:"'Cairo'"}}/>

      <div style={{background:'#ffffff',borderRadius:16,border:'1px solid #d9e2f2',overflow:'hidden'}}>
        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr 1fr 1fr 1fr 1fr',padding:'12px 20px',background:'#f8fbff',borderBottom:'1px solid #e2e8f7'}}>
          {['رقم التسوية','التاريخ','المخزن','المواد','فائض','نقص','إجراء'].map(h=>(
            <div key={h} style={{color:'#64748b',fontSize:11,fontWeight:700}}>{h}</div>
          ))}
        </div>
        {filteredSettles.length===0
          ?<div style={{color:'#cdd8ec',textAlign:'center',padding:60}}>لا توجد تسويات بعد</div>
          :filteredSettles.map((s,i)=>(
            <div key={s.id} style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr 1fr 1fr 1fr 1fr',padding:'12px 20px',borderBottom:i<filteredSettles.length-1?'1px solid #ffffff':'none',alignItems:'center',background:i%2===0?'transparent':'#f8fbff'}}>
              <div style={{color:'#F5C800',fontSize:12,fontWeight:700}}>{s.settleNo}</div>
              <div style={{color:'#64748b',fontSize:11}}>{s.dateISO||s.date}</div>
              <div style={{color:'#1e293b',fontSize:12}}>{s.warehouse||'الكل'}</div>
              <div style={{color:'#3b82f6',fontSize:12}}>{s.items?.length||0}</div>
              <div style={{color:'#10b981',fontSize:12,fontWeight:700}}>{s.surplusCount||0}</div>
              <div style={{color:'#ef4444',fontSize:12,fontWeight:700}}>{s.shortageCount||0}</div>
              <div style={{display:'flex',gap:6}}>
                <button onClick={()=>{setSelSettle(s);setView('detail');}}
                  style={{background:'#F5C80022',border:'1px solid #F5C80044',borderRadius:8,padding:'5px 10px',color:'#F5C800',fontSize:12,cursor:'pointer'}}>👁️</button>
                <button onClick={()=>printSettle(s)}
                  style={{background:'#3b82f622',border:'1px solid #3b82f644',borderRadius:8,padding:'5px 10px',color:'#3b82f6',fontSize:12,cursor:'pointer'}}>🖨️</button>
              </div>
            </div>
          ))
        }
      </div>
    </div>
  );
}
