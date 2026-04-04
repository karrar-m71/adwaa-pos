import { useState, useEffect } from 'react';
import { collection, onSnapshot } from 'firebase/firestore';
import { db } from '../../firebase';

const fmt = n=>(n||0).toLocaleString('ar-IQ')+' د.ع';

export default function ItemMovement({ user }) {
  const [products,   setProducts]   = useState([]);
  const [sales,      setSales]      = useState([]);
  const [purchases,  setPurchases]  = useState([]);
  const [returns,    setReturns]    = useState([]);
  const [invMovs,    setInvMovs]    = useState([]);
  const [selProduct, setSelProduct] = useState('');
  const [dateFrom,   setDateFrom]   = useState('');
  const [dateTo,     setDateTo]     = useState('');

  useEffect(()=>{
    const us=[
      onSnapshot(collection(db,'pos_products'),           s=>setProducts(s.docs.map(d=>({...d.data(),id:d.id})))),
      onSnapshot(collection(db,'pos_sales'),              s=>setSales(s.docs.map(d=>({...d.data(),id:d.id})))),
      onSnapshot(collection(db,'pos_purchases'),          s=>setPurchases(s.docs.map(d=>({...d.data(),id:d.id})))),
      onSnapshot(collection(db,'pos_returns'),            s=>setReturns(s.docs.map(d=>({...d.data(),id:d.id})))),
      onSnapshot(collection(db,'pos_inventory_movements'),s=>setInvMovs(s.docs.map(d=>({...d.data(),id:d.id})))),
    ];
    return()=>us.forEach(u=>u());
  },[]);

  const inRange=d=>{ const ds=d?.slice(0,10)||''; if(!ds)return true; if(dateFrom&&ds<dateFrom)return false; if(dateTo&&ds>dateTo)return false; return true; };

  const selProd=products.find(p=>p.id===selProduct);

  // بناء كل الحركات للمادة المختارة
  const movements=[];
  if(selProduct){
    // مبيعات
    sales.filter(s=>inRange(s.createdAt)).forEach(inv=>{
      const item=(inv.items||[]).find(it=>it.id===selProduct);
      if(item)movements.push({date:inv.createdAt,type:'بيع',icon:'📤',ref:`#${inv.invoiceNo}`,party:inv.customer||'زبون عام',qty:-item.qty,price:item.price,color:'#ef4444'});
    });
    // مشتريات
    purchases.filter(p=>inRange(p.createdAt)).forEach(inv=>{
      const item=(inv.items||[]).find(it=>it.id===selProduct);
      if(item)movements.push({date:inv.createdAt,type:'شراء',icon:'📥',ref:`#${inv.invoiceNo}`,party:inv.supplier||'—',qty:+item.qty,price:item.buyPrice,color:'#10b981'});
    });
    // إرجاع بيع
    returns.filter(r=>inRange(r.createdAt)).forEach(ret=>{
      const item=(ret.items||[]).find(it=>it.id===selProduct);
      if(item)movements.push({date:ret.createdAt,type:'إرجاع بيع',icon:'↩️',ref:`#${ret.returnNo}`,party:ret.customer||'—',qty:+item.returnQty,price:item.price,color:'#a78bfa'});
    });
    // حركات يدوية
    invMovs.filter(m=>m.productId===selProduct&&inRange(m.createdAt)).forEach(m=>{
      movements.push({date:m.createdAt,type:m.type==='إدخال'?'إدخال يدوي':'إخراج يدوي',icon:m.type==='إدخال'?'➕':'➖',ref:'—',party:m.addedBy||'—',qty:m.type==='إدخال'?+m.qty:-m.qty,price:0,color:m.type==='إدخال'?'#10b981':'#f59e0b'});
    });
  }

  movements.sort((a,b)=>new Date(a.date)-new Date(b.date));

  // حساب رصيد متراكم
  let running = selProd ? (selProd.stock||0) - movements.reduce((s,m)=>s+m.qty,0) : 0;
  const rows=movements.map(m=>{running+=m.qty;return{...m,balance:running};});

  const totalIn  = movements.filter(m=>m.qty>0).reduce((s,m)=>s+m.qty,0);
  const totalOut = movements.filter(m=>m.qty<0).reduce((s,m)=>s+Math.abs(m.qty),0);

  return(
    <div style={{padding:24,fontFamily:"'Cairo'",direction:'rtl'}}>
      <div style={{color:'#fff',fontSize:22,fontWeight:800,marginBottom:20}}>🔄 حركة المادة</div>

      <div style={{display:'flex',gap:14,marginBottom:20,background:'#ffffff',borderRadius:14,padding:16,border:'1px solid #d9e2f2',alignItems:'flex-end',flexWrap:'wrap'}}>
        <div style={{flex:1}}>
          <label style={{color:'#64748b',fontSize:12,display:'block',marginBottom:6}}>اختر المادة *</label>
          <select value={selProduct} onChange={e=>setSelProduct(e.target.value)}
            style={{width:'100%',color:'#0f172a',outline:'none'}}>
            <option value="">اختر مادة...</option>
            {products.map(p=><option key={p.id} value={p.id}>{p.name} (مخزون: {p.stock||0})</option>)}
          </select>
        </div>
        <div>
          <label style={{color:'#64748b',fontSize:12,display:'block',marginBottom:6}}>من تاريخ</label>
          <input type="date" value={dateFrom} onChange={e=>setDateFrom(e.target.value)}
            style={{color:'#0f172a',outline:'none'}}/>
        </div>
        <div>
          <label style={{color:'#64748b',fontSize:12,display:'block',marginBottom:6}}>إلى تاريخ</label>
          <input type="date" value={dateTo} onChange={e=>setDateTo(e.target.value)}
            style={{color:'#0f172a',outline:'none'}}/>
        </div>
        <button onClick={()=>{setDateFrom('');setDateTo('');}}
          style={{background:'#d9e2f2',border:'none',borderRadius:10,padding:'10px 14px',color:'#64748b',cursor:'pointer',fontFamily:"'Cairo'"}}>إعادة</button>
      </div>

      {selProd&&(
        <>
          {/* بطاقة المادة */}
          <div style={{background:'#ffffff',borderRadius:16,padding:20,border:'1px solid #F5C80033',marginBottom:20,display:'flex',gap:20,alignItems:'center'}}>
            <span style={{fontSize:48}}>{selProd.img||'📦'}</span>
            <div style={{flex:1}}>
              <div style={{color:'#fff',fontSize:18,fontWeight:800,marginBottom:4}}>{selProd.name}</div>
              <div style={{color:'#64748b',fontSize:12}}>{selProd.cat} • {selProd.barcode||'بدون باركود'}</div>
            </div>
            <div style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:16}}>
              {[['المخزون الحالي',selProd.stock||0,'#F5C800'],['وارد',totalIn,'#10b981'],['صادر',totalOut,'#ef4444'],['عدد الحركات',movements.length,'#3b82f6']].map(([l,v,c])=>(
                <div key={l} style={{textAlign:'center'}}>
                  <div style={{color:'#64748b',fontSize:11,marginBottom:4}}>{l}</div>
                  <div style={{color:c,fontSize:20,fontWeight:900}}>{v}</div>
                </div>
              ))}
            </div>
          </div>

          {/* جدول الحركات */}
          <div style={{background:'#ffffff',borderRadius:16,border:'1px solid #d9e2f2',overflow:'hidden'}}>
            <div style={{display:'grid',gridTemplateColumns:'1.5fr 1fr 2fr 1fr 1fr 1fr 1fr',padding:'12px 20px',background:'#f8fbff',borderBottom:'1px solid #e2e8f7'}}>
              {['التاريخ','النوع','المرجع / الطرف','سعر الوحدة','كمية وارد','كمية صادر','الرصيد'].map(h=>(
                <div key={h} style={{color:'#64748b',fontSize:11,fontWeight:700}}>{h}</div>
              ))}
            </div>
            {rows.length===0
              ?<div style={{color:'#cdd8ec',textAlign:'center',padding:60}}>لا توجد حركات لهذه المادة</div>
              :rows.map((r,i)=>(
                <div key={i} style={{display:'grid',gridTemplateColumns:'1.5fr 1fr 2fr 1fr 1fr 1fr 1fr',padding:'11px 20px',borderBottom:i<rows.length-1?'1px solid #ffffff':'none',alignItems:'center',background:i%2===0?'transparent':'#f8fbff'}}>
                  <div style={{color:'#64748b',fontSize:11}}>{r.date?.slice(0,10)}</div>
                  <span style={{background:`${r.color}22`,border:`1px solid ${r.color}44`,borderRadius:20,padding:'2px 8px',color:r.color,fontSize:10,fontWeight:700,display:'inline-flex',gap:4,alignItems:'center'}}>
                    {r.icon} {r.type}
                  </span>
                  <div>
                    <div style={{color:'#1e293b',fontSize:11}}>{r.ref}</div>
                    <div style={{color:'#64748b',fontSize:10}}>{r.party}</div>
                  </div>
                  <div style={{color:'#64748b',fontSize:11}}>{r.price>0?fmt(r.price):'—'}</div>
                  <div style={{color:'#10b981',fontSize:13,fontWeight:r.qty>0?800:400}}>{r.qty>0?`+${r.qty}`:'—'}</div>
                  <div style={{color:'#ef4444',fontSize:13,fontWeight:r.qty<0?800:400}}>{r.qty<0?Math.abs(r.qty):'—'}</div>
                  <div style={{color:'#F5C800',fontSize:13,fontWeight:800}}>{r.balance}</div>
                </div>
              ))
            }
            {rows.length>0&&(
              <div style={{display:'grid',gridTemplateColumns:'1.5fr 1fr 2fr 1fr 1fr 1fr 1fr',padding:'14px 20px',background:'#ffffff',borderTop:'2px solid #d9e2f2'}}>
                <div style={{color:'#1e293b',fontSize:13,fontWeight:800,gridColumn:'1/5'}}>الإجمالي ({rows.length} حركة)</div>
                <div style={{color:'#10b981',fontSize:14,fontWeight:900}}>{totalIn}</div>
                <div style={{color:'#ef4444',fontSize:14,fontWeight:900}}>{totalOut}</div>
                <div style={{color:'#F5C800',fontSize:14,fontWeight:900}}>{selProd.stock||0}</div>
              </div>
            )}
          </div>
        </>
      )}

      {!selProduct&&(
        <div style={{background:'#ffffff',borderRadius:16,padding:60,border:'1px solid #d9e2f2',textAlign:'center'}}>
          <div style={{fontSize:48,marginBottom:12}}>🔄</div>
          <div style={{color:'#64748b',fontSize:15}}>اختر مادة لعرض حركاتها</div>
        </div>
      )}
    </div>
  );
}
