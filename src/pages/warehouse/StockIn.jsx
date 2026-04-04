import { useState, useEffect } from 'react';
import { collection, onSnapshot, addDoc, updateDoc, doc } from 'firebase/firestore';
import { db } from '../../firebase';

const fmt = n=>(n||0).toLocaleString('ar-IQ')+' د.ع';
const today=()=>new Date().toISOString().split('T')[0];

export default function StockIn({ user }) {
  const [products,setProducts]=useState([]);
  const [warehouses,setWarehouses]=useState([]);
  const [movements,setMovements]=useState([]);
  const [cart,setCart]=useState([]);
  const [warehouse,setWarehouse]=useState('');
  const [date,setDate]=useState(today());
  const [notes,setNotes]=useState('');
  const [saving,setSaving]=useState(false);

  useEffect(()=>{
    const u1=onSnapshot(collection(db,'pos_products'),s=>setProducts(s.docs.map(d=>({...d.data(),id:d.id}))));
    const u2=onSnapshot(collection(db,'pos_warehouses'),s=>setWarehouses(s.docs.map(d=>({...d.data(),id:d.id}))));
    const u3=onSnapshot(collection(db,'pos_inventory_movements'),s=>setMovements(s.docs.map(d=>({...d.data(),id:d.id})).filter(m=>m.type==='إدخال').sort((a,b)=>new Date(b.createdAt)-new Date(a.createdAt))));
    return()=>{u1();u2();u3();};
  },[]);

  const addRow=()=>setCart(c=>[...c,{productId:'',productName:'',qty:1,buyPrice:0,unit:''}]);
  const updateRow=(i,f,v)=>setCart(c=>c.map((r,idx)=>{
    if(idx!==i)return r;
    if(f==='productId'){const p=products.find(p=>p.id===v);return{...r,productId:v,productName:p?.name||'',buyPrice:p?.buyPrice||0,unit:p?.unit||''};}
    return{...r,[f]:v};
  }));

  const save=async()=>{
    if(cart.length===0)return alert('أضف منتجات');
    setSaving(true);
    try{
      const no='SI-'+Date.now().toString().slice(-6);
      await addDoc(collection(db,'pos_inventory_movements'),{
        no,type:'إدخال',warehouse,items:cart,
        date,notes,addedBy:user.name,createdAt:new Date().toISOString(),
      });
      for(const item of cart){
        if(item.productId){
          const p=products.find(p=>p.id===item.productId);
          if(p)await updateDoc(doc(db,'pos_products',item.productId),{stock:(p.stock||0)+Number(item.qty)});
        }
      }
      setCart([]);setNotes('');
      alert('✅ تم تسجيل الإدخال المخزني');
    }catch(e){alert('حدث خطأ!');}
    setSaving(false);
  };

  return(
    <div style={{padding:24,fontFamily:"'Cairo'",direction:'rtl'}}>
      <div style={{color:'#fff',fontSize:22,fontWeight:800,marginBottom:24}}>📥 إدخال مخزني</div>
      <div style={{display:'grid',gridTemplateColumns:'2fr 1fr',gap:20}}>
        <div>
          <div style={{background:'#ffffff',borderRadius:16,padding:20,border:'1px solid #d9e2f2',marginBottom:16}}>
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:14,marginBottom:16}}>
              <div>
                <label style={{color:'#64748b',fontSize:12,display:'block',marginBottom:5}}>المخزن</label>
                <select value={warehouse} onChange={e=>setWarehouse(e.target.value)}
                  style={{width:'100%',color:'#0f172a',outline:'none'}}>
                  <option value="">اختر المخزن...</option>
                  {warehouses.map(w=><option key={w.id} value={w.name}>{w.name}</option>)}
                </select>
              </div>
              <div>
                <label style={{color:'#64748b',fontSize:12,display:'block',marginBottom:5}}>التاريخ</label>
                <input type="date" value={date} onChange={e=>setDate(e.target.value)}
                  style={{width:'100%',color:'#0f172a',outline:'none'}}/>
              </div>
            </div>
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:14}}>
              <div style={{color:'#fff',fontSize:14,fontWeight:700}}>المواد</div>
              <button onClick={addRow} style={{background:'#a78bfa22',border:'1px solid #a78bfa44',borderRadius:10,padding:'6px 14px',color:'#a78bfa',cursor:'pointer',fontSize:13,fontWeight:700}}>+ إضافة صنف</button>
            </div>
            {cart.map((r,i)=>(
              <div key={i} style={{display:'grid',gridTemplateColumns:'2fr 1fr 1fr auto',gap:8,marginBottom:8,alignItems:'center'}}>
                <select value={r.productId} onChange={e=>updateRow(i,'productId',e.target.value)}
                  style={{color:'#0f172a',outline:'none'}}>
                  <option value="">اختر مادة...</option>
                  {products.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
                <input type="number" value={r.qty} onChange={e=>updateRow(i,'qty',e.target.value)} placeholder="الكمية"
                  style={{color:'#0f172a',outline:'none'}}/>
                <input type="number" value={r.buyPrice} onChange={e=>updateRow(i,'buyPrice',e.target.value)} placeholder="سعر الشراء"
                  style={{color:'#0f172a',outline:'none'}}/>
                <button onClick={()=>setCart(c=>c.filter((_,idx)=>idx!==i))}
                  style={{background:'#ef444422',border:'1px solid #ef444444',borderRadius:10,padding:'10px 12px',color:'#ef4444',cursor:'pointer'}}>✕</button>
              </div>
            ))}
            <div style={{marginTop:14}}>
              <label style={{color:'#64748b',fontSize:12,display:'block',marginBottom:5}}>ملاحظات</label>
              <textarea value={notes} onChange={e=>setNotes(e.target.value)} rows={2}
                style={{width:'100%',color:'#0f172a',outline:'none',resize:'vertical',fontFamily:"'Cairo'"}}/>
            </div>
          </div>
          <button onClick={save} disabled={saving||cart.length===0}
            style={{width:'100%',background:cart.length===0?'#ffffff':'linear-gradient(135deg,#a78bfa,#7c3aed)',color:cart.length===0?'#cdd8ec':'#fff',border:'none',borderRadius:14,padding:14,fontWeight:800,fontSize:15,cursor:cart.length===0?'not-allowed':'pointer'}}>
            {saving?'⏳ جاري الحفظ...':'✅ حفظ الإدخال المخزني'}
          </button>
        </div>

        {/* آخر الإدخالات */}
        <div style={{background:'#ffffff',borderRadius:16,border:'1px solid #d9e2f2',overflow:'hidden'}}>
          <div style={{padding:'14px 16px',borderBottom:'1px solid #d9e2f2',color:'#fff',fontSize:14,fontWeight:700}}>آخر الإدخالات</div>
          {movements.length===0
            ?<div style={{color:'#cdd8ec',textAlign:'center',padding:40}}>لا توجد سجلات</div>
            :movements.slice(0,10).map((m,i)=>(
              <div key={m.id} style={{padding:'12px 16px',borderBottom:i<9?'1px solid #ffffff':'none'}}>
                <div style={{color:'#a78bfa',fontSize:12,fontWeight:700}}>{m.no}</div>
                <div style={{color:'#64748b',fontSize:11}}>{m.date} • {m.warehouse||'—'}</div>
                <div style={{color:'#1e293b',fontSize:11}}>{m.items?.length||0} صنف</div>
              </div>
            ))
          }
        </div>
      </div>
    </div>
  );
}
