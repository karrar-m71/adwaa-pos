import { useState } from 'react';

export default function ReportSettings({ user }) {
  const [settings, setSettings] = useState(()=>{
    try{ return JSON.parse(localStorage.getItem('adwaa_report_settings')||'{}'); }
    catch{ return {}; }
  });
  const [saved, setSaved] = useState(false);

  const set=(k,v)=>setSettings(s=>({...s,[k]:v}));
  const save=()=>{ localStorage.setItem('adwaa_report_settings',JSON.stringify(settings)); setSaved(true); setTimeout(()=>setSaved(false),2000); };

  const toggle=(k)=>(
    <div onClick={()=>set(k,!settings[k])} style={{width:42,height:24,borderRadius:12,background:settings[k]?'#3b82f6':'#cdd8ec',position:'relative',cursor:'pointer',transition:'background .2s'}}>
      <div style={{position:'absolute',top:2,left:settings[k]?20:2,width:20,height:20,borderRadius:10,background:'#fff',transition:'left .2s'}}/>
    </div>
  );

  const Row=({label,sub,children})=>(
    <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'12px 0',borderBottom:'1px solid #e2e8f7'}}>
      <div><div style={{color:'#1e293b',fontSize:13}}>{label}</div>{sub&&<div style={{color:'#64748b',fontSize:11,marginTop:2}}>{sub}</div>}</div>
      {children}
    </div>
  );

  return(
    <div style={{padding:24,fontFamily:"'Cairo'",direction:'rtl',maxWidth:600}}>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:20}}>
        <div style={{color:'#fff',fontSize:22,fontWeight:800}}>📊 إعدادات التقارير</div>
        <button onClick={save} style={{background:saved?'#10b981':'#3b82f6',color:'#fff',border:'none',borderRadius:12,padding:'9px 20px',fontWeight:800,cursor:'pointer',fontFamily:"'Cairo'",fontSize:13}}>
          {saved?'✅ تم الحفظ':'💾 حفظ'}
        </button>
      </div>

      <div style={{background:'#ffffff',borderRadius:16,padding:20,border:'1px solid #3b82f633',marginBottom:16}}>
        <div style={{color:'#3b82f6',fontSize:14,fontWeight:800,marginBottom:14}}>📄 إعدادات الطباعة</div>
        <Row label="إظهار شعار المتجر في التقارير">{toggle('showLogo')}</Row>
        <Row label="إظهار التاريخ والوقت">{toggle('showDateTime')}</Row>
        <Row label="إظهار اسم المستخدم">{toggle('showUser')}</Row>
        <Row label="إظهار رقم الصفحة">{toggle('showPageNo')}</Row>
        <Row label="إظهار الإجماليات في نهاية الجدول">{toggle('showTotals')}</Row>
      </div>

      <div style={{background:'#ffffff',borderRadius:16,padding:20,border:'1px solid #d9e2f2',marginBottom:16}}>
        <div style={{color:'#F5C800',fontSize:14,fontWeight:800,marginBottom:14}}>📊 البيانات الافتراضية</div>
        <Row label="الفترة الافتراضية للتقارير">
          <select value={settings.defaultPeriod||'month'} onChange={e=>set('defaultPeriod',e.target.value)}
            style={{color:'#0f172a',outline:'none'}}>
            <option value="today">اليوم</option>
            <option value="week">آخر أسبوع</option>
            <option value="month">آخر شهر</option>
            <option value="year">آخر سنة</option>
            <option value="all">كل الوقت</option>
          </select>
        </Row>
        <Row label="عدد الصفوف في كل صفحة">
          <input type="number" value={settings.rowsPerPage||50} onChange={e=>set('rowsPerPage',Number(e.target.value))} min={10} max={200}
            style={{width:80,background:'#f8fbff',border:'1px solid #cdd8ec',borderRadius:8,padding:'6px 10px',color:'#F5C800',fontSize:13,outline:'none',textAlign:'center'}}/>
        </Row>
        <Row label="عملة التقارير">
          <select value={settings.currency||'دينار عراقي'} onChange={e=>set('currency',e.target.value)}
            style={{color:'#0f172a',outline:'none'}}>
            {['دينار عراقي','دولار أمريكي','يورو'].map(c=><option key={c}>{c}</option>)}
          </select>
        </Row>
      </div>

      <div style={{background:'#ffffff',borderRadius:16,padding:20,border:'1px solid #d9e2f2'}}>
        <div style={{color:'#10b981',fontSize:14,fontWeight:800,marginBottom:14}}>📧 تصدير التقارير</div>
        <Row label="تصدير تلقائي بعد الإغلاق">{toggle('autoExport')}</Row>
        <Row label="تضمين الرسوم البيانية في PDF">{toggle('includeCharts')}</Row>
        <Row label="ضغط ملفات PDF الكبيرة">{toggle('compressPDF')}</Row>
      </div>
    </div>
  );
}
