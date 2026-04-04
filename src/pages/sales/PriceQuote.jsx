import { useState, useEffect } from 'react';
import { collection, onSnapshot, addDoc, deleteDoc, doc } from 'firebase/firestore';
import { db } from '../../firebase';
import jsPDF from 'jspdf';
import { getUnitPriceByMode, PRICE_MODES } from '../../utils/pricing';

const fmt = n=>(n||0).toLocaleString('ar-IQ')+' د.ع';
const today=()=>new Date().toISOString().split('T')[0];
const nowStr=()=>new Date().toLocaleDateString('ar-IQ',{year:'numeric',month:'short',day:'numeric'});

export default function PriceQuote({ user }) {
  const [products,  setProducts]  = useState([]);
  const [customers, setCustomers] = useState([]);
  const [quotes,    setQuotes]    = useState([]);
  const [view,      setView]      = useState('list');
  const [selQuote,  setSelQuote]  = useState(null);
  const [saving,    setSaving]    = useState(false);
  const [search,    setSearch]    = useState('');
  const [searchProd,setSearchProd]= useState('');

  // نموذج
  const [cart,      setCart]      = useState([]);
  const [customer,  setCustomer]  = useState('');
  const [date,      setDate]      = useState(today());
  const [validDays, setValidDays] = useState('7');
  const [discount,  setDiscount]  = useState(0);
  const [notes,     setNotes]     = useState('');
  const [priceMode, setPriceMode] = useState('retail');

  useEffect(()=>{
    const u1=onSnapshot(collection(db,'pos_products'),  s=>setProducts(s.docs.map(d=>({...d.data(),id:d.id}))));
    const u2=onSnapshot(collection(db,'pos_customers'), s=>setCustomers(s.docs.map(d=>({...d.data(),id:d.id}))));
    const u3=onSnapshot(collection(db,'pos_quotes'),    s=>setQuotes(s.docs.map(d=>({...d.data(),id:d.id})).sort((a,b)=>new Date(b.createdAt)-new Date(a.createdAt))));
    return()=>{u1();u2();u3();};
  },[]);

  const filteredProds=products.filter(p=>!searchProd||p.name?.includes(searchProd)||p.barcode?.includes(searchProd));

  const addToCart=(p)=>{
    setCart(c=>{
      const ex=c.findIndex(i=>i.id===p.id);
      if(ex>=0)return c.map((i,idx)=>idx===ex?{...i,qty:i.qty+1}:i);
      return[...c,{...p,qty:1,price:getUnitPriceByMode(p, priceMode),discount:0,priceMode}];
    });
    setSearchProd('');
  };

  const updateRow=(id,f,v)=>setCart(c=>c.map(i=>i.id===id?{...i,[f]:Number(v)}:i));
  const removeRow=(id)=>setCart(c=>c.filter(i=>i.id!==id));
  const subtotal=cart.reduce((s,i)=>s+(i.price*i.qty),0);
  const totalDisc=cart.reduce((s,i)=>s+(i.price*i.qty*(i.discount||0)/100),0)+subtotal*(discount/100);
  const total=subtotal-totalDisc;

  const resetForm=()=>{setCart([]);setCustomer('');setDate(today());setValidDays('7');setDiscount(0);setNotes('');setSearchProd('');};

  const save=async()=>{
    if(cart.length===0)return alert('أضف منتجات للعرض');
    setSaving(true);
    try{
      const quoteNo='QUO-'+Date.now().toString().slice(-6);
      // حساب تاريخ الانتهاء
      const expDate=new Date();expDate.setDate(expDate.getDate()+Number(validDays));
      const quote={
        quoteNo, status:'مفتوح',
        items:cart.map(i=>({id:i.id,name:i.name,qty:i.qty,price:i.price,discount:i.discount||0,total:i.price*i.qty*(1-(i.discount||0)/100)})),
        customer:customer.trim()||'—', subtotal, discount, totalDiscount:totalDisc, total,
        validDays:Number(validDays), expiryDate:expDate.toLocaleDateString('ar-IQ'),
        notes, date:nowStr(), dateISO:date, createdBy:user.name,
        createdAt:new Date().toISOString(),
      };
      await addDoc(collection(db,'pos_quotes'),quote);
      resetForm();setView('list');
      alert('✅ تم حفظ عرض السعر — لم يتم الخصم من المخزون');
    }catch(e){console.log(e);alert('حدث خطأ!');}
    setSaving(false);
  };

  const del=async(id,no)=>{if(!confirm(`حذف عرض "${no}"؟`))return;await deleteDoc(doc(db,'pos_quotes',id));};

  const printQuote=(q)=>{
    const doc2=new jsPDF({orientation:'p',unit:'mm',format:'a4'});
    doc2.setFont('helvetica','bold');
    doc2.setFontSize(20);doc2.text('Adwaa Al-Madina',105,20,{align:'center'});
    doc2.setFontSize(14);doc2.text('PRICE QUOTATION',105,30,{align:'center'});
    doc2.setFontSize(10);doc2.setFont('helvetica','normal');
    doc2.line(14,34,196,34);
    doc2.text(`Quote No: ${q.quoteNo}`,14,42);doc2.text(`Date: ${q.dateISO||q.date}`,140,42);
    doc2.text(`Customer: ${q.customer}`,14,49);doc2.text(`Valid Until: ${q.expiryDate}`,140,49);
    doc2.line(14,53,196,53);
    // رأس الجدول
    doc2.setFont('helvetica','bold');
    doc2.text('Item',14,60);doc2.text('Qty',100,60);doc2.text('Price',120,60);doc2.text('Disc%',145,60);doc2.text('Total',170,60);
    doc2.line(14,63,196,63);
    doc2.setFont('helvetica','normal');
    let y=70;
    (q.items||[]).forEach((item,i)=>{
      doc2.text(item.name?.length>35?item.name.slice(0,35)+'...':item.name,14,y);
      doc2.text(String(item.qty),100,y);
      doc2.text(item.price?.toLocaleString()||'0',120,y);
      doc2.text(`${item.discount||0}%`,145,y);
      doc2.text(item.total?.toLocaleString()||'0',170,y);
      y+=7;
      if(i<(q.items.length-1))doc2.line(14,y-3,196,y-3);
    });
    doc2.line(14,y,196,y);y+=8;
    if(q.totalDiscount>0){doc2.text(`Discount: -${q.totalDiscount?.toLocaleString()} IQD`,196,y,{align:'right'});y+=7;}
    doc2.setFont('helvetica','bold');
    doc2.setFontSize(13);doc2.text(`TOTAL: ${q.total?.toLocaleString()} IQD`,196,y,{align:'right'});
    y+=10;doc2.setFont('helvetica','normal');doc2.setFontSize(9);
    doc2.text(`* This quotation is valid for ${q.validDays} days until ${q.expiryDate}`,14,y);y+=6;
    doc2.text('* Prices are subject to change without notice',14,y);y+=6;
    if(q.notes){doc2.text(`Notes: ${q.notes}`,14,y);}
    doc2.save(`${q.quoteNo}.pdf`);
  };

  const STATUS_COLOR={'مفتوح':'#10b981','منتهي الصلاحية':'#ef4444','تم التحويل':'#3b82f6'};

  // ── تفاصيل العرض ──────────────────────────────
  if(view==='detail'&&selQuote) return(
    <div style={{padding:24,fontFamily:"'Cairo'",direction:'rtl'}}>
      <div style={{display:'flex',alignItems:'center',gap:12,marginBottom:24}}>
        <button onClick={()=>{setView('list');setSelQuote(null);}} style={{background:'#ffffff',border:'1px solid #cdd8ec',borderRadius:10,padding:'8px 16px',color:'#F5C800',cursor:'pointer',fontFamily:"'Cairo'"}}>← رجوع</button>
        <div style={{color:'#fff',fontSize:20,fontWeight:800}}>عرض السعر #{selQuote.quoteNo}</div>
        <span style={{background:`${STATUS_COLOR[selQuote.status]||'#64748b'}22`,border:`1px solid ${STATUS_COLOR[selQuote.status]||'#64748b'}44`,borderRadius:20,padding:'4px 14px',color:STATUS_COLOR[selQuote.status]||'#64748b',fontSize:12,fontWeight:700}}>{selQuote.status}</span>
      </div>
      <div style={{display:'grid',gridTemplateColumns:'2fr 1fr',gap:20}}>
        <div style={{background:'#ffffff',borderRadius:16,border:'1px solid #d9e2f2',overflow:'hidden'}}>
          <div style={{display:'grid',gridTemplateColumns:'2fr 1fr 1fr 1fr 1fr',padding:'10px 20px',background:'#f8fbff',borderBottom:'1px solid #e2e8f7'}}>
            {['المادة','الكمية','السعر','الخصم%','الإجمالي'].map(h=><div key={h} style={{color:'#64748b',fontSize:11,fontWeight:700}}>{h}</div>)}
          </div>
          {(selQuote.items||[]).map((item,i)=>(
            <div key={i} style={{display:'grid',gridTemplateColumns:'2fr 1fr 1fr 1fr 1fr',padding:'10px 20px',borderBottom:'1px solid #ffffff',alignItems:'center'}}>
              <div style={{color:'#1e293b',fontSize:13,fontWeight:600}}>{item.name}</div>
              <div style={{color:'#1e293b',fontSize:13}}>{item.qty}</div>
              <div style={{color:'#F5C800',fontSize:13}}>{fmt(item.price)}</div>
              <div style={{color:'#a78bfa',fontSize:13}}>{item.discount||0}%</div>
              <div style={{color:'#10b981',fontSize:13,fontWeight:700}}>{fmt(item.total)}</div>
            </div>
          ))}
          <div style={{padding:'14px 20px',borderTop:'2px solid #d9e2f2'}}>
            {[selQuote.totalDiscount>0&&['الخصم الإجمالي',`- ${fmt(selQuote.totalDiscount)}`,'#ef4444'],['الإجمالي',fmt(selQuote.total),'#F5C800']].filter(Boolean).map(([l,v,c])=>(
              <div key={l} style={{display:'flex',justifyContent:'space-between',marginBottom:6}}>
                <span style={{color:'#64748b',fontSize:13}}>{l}</span>
                <span style={{color:c,fontSize:14,fontWeight:700}}>{v}</span>
              </div>
            ))}
          </div>
        </div>
        <div>
          <div style={{background:'#ffffff',borderRadius:16,padding:20,border:'1px solid #d9e2f2',marginBottom:14}}>
            {[['الزبون',selQuote.customer],['تاريخ العرض',selQuote.dateISO||selQuote.date],['صالح لـ',`${selQuote.validDays} يوم`],['تاريخ الانتهاء',selQuote.expiryDate],['أنشأه',selQuote.createdBy],selQuote.notes&&['ملاحظات',selQuote.notes]].filter(Boolean).map(([l,v])=>(
              <div key={l} style={{display:'flex',justifyContent:'space-between',padding:'8px 0',borderBottom:'1px solid #e2e8f7'}}>
                <span style={{color:'#64748b',fontSize:12}}>{l}</span>
                <span style={{color:'#1e293b',fontSize:13,fontWeight:600}}>{v}</span>
              </div>
            ))}
          </div>
          <div style={{background:'#F5C80011',border:'1px solid #F5C80033',borderRadius:12,padding:12,marginBottom:14,textAlign:'center'}}>
            <div style={{color:'#F5C800',fontSize:11,marginBottom:4}}>⚠️ تنبيه مهم</div>
            <div style={{color:'#64748b',fontSize:11}}>هذا عرض سعر فقط — لم يتم الخصم من المخزون</div>
          </div>
          <button onClick={()=>printQuote(selQuote)} style={{width:'100%',background:'#3b82f6',color:'#fff',border:'none',borderRadius:12,padding:12,fontWeight:700,cursor:'pointer',fontFamily:"'Cairo'"}}>🖨️ طباعة عرض السعر</button>
        </div>
      </div>
    </div>
  );

  // ── عرض سعر جديد ─────────────────────────────
  if(view==='new') return(
    <div style={{display:'flex',height:'calc(100vh - 60px)',fontFamily:"'Cairo'",direction:'rtl',overflow:'hidden'}}>
      {/* المنتجات */}
      <div style={{flex:1,padding:16,overflowY:'auto',borderLeft:'1px solid #ffffff'}}>
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:14}}>
          <div>
            <div style={{color:'#fff',fontSize:16,fontWeight:800}}>💬 عرض سعر جديد</div>
            <div style={{color:'#64748b',fontSize:11,marginTop:2}}>⚠️ لا يتم الخصم من المخزون</div>
          </div>
          <button onClick={()=>{resetForm();setView('list');}} style={{background:'#ffffff',border:'1px solid #cdd8ec',borderRadius:10,padding:'7px 14px',color:'#64748b',cursor:'pointer',fontFamily:"'Cairo'",fontSize:12}}>← إلغاء</button>
        </div>
        <input value={searchProd} onChange={e=>setSearchProd(e.target.value)} placeholder="🔍 ابحث عن مادة..."
          style={{width:'100%',color:'#0f172a',fontSize:14,outline:'none',marginBottom:14,boxSizing:'border-box',fontFamily:"'Cairo'"}}/>
        <div style={{display:'flex',gap:8,marginBottom:12,flexWrap:'wrap'}}>
          {Object.entries(PRICE_MODES).map(([mode, meta])=>(
            <button key={mode} onClick={()=>setPriceMode(mode)}
              style={{background:priceMode===mode?'#ede9fe':'#fff',color:priceMode===mode?'#6d28d9':'#64748b',border:`1px solid ${priceMode===mode?'#c4b5fd':'#d9e2f2'}`,borderRadius:999,padding:'6px 12px',cursor:'pointer',fontFamily:"'Cairo'",fontSize:11,fontWeight:700}}>
              {meta.label}
            </button>
          ))}
        </div>
        <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:10}}>
          {filteredProds.map(p=>(
            <div key={p.id} onClick={()=>addToCart(p)}
              style={{background:'#ffffff',borderRadius:12,padding:12,border:'1px solid #d9e2f2',cursor:'pointer',transition:'border .15s'}}
              onMouseEnter={e=>e.currentTarget.style.borderColor='#a78bfa'}
              onMouseLeave={e=>e.currentTarget.style.borderColor='#d9e2f2'}>
              <div style={{fontSize:26,textAlign:'center',marginBottom:6}}>{p.img||'📦'}</div>
              <div style={{color:'#1e293b',fontSize:12,fontWeight:600,textAlign:'center',marginBottom:4}}>{p.name?.length>14?p.name.slice(0,14)+'...':p.name}</div>
              <div style={{color:'#a78bfa',fontSize:13,fontWeight:800,textAlign:'center'}}>{fmt(getUnitPriceByMode(p, priceMode))}</div>
            </div>
          ))}
        </div>
      </div>

      {/* العرض */}
      <div style={{width:420,padding:16,display:'flex',flexDirection:'column',background:'#f8fbff',borderRight:'1px solid #ffffff',overflowY:'auto'}}>
        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10,marginBottom:12}}>
          <div>
            <label style={{color:'#64748b',fontSize:11,display:'block',marginBottom:4}}>الزبون</label>
            <input value={customer} onChange={e=>setCustomer(e.target.value)} list="cust-q-list" placeholder="اختياري"
              style={{width:'100%',color:'#0f172a',fontSize:12,outline:'none',fontFamily:"'Cairo'",boxSizing:'border-box'}}/>
            <datalist id="cust-q-list">{customers.map(c=><option key={c.id} value={c.name}/>)}</datalist>
          </div>
          <div>
            <label style={{color:'#64748b',fontSize:11,display:'block',marginBottom:4}}>صالح لـ (أيام)</label>
            <input type="number" value={validDays} onChange={e=>setValidDays(e.target.value)} min={1}
              style={{width:'100%',background:'#ffffff',border:'1px solid #cdd8ec',borderRadius:8,padding:'8px 10px',color:'#a78bfa',fontSize:12,outline:'none',boxSizing:'border-box'}}/>
          </div>
          <div>
            <label style={{color:'#64748b',fontSize:11,display:'block',marginBottom:4}}>التاريخ</label>
            <input type="date" value={date} onChange={e=>setDate(e.target.value)}
              style={{width:'100%',color:'#0f172a',fontSize:12,outline:'none',boxSizing:'border-box'}}/>
          </div>
          <div>
            <label style={{color:'#64748b',fontSize:11,display:'block',marginBottom:4}}>خصم عام %</label>
            <input type="number" value={discount} onChange={e=>setDiscount(Number(e.target.value))} min={0} max={100}
              style={{width:'100%',background:'#ffffff',border:'1px solid #cdd8ec',borderRadius:8,padding:'8px 10px',color:'#F5C800',fontSize:12,outline:'none',boxSizing:'border-box'}}/>
          </div>
        </div>

        <div style={{flex:1,overflowY:'auto',marginBottom:10}}>
          {cart.length===0
            ?<div style={{color:'#e2e8f7',textAlign:'center',padding:30,fontSize:13}}>أضف منتجات من اليسار</div>
            :<>
              <div style={{display:'grid',gridTemplateColumns:'2fr 1fr 1fr 1fr auto',gap:6,padding:'6px 0',borderBottom:'1px solid #e2e8f7',marginBottom:6}}>
                {['المادة','الكمية','السعر','خصم%',''].map(h=><div key={h} style={{color:'#475569',fontSize:10}}>{h}</div>)}
              </div>
              {cart.map(item=>(
                <div key={item.id} style={{display:'grid',gridTemplateColumns:'2fr 1fr 1fr 1fr auto',gap:6,marginBottom:8,alignItems:'center'}}>
                  <div style={{color:'#1e293b',fontSize:12,fontWeight:600}}>{item.name?.length>12?item.name.slice(0,12)+'...':item.name}</div>
                  <input type="number" value={item.qty} onChange={e=>updateRow(item.id,'qty',e.target.value)} min={1}
                    style={{color:'#0f172a',fontSize:12,outline:'none'}}/>
                  <input type="number" value={item.price} onChange={e=>updateRow(item.id,'price',e.target.value)}
                    style={{background:'#ffffff',border:'1px solid #cdd8ec',borderRadius:8,padding:'6px 8px',color:'#a78bfa',fontSize:12,outline:'none'}}/>
                  <input type="number" value={item.discount||0} onChange={e=>updateRow(item.id,'discount',e.target.value)} min={0} max={100}
                    style={{background:'#ffffff',border:'1px solid #cdd8ec',borderRadius:8,padding:'6px 8px',color:'#F5C800',fontSize:12,outline:'none'}}/>
                  <button onClick={()=>removeRow(item.id)} style={{background:'#ef444422',border:'none',borderRadius:6,padding:'6px 8px',color:'#ef4444',cursor:'pointer',fontSize:12}}>✕</button>
                </div>
              ))}
            </>
          }
        </div>

        <div style={{background:'#ffffff',borderRadius:14,padding:14,border:'1px solid #d9e2f2'}}>
          {[['المجموع',fmt(subtotal),'#1e293b'],totalDisc>0&&['الخصم',`- ${fmt(totalDisc)}`,'#ef4444'],['الإجمالي',fmt(total),'#a78bfa']].filter(Boolean).map(([l,v,c])=>(
            <div key={l} style={{display:'flex',justifyContent:'space-between',marginBottom:6}}>
              <span style={{color:'#64748b',fontSize:12}}>{l}</span>
              <span style={{color:c,fontSize:l==='الإجمالي'?20:13,fontWeight:l==='الإجمالي'?900:600}}>{v}</span>
            </div>
          ))}
          <div style={{background:'#a78bfa11',border:'1px solid #a78bfa33',borderRadius:10,padding:'8px 12px',margin:'10px 0',textAlign:'center'}}>
            <div style={{color:'#a78bfa',fontSize:11}}>⚠️ هذا عرض سعر — لن يُخصم من المخزون</div>
          </div>
          <textarea value={notes} onChange={e=>setNotes(e.target.value)} placeholder="ملاحظات..." rows={2}
            style={{width:'100%',background:'#f8fbff',border:'1px solid #cdd8ec',borderRadius:8,padding:'8px 10px',color:'#64748b',fontSize:12,outline:'none',resize:'none',fontFamily:"'Cairo'",marginBottom:8,boxSizing:'border-box'}}/>
          <button onClick={save} disabled={saving||cart.length===0}
            style={{width:'100%',background:cart.length===0?'#ffffff':'linear-gradient(135deg,#a78bfa,#7c3aed)',color:cart.length===0?'#cdd8ec':'#fff',border:'none',borderRadius:12,padding:14,fontWeight:800,fontSize:15,cursor:cart.length===0?'not-allowed':'pointer'}}>
            {saving?'⏳ جاري الحفظ...`':`💬 حفظ عرض السعر — ${fmt(total)}`}
          </button>
        </div>
      </div>
    </div>
  );

  // ── قائمة العروض ──────────────────────────────
  const filtered=quotes.filter(q=>!search||q.quoteNo?.includes(search)||q.customer?.includes(search));

  return(
    <div style={{padding:24,fontFamily:"'Cairo'",direction:'rtl'}}>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:20}}>
        <div>
          <div style={{color:'#fff',fontSize:22,fontWeight:800}}>💬 قائمة عرض السعر</div>
          <div style={{color:'#64748b',fontSize:13}}>{quotes.length} عرض • لا يتأثر المخزون</div>
        </div>
        <button onClick={()=>setView('new')}
          style={{background:'#a78bfa',color:'#fff',border:'none',borderRadius:12,padding:'10px 20px',fontWeight:800,cursor:'pointer',fontFamily:"'Cairo'",fontSize:14}}>
          + عرض سعر جديد
        </button>
      </div>

      <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="🔍 ابحث برقم العرض أو الزبون..."
        style={{width:'100%',color:'#0f172a',fontSize:13,outline:'none',marginBottom:16,boxSizing:'border-box',fontFamily:"'Cairo'"}}/>

      <div style={{background:'#ffffff',borderRadius:16,border:'1px solid #d9e2f2',overflow:'hidden'}}>
        <div style={{display:'grid',gridTemplateColumns:'1fr 1.5fr 1fr 1fr 1fr 1fr 1fr',padding:'12px 20px',borderBottom:'1px solid #d9e2f2',background:'#f8fbff'}}>
          {['رقم العرض','الزبون','التاريخ','صالح لـ','انتهاء الصلاحية','الإجمالي','إجراء'].map(h=>(
            <div key={h} style={{color:'#64748b',fontSize:11,fontWeight:700}}>{h}</div>
          ))}
        </div>
        {filtered.length===0
          ?<div style={{color:'#cdd8ec',textAlign:'center',padding:60}}>لا توجد عروض أسعار</div>
          :filtered.map((q,i)=>(
            <div key={q.id} style={{display:'grid',gridTemplateColumns:'1fr 1.5fr 1fr 1fr 1fr 1fr 1fr',padding:'12px 20px',borderBottom:i<filtered.length-1?'1px solid #ffffff':'none',alignItems:'center',background:i%2===0?'transparent':'#f8fbff'}}>
              <div style={{color:'#a78bfa',fontSize:12,fontWeight:700}}>{q.quoteNo}</div>
              <div style={{color:'#1e293b',fontSize:12}}>{q.customer||'—'}</div>
              <div style={{color:'#64748b',fontSize:11}}>{q.dateISO||q.date}</div>
              <div style={{color:'#666',fontSize:11}}>{q.validDays} يوم</div>
              <div style={{color:'#64748b',fontSize:11}}>{q.expiryDate}</div>
              <div style={{color:'#F5C800',fontSize:13,fontWeight:800}}>{fmt(q.total)}</div>
              <div style={{display:'flex',gap:6}}>
                <button onClick={()=>{setSelQuote(q);setView('detail');}}
                  style={{background:'#a78bfa22',border:'1px solid #a78bfa44',borderRadius:8,padding:'5px 10px',color:'#a78bfa',fontSize:12,cursor:'pointer'}}>👁️</button>
                <button onClick={()=>printQuote(q)}
                  style={{background:'#3b82f622',border:'1px solid #3b82f644',borderRadius:8,padding:'5px 10px',color:'#3b82f6',fontSize:12,cursor:'pointer'}}>🖨️</button>
                {user.role==='مدير'&&<button onClick={()=>del(q.id,q.quoteNo)}
                  style={{background:'#ef444422',border:'1px solid #ef444444',borderRadius:8,padding:'5px 10px',color:'#ef4444',fontSize:12,cursor:'pointer'}}>🗑️</button>}
              </div>
            </div>
          ))
        }
      </div>
    </div>
  );
}
