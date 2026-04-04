export default function Shortcuts({ user }) {
  const sections = [
    {
      title:'🖥️ الاختصارات العامة',color:'#F5C800',
      items:[
        ['F1','فتح المساعدة'],['F2','البحث السريع'],['F5','تحديث الصفحة'],
        ['Ctrl + S','حفظ'],['Ctrl + P','طباعة'],['Ctrl + Z','تراجع'],
        ['Escape','إغلاق النافذة'],['Tab','الانتقال للحقل التالي'],
        ['Enter','تأكيد / إرسال'],['Ctrl + Home','الذهاب للأعلى'],
      ]
    },
    {
      title:'🛒 اختصارات نقطة البيع',color:'#10b981',
      items:[
        ['F3','فتح نقطة البيع'],['Ctrl + N','فاتورة جديدة'],
        ['Ctrl + F','البحث عن مادة'],['Ctrl + D','تطبيق خصم'],
        ['Ctrl + Enter','إتمام البيع'],['Delete','حذف صنف من السلة'],
        ['Ctrl + +','زيادة الكمية'],['Ctrl + -','تقليل الكمية'],
        ['F8','اختيار زبون'],['F9','تغيير طريقة الدفع'],
      ]
    },
    {
      title:'📦 اختصارات المخزون',color:'#a78bfa',
      items:[
        ['F4','فتح صفحة المواد'],['Ctrl + I','إدخال مخزني جديد'],
        ['Ctrl + O','إخراج مخزني جديد'],['Ctrl + B','مسح الباركود'],
        ['F6','البحث بالباركود'],['Alt + S','تسوية مخزنية'],
        ['Alt + T','نقل بين المخازن'],['Ctrl + L','قائمة المواد'],
      ]
    },
    {
      title:'📊 اختصارات التقارير',color:'#3b82f6',
      items:[
        ['F7','فتح التقارير'],['Ctrl + R','تقرير المتاجرة'],
        ['Alt + R','تقرير الأرباح'],['Ctrl + Alt + S','تقرير المبيعات'],
        ['Ctrl + E','تصدير PDF'],['Ctrl + Alt + P','طباعة التقرير'],
      ]
    },
  ];

  return(
    <div style={{padding:24,fontFamily:"'Cairo'",direction:'rtl'}}>
      <div style={{color:'#fff',fontSize:22,fontWeight:800,marginBottom:6}}>⌨️ الاختصارات</div>
      <div style={{color:'#64748b',fontSize:13,marginBottom:24}}>اختصارات لوحة المفاتيح لتسريع العمل</div>

      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:16}}>
        {sections.map(sec=>(
          <div key={sec.title} style={{background:'#ffffff',borderRadius:16,border:`1px solid ${sec.color}22`,overflow:'hidden'}}>
            <div style={{padding:'14px 20px',background:`${sec.color}11`,borderBottom:`1px solid ${sec.color}22`}}>
              <div style={{color:sec.color,fontSize:14,fontWeight:800}}>{sec.title}</div>
            </div>
            <div style={{padding:16}}>
              {sec.items.map(([key,action])=>(
                <div key={key} style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'8px 0',borderBottom:'1px solid #ffffff'}}>
                  <div style={{color:'#64748b',fontSize:12}}>{action}</div>
                  <div style={{display:'flex',gap:4}}>
                    {key.split('+').map(k=>(
                      <span key={k} style={{background:'#f8fbff',border:'1px solid #cdd8ec',borderRadius:6,padding:'3px 8px',color:'#F5C800',fontSize:11,fontWeight:700,fontFamily:'monospace'}}>
                        {k.trim()}
                      </span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      <div style={{background:'#ffffff',borderRadius:14,padding:16,border:'1px solid #d9e2f2',marginTop:16,textAlign:'center'}}>
        <div style={{color:'#64748b',fontSize:12}}>💡 يمكنك الضغط على أي مفتاح لمعرفة وظيفته — بعض الاختصارات تعتمد على الصفحة الحالية</div>
      </div>
    </div>
  );
}
