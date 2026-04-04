import { useState, useEffect } from 'react';
import { collection, onSnapshot, deleteDoc, doc } from 'firebase/firestore';
import { db } from '../../firebase';

const fmt = n=>(n||0).toLocaleString('ar-IQ');

export default function CompletedTasks({ user }) {
  const [tasks,    setTasks]    = useState([]);
  const [search,   setSearch]   = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo,   setDateTo]   = useState('');
  const [assignee, setAssignee] = useState('الكل');

  useEffect(()=>{
    const u=onSnapshot(collection(db,'pos_tasks'),s=>setTasks(
      s.docs.map(d=>({...d.data(),id:d.id}))
        .filter(t=>t.status==='منتهية')
        .sort((a,b)=>new Date(b.completedAt||b.createdAt)-new Date(a.completedAt||a.createdAt))
    ));
    return()=>u();
  },[]);

  const inRange=d=>{ const ds=(d||'').slice(0,10); if(dateFrom&&ds<dateFrom)return false; if(dateTo&&ds>dateTo)return false; return true; };
  const assignees=['الكل',...new Set(tasks.map(t=>t.assignee).filter(Boolean))];

  const filtered=tasks.filter(t=>{
    const mS=!search||t.title?.includes(search)||t.assignee?.includes(search);
    const mD=inRange(t.completedAt||t.createdAt);
    const mA=assignee==='الكل'||t.assignee===assignee;
    return mS&&mD&&mA;
  });

  const del=async(id)=>{ if(!confirm('حذف هذه المهمة نهائياً؟'))return; await deleteDoc(doc(db,'pos_tasks',id)); };

  const PR_COLORS={ عالية:'#ef4444', متوسطة:'#f59e0b', منخفضة:'#10b981' };
  const PR_ICONS={ عالية:'🔴', متوسطة:'🟡', منخفضة:'🟢' };

  // إحصائيات
  const byAssignee={};
  filtered.forEach(t=>{byAssignee[t.assignee]=(byAssignee[t.assignee]||0)+1;});
  const avgTime=filtered.filter(t=>t.completedAt&&t.createdAt).reduce((s,t)=>{
    return s+(new Date(t.completedAt)-new Date(t.createdAt))/(1000*60*60*24);
  },0)/Math.max(filtered.length,1);

  return(
    <div style={{padding:24,fontFamily:"'Cairo'",direction:'rtl'}}>
      <div style={{color:'#fff',fontSize:22,fontWeight:800,marginBottom:20}}>🏁 المهام المنجزة</div>

      <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:14,marginBottom:20}}>
        {[['🏁','إجمالي المنجزة',filtered.length,'#10b981'],['⏱️','متوسط وقت الإنجاز',`${avgTime.toFixed(1)} يوم`,'#3b82f6'],['👤','أكثر منجز',Object.entries(byAssignee).sort((a,b)=>b[1]-a[1])[0]?.[0]||'—','#F5C800']].map(([icon,label,val,color])=>(
          <div key={label} style={{background:'#ffffff',borderRadius:14,padding:16,border:`1px solid ${color}33`,textAlign:'center'}}>
            <div style={{fontSize:24,marginBottom:6}}>{icon}</div>
            <div style={{color:'#64748b',fontSize:11,marginBottom:4}}>{label}</div>
            <div style={{color,fontSize:16,fontWeight:800}}>{val}</div>
          </div>
        ))}
      </div>

      {Object.keys(byAssignee).length>0&&(
        <div style={{background:'#ffffff',borderRadius:14,padding:16,border:'1px solid #d9e2f2',marginBottom:20}}>
          <div style={{color:'#fff',fontSize:13,fontWeight:700,marginBottom:12}}>📊 الإنجاز حسب المستخدم</div>
          <div style={{display:'flex',gap:12,flexWrap:'wrap'}}>
            {Object.entries(byAssignee).sort((a,b)=>b[1]-a[1]).map(([name,count])=>(
              <div key={name} style={{background:'#f8fbff',borderRadius:10,padding:'10px 16px',border:'1px solid #d9e2f2',textAlign:'center'}}>
                <div style={{color:'#1e293b',fontSize:12,fontWeight:700,marginBottom:4}}>{name}</div>
                <div style={{color:'#10b981',fontSize:18,fontWeight:900}}>{count}</div>
                <div style={{color:'#64748b',fontSize:10}}>مهمة</div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div style={{display:'flex',gap:10,marginBottom:16,flexWrap:'wrap'}}>
        <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="🔍 ابحث..."
          style={{flex:1,color:'#0f172a',fontSize:13,outline:'none'}}/>
        {assignees.map(a=>(
          <button key={a} onClick={()=>setAssignee(a)}
            style={{background:assignee===a?'#10b981':'#ffffff',color:assignee===a?'#fff':'#64748b',border:`1px solid ${assignee===a?'#10b981':'#cdd8ec'}`,borderRadius:20,padding:'7px 14px',fontSize:12,cursor:'pointer',fontWeight:assignee===a?700:400}}>{a}</button>
        ))}
        <input type="date" value={dateFrom} onChange={e=>setDateFrom(e.target.value)} style={{color:'#0f172a',outline:'none'}}/>
        <span style={{color:'#64748b',alignSelf:'center'}}>—</span>
        <input type="date" value={dateTo} onChange={e=>setDateTo(e.target.value)} style={{color:'#0f172a',outline:'none'}}/>
      </div>

      <div style={{display:'flex',flexDirection:'column',gap:8}}>
        {filtered.length===0
          ?<div style={{background:'#ffffff',borderRadius:16,padding:60,textAlign:'center',border:'1px solid #d9e2f2'}}>
            <div style={{fontSize:40,marginBottom:12}}>📭</div>
            <div style={{color:'#64748b',fontSize:14}}>لا توجد مهام منجزة</div>
          </div>
          :filtered.map((task,i)=>{
            const duration=task.completedAt&&task.createdAt?((new Date(task.completedAt)-new Date(task.createdAt))/(1000*60*60*24)).toFixed(1):null;
            return(
              <div key={task.id} style={{background:'#ffffff',borderRadius:14,padding:16,border:'1px solid #10b98133',display:'flex',justifyContent:'space-between',alignItems:'center',gap:16}}>
                <div style={{flex:1}}>
                  <div style={{display:'flex',gap:8,alignItems:'center',marginBottom:6}}>
                    <span style={{fontSize:16}}>✅</span>
                    <span style={{color:'#64748b',fontSize:14,textDecoration:'line-through'}}>{task.title}</span>
                    <span style={{fontSize:12}}>{PR_ICONS[task.priority]||'🟡'}</span>
                  </div>
                  <div style={{display:'flex',gap:8,flexWrap:'wrap'}}>
                    <span style={{color:'#64748b',fontSize:11}}>👤 {task.assignee}</span>
                    <span style={{color:'#64748b',fontSize:11}}>📂 {task.category}</span>
                    {duration&&<span style={{color:'#10b981',fontSize:11}}>⏱️ {duration} يوم</span>}
                    {task.completedAt&&<span style={{color:'#475569',fontSize:11}}>أُنجزت: {task.completedAt?.slice(0,10)}</span>}
                  </div>
                  {task.desc&&<div style={{color:'#475569',fontSize:11,marginTop:4}}>{task.desc}</div>}
                </div>
                {user.role==='مدير'&&(
                  <button onClick={()=>del(task.id)}
                    style={{background:'#ef444422',border:'1px solid #ef444444',borderRadius:8,padding:'6px 10px',color:'#ef4444',fontSize:12,cursor:'pointer',flexShrink:0}}>🗑️</button>
                )}
              </div>
            );
          })
        }
      </div>
    </div>
  );
}
