import { useState, useEffect } from 'react';
import { collection, onSnapshot, addDoc, updateDoc, doc } from 'firebase/firestore';
import { db } from '../firebase';

const fmt = n => (n||0).toLocaleString('ar-IQ') + ' د.ع';
const now = () => new Date().toLocaleDateString('ar-IQ',{year:'numeric',month:'short',day:'numeric',hour:'2-digit',minute:'2-digit'});

export default function Inventory({ user }) {
  const [products, setProducts]   = useState([]);
  const [movements, setMovements] = useState([]);
  const [search, setSearch]       = useState('');
  const [catFilter, setCatFilter] = useState('الكل');
  const [showAdjust, setShowAdjust] = useState(false);
  const [selProduct, setSelProduct] = useState(null);
  const [adjQty, setAdjQty]       = useState('');
  const [adjType, setAdjType]     = useState('إضافة');
  const [adjNote, setAdjNote]     = useState('');
  const [saving, setSaving]       = useState(false);
  const [activeTab, setActiveTab] = useState('products');

  useEffect(() => {
    const u1 = onSnapshot(collection(db,'pos_products'),  s => setProducts(s.docs.map(d=>({...d.data(),id:d.id}))));
    const u2 = onSnapshot(collection(db,'pos_inventory_movements'), s => setMovements(s.docs.map(d=>({...d.data(),id:d.id})).sort((a,b)=>new Date(b.createdAt)-new Date(a.createdAt))));
    return () => { u1(); u2(); };
  }, []);

  const CATS = ['الكل',...new Set(products.map(p=>p.cat).filter(Boolean))];

  const filtered = products.filter(p =>
    (catFilter==='الكل' || p.cat===catFilter) &&
    (!search || p.name?.includes(search) || p.barcode?.includes(search))
  );

  const lowStock   = products.filter(p => (p.stock||0) <= (p.minStock||5));
  const totalValue = products.reduce((s,p) => s + (p.stock||0)*(p.buyPrice||0), 0);
  const totalItems = products.reduce((s,p) => s + (p.stock||0), 0);

  const saveAdjust = async () => {
    if (!selProduct || !adjQty) return alert('اختر منتجاً وأدخل الكمية');
    setSaving(true);
    const qty = Number(adjQty);
    const newStock = adjType==='إضافة' ? (selProduct.stock||0)+qty : Math.max(0,(selProduct.stock||0)-qty);
    await updateDoc(doc(db,'pos_products',selProduct.id), { stock:newStock });
    await addDoc(collection(db,'pos_inventory_movements'), {
      productId:selProduct.id, productName:selProduct.name,
      type:adjType, qty, prevStock:selProduct.stock||0, newStock,
      note:adjNote, addedBy:user.name, date:now(), createdAt:new Date().toISOString()
    });
    setShowAdjust(false); setSelProduct(null); setAdjQty(''); setAdjNote('');
    setSaving(false);
    alert('✅ تم تعديل المخزون');
  };

  return (
    <div style={{ padding:24, fontFamily:"'Cairo'", direction:'rtl' }}>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:24 }}>
        <div>
          <div style={{ color:'#fff', fontSize:22, fontWeight:800 }}>إدارة المخزون</div>
          <div style={{ color:'#64748b', fontSize:13 }}>{products.length} منتج</div>
        </div>
        <button onClick={()=>setShowAdjust(true)}
          style={{ background:'#F5C800', color:'#000', border:'none', borderRadius:12, padding:'10px 20px', fontWeight:800, cursor:'pointer', fontFamily:"'Cairo'", fontSize:14 }}>
          ⚖️ تعديل مخزون
        </button>
      </div>

      {/* ملخص */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:16, marginBottom:24 }}>
        {[
          ['📦','إجمالي الأصناف',products.length,'#3b82f6'],
          ['🔢','إجمالي القطع',totalItems.toLocaleString(),'#F5C800'],
          ['💰','قيمة المخزون',fmt(totalValue),'#10b981'],
          ['⚠️','تحت الحد الأدنى',lowStock.length,'#ef4444'],
        ].map(([icon,label,val,color])=>(
          <div key={label} style={{ background:'#ffffff', borderRadius:16, padding:20, border:'1px solid #d9e2f2', textAlign:'center' }}>
            <div style={{ fontSize:28, marginBottom:8 }}>{icon}</div>
            <div style={{ color:'#64748b', fontSize:11, marginBottom:6 }}>{label}</div>
            <div style={{ color, fontSize:18, fontWeight:800 }}>{val}</div>
          </div>
        ))}
      </div>

      {/* نافذة التعديل */}
      {showAdjust && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.8)', zIndex:500, display:'flex', alignItems:'center', justifyContent:'center', padding:20 }}>
          <div style={{ background:'#ffffff', borderRadius:20, padding:28, width:'100%', maxWidth:500, border:'1px solid #d9e2f2' }}>
            <div style={{ color:'#fff', fontSize:18, fontWeight:800, marginBottom:20 }}>⚖️ تعديل المخزون</div>

            {/* اختيار المنتج */}
            <div style={{ marginBottom:14 }}>
              <label style={{ color:'#64748b', fontSize:12, display:'block', marginBottom:6 }}>اختر المنتج *</label>
              <select value={selProduct?.id||''} onChange={e=>{const p=products.find(p=>p.id===e.target.value);setSelProduct(p);}}
                style={{ width:'100%', color:'#0f172a', outline:'none' }}>
                <option value="">اختر منتجاً...</option>
                {products.map(p=><option key={p.id} value={p.id}>{p.name} (مخزون: {p.stock})</option>)}
              </select>
            </div>

            {selProduct && (
              <div style={{ background:'#f8fbff', borderRadius:12, padding:14, marginBottom:14, border:'1px solid #e2e8f7' }}>
                <div style={{ display:'flex', justifyContent:'space-between' }}>
                  <span style={{ color:'#64748b', fontSize:13 }}>المخزون الحالي</span>
                  <span style={{ color:'#F5C800', fontSize:20, fontWeight:800 }}>{selProduct.stock} قطعة</span>
                </div>
              </div>
            )}

            {/* نوع التعديل */}
            <div style={{ display:'flex', gap:10, marginBottom:14 }}>
              {['إضافة','خصم'].map(t=>(
                <button key={t} onClick={()=>setAdjType(t)}
                  style={{ flex:1, background:adjType===t?(t==='إضافة'?'#10b98122':'#ef444422'):'#f8fbff', border:`2px solid ${adjType===t?(t==='إضافة'?'#10b981':'#ef4444'):'#cdd8ec'}`, borderRadius:10, padding:10, color:adjType===t?(t==='إضافة'?'#10b981':'#ef4444'):'#64748b', fontWeight:700, cursor:'pointer', fontFamily:"'Cairo'" }}>{t==='إضافة'?'➕ إضافة':'➖ خصم'}</button>
              ))}
            </div>

            <div style={{ marginBottom:14 }}>
              <label style={{ color:'#64748b', fontSize:12, display:'block', marginBottom:6 }}>الكمية *</label>
              <input type="number" value={adjQty} onChange={e=>setAdjQty(e.target.value)} placeholder="أدخل الكمية"
                style={{ width:'100%', color:'#0f172a', outline:'none', boxSizing:'border-box' }}/>
            </div>

            {selProduct && adjQty && (
              <div style={{ background:'#f8fbff', borderRadius:12, padding:12, marginBottom:14, border:'1px solid #e2e8f7', textAlign:'center' }}>
                <span style={{ color:'#64748b', fontSize:13 }}>المخزون بعد التعديل: </span>
                <span style={{ color:adjType==='إضافة'?'#10b981':'#ef4444', fontSize:18, fontWeight:800 }}>
                  {adjType==='إضافة'?(selProduct.stock||0)+Number(adjQty||0):Math.max(0,(selProduct.stock||0)-Number(adjQty||0))} قطعة
                </span>
              </div>
            )}

            <div style={{ marginBottom:20 }}>
              <label style={{ color:'#64748b', fontSize:12, display:'block', marginBottom:6 }}>السبب / الملاحظة</label>
              <input value={adjNote} onChange={e=>setAdjNote(e.target.value)} placeholder="مثال: جرد مخزن، تالف..."
                style={{ width:'100%', color:'#0f172a', outline:'none', boxSizing:'border-box' }}/>
            </div>

            <div style={{ display:'flex', gap:10 }}>
              <button onClick={()=>{setShowAdjust(false);setSelProduct(null);setAdjQty('');setAdjNote('');}}
                style={{ flex:1, background:'#f8fbff', border:'1px solid #cdd8ec', borderRadius:12, padding:12, color:'#64748b', cursor:'pointer', fontFamily:"'Cairo'" }}>إلغاء</button>
              <button onClick={saveAdjust} disabled={saving}
                style={{ flex:2, background:'linear-gradient(135deg,#F5C800,#d4a800)', color:'#000', border:'none', borderRadius:12, padding:12, fontWeight:800, cursor:'pointer', fontFamily:"'Cairo'", opacity:saving?0.6:1 }}>
                {saving?'⏳ جاري الحفظ...':'✅ حفظ التعديل'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* التبويبات */}
      <div style={{ display:'flex', gap:10, marginBottom:20 }}>
        {[['products','📦 المنتجات'],['movements','📋 حركة المخزون'],['low','⚠️ تحت الحد']].map(([id,label])=>(
          <button key={id} onClick={()=>setActiveTab(id)}
            style={{ background:activeTab===id?'#F5C800':'#ffffff', color:activeTab===id?'#000':'#64748b', border:`1px solid ${activeTab===id?'#F5C800':'#cdd8ec'}`, borderRadius:20, padding:'8px 20px', fontSize:13, cursor:'pointer', fontFamily:"'Cairo'", fontWeight:activeTab===id?700:400 }}>{label}</button>
        ))}
      </div>

      {/* المنتجات */}
      {activeTab==='products' && <>
        <div style={{ display:'flex', gap:10, marginBottom:16, flexWrap:'wrap' }}>
          <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="🔍 ابحث..."
            style={{ flex:1, minWidth:200, color:'#0f172a', fontSize:13, outline:'none' }}/>
          {CATS.map(c=>(
            <button key={c} onClick={()=>setCatFilter(c)}
              style={{ background:catFilter===c?'#F5C800':'#ffffff', color:catFilter===c?'#000':'#64748b', border:`1px solid ${catFilter===c?'#F5C800':'#cdd8ec'}`, borderRadius:20, padding:'6px 14px', fontSize:12, cursor:'pointer', fontFamily:"'Cairo'" }}>{c}</button>
          ))}
        </div>
        <div style={{ background:'#ffffff', borderRadius:16, border:'1px solid #d9e2f2', overflow:'hidden' }}>
          <div style={{ display:'grid', gridTemplateColumns:'2fr 1fr 1fr 1fr 1fr', padding:'12px 20px', borderBottom:'1px solid #d9e2f2', background:'#f8fbff' }}>
            {['المنتج','المخزون','الحد الأدنى','سعر الشراء','قيمة المخزون'].map(h=>(
              <div key={h} style={{ color:'#64748b', fontSize:11, fontWeight:700 }}>{h}</div>
            ))}
          </div>
          {filtered.length===0
            ?<div style={{ color:'#cdd8ec', textAlign:'center', padding:60 }}>لا توجد منتجات</div>
            :filtered.map((p,i)=>(
              <div key={p.id} style={{ display:'grid', gridTemplateColumns:'2fr 1fr 1fr 1fr 1fr', padding:'12px 20px', borderBottom:i<filtered.length-1?'1px solid #ffffff':'none', alignItems:'center', background:(p.stock||0)<=(p.minStock||5)?'#ef444408':'transparent' }}>
                <div style={{ display:'flex', gap:10, alignItems:'center' }}>
                  <span style={{ fontSize:20 }}>{p.img||'📦'}</span>
                  <div>
                    <div style={{ color:'#1e293b', fontSize:13, fontWeight:600 }}>{p.name}</div>
                    <div style={{ color:'#475569', fontSize:11 }}>{p.cat}</div>
                  </div>
                </div>
                <div>
                  <span style={{ background:(p.stock||0)<=(p.minStock||5)?'#ef444422':'#10b98122', border:`1px solid ${(p.stock||0)<=(p.minStock||5)?'#ef444444':'#10b98144'}`, borderRadius:20, padding:'3px 12px', color:(p.stock||0)<=(p.minStock||5)?'#ef4444':'#10b981', fontSize:13, fontWeight:800 }}>
                    {p.stock||0}
                  </span>
                </div>
                <div style={{ color:'#64748b', fontSize:12 }}>{p.minStock||5}</div>
                <div style={{ color:'#64748b', fontSize:12 }}>{fmt(p.buyPrice)}</div>
                <div style={{ color:'#F5C800', fontSize:13, fontWeight:700 }}>{fmt((p.stock||0)*(p.buyPrice||0))}</div>
              </div>
            ))
          }
        </div>
      </>}

      {/* حركة المخزون */}
      {activeTab==='movements' && (
        <div style={{ background:'#ffffff', borderRadius:16, border:'1px solid #d9e2f2', overflow:'hidden' }}>
          <div style={{ display:'grid', gridTemplateColumns:'2fr 1fr 1fr 1fr 1fr 1fr', padding:'12px 20px', borderBottom:'1px solid #d9e2f2', background:'#f8fbff' }}>
            {['المنتج','النوع','الكمية','قبل','بعد','التاريخ'].map(h=>(
              <div key={h} style={{ color:'#64748b', fontSize:11, fontWeight:700 }}>{h}</div>
            ))}
          </div>
          {movements.length===0
            ?<div style={{ color:'#cdd8ec', textAlign:'center', padding:60 }}>لا توجد حركات</div>
            :movements.map((m,i)=>(
              <div key={m.id} style={{ display:'grid', gridTemplateColumns:'2fr 1fr 1fr 1fr 1fr 1fr', padding:'12px 20px', borderBottom:i<movements.length-1?'1px solid #ffffff':'none', alignItems:'center' }}>
                <div style={{ color:'#1e293b', fontSize:13 }}>{m.productName}</div>
                <span style={{ background:m.type==='إضافة'?'#10b98122':'#ef444422', border:`1px solid ${m.type==='إضافة'?'#10b98144':'#ef444444'}`, borderRadius:20, padding:'2px 10px', color:m.type==='إضافة'?'#10b981':'#ef4444', fontSize:11, fontWeight:700, display:'inline-block' }}>{m.type}</span>
                <div style={{ color:m.type==='إضافة'?'#10b981':'#ef4444', fontSize:14, fontWeight:800 }}>{m.type==='إضافة'?'+':'-'}{m.qty}</div>
                <div style={{ color:'#64748b', fontSize:12 }}>{m.prevStock}</div>
                <div style={{ color:'#F5C800', fontSize:13, fontWeight:700 }}>{m.newStock}</div>
                <div style={{ color:'#475569', fontSize:11 }}>{m.date}</div>
              </div>
            ))
          }
        </div>
      )}

      {/* تحت الحد الأدنى */}
      {activeTab==='low' && (
        <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:12 }}>
          {lowStock.length===0
            ?<div style={{ gridColumn:'1/-1', color:'#10b981', textAlign:'center', padding:60, fontSize:18 }}>✅ كل المنتجات بمستوى جيد</div>
            :lowStock.map(p=>(
              <div key={p.id} style={{ background:'#ffffff', borderRadius:16, padding:16, border:'1px solid #ef444433' }}>
                <div style={{ display:'flex', justifyContent:'space-between', marginBottom:10 }}>
                  <span style={{ fontSize:28 }}>{p.img||'📦'}</span>
                  <span style={{ color:'#ef4444', fontSize:24, fontWeight:900 }}>{p.stock}</span>
                </div>
                <div style={{ color:'#1e293b', fontSize:13, fontWeight:700, marginBottom:4 }}>{p.name}</div>
                <div style={{ color:'#64748b', fontSize:11, marginBottom:10 }}>الحد الأدنى: {p.minStock||5} قطعة</div>
                <button onClick={()=>{setSelProduct(p);setAdjType('إضافة');setShowAdjust(true);}}
                  style={{ width:'100%', background:'#F5C80022', border:'1px solid #F5C80044', borderRadius:10, padding:'8px 0', color:'#F5C800', fontSize:12, fontWeight:700, cursor:'pointer', fontFamily:"'Cairo'" }}>
                  ➕ إضافة مخزون
                </button>
              </div>
            ))
          }
        </div>
      )}
    </div>
  );
}
