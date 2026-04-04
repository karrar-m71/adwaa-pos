import { useState, useEffect } from 'react';
import { collection, onSnapshot, addDoc, updateDoc, deleteDoc, doc } from 'firebase/firestore';
import { db } from '../../firebase';

const PRIORITIES = [
  { id:'عالية', color:'#ef4444', icon:'🔴' },
  { id:'متوسطة', color:'#f59e0b', icon:'🟡' },
  { id:'منخفضة', color:'#10b981', icon:'🟢' },
];

const ASSIGNEES = ['كرار عبد الرضا','الكاشير','المحاسب'];

export default function TaskManager({ user }) {
  const [tasks,    setTasks]    = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [filter,   setFilter]   = useState('pending'); // pending | inprogress | done | all
  const [search,   setSearch]   = useState('');
  const [saving,   setSaving]   = useState(false);

  const empty = { title:'', desc:'', priority:'متوسطة', assignee:user.name, dueDate:'', category:'عام' };
  const [form, setForm] = useState(empty);

  useEffect(()=>{
    const u=onSnapshot(collection(db,'pos_tasks'),s=>setTasks(s.docs.map(d=>({...d.data(),id:d.id})).sort((a,b)=>new Date(b.createdAt)-new Date(a.createdAt))));
    return()=>u();
  },[]);

  const filtered=tasks.filter(t=>{
    const mS=!search||t.title?.includes(search)||t.assignee?.includes(search);
    const mF=filter==='all'||(filter==='pending'&&t.status==='جديدة')||(filter==='inprogress'&&t.status==='قيد التنفيذ')||(filter==='done'&&t.status==='منتهية');
    return mS&&mF;
  });

  const save=async()=>{
    if(!form.title.trim())return alert('يرجى إدخال عنوان المهمة');
    setSaving(true);
    try{
      await addDoc(collection(db,'pos_tasks'),{
        ...form, status:'جديدة',
        createdBy:user.name, createdAt:new Date().toISOString(),
        completedAt:null,
      });
      setForm(empty);setShowForm(false);
    }catch(e){alert('حدث خطأ!');}
    setSaving(false);
  };

  const changeStatus=async(id,status)=>{
    await updateDoc(doc(db,'pos_tasks',id),{
      status, completedAt:status==='منتهية'?new Date().toISOString():null,
    });
  };

  const del=async(id)=>{ if(!confirm('حذف المهمة؟'))return; await deleteDoc(doc(db,'pos_tasks',id)); };

  const counts={
    جديدة:     tasks.filter(t=>t.status==='جديدة').length,
    'قيد التنفيذ': tasks.filter(t=>t.status==='قيد التنفيذ').length,
    منتهية:    tasks.filter(t=>t.status==='منتهية').length,
  };

  const CATS=['عام','مبيعات','مشتريات','مخزون','محاسبة','صيانة','أخرى'];

  return(
    <div style={{padding:24,fontFamily:"'Cairo'",direction:'rtl'}}>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:20}}>
        <div>
          <div style={{color:'#fff',fontSize:22,fontWeight:800}}>✅ مدير المهام</div>
          <div style={{color:'#64748b',fontSize:13}}>{tasks.length} مهمة إجمالاً</div>
        </div>
        <button onClick={()=>setShowForm(true)}
          style={{background:'#06b6d4',color:'#fff',border:'none',borderRadius:12,padding:'10px 20px',fontWeight:800,cursor:'pointer',fontSize:14}}>
          + مهمة جديدة
        </button>
      </div>

      {/* الإحصائيات */}
      <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:14,marginBottom:20}}>
        {[['🆕','جديدة',counts.جديدة,'#3b82f6'],['⚙️','قيد التنفيذ',counts['قيد التنفيذ'],'#f59e0b'],['✅','منتهية',counts.منتهية,'#10b981']].map(([icon,label,val,color])=>(
          <div key={label} style={{background:'#ffffff',borderRadius:14,padding:16,border:`1px solid ${color}33`,textAlign:'center',cursor:'pointer'}}
            onClick={()=>setFilter(label==='جديدة'?'pending':label==='قيد التنفيذ'?'inprogress':'done')}>
            <div style={{fontSize:26,marginBottom:6}}>{icon}</div>
            <div style={{color:'#64748b',fontSize:11,marginBottom:4}}>{label}</div>
            <div style={{color,fontSize:22,fontWeight:800}}>{val}</div>
          </div>
        ))}
      </div>

      {/* نموذج الإضافة */}
      {showForm&&(
        <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.85)',zIndex:500,display:'flex',alignItems:'center',justifyContent:'center',padding:20}}>
          <div style={{background:'#ffffff',borderRadius:20,padding:28,width:'100%',maxWidth:540,border:'1px solid #06b6d444',maxHeight:'90vh',overflowY:'auto'}}>
            <div style={{color:'#06b6d4',fontSize:18,fontWeight:800,marginBottom:20}}>➕ مهمة جديدة</div>
            <div style={{marginBottom:14}}>
              <label style={{color:'#64748b',fontSize:12,display:'block',marginBottom:5}}>عنوان المهمة *</label>
              <input value={form.title} onChange={e=>setForm(f=>({...f,title:e.target.value}))} placeholder="مثال: مراجعة المخزون"
                style={{width:'100%',color:'#0f172a',outline:'none',boxSizing:'border-box',fontFamily:"'Cairo'"}}/>
            </div>
            <div style={{marginBottom:14}}>
              <label style={{color:'#64748b',fontSize:12,display:'block',marginBottom:5}}>الوصف</label>
              <textarea value={form.desc} onChange={e=>setForm(f=>({...f,desc:e.target.value}))} rows={3} placeholder="تفاصيل المهمة..."
                style={{width:'100%',color:'#0f172a',outline:'none',resize:'vertical',fontFamily:"'Cairo'",boxSizing:'border-box'}}/>
            </div>
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:12,marginBottom:14}}>
              <div>
                <label style={{color:'#64748b',fontSize:12,display:'block',marginBottom:5}}>الأولوية</label>
                <div style={{display:'flex',flexDirection:'column',gap:6}}>
                  {PRIORITIES.map(p=>(
                    <button key={p.id} onClick={()=>setForm(f=>({...f,priority:p.id}))}
                      style={{background:form.priority===p.id?`${p.color}22`:'#f8fbff',color:form.priority===p.id?p.color:'#64748b',border:`2px solid ${form.priority===p.id?p.color:'#cdd8ec'}`,borderRadius:8,padding:'7px 0',fontWeight:700,cursor:'pointer',fontSize:12}}>
                      {p.icon} {p.id}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label style={{color:'#64748b',fontSize:12,display:'block',marginBottom:5}}>المكلَّف</label>
                <select value={form.assignee} onChange={e=>setForm(f=>({...f,assignee:e.target.value}))}
                  style={{width:'100%',color:'#0f172a',outline:'none',marginBottom:8}}>
                  {ASSIGNEES.map(a=><option key={a}>{a}</option>)}
                </select>
                <label style={{color:'#64748b',fontSize:12,display:'block',marginBottom:5}}>التصنيف</label>
                <select value={form.category} onChange={e=>setForm(f=>({...f,category:e.target.value}))}
                  style={{width:'100%',color:'#0f172a',outline:'none'}}>
                  {CATS.map(c=><option key={c}>{c}</option>)}
                </select>
              </div>
              <div>
                <label style={{color:'#64748b',fontSize:12,display:'block',marginBottom:5}}>تاريخ الاستحقاق</label>
                <input type="date" value={form.dueDate} onChange={e=>setForm(f=>({...f,dueDate:e.target.value}))}
                  style={{width:'100%',color:'#0f172a',outline:'none'}}/>
              </div>
            </div>
            <div style={{display:'flex',gap:10}}>
              <button onClick={()=>setShowForm(false)} style={{flex:1,background:'#f8fbff',border:'1px solid #cdd8ec',borderRadius:12,padding:12,color:'#64748b',cursor:'pointer',fontFamily:"'Cairo'"}}>إلغاء</button>
              <button onClick={save} disabled={saving} style={{flex:2,background:'#06b6d4',color:'#fff',border:'none',borderRadius:12,padding:12,fontWeight:800,cursor:'pointer',fontFamily:"'Cairo'",fontSize:14,opacity:saving?0.6:1}}>
                {saving?'⏳ جاري...':'✅ إضافة المهمة'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* فلاتر */}
      <div style={{display:'flex',gap:10,marginBottom:16}}>
        <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="🔍 ابحث..."
          style={{flex:1,color:'#0f172a',fontSize:13,outline:'none'}}/>
        {[['all','الكل'],['pending','جديدة'],['inprogress','قيد التنفيذ'],['done','منتهية']].map(([v,l])=>(
          <button key={v} onClick={()=>setFilter(v)}
            style={{background:filter===v?'#06b6d4':'#ffffff',color:filter===v?'#fff':'#64748b',border:`1px solid ${filter===v?'#06b6d4':'#cdd8ec'}`,borderRadius:20,padding:'8px 14px',fontSize:12,cursor:'pointer',fontWeight:filter===v?700:400}}>{l}</button>
        ))}
      </div>

      {/* المهام */}
      <div style={{display:'flex',flexDirection:'column',gap:10}}>
        {filtered.length===0
          ?<div style={{background:'#ffffff',borderRadius:16,padding:60,textAlign:'center',border:'1px solid #d9e2f2'}}>
            <div style={{fontSize:40,marginBottom:12}}>✅</div>
            <div style={{color:'#64748b',fontSize:14}}>لا توجد مهام</div>
          </div>
          :filtered.map(task=>{
            const pr=PRIORITIES.find(p=>p.id===task.priority)||PRIORITIES[1];
            const isOverdue=task.dueDate&&new Date(task.dueDate)<new Date()&&task.status!=='منتهية';
            return(
              <div key={task.id} style={{background:'#ffffff',borderRadius:14,padding:16,border:`1px solid ${isOverdue?'#ef444433':task.status==='منتهية'?'#10b98133':'#d9e2f2'}`}}>
                <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:10}}>
                  <div style={{flex:1}}>
                    <div style={{display:'flex',gap:8,alignItems:'center',marginBottom:4}}>
                      <span style={{fontSize:14}}>{pr.icon}</span>
                      <div style={{color:task.status==='منتهية'?'#64748b':'#fff',fontSize:14,fontWeight:700,textDecoration:task.status==='منتهية'?'line-through':'none'}}>{task.title}</div>
                      {isOverdue&&<span style={{background:'#ef444422',border:'1px solid #ef444444',borderRadius:20,padding:'1px 8px',color:'#ef4444',fontSize:10,fontWeight:700}}>متأخرة!</span>}
                    </div>
                    {task.desc&&<div style={{color:'#64748b',fontSize:12,marginBottom:6}}>{task.desc}</div>}
                    <div style={{display:'flex',gap:10,flexWrap:'wrap'}}>
                      <span style={{background:'#06b6d422',borderRadius:20,padding:'2px 8px',color:'#06b6d4',fontSize:10}}>👤 {task.assignee}</span>
                      <span style={{background:'#d9e2f2',borderRadius:20,padding:'2px 8px',color:'#64748b',fontSize:10}}>📂 {task.category}</span>
                      {task.dueDate&&<span style={{background:isOverdue?'#ef444422':'#d9e2f2',borderRadius:20,padding:'2px 8px',color:isOverdue?'#ef4444':'#64748b',fontSize:10}}>📅 {task.dueDate}</span>}
                      <span style={{background:'#d9e2f2',borderRadius:20,padding:'2px 8px',color:'#475569',fontSize:10}}>بواسطة {task.createdBy}</span>
                    </div>
                  </div>
                  <div style={{display:'flex',gap:6,alignItems:'center',marginRight:10}}>
                    {/* تغيير الحالة */}
                    {task.status==='جديدة'&&(
                      <button onClick={()=>changeStatus(task.id,'قيد التنفيذ')}
                        style={{background:'#f59e0b22',border:'1px solid #f59e0b44',borderRadius:8,padding:'5px 10px',color:'#f59e0b',fontSize:11,fontWeight:700,cursor:'pointer',whiteSpace:'nowrap'}}>⚙️ بدء</button>
                    )}
                    {task.status==='قيد التنفيذ'&&(
                      <button onClick={()=>changeStatus(task.id,'منتهية')}
                        style={{background:'#10b98122',border:'1px solid #10b98144',borderRadius:8,padding:'5px 10px',color:'#10b981',fontSize:11,fontWeight:700,cursor:'pointer',whiteSpace:'nowrap'}}>✅ إنهاء</button>
                    )}
                    {task.status==='منتهية'&&(
                      <button onClick={()=>changeStatus(task.id,'جديدة')}
                        style={{background:'#3b82f622',border:'1px solid #3b82f644',borderRadius:8,padding:'5px 10px',color:'#3b82f6',fontSize:11,fontWeight:700,cursor:'pointer',whiteSpace:'nowrap'}}>🔄 إعادة</button>
                    )}
                    <button onClick={()=>del(task.id)}
                      style={{background:'#ef444422',border:'1px solid #ef444444',borderRadius:8,padding:'5px 8px',color:'#ef4444',fontSize:12,cursor:'pointer'}}>🗑️</button>
                  </div>
                </div>
                {/* شريط الحالة */}
                <div style={{display:'flex',alignItems:'center',gap:8}}>
                  {['جديدة','قيد التنفيذ','منتهية'].map((s,idx)=>(
                    <div key={s} style={{display:'flex',alignItems:'center',gap:4}}>
                      <div style={{width:8,height:8,borderRadius:4,background:task.status===s?(['#3b82f6','#f59e0b','#10b981'][idx]):task.status==='منتهية'?['#3b82f6','#f59e0b','#10b981'][idx]+'44':'#d9e2f2'}}/>
                      <span style={{color:task.status===s?['#3b82f6','#f59e0b','#10b981'][idx]:'#cdd8ec',fontSize:10}}>{s}</span>
                      {idx<2&&<div style={{width:20,height:1,background:'#d9e2f2'}}/>}
                    </div>
                  ))}
                </div>
              </div>
            );
          })
        }
      </div>
    </div>
  );
}
