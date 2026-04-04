import { useState, useEffect, useRef } from 'react';
import { collection, onSnapshot, getDocs, writeBatch, doc } from 'firebase/firestore';
import { db } from '../../firebase';
import { hasLocalApi, localExportBackup, localRestoreBackup } from '../../data/api/localApi';

const fmt = n=>(n||0).toLocaleString('ar-IQ');
const BACKUP_COLLECTIONS = [
  { id:'pos_sales',           label:'فواتير البيع',       icon:'🧾', color:'#10b981' },
  { id:'pos_purchases',       label:'فواتير الشراء',      icon:'🛍️', color:'#f59e0b' },
  { id:'pos_products',        label:'المواد',              icon:'📦', color:'#a78bfa' },
  { id:'pos_customers',       label:'الزبائن',             icon:'👥', color:'#3b82f6' },
  { id:'pos_suppliers',       label:'الموردون',            icon:'🏭', color:'#f59e0b' },
  { id:'pos_vouchers',        label:'السندات',             icon:'🧾', color:'#F5C800' },
  { id:'pos_expenses',        label:'المصروفات',           icon:'💸', color:'#ef4444' },
  { id:'pos_returns',         label:'إرجاع المبيعات',      icon:'↩️', color:'#a78bfa' },
  { id:'pos_purchase_returns',label:'إرجاع المشتريات',     icon:'↩️', color:'#f59e0b' },
  { id:'pos_warehouses',      label:'المخازن',             icon:'🏪', color:'#06b6d4' },
  { id:'pos_packages',        label:'التعبئات',            icon:'📦', color:'#a78bfa' },
  { id:'pos_settlements',     label:'التسويات المخزنية',   icon:'⚖️', color:'#F5C800' },
  { id:'pos_tasks',           label:'المهام',               icon:'✅', color:'#10b981' },
  { id:'pos_quotes',          label:'عروض الأسعار',        icon:'💬', color:'#a78bfa' },
];

