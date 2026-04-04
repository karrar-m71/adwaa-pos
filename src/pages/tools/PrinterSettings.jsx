import { useState } from 'react';

export default function PrinterSettings({ user }) {
  const [settings, setSettings] = useState(()=>{
    try{ return JSON.parse(localStorage.getItem('adwaa_printer')||'{}'); }
    catch{ return {}; }
  });
  const [saved, setSaved] = useState(false);

  const set=(k,v)=>setSettings(s=>({...s,[k]:v}));
  const save=()=>{ localStorage.setItem('adwaa_printer',JSON.stringify(settings)); setSaved(true); setTimeout(()=>setSaved(false),2000); };

  const PAPER=['80mm (حرارية)','A4','A5','Letter'];
  const inp={width:'100%',color:'#0f172a',outline:'none',fontFamily:"'Cairo'",fontSize:13,boxSizing:'border-box'};

  return(
    <div style={{padding:24,fontFamily:"'Cairo'",direction:'rtl',maxWidth:600}}>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:20}}>
        <div style={{color:'#fff',fontSize:22,fontWeight:800}}>🖨️ إعدادات الطابعة</div>
        <button onClick={save} style={{background:saved?'#10b981':'#F5C800',color:'#000',border:'none',borderRadius:12,padding:'9px 20px',fontWeight:800,cursor:'pointer',fontFamily:"'Cairo'",fontSize:13}}>
          {saved?'✅ تم الحفظ':'💾 حفظ'}
        </button>
      </div>

      <div style={{display:'grid',gridTemplateColumns:'1fr',gap:16}}>
        {/* الطابعة الافتراضية */}
        <div style={{background:'#ffffff',borderRadius:16,padding:20,border:'1px solid #d9e2f2'}}>
          <div style={{color:'#F5C800',fontSize:14,fontWeight:800,marginBottom:16}}>🖨️ الطابعة الافتراضية</div>
          <div style={{marginBottom:14}}>
            <label style={{color:'#64748b',fontSize:12,display:'block',marginBottom:6}}>اسم الطابعة</label>
            <input value={settings.printerName||''} onChange={e=>set('printerName',e.target.value)} placeholder="مثال: EPSON TM-T20III"
              style={inp}/>
          </div>
          <div style={{marginBottom:14}}>
            <label style={{color:'#64748b',fontSize:12,display:'block',marginBottom:6}}>حجم الورق</label>
            <div style={{display:'grid',gridTemplateColumns:'repeat(2,1fr)',gap:8}}>
              {PAPER.map(p=>(
                <button key={p} onClick={()=>set('paperSize',p)}
                  style={{background:settings.paperSize===p?'#F5C80022':'#f8fbff',color:settings.paperSize===p?'#F5C800':'#64748b',border:`2px solid ${settings.paperSize===p?'#F5C800':'#cdd8ec'}`,borderRadius:10,padding:'10px 0',fontWeight:700,cursor:'pointer',fontSize:12}}>
                  📄 {p}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* إعدادات الفاتورة */}
        <div style={{background:'#ffffff',borderRadius:16,padding:20,border:'1px solid #d9e2f2'}}>
          <div style={{color:'#10b981',fontSize:14,fontWeight:800,marginBottom:16}}>🧾 إعدادات الفاتورة</div>
          {[['نسخ الفاتورة','copies','number','1'],['هامش الفاتورة (mm)','margin','number','5'],['حجم الخط (pt)','fontSize','number','10']].map(([l,k,t,ph])=>(
            <div key={k} style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'10px 0',borderBottom:'1px solid #e2e8f7'}}>
              <span style={{color:'#1e293b',fontSize:13}}>{l}</span>
              <input type={t} value={settings[k]||ph} onChange={e=>set(k,e.target.value)}
                style={{width:80,background:'#f8fbff',border:'1px solid #cdd8ec',borderRadius:8,padding:'6px 10px',color:'#F5C800',fontSize:13,outline:'none',textAlign:'center'}}/>
            </div>
          ))}
          <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'10px 0',borderBottom:'1px solid #e2e8f7'}}>
            <span style={{color:'#1e293b',fontSize:13}}>طباعة تلقائية بعد البيع</span>
            <div onClick={()=>set('autoPrint',!settings.autoPrint)} style={{width:42,height:24,borderRadius:12,background:settings.autoPrint?'#F5C800':'#cdd8ec',position:'relative',cursor:'pointer',transition:'background .2s'}}>
              <div style={{position:'absolute',top:2,left:settings.autoPrint?20:2,width:20,height:20,borderRadius:10,background:'#fff',transition:'left .2s'}}/>
            </div>
          </div>
          <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'10px 0'}}>
            <span style={{color:'#1e293b',fontSize:13}}>طباعة شعار المتجر</span>
            <div onClick={()=>set('printLogo',!settings.printLogo)} style={{width:42,height:24,borderRadius:12,background:settings.printLogo?'#F5C800':'#cdd8ec',position:'relative',cursor:'pointer',transition:'background .2s'}}>
              <div style={{position:'absolute',top:2,left:settings.printLogo?20:2,width:20,height:20,borderRadius:10,background:'#fff',transition:'left .2s'}}/>
            </div>
          </div>
        </div>

        {/* اختبار الطباعة */}
        <div style={{background:'#ffffff',borderRadius:16,padding:20,border:'1px solid #d9e2f2'}}>
          <div style={{color:'#3b82f6',fontSize:14,fontWeight:800,marginBottom:16}}>🔧 اختبار الطباعة</div>
          <button onClick={()=>{const w=window.open('','_blank');w.document.write('<html><body style="font-family:monospace;text-align:center;direction:rtl"><h2>أضواء المدينة</h2><p>اختبار طباعة</p><p>━━━━━━━━━━━━━━━━━━</p><p>الطابعة تعمل بشكل صحيح ✓</p></body></html>');w.document.close();w.print();}}
            style={{width:'100%',background:'#3b82f622',border:'1px solid #3b82f644',borderRadius:12,padding:12,color:'#3b82f6',fontWeight:700,cursor:'pointer',fontFamily:"'Cairo'",fontSize:14}}>
            🖨️ طباعة صفحة اختبار
          </button>
        </div>
      </div>
    </div>
  );
}
