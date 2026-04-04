import { useState } from 'react';

export default function VoucherShortcuts({ user }) {
  const [activeKey, setActiveKey] = useState(null);

  const VOUCHER_TYPES = [
    { type:'قبض',    icon:'📥', color:'#10b981', key:'F10', desc:'سند قبض — استلام مبلغ من طرف',
      fields:[['الاسم/الطرف','fromTo'],['المبلغ بالدينار (IQD)','amountIQDInput'],['المبلغ بالدولار (USD)','amountUSDInput'],['التاريخ','date'],['البيان','description']]
    },
    { type:'دفع',    icon:'📤', color:'#ef4444', key:'F11', desc:'سند دفع — دفع مبلغ لطرف',
      fields:[['الاسم/الطرف','fromTo'],['المبلغ بالدينار (IQD)','amountIQDInput'],['المبلغ بالدولار (USD)','amountUSDInput'],['التاريخ','date'],['البيان','description']]
    },
    { type:'صرف',   icon:'💸', color:'#f59e0b', key:'F12', desc:'سند صرف — صرف من الصندوق',
      fields:[['الوصف','description'],['المبلغ بالدينار (IQD)','amountIQDInput'],['المبلغ بالدولار (USD)','amountUSDInput'],['التاريخ','date']]
    },
    { type:'تحويل', icon:'💱', color:'#3b82f6', key:'Ctrl+F10', desc:'تحويل عملة',
      fields:[['من عملة','fromCurrency'],['إلى عملة','toCurrency'],['المبلغ','fromAmount'],['سعر الصرف','rate']]
    },
  ];

  const TIPS = [
    { icon:'⚡', tip:'اضغط Tab للانتقال بين حقول السند بسرعة' },
    { icon:'🔍', tip:'اكتب اسم الطرف وسيقترح النظام من الزبائن والموردين' },
    { icon:'💡', tip:'السعر يحسب تلقائياً في تحويل العملة' },
    { icon:'📋', tip:'يمكنك نسخ رقم السند وإرساله للعميل' },
    { icon:'🖨️', tip:'اضغط Ctrl+P لطباعة السند مباشرة' },
    { icon:'🔄', tip:'سند القبض يقلل دين الزبون تلقائياً' },
    { icon:'🔄', tip:'سند الدفع يقلل دين المورد تلقائياً' },
  ];

  return(
    <div style={{padding:24,fontFamily:"'Cairo'",direction:'rtl'}}>
      <div style={{color:'#fff',fontSize:22,fontWeight:800,marginBottom:6}}>🧾 اختصارات السندات</div>
      <div style={{color:'#64748b',fontSize:13,marginBottom:24}}>دليل سريع لإنشاء وإدارة السندات المالية</div>

      {/* اختصارات السندات */}
      <div style={{display:'grid',gridTemplateColumns:'repeat(2,1fr)',gap:14,marginBottom:24}}>
        {VOUCHER_TYPES.map(v=>(
          <div key={v.type} onClick={()=>setActiveKey(activeKey===v.type?null:v.type)}
            style={{background:'#ffffff',borderRadius:16,border:`2px solid ${activeKey===v.type?v.color:v.color+'33'}`,cursor:'pointer',overflow:'hidden',transition:'border .2s'}}>
            <div style={{padding:16,display:'flex',gap:12,alignItems:'center'}}>
              <div style={{width:48,height:48,borderRadius:12,background:`${v.color}22`,display:'flex',alignItems:'center',justifyContent:'center',fontSize:26,flexShrink:0}}>{v.icon}</div>
              <div style={{flex:1}}>
                <div style={{color:v.color,fontSize:15,fontWeight:800,marginBottom:2}}>{v.type} — {v.desc}</div>
                <div style={{display:'flex',gap:4,alignItems:'center'}}>
                  {v.key.split('+').map(k=>(
                    <span key={k} style={{background:'#f8fbff',border:'1px solid #cdd8ec',borderRadius:6,padding:'2px 8px',color:'#F5C800',fontSize:11,fontWeight:700,fontFamily:'monospace'}}>{k.trim()}</span>
                  ))}
                  <span style={{color:'#64748b',fontSize:11}}>للفتح السريع</span>
                </div>
              </div>
              <span style={{color:'#64748b',fontSize:14}}>{activeKey===v.type?'▲':'▼'}</span>
            </div>

            {activeKey===v.type&&(
              <div style={{borderTop:`1px solid ${v.color}22`,padding:16,background:'#f8fbff'}}>
                <div style={{color:'#64748b',fontSize:12,marginBottom:10}}>الحقول المطلوبة للسند:</div>
                <div style={{display:'flex',flexDirection:'column',gap:6}}>
                  {v.fields.map(([label,key],i)=>(
                    <div key={key} style={{display:'flex',gap:10,alignItems:'center'}}>
                      <div style={{width:22,height:22,borderRadius:6,background:`${v.color}22`,display:'flex',alignItems:'center',justifyContent:'center',color:v.color,fontSize:11,fontWeight:800,flexShrink:0}}>{i+1}</div>
                      <div style={{color:'#1e293b',fontSize:12}}>{label}</div>
                      {i===0&&<span style={{color:'#64748b',fontSize:10,marginRight:'auto'}}>مطلوب *</span>}
                    </div>
                  ))}
                </div>
                <div style={{marginTop:12,background:`${v.color}11`,borderRadius:10,padding:10,border:`1px solid ${v.color}22`}}>
                  <div style={{color:v.color,fontSize:12,fontWeight:700}}>تأثير السند على النظام:</div>
                  <div style={{color:'#64748b',fontSize:11,marginTop:4}}>
                    {v.type==='قبض'&&'✓ يقلل دين الزبون تلقائياً إذا كان اسمه موجوداً'}
                    {v.type==='دفع'&&'✓ يقلل دين المورد تلقائياً إذا كان اسمه موجوداً'}
                    {v.type==='صرف'&&'✓ يسجل في حساب المصروفات النقدية'}
                    {v.type==='تحويل'&&'✓ يسجل حركة تحويل العملة مع سعر الصرف'}
                  </div>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* نصائح سريعة */}
      <div style={{background:'#ffffff',borderRadius:16,padding:20,border:'1px solid #d9e2f2'}}>
        <div style={{color:'#fff',fontSize:14,fontWeight:700,marginBottom:14}}>💡 نصائح سريعة للسندات</div>
        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10}}>
          {TIPS.map((t,i)=>(
            <div key={i} style={{background:'#f8fbff',borderRadius:10,padding:12,display:'flex',gap:10,alignItems:'flex-start'}}>
              <span style={{fontSize:18,flexShrink:0}}>{t.icon}</span>
              <span style={{color:'#64748b',fontSize:12}}>{t.tip}</span>
            </div>
          ))}
        </div>
      </div>

      {/* جدول أنواع السندات */}
      <div style={{background:'#ffffff',borderRadius:16,border:'1px solid #d9e2f2',overflow:'hidden',marginTop:16}}>
        <div style={{padding:'14px 20px',borderBottom:'1px solid #d9e2f2',color:'#fff',fontSize:14,fontWeight:700}}>ملخص أنواع السندات</div>
        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr 2fr',padding:'10px 20px',background:'#f8fbff',borderBottom:'1px solid #e2e8f7'}}>
          {['النوع','الاختصار','التأثير','الاستخدام'].map(h=><div key={h} style={{color:'#64748b',fontSize:11,fontWeight:700}}>{h}</div>)}
        </div>
        {[
          ['📥 قبض','F10','يرفع النقدية','عند استلام مدفوعات من الزبائن'],
          ['📤 دفع','F11','يخفض النقدية','عند الدفع للموردين والموظفين'],
          ['💸 صرف','F12','يخفض النقدية','للمصروفات التشغيلية'],
          ['💱 تحويل','Ctrl+F10','لا يؤثر','تسجيل حركات الصرف الأجنبي'],
        ].map(([type,key,effect,use],i)=>(
          <div key={i} style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr 2fr',padding:'11px 20px',borderBottom:i<3?'1px solid #ffffff':'none',alignItems:'center'}}>
            <div style={{color:'#1e293b',fontSize:13,fontWeight:700}}>{type}</div>
            <div style={{display:'flex',gap:3}}>{key.split('+').map(k=><span key={k} style={{background:'#f8fbff',border:'1px solid #cdd8ec',borderRadius:6,padding:'2px 7px',color:'#F5C800',fontSize:10,fontFamily:'monospace'}}>{k.trim()}</span>)}</div>
            <div style={{color:'#64748b',fontSize:12}}>{effect}</div>
            <div style={{color:'#64748b',fontSize:11}}>{use}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
