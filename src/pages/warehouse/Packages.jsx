import { useState, useEffect } from 'react';
import { collection, onSnapshot, addDoc, updateDoc, deleteDoc, doc } from 'firebase/firestore';
import { db } from '../../firebase';

export default function Packages({ user }) {
  const [packages, setPackages] = useState([]);
  const [products, setProducts] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [editing,  setEditing]  = useState(null);
  const [activeTab, setActiveTab] = useState('packages'); // packages | items
  const empty = { name:'', unit:'', qty:1, notes:'' };
  const [form, setForm] = useState(empty);

  useEffect(()=>{
    const u1=onSnapshot(collection(db,'pos_packages'), s=>setPackages(s.docs.map(d=>({...d.data(),id:d.id}))));
    const u2=onSnapshot(collection(db,'pos_products'), s=>setProducts(s.docs.map(d=>({...d.data(),id:d.id})).filter(p=>p.hasPackage)));
    return()=>{u1();u2();};
  },[]);

  const save=async()=>{
    if(!form.name.trim())return alert('أدخل اسم التعبئة');
    if(editing){await updateDoc(doc(db,'pos_packages',editing),form);}
    else{await addDoc(collection(db,'pos_packages'),{...form,qty:Number(form.qty),createdAt:new Date().toISOString()});}
    setForm(empty);setEditing(null);setShowForm(false);
  };

  const del=async(id,name)=>{
    if(!confirm(`حذف "${name}"؟`))return;
    await deleteDoc(doc(db,'pos_packages',id));
  };

  const edit=(p)=>{setForm({name:p.name,unit:p.unit||'',qty:String(p.qty),notes:p.notes||''});setEditing(p.id);setShowForm(true);};

  // المواد المعبّأة مع تفاصيل تعبئتها
  const packagedProducts = products.map(p=>({
    ...p,
    packageInfo: packages.find(pk=>pk.id===p.packageTypeId),
  }));

  return(
    <div style={{padding:24,fontFamily:"'Cairo'",direction:'rtl'}}>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:20}}>
        <div>
          <div style={{color:'#fff',fontSize:22,fontWeight:800}}>📦 التعبئات</div>
          <div style={{color:'#64748b',fontSize:13}}>{packages.length} نوع تعبئة</div>
        </div>
        <button onClick={()=>{setForm(empty);setEditing(null);setShowForm(true);}}
          style={{background:'#a78bfa',color:'#fff',border:'none',borderRadius:12,padding:'10px 20px',fontWeight:800,cursor:'pointer',fontSize:14}}>
          + إضافة نوع تعبئة
        </button>
      </div>

      {/* تبويبات */}
      <div style={{display:'flex',gap:10,marginBottom:20}}>
        {[['packages','📦 أنواع التعبئات'],['items','🏷️ المواد المعبّأة']].map(([id,label])=>(
          <button key={id} onClick={()=>setActiveTab(id)}
            style={{background:activeTab===id?'#a78bfa':'#ffffff',color:activeTab===id?'#fff':'#64748b',border:`1px solid ${activeTab===id?'#a78bfa':'#cdd8ec'}`,borderRadius:20,padding:'8px 20px',fontSize:13,cursor:'pointer',fontWeight:activeTab===id?700:400}}>
            {label}
          </button>
        ))}
      </div>

      {/* نموذج الإضافة */}
      {showForm&&(
        <div style={{background:'#ffffff',borderRadius:16,padding:24,border:'1px solid #a78bfa33',marginBottom:20}}>
          <div style={{color:'#a78bfa',fontSize:16,fontWeight:800,marginBottom:20}}>{editing?'✏️ تعديل':'➕ إضافة نوع تعبئة'}</div>
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:14}}>
            <div>
              <label style={{color:'#64748b',fontSize:12,display:'block',marginBottom:5}}>اسم التعبئة *</label>
              <input value={form.name} onChange={e=>setForm(f=>({...f,name:e.target.value}))}
                placeholder="مثال: كرتون، رزمة، صندوق"
                style={{width:'100%',color:'#0f172a',outline:'none',boxSizing:'border-box'}}/>
            </div>
            <div>
              <label style={{color:'#64748b',fontSize:12,display:'block',marginBottom:5}}>الوحدة</label>
              <input value={form.unit} onChange={e=>setForm(f=>({...f,unit:e.target.value}))}
                placeholder="مثال: قطعة، كيلو، متر"
                style={{width:'100%',color:'#0f172a',outline:'none',boxSizing:'border-box'}}/>
            </div>
            <div>
              <label style={{color:'#64748b',fontSize:12,display:'block',marginBottom:5}}>عدد الوحدات في التعبئة</label>
              <input type="number" value={form.qty} onChange={e=>setForm(f=>({...f,qty:e.target.value}))} min={1}
                style={{width:'100%',background:'#f8fbff',border:'1px solid #cdd8ec',borderRadius:10,padding:'10px 12px',color:'#a78bfa',fontSize:15,fontWeight:700,outline:'none',boxSizing:'border-box'}}/>
            </div>
            <div style={{gridColumn:'1/-1'}}>
              <label style={{color:'#64748b',fontSize:12,display:'block',marginBottom:5}}>ملاحظات</label>
              <input value={form.notes} onChange={e=>setForm(f=>({...f,notes:e.target.value}))}
                style={{width:'100%',color:'#0f172a',outline:'none',boxSizing:'border-box'}}/>
            </div>
          </div>
          <div style={{display:'flex',gap:10,marginTop:16}}>
            <button onClick={()=>{setShowForm(false);setForm(empty);setEditing(null);}}
              style={{flex:1,background:'#f8fbff',border:'1px solid #cdd8ec',borderRadius:12,padding:12,color:'#64748b',cursor:'pointer'}}>إلغاء</button>
            <button onClick={save}
              style={{flex:2,background:'#a78bfa',color:'#fff',border:'none',borderRadius:12,padding:12,fontWeight:800,cursor:'pointer'}}>
              {editing?'💾 حفظ':'✅ إضافة'}
            </button>
          </div>
        </div>
      )}

      {/* أنواع التعبئات */}
      {activeTab==='packages'&&(
        <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:14}}>
          {packages.length===0
            ?<div style={{gridColumn:'1/-1',color:'#cdd8ec',textAlign:'center',padding:60,background:'#ffffff',borderRadius:16,border:'1px solid #d9e2f2'}}>
              لا توجد أنواع تعبئة — أضف أول نوع!
            </div>
            :packages.map(p=>(
              <div key={p.id} style={{background:'#ffffff',borderRadius:16,padding:20,border:'1px solid #d9e2f2'}}>
                <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:12}}>
                  <div style={{fontSize:36}}>📦</div>
                  <div style={{background:'#a78bfa22',border:'1px solid #a78bfa44',borderRadius:20,padding:'4px 12px'}}>
                    <span style={{color:'#a78bfa',fontSize:13,fontWeight:800}}>{p.qty} {p.unit||'وحدة'}</span>
                  </div>
                </div>
                <div style={{color:'#fff',fontSize:15,fontWeight:700,marginBottom:4}}>{p.name}</div>
                {p.notes&&<div style={{color:'#64748b',fontSize:12,marginBottom:10}}>{p.notes}</div>}
                <div style={{color:'#475569',fontSize:11,marginBottom:12}}>
                  يستخدم في: {products.filter(pr=>pr.packageTypeId===p.id).length} مادة
                </div>
                <div style={{display:'flex',gap:8}}>
                  <button onClick={()=>edit(p)} style={{flex:1,background:'#a78bfa22',border:'1px solid #a78bfa44',borderRadius:10,padding:'7px 0',color:'#a78bfa',fontSize:12,fontWeight:700,cursor:'pointer'}}>✏️ تعديل</button>
                  {user.role==='مدير'&&<button onClick={()=>del(p.id,p.name)} style={{flex:1,background:'#ef444422',border:'1px solid #ef444444',borderRadius:10,padding:'7px 0',color:'#ef4444',fontSize:12,fontWeight:700,cursor:'pointer'}}>🗑️ حذف</button>}
                </div>
              </div>
            ))
          }
        </div>
      )}

      {/* المواد المعبّأة */}
      {activeTab==='items'&&(
        <div style={{background:'#ffffff',borderRadius:16,border:'1px solid #d9e2f2',overflow:'hidden'}}>
          <div style={{display:'grid',gridTemplateColumns:'2fr 1fr 1fr 1fr 1fr',padding:'12px 20px',borderBottom:'1px solid #d9e2f2',background:'#f8fbff'}}>
            {['المادة','نوع التعبئة','عدد الوحدات','سعر المفرد','سعر التعبئة'].map(h=>(
              <div key={h} style={{color:'#64748b',fontSize:11,fontWeight:700}}>{h}</div>
            ))}
          </div>
          {packagedProducts.length===0
            ?<div style={{color:'#cdd8ec',textAlign:'center',padding:60}}>لا توجد مواد معبّأة بعد</div>
            :packagedProducts.map((p,i)=>(
              <div key={p.id} style={{display:'grid',gridTemplateColumns:'2fr 1fr 1fr 1fr 1fr',padding:'12px 20px',borderBottom:i<packagedProducts.length-1?'1px solid #ffffff':'none',alignItems:'center'}}>
                <div style={{display:'flex',gap:10,alignItems:'center'}}>
                  <span style={{fontSize:20}}>{p.img||'📦'}</span>
                  <div>
                    <div style={{color:'#1e293b',fontSize:13,fontWeight:600}}>{p.name}</div>
                    <div style={{color:'#64748b',fontSize:11}}>{p.cat}</div>
                  </div>
                </div>
                <div style={{color:'#a78bfa',fontSize:12,fontWeight:700}}>{p.packageInfo?.name||'—'}</div>
                <div style={{color:'#1e293b',fontSize:12}}>{p.packageQty||p.packageInfo?.qty||'—'} {p.packageInfo?.unit||''}</div>
                <div style={{color:'#F5C800',fontSize:12}}>{(p.sellPrice||0).toLocaleString('ar-IQ')} د.ع</div>
                <div style={{color:'#10b981',fontSize:12,fontWeight:700}}>
                  {p.packagePrice
                    ? `${p.packagePrice.toLocaleString('ar-IQ')} د.ع`
                    : `${((p.sellPrice||0)*(p.packageQty||p.packageInfo?.qty||1)).toLocaleString('ar-IQ')} د.ع`
                  }
                </div>
              </div>
            ))
          }
        </div>
      )}
    </div>
  );
}
