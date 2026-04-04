import { useState, useEffect } from 'react';
import { collection, onSnapshot, addDoc, doc, updateDoc } from 'firebase/firestore';
import { db } from '../../firebase';

const fmt = n=>(n||0).toLocaleString('ar-IQ')+' د.ع';

export default function AdjustedBalances({ user }) {
  const [customers, setCustomers] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [adjustments, setAdjustments] = useState([]);
  const [tab,      setTab]      = useState('customers');
  const [search,   setSearch]   = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo,   setDateTo]   = useState('');
  const [showForm, setShowForm] = useState(false);
  const [saving,   setSaving]   = useState(false);
  const [form, setForm] = useState({ partyName:'', partyType:'زبون', oldBalance:0, newBalance:'', reason:'' });

  useEffect(()=>{
    const us=[
      onSnapshot(collection(db,'pos_customers'),   s=>setCustomers(s.docs.map(d=>({...d.data(),id:d.id})))),
      onSnapshot(collection(db,'pos_suppliers'),   s=>setSuppliers(s.docs.map(d=>({...d.data(),id:d.id})))),
      onSnapshot(collection(db,'pos_adj_balances'),s=>setAdjustments(s.docs.map(d=>({...d.data(),id:d.id})).sort((a,b)=>new Date(b.createdAt)-new Date(a.createdAt)))),
    ];
    return()=>us.forEach(u=>u());
  },[]);

  const inRange=d=>{ if(!d)return true; const ds=d?.slice(0,10)||''; if(dateFrom&&ds<dateFrom)return false; if(dateTo&&ds>dateTo)return false; return true; };
  const filtered=adjustments.filter(a=>inRange(a.createdAt)&&(!search||a.partyName?.includes(search)||a.reason?.includes(search)));

  const saveAdj=async()=>{
    if(!form.partyName||form.newBalance==='')return alert('يرجى إدخال الاسم والرصيد الجديد');
    setSaving(true);
    try{
      const diff=Number(form.newBalance)-(form.oldBalance||0);
      await addDoc(collection(db,'pos_adj_balances'),{
        ...form, newBalance:Number(form.newBalance),
        diff, adjBy:user.name,
        date:new Date().toISOString().split('T')[0],
        createdAt:new Date().toISOString(),
      });
      // تحديث الرصيد الفعلي
      if(form.partyType==='زبون'){
        const c=customers.find(c=>c.name===form.partyName);
        if(c)await updateDoc(doc(db,'pos_customers',c.id),{debt:Math.max(0,Number(form.newBalance))});
      } else {
        const s=suppliers.find(s=>s.name===form.partyName);
        if(s)await updateDoc(doc(db,'pos_suppliers',s.id),{debt:Math.max(0,Number(form.newBalance))});
      }
      setShowForm(false);setForm({partyName:'',partyType:'زبون',oldBalance:0,newBalance:'',reason:''});
    }catch(e){alert('حدث خطأ!');}
    setSaving(false);
  };

  const parties=(tab==='customers'?customers:suppliers);

  return(
    <div style={{padding:24,fontFamily:"'Cairo'",direction:'rtl'}}>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:20}}>
        <div>
          <div style={{color:'#fff',fontSize:22,fontWeight:800}}>⚖️ الأرصدة المعدّلة</div>
          <div style={{color:'#64748b',fontSize:13}}>{filtered.length} تعديل مسجّل</div>
        </div>
        {user.role==='مدير'&&(
          <button onClick={()=>setShowForm(true)}
            style={{background:'#f59e0b',color:'#000',border:'none',borderRadius:12,padding:'10px 20px',fontWeight:800,cursor:'pointer',fontSize:14}}>
            ✏️ تعديل رصيد
          </button>
        )}
      </div>

      {/* تنبيه */}
      <div style={{background:'#f59e0b11',border:'1px solid #f59e0b33',borderRadius:12,padding:12,marginBottom:20,textAlign:'center'}}>
        <div style={{color:'#f59e0b',fontSize:13}}>⚠️ هذه الصفحة تعرض التعديلات اليدوية على أرصدة الزبائن والموردين — كل تعديل مسجّل بالمستخدم والسبب</div>
      </div>

      {/* نموذج التعديل */}
      {showForm&&(
        <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.85)',zIndex:500,display:'flex',alignItems:'center',justifyContent:'center',padding:20}}>
          <div style={{background:'#ffffff',borderRadius:20,padding:28,width:'100%',maxWidth:480,border:'1px solid #f59e0b44'}}>
            <div style={{color:'#f59e0b',fontSize:18,fontWeight:800,marginBottom:20}}>✏️ تعديل رصيد حساب</div>
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:14,marginBottom:14}}>
              <div>
                <label style={{color:'#64748b',fontSize:12,display:'block',marginBottom:5}}>نوع الحساب</label>
                <select value={form.partyType} onChange={e=>setForm(f=>({...f,partyType:e.target.value,partyName:''}))}
                  style={{width:'100%',color:'#0f172a',outline:'none'}}>
                  <option>زبون</option><option>مورد</option>
                </select>
              </div>
              <div>
                <label style={{color:'#64748b',fontSize:12,display:'block',marginBottom:5}}>اسم الحساب</label>
                <select value={form.partyName} onChange={e=>{
                  const p=(form.partyType==='زبون'?customers:suppliers).find(p=>p.name===e.target.value);
                  setForm(f=>({...f,partyName:e.target.value,oldBalance:p?.debt||0}));
                }} style={{width:'100%',color:'#0f172a',outline:'none'}}>
                  <option value="">اختر...</option>
                  {(form.partyType==='زبون'?customers:suppliers).map(p=><option key={p.id} value={p.name}>{p.name}</option>)}
                </select>
              </div>
            </div>
            {form.partyName&&(
              <div style={{background:'#f8fbff',borderRadius:10,padding:12,marginBottom:14,display:'flex',justifyContent:'space-between'}}>
                <span style={{color:'#64748b',fontSize:13}}>الرصيد الحالي</span>
                <span style={{color:'#f59e0b',fontSize:16,fontWeight:800}}>{fmt(form.oldBalance)}</span>
              </div>
            )}
            <div style={{marginBottom:14}}>
              <label style={{color:'#64748b',fontSize:12,display:'block',marginBottom:5}}>الرصيد الجديد (د.ع)</label>
              <input type="number" value={form.newBalance} onChange={e=>setForm(f=>({...f,newBalance:e.target.value}))}
                style={{width:'100%',background:'#f8fbff',border:'1px solid #cdd8ec',borderRadius:10,padding:'12px 14px',color:'#F5C800',fontSize:18,fontWeight:800,outline:'none',boxSizing:'border-box'}}/>
              {form.newBalance!==''&&<div style={{color:'#64748b',fontSize:12,marginTop:6}}>
                الفرق: <span style={{color:Number(form.newBalance)-form.oldBalance>0?'#ef4444':Number(form.newBalance)-form.oldBalance<0?'#10b981':'#64748b',fontWeight:700}}>
                  {Number(form.newBalance)-form.oldBalance>0?'+':''}{fmt(Number(form.newBalance)-form.oldBalance)}
                </span>
              </div>}
            </div>
            <div style={{marginBottom:20}}>
              <label style={{color:'#64748b',fontSize:12,display:'block',marginBottom:5}}>سبب التعديل *</label>
              <input value={form.reason} onChange={e=>setForm(f=>({...f,reason:e.target.value}))} placeholder="مثال: تصحيح خطأ، اتفاقية..."
                style={{width:'100%',color:'#0f172a',outline:'none',boxSizing:'border-box',fontFamily:"'Cairo'"}}/>
            </div>
            <div style={{display:'flex',gap:10}}>
              <button onClick={()=>{setShowForm(false);}} style={{flex:1,background:'#f8fbff',border:'1px solid #cdd8ec',borderRadius:12,padding:12,color:'#64748b',cursor:'pointer',fontFamily:"'Cairo'"}}>إلغاء</button>
              <button onClick={saveAdj} disabled={saving} style={{flex:2,background:'#f59e0b',color:'#000',border:'none',borderRadius:12,padding:12,fontWeight:800,cursor:'pointer',fontFamily:"'Cairo'",fontSize:14,opacity:saving?0.6:1}}>
                {saving?'⏳ جاري...':'✅ حفظ التعديل'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* فلاتر */}
      <div style={{display:'flex',gap:10,marginBottom:16,flexWrap:'wrap'}}>
        <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="🔍 ابحث بالاسم أو السبب..."
          style={{flex:1,color:'#0f172a',fontSize:13,outline:'none'}}/>
        <input type="date" value={dateFrom} onChange={e=>setDateFrom(e.target.value)} style={{color:'#0f172a',outline:'none'}}/>
        <span style={{color:'#64748b',alignSelf:'center'}}>—</span>
        <input type="date" value={dateTo} onChange={e=>setDateTo(e.target.value)} style={{color:'#0f172a',outline:'none'}}/>
        <button onClick={()=>{setDateFrom('');setDateTo('');}} style={{background:'#d9e2f2',border:'none',borderRadius:10,padding:'10px 14px',color:'#64748b',cursor:'pointer',fontFamily:"'Cairo'"}}>إعادة</button>
      </div>

      <div style={{background:'#ffffff',borderRadius:16,border:'1px solid #d9e2f2',overflow:'hidden'}}>
        <div style={{display:'grid',gridTemplateColumns:'1.5fr 1fr 1fr 1fr 1fr 1.5fr 1fr',padding:'12px 20px',background:'#f8fbff',borderBottom:'1px solid #e2e8f7'}}>
          {['الاسم','النوع','الرصيد القديم','الرصيد الجديد','الفرق','السبب','بواسطة / التاريخ'].map(h=><div key={h} style={{color:'#64748b',fontSize:10,fontWeight:700}}>{h}</div>)}
        </div>
        {filtered.length===0
          ?<div style={{color:'#cdd8ec',textAlign:'center',padding:60}}>لا توجد تعديلات مسجّلة</div>
          :filtered.map((a,i)=>(
            <div key={a.id} style={{display:'grid',gridTemplateColumns:'1.5fr 1fr 1fr 1fr 1fr 1.5fr 1fr',padding:'12px 20px',borderBottom:i<filtered.length-1?'1px solid #ffffff':'none',alignItems:'center'}}>
              <div style={{color:'#1e293b',fontSize:13,fontWeight:700}}>{a.partyName}</div>
              <span style={{background:a.partyType==='زبون'?'#3b82f622':'#f59e0b22',border:`1px solid ${a.partyType==='زبون'?'#3b82f644':'#f59e0b44'}`,borderRadius:20,padding:'2px 8px',color:a.partyType==='زبون'?'#3b82f6':'#f59e0b',fontSize:10,fontWeight:700,display:'inline-block'}}>{a.partyType}</span>
              <div style={{color:'#64748b',fontSize:12}}>{fmt(a.oldBalance)}</div>
              <div style={{color:'#F5C800',fontSize:12,fontWeight:700}}>{fmt(a.newBalance)}</div>
              <div style={{color:a.diff>0?'#ef4444':a.diff<0?'#10b981':'#64748b',fontSize:12,fontWeight:700}}>
                {a.diff>0?'+':''}{fmt(a.diff)}
              </div>
              <div style={{color:'#64748b',fontSize:11}}>{a.reason||'—'}</div>
              <div>
                <div style={{color:'#64748b',fontSize:10}}>{a.adjBy}</div>
                <div style={{color:'#475569',fontSize:9}}>{a.date}</div>
              </div>
            </div>
          ))
        }
      </div>
    </div>
  );
}