export default function Backup({ user }) {
  const [stats,     setStats]     = useState({});
  const [loading,   setLoading]   = useState(false);
  const [backupDone,setBackupDone]= useState(false);
  const [lastBackup,setLastBackup]= useState(()=>localStorage.getItem('adwaa_last_backup')||null);
  const [lastRestore,setLastRestore]= useState(()=>localStorage.getItem('adwaa_last_restore')||null);
  const [progress,  setProgress]  = useState(0);
  const [restoreLoading, setRestoreLoading] = useState(false);
  const [restoreProgress, setRestoreProgress] = useState(0);
  const [restoreDone, setRestoreDone] = useState(false);
  const [restoreSummary, setRestoreSummary] = useState(null);
  const fileInputRef = useRef(null);

  useEffect(()=>{
    // احصائيات سريعة
    const listeners=BACKUP_COLLECTIONS.map(c=>
      onSnapshot(collection(db,c.id),s=>setStats(prev=>({...prev,[c.id]:s.size})))
    );
    return()=>listeners.forEach(u=>u());
  },[]);

  const doBackup=async()=>{
    setLoading(true);setProgress(0);setBackupDone(false);
    try{
      if (hasLocalApi()) {
        const res = await localExportBackup();
        if (res?.canceled) return;
        if (!res?.ok) throw new Error('فشل تصدير النسخة المحلية');
        const now = new Date().toLocaleString('ar-IQ');
        setLastBackup(now);
        localStorage.setItem('adwaa_last_backup', now);
        setProgress(100);
        setBackupDone(true);
        alert(`تم حفظ النسخة المحلية في:\n${res.outputPath}`);
        return;
      }

      const backup={
        meta:{ version:'1.0', app:'أضواء المدينة', date:new Date().toISOString(), by:user.name },
        data:{},
      };
      for(let i=0;i<BACKUP_COLLECTIONS.length;i++){
        const col=BACKUP_COLLECTIONS[i];
        const snap=await getDocs(collection(db,col.id));
        backup.data[col.id]=snap.docs.map(d=>({id:d.id,...d.data()}));
        setProgress(Math.round((i+1)/BACKUP_COLLECTIONS.length*100));
      }
      const blob=new Blob([JSON.stringify(backup,null,2)],{type:'application/json'});
      const url=URL.createObjectURL(blob);
      const a=document.createElement('a');a.href=url;
      a.download=`adwaa-backup-${new Date().toISOString().split('T')[0]}.json`;
      a.click();URL.revokeObjectURL(url);
      const now=new Date().toLocaleString('ar-IQ');
      setLastBackup(now);localStorage.setItem('adwaa_last_backup',now);
      setBackupDone(true);
    }catch(e){alert('حدث خطأ أثناء النسخ الاحتياطي: '+e.message);}
    setLoading(false);
  };

  const doRestore = async (event) => {
    if (!confirm('سيتم استعادة البيانات من الملف. في نسخة سطح المكتب ستكون الاستعادة كاملة لقاعدة البيانات المحلية. هل تريد المتابعة؟')) return;

    setRestoreLoading(true);
    setRestoreProgress(0);
    setRestoreDone(false);
    setRestoreSummary(null);
    try {
      if (hasLocalApi()) {
        const res = await localRestoreBackup();
        if (res?.canceled) return;
        if (!res?.ok) throw new Error('فشل استعادة النسخة المحلية');
        setRestoreProgress(100);
        const now = new Date().toLocaleString('ar-IQ');
        setLastRestore(now);
        localStorage.setItem('adwaa_last_restore', now);
        setRestoreDone(true);
        setRestoreSummary({
          totalRows: res.restoredRows || 0,
          collections: Object.fromEntries((res.details || []).map((d) => [d.table, d.rows])),
        });
        alert('تمت استعادة قاعدة البيانات المحلية بنجاح. يفضّل إعادة فتح التطبيق لتحديث كل الشاشات.');
        return;
      }

      const file = event?.target?.files?.[0];
      if (event?.target) event.target.value = '';
      if (!file) return;

      const rawText = await file.text();
      const parsed = JSON.parse(rawText);
      if (!parsed || typeof parsed !== 'object' || typeof parsed.data !== 'object') {
        throw new Error('صيغة الملف غير صحيحة');
      }

      const collectionsToRestore = BACKUP_COLLECTIONS
        .map((col) => ({ ...col, rows: Array.isArray(parsed.data[col.id]) ? parsed.data[col.id] : [] }))
        .filter((col) => col.rows.length > 0);
      if (!collectionsToRestore.length) throw new Error('لا توجد بيانات قابلة للاستعادة في الملف');

      const totalRows = collectionsToRestore.reduce((sum, col) => sum + col.rows.length, 0);
      let processed = 0;
      let batch = writeBatch(db);
      let batchOps = 0;
      const restoredByCollection = {};

      const flushBatch = async () => {
        if (!batchOps) return;
        await batch.commit();
        batch = writeBatch(db);
        batchOps = 0;
      };

      for (const col of collectionsToRestore) {
        restoredByCollection[col.id] = 0;
        for (const row of col.rows) {
          if (!row || typeof row !== 'object') continue;
          const id = row.id ? String(row.id) : null;
          const payload = { ...row };
          delete payload.id;
          const ref = id ? doc(db, col.id, id) : doc(collection(db, col.id));
          batch.set(ref, payload, { merge: true });
          batchOps += 1;
          restoredByCollection[col.id] += 1;
          processed += 1;
          setRestoreProgress(Math.round((processed / totalRows) * 100));
          if (batchOps >= 400) await flushBatch();
        }
      }
      await flushBatch();

      const now = new Date().toLocaleString('ar-IQ');
      setLastRestore(now);
      localStorage.setItem('adwaa_last_restore', now);
      setRestoreDone(true);
      setRestoreSummary({
        totalRows,
        collections: restoredByCollection,
      });
    } catch (e) {
      alert('حدث خطأ أثناء الاستعادة: ' + (e?.message || 'خطأ غير معروف'));
    }
    setRestoreLoading(false);
  };

  const totalRecords=Object.values(stats).reduce((s,v)=>s+(v||0),0);

  return(
    <div style={{padding:24,fontFamily:"'Cairo'",direction:'rtl'}}>
      <div style={{color:'#fff',fontSize:22,fontWeight:800,marginBottom:20}}>💾 النسخ الاحتياطي</div>

      {/* معلومات البيانات */}
      <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:14,marginBottom:24}}>
        {[['📊','إجمالي السجلات',fmt(totalRecords),'#3b82f6'],['📁','عدد الجداول',BACKUP_COLLECTIONS.length,'#F5C800'],['🕐','آخر نسخة',lastBackup||'لم يتم بعد','#10b981']].map(([icon,label,val,color])=>(
          <div key={label} style={{background:'#ffffff',borderRadius:14,padding:16,border:'1px solid #d9e2f2',textAlign:'center'}}>
            <div style={{fontSize:24,marginBottom:6}}>{icon}</div>
            <div style={{color:'#64748b',fontSize:11,marginBottom:4}}>{label}</div>
            <div style={{color,fontSize:14,fontWeight:800}}>{val}</div>
          </div>
        ))}
      </div>

      {/* زر النسخ الاحتياطي */}
      <div style={{background:'#ffffff',borderRadius:16,padding:24,border:'1px solid #10b98133',marginBottom:24,textAlign:'center'}}>
        <div style={{fontSize:48,marginBottom:12}}>💾</div>
        <div style={{color:'#fff',fontSize:16,fontWeight:800,marginBottom:8}}>نسخ احتياطي كامل للبيانات</div>
        <div style={{color:'#64748b',fontSize:13,marginBottom:20}}>يشمل جميع الفواتير والمواد والزبائن والموردين والسندات</div>

        {loading&&(
          <div style={{marginBottom:16}}>
            <div style={{display:'flex',justifyContent:'space-between',marginBottom:6}}>
              <span style={{color:'#64748b',fontSize:12}}>جاري التصدير...</span>
              <span style={{color:'#10b981',fontSize:12,fontWeight:700}}>{progress}%</span>
            </div>
            <div style={{height:8,background:'#d9e2f2',borderRadius:4,overflow:'hidden'}}>
              <div style={{width:`${progress}%`,height:'100%',background:'#10b981',borderRadius:4,transition:'width .3s'}}/>
            </div>
          </div>
        )}

        {backupDone&&(
          <div style={{background:'#10b98122',border:'1px solid #10b98144',borderRadius:12,padding:12,marginBottom:16}}>
            <div style={{color:'#10b981',fontSize:14,fontWeight:700}}>✅ تم تنزيل النسخة الاحتياطية بنجاح!</div>
          </div>
        )}

        <button onClick={doBackup} disabled={loading}
          style={{background:loading?'#ffffff':'linear-gradient(135deg,#10b981,#059669)',color:loading?'#cdd8ec':'#fff',border:'none',borderRadius:14,padding:'14px 40px',fontWeight:800,cursor:loading?'not-allowed':'pointer',fontFamily:"'Cairo'",fontSize:16,opacity:loading?0.6:1}}>
          {loading?`⏳ جاري التصدير... ${progress}%`:'📥 تنزيل النسخة الاحتياطية'}
        </button>
      </div>

      {/* الاستعادة */}
      <div style={{background:'#ffffff',borderRadius:16,padding:24,border:'1px solid #3b82f633',marginBottom:24,textAlign:'center'}}>
        <div style={{fontSize:44,marginBottom:10}}>♻️</div>
        <div style={{color:'#fff',fontSize:16,fontWeight:800,marginBottom:8}}>استعادة نسخة احتياطية</div>
        <div style={{color:'#64748b',fontSize:13,marginBottom:16}}>ارفع ملف JSON تم تصديره من نفس شاشة النسخ الاحتياطي</div>

        {restoreLoading&&(
          <div style={{marginBottom:16}}>
            <div style={{display:'flex',justifyContent:'space-between',marginBottom:6}}>
              <span style={{color:'#64748b',fontSize:12}}>جاري الاستعادة...</span>
              <span style={{color:'#3b82f6',fontSize:12,fontWeight:700}}>{restoreProgress}%</span>
            </div>
            <div style={{height:8,background:'#d9e2f2',borderRadius:4,overflow:'hidden'}}>
              <div style={{width:`${restoreProgress}%`,height:'100%',background:'#3b82f6',borderRadius:4,transition:'width .3s'}}/>
            </div>
          </div>
        )}

        {restoreDone&&(
          <div style={{background:'#10b98122',border:'1px solid #10b98144',borderRadius:12,padding:12,marginBottom:16,textAlign:'right'}}>
            <div style={{color:'#10b981',fontSize:14,fontWeight:700,marginBottom:8}}>✅ تمت الاستعادة بنجاح</div>
            {restoreSummary&&(
              <div style={{color:'#1e293b',fontSize:12,lineHeight:1.8}}>
                <div>إجمالي السجلات المستعادة: {fmt(restoreSummary.totalRows)}</div>
                {Object.entries(restoreSummary.collections).map(([colId,count])=>{
                  const info = BACKUP_COLLECTIONS.find((c)=>c.id===colId);
                  return <div key={colId}>{info?.label || colId}: {fmt(count)}</div>;
                })}
              </div>
            )}
          </div>
        )}

        <div style={{display:'flex',gap:10,justifyContent:'center',alignItems:'center',flexWrap:'wrap'}}>
          <button
            onClick={()=>{
              if (hasLocalApi()) doRestore();
              else fileInputRef.current?.click();
            }}
            disabled={restoreLoading}
            style={{background:restoreLoading?'#cdd8ec':'linear-gradient(135deg,#3b82f6,#1d4ed8)',color:'#fff',border:'none',borderRadius:14,padding:'12px 28px',fontWeight:800,cursor:restoreLoading?'not-allowed':'pointer',fontFamily:"'Cairo'",fontSize:15,opacity:restoreLoading?0.7:1}}
          >
            {restoreLoading ? '⏳ جاري الاستعادة...' : '📤 استعادة من ملف'}
          </button>
          <span style={{color:'#64748b',fontSize:12}}>آخر استعادة: {lastRestore || 'لم يتم بعد'}</span>
        </div>
        <input
          ref={fileInputRef}
          type="file"
          accept="application/json,.json"
          onChange={doRestore}
          style={{display:'none'}}
        />
      </div>

      {/* إحصائيات الجداول */}
      <div style={{background:'#ffffff',borderRadius:16,border:'1px solid #d9e2f2',overflow:'hidden'}}>
        <div style={{padding:'14px 20px',borderBottom:'1px solid #d9e2f2',color:'#fff',fontSize:14,fontWeight:700}}>تفاصيل البيانات</div>
        <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',padding:16,gap:10}}>
        {BACKUP_COLLECTIONS.map(col=>(
            <div key={col.id} style={{background:'#f8fbff',borderRadius:12,padding:14,border:`1px solid ${col.color}22`,display:'flex',gap:10,alignItems:'center'}}>
              <div style={{fontSize:22}}>{col.icon}</div>
              <div style={{flex:1}}>
                <div style={{color:'#1e293b',fontSize:12,fontWeight:600,marginBottom:2}}>{col.label}</div>
                <div style={{color:col.color,fontSize:16,fontWeight:800}}>{fmt(stats[col.id]||0)} سجل</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
