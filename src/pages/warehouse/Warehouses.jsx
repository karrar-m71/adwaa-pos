import { useState, useEffect } from 'react';
import { collection, onSnapshot, addDoc, updateDoc, deleteDoc, doc } from 'firebase/firestore';
import { db } from '../../firebase';

export default function Warehouses({ user }) {
  const [warehouses, setWarehouses] = useState([]);
  const [showForm, setShowForm]     = useState(false);
  const [editing, setEditing]       = useState(null);
  const [form, setForm]             = useState({ name:'', location:'', notes:'' });

  useEffect(()=>{
    const u=onSnapshot(collection(db,'pos_warehouses'),s=>setWarehouses(s.docs.map(d=>({...d.data(),id:d.id}))));
    return()=>u();
  },[]);

  const save=async()=>{
    if(!form.name.trim())return alert('أدخل اسم المخزن');
    if(editing){await updateDoc(doc(db,'pos_warehouses',editing),form);}
    else{await addDoc(collection(db,'pos_warehouses'),{...form,createdAt:new Date().toISOString(),createdBy:user.name});}
    setForm({name:'',location:'',notes:''});setEditing(null);setShowForm(false);
  };
  const del=async(id,name)=>{if(!confirm(`حذف "${name}"؟`))return;await deleteDoc(doc(db,'pos_warehouses',id));};
  const edit=(w)=>{setForm({name:w.name,location:w.location||'',notes:w.notes||''});setEditing(w.id);setShowForm(true);};

  return(
    <div style={{padding:24,fontFamily:"'Cairo'",direction:'rtl'}}>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:24}}>
        <div>
          <div style={{color:'#fff',fontSize:22,fontWeight:800}}>🏭 المخازن</div>
          <div style={{color:'#64748b',fontSize:13}}>{warehouses.length} مخزن</div>
        </div>
        <button onClick={()=>{setForm({name:'',location:'',notes:''});setEditing(null);setShowForm(true);}}
          style={{background:'#a78bfa',color:'#000',border:'none',borderRadius:12,padding:'10px 20px',fontWeight:800,cursor:'pointer',fontSize:14}}>
          + إضافة مخزن
        </button>
      </div>

      {showForm&&(
        <div style={{background:'#ffffff',borderRadius:16,padding:24,border:'1px solid #a78bfa33',marginBottom:20}}>
          <div style={{color:'#a78bfa',fontSize:16,fontWeight:800,marginBottom:16}}>{editing?'✏️ تعديل':'➕ إضافة مخزن'}</div>
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:14}}>
            {[['اسم المخزن *','name'],['الموقع','location'],['ملاحظات','notes']].map(([lb,k])=>(
              <div key={k}>
                <label style={{color:'#64748b',fontSize:12,display:'block',marginBottom:5}}>{lb}</label>
                <input value={form[k]} onChange={e=>setForm(f=>({...f,[k]:e.target.value}))}
                  style={{width:'100%',color:'#0f172a',outline:'none',boxSizing:'border-box'}}/>
              </div>
            ))}
          </div>
          <div style={{display:'flex',gap:10,marginTop:16}}>
            <button onClick={()=>{setShowForm(false);setForm({name:'',location:'',notes:''});setEditing(null);}}
              style={{flex:1,background:'#f8fbff',border:'1px solid #cdd8ec',borderRadius:12,padding:12,color:'#64748b',cursor:'pointer'}}>إلغاء</button>
            <button onClick={save}
              style={{flex:2,background:'#a78bfa',color:'#000',border:'none',borderRadius:12,padding:12,fontWeight:800,cursor:'pointer'}}>
              {editing?'💾 حفظ':'✅ إضافة'}
            </button>
          </div>
        </div>
      )}

      <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:14}}>
        {warehouses.length===0
          ?<div style={{gridColumn:'1/-1',color:'#cdd8ec',textAlign:'center',padding:60}}>لا توجد مخازن — أضف أول مخزن!</div>
          :warehouses.map(w=>(
            <div key={w.id} style={{background:'#ffffff',borderRadius:16,padding:20,border:'1px solid #d9e2f2'}}>
              <div style={{fontSize:36,marginBottom:10}}>🏭</div>
              <div style={{color:'#1e293b',fontSize:15,fontWeight:700,marginBottom:6}}>{w.name}</div>
              {w.location&&<div style={{color:'#64748b',fontSize:12,marginBottom:4}}>📍 {w.location}</div>}
              {w.notes&&<div style={{color:'#475569',fontSize:11,marginBottom:10}}>{w.notes}</div>}
              <div style={{display:'flex',gap:8,marginTop:12}}>
                <button onClick={()=>edit(w)} style={{flex:1,background:'#a78bfa22',border:'1px solid #a78bfa44',borderRadius:10,padding:'7px 0',color:'#a78bfa',fontSize:12,fontWeight:700,cursor:'pointer'}}>✏️ تعديل</button>
                {user.role==='مدير'&&<button onClick={()=>del(w.id,w.name)} style={{flex:1,background:'#ef444422',border:'1px solid #ef444444',borderRadius:10,padding:'7px 0',color:'#ef4444',fontSize:12,fontWeight:700,cursor:'pointer'}}>🗑️ حذف</button>}
              </div>
            </div>
          ))
        }
      </div>
    </div>
  );
}
