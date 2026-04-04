import { useState } from 'react';
import { addDoc, collection, waitForPendingWrites } from 'firebase/firestore';
import { localDb } from '../../firebase';
import { db } from '../../firebase';

const DEFAULT = {
  storeName: 'أضواء المدينة',
  storePhone: '07714424355',
  storeWhatsApp: '',
  managerWhatsApp: '',
  storeAddress: 'كربلاء، العراق',
  whatsappDefaultCountryCode: '964',
  whatsappSendMode: 'app',
  whatsappApiVersion: 'v23.0',
  whatsappPhoneNumberId: '',
  whatsappAccessToken: '',
  aiAssistantEnabled: true,
  aiDailyInsights: true,
  aiSensitivity: 'متوسط',
  aiCloudEnabled: true,
  aiCloudProvider: 'huggingface_free',
  aiCloudModel: 'Qwen/Qwen2.5-7B-Instruct',
  aiCloudApiKey: '',
  aiCloudTimeoutMs: '15000',
  currency: 'دينار عراقي',
  currencySymbol: 'د.ع',
  taxRate: '0',
  defaultProfitMargin: '20',
  defaultRetailProfitMargin: '20',
  defaultWholesaleProfitMargin: '12',
  defaultSpecialProfitMargin: '8',
  exchangeRate: '1480',
  invoiceFooter: 'شكراً لتعاملكم معنا',
  language: 'ar',
  dateFormat: 'ar-IQ',
  autoBackup: true,
  soundEffects: false,
  showWelcome: true,
  lowStockAlert: true,
  lowStockThreshold: '5',
};

function Section({ title, color = '#F5C800', children }) {
  return (
    <div style={{ background:'#ffffff', borderRadius:16, border:`1px solid ${color}22`, overflow:'hidden', marginBottom:16 }}>
      <div style={{ padding:'14px 20px', background:`${color}11`, borderBottom:`1px solid ${color}22` }}>
        <div style={{ color, fontSize:14, fontWeight:800 }}>{title}</div>
      </div>
      <div style={{ padding:20 }}>{children}</div>
    </div>
  );
}

function Row({ label, sub, children }) {
  return (
    <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'10px 0', borderBottom:'1px solid #e2e8f7' }}>
      <div>
        <div style={{ color:'#1e293b', fontSize:13 }}>{label}</div>
        {sub && <div style={{ color:'#64748b', fontSize:11, marginTop:2 }}>{sub}</div>}
      </div>
      <div>{children}</div>
    </div>
  );
}

function ImageUploadRow({ label, sub, preview, onRemove, onUpload }) {
  return (
    <div style={{ padding:'14px 0', borderBottom:'1px solid #e2e8f7' }}>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', gap:16 }}>
        <div>
          <div style={{ color:'#1e293b', fontSize:13, marginBottom:3 }}>{label}</div>
          {sub && <div style={{ color:'#64748b', fontSize:11 }}>{sub}</div>}
        </div>
        <div style={{ display:'flex', gap:8, alignItems:'center', flexShrink:0 }}>
          {preview && (
            <div style={{ position:'relative' }}>
              <img src={preview} style={{ width:60, height:60, objectFit:'contain', borderRadius:8, border:'1px solid #d9e2f2', background:'#f8fbff' }} alt=""/>
              <button type="button" onClick={onRemove}
                style={{ position:'absolute', top:-6, right:-6, width:18, height:18, borderRadius:'50%', background:'#ef4444', border:'none', color:'#fff', fontSize:10, cursor:'pointer', lineHeight:1, display:'flex', alignItems:'center', justifyContent:'center' }}>
                ✕
              </button>
            </div>
          )}
          <label style={{ background:'#F5C800', color:'#000', borderRadius:10, padding:'8px 14px', fontSize:11, fontWeight:700, cursor:'pointer', whiteSpace:'nowrap' }}>
            {preview ? '🔄 تغيير' : '📁 رفع صورة'}
            <input type="file" accept="image/*" onChange={onUpload} style={{ display:'none' }}/>
          </label>
        </div>
      </div>
    </div>
  );
}

export default function AppSettings({ user }) {
  const [settings, setSettings] = useState(() => {
    try { return { ...DEFAULT, ...JSON.parse(localStorage.getItem('adwaa_settings') || '{}') }; }
    catch { return DEFAULT; }
  });
  const [saved,          setSaved]          = useState(false);
  const [logoPreview,    setLogoPreview]    = useState(() => localStorage.getItem('adwaa_logo') || '');
  const [invoiceHeaderPreview, setInvoiceHeaderPreview] = useState(() => localStorage.getItem('adwaa_invoice_header') || '');
  const [watermarkPreview, setWatermarkPreview] = useState(() => localStorage.getItem('adwaa_watermark') || '');
  const [probeStatus, setProbeStatus] = useState('');
  const [probeRunning, setProbeRunning] = useState(false);

  const setField = (k, v) => setSettings(s => ({ ...s, [k]: v }));
  const save  = () => {
    localStorage.setItem('adwaa_settings', JSON.stringify(settings));
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };
  const reset = () => {
    if (!confirm('إعادة ضبط كل الإعدادات؟')) return;
    setSettings(DEFAULT);
    localStorage.setItem('adwaa_settings', JSON.stringify(DEFAULT));
  };

  const handleImageUpload = (key, setter) => (e) => {
    const file = e.target.files[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) return alert('حجم الصورة كبير جداً (الحد الأقصى 2MB)');
    const reader = new FileReader();
    reader.onload = (ev) => {
      localStorage.setItem(key, ev.target.result);
      setter(ev.target.result);
    };
    reader.readAsDataURL(file);
  };

  const removeImage = (key, setter) => {
    localStorage.removeItem(key);
    setter('');
  };

  const inp    = { color:'#0f172a', outline:'none', fontFamily:"'Cairo'", fontSize:13 };
  const toggle = (k) => (
    <div onClick={() => setField(k, !settings[k])} style={{ width:42, height:24, borderRadius:12, background:settings[k]?'#F5C800':'#cdd8ec', position:'relative', cursor:'pointer', transition:'background .2s' }}>
      <div style={{ position:'absolute', top:2, left:settings[k]?20:2, width:20, height:20, borderRadius:10, background:'#fff', transition:'left .2s' }}/>
    </div>
  );
  const localDbLabel = localDb.persistent
    ? 'Persistent Local Cache (جاهز للعمل بدون نت)'
    : (localDb.mode === 'memory-only'
      ? 'Memory Cache فقط (يعمل بدون نت حتى إغلاق التطبيق)'
      : 'Default Cache (قد لا يحتفظ بالبيانات بعد الإغلاق)');
  const localDbColor = localDb.persistent ? '#10b981' : (localDb.mode === 'memory-only' ? '#f59e0b' : '#ef4444');
  const runOfflineProbe = async () => {
    setProbeRunning(true);
    setProbeStatus('');
    try {
      await addDoc(collection(db, 'pos_offline_probe'), {
        createdAt: new Date().toISOString(),
        mode: localDb.mode,
        onlineAtWrite: typeof navigator !== 'undefined' ? navigator.onLine : true,
        by: user?.username || user?.name || 'unknown',
      });

      if (typeof navigator !== 'undefined' && navigator.onLine) {
        const timeout = new Promise((resolve) => setTimeout(resolve, 4000, 'timeout'));
        const pending = waitForPendingWrites(db).then(() => 'synced').catch(() => 'error');
        const result = await Promise.race([pending, timeout]);
        if (result === 'synced') {
          setProbeStatus('✅ الاختبار ناجح: تم حفظ العملية ومزامنتها مباشرة.');
        } else if (result === 'timeout') {
          setProbeStatus('⏳ تم الحفظ محليًا، والمزامنة ما زالت قيد التنفيذ.');
        } else {
          setProbeStatus('⚠️ تم الحفظ، لكن تعذر التأكد من المزامنة فورًا.');
        }
      } else {
        setProbeStatus('✅ تم الحفظ محليًا بدون إنترنت. ستتم المزامنة تلقائيًا عند عودة الاتصال.');
      }
    } catch (error) {
      setProbeStatus(`❌ فشل اختبار الأوفلاين: ${error?.message || 'خطأ غير معروف'}`);
    } finally {
      setProbeRunning(false);
    }
  };

  return (
    <div style={{ padding:24, fontFamily:"'Cairo'", direction:'rtl', maxWidth:700 }}>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:20 }}>
        <div style={{ color:'#fff', fontSize:22, fontWeight:800 }}>⚙️ إعدادات التطبيق</div>
        <div style={{ display:'flex', gap:10 }}>
          <button onClick={reset} style={{ background:'#ef444422', border:'1px solid #ef444444', borderRadius:12, padding:'9px 16px', color:'#ef4444', cursor:'pointer', fontFamily:"'Cairo'", fontSize:12, fontWeight:700 }}>↺ إعادة ضبط</button>
          <button onClick={save} style={{ background:saved?'#10b981':'#F5C800', color:'#000', border:'none', borderRadius:12, padding:'9px 20px', fontWeight:800, cursor:'pointer', fontFamily:"'Cairo'", fontSize:13, transition:'background .2s' }}>
            {saved ? '✅ تم الحفظ' : '💾 حفظ الإعدادات'}
          </button>
        </div>
      </div>

      <Section title="💾 قاعدة البيانات المحلية" color={localDbColor}>
        <Row label="وضع التخزين المحلي" sub="هذه الحالة تحدد مدى موثوقية الحفظ بدون إنترنت">
          <span style={{ color:localDbColor, fontSize:12, fontWeight:800 }}>{localDb.mode}</span>
        </Row>
        <Row label="التقييم" sub="يفضل أن تكون الحالة persistent-* للعمل اليومي بدون نت">
          <span style={{ color:localDbColor, fontSize:12, fontWeight:700 }}>{localDbLabel}</span>
        </Row>
        <Row label="اختبار جاهزية الأوفلاين" sub="ينفذ عملية حفظ تجريبية آمنة لقياس الجاهزية الفعلية">
          <button
            type="button"
            onClick={runOfflineProbe}
            disabled={probeRunning}
            style={{ background:probeRunning ? '#cbd5e1' : '#0ea5e9', color:'#fff', border:'none', borderRadius:10, padding:'8px 12px', fontSize:12, fontWeight:700, cursor:probeRunning ? 'not-allowed' : 'pointer', fontFamily:"'Cairo'" }}
          >
            {probeRunning ? 'جاري الاختبار...' : 'تشغيل اختبار'}
          </button>
        </Row>
        {probeStatus && (
          <div style={{ marginTop:10, color:'#334155', fontSize:12, background:'#f8fbff', border:'1px solid #d9e2f2', borderRadius:10, padding:'10px 12px' }}>
            {probeStatus}
          </div>
        )}
      </Section>

      {/* معلومات المتجر */}
      <Section title="🏪 معلومات المتجر" color="#F5C800">
        {[['اسم المتجر','storeName'],['رقم الهاتف','storePhone'],['العنوان','storeAddress'],['تذييل الفاتورة','invoiceFooter']].map(([l, k]) => (
          <Row key={k} label={l}>
            <input value={settings[k]} onChange={e => setField(k, e.target.value)} style={{ ...inp, width:220 }}/>
          </Row>
        ))}
      </Section>

      {/* واتساب */}
      <Section title="🟢 إعدادات واتساب" color="#22c55e">
        <Row label="وضع الإرسال" sub="Cloud API = إرسال صامت بدون فتح واتساب / تطبيق-ويب = فتح واتساب للمستخدم">
          <select
            value={settings.whatsappSendMode || 'app'}
            onChange={e => setField('whatsappSendMode', e.target.value)}
            style={{ ...inp, width:220 }}
          >
            <option value="app">تطبيق-ويب (يدوي)</option>
            <option value="cloud_api">Cloud API (صامت)</option>
          </select>
        </Row>
        <Row label="واتساب المتجر" sub="الرقم الذي يعتمد عليه البرنامج عند إرسال الفواتير إذا لم يوجد رقم للطرف">
          <input
            value={settings.storeWhatsApp || ''}
            onChange={e => setField('storeWhatsApp', e.target.value)}
            placeholder="مثال: 077xxxxxxx أو +96477xxxxxxx"
            style={{ ...inp, width:240 }}
          />
        </Row>
        <Row label="واتساب المدير (للملخصات اليومية)">
          <input
            value={settings.managerWhatsApp || ''}
            onChange={e => setField('managerWhatsApp', e.target.value)}
            placeholder="مثال: 077xxxxxxx أو +96477xxxxxxx"
            style={{ ...inp, width:240 }}
          />
        </Row>
        <Row label="كود الدولة الافتراضي" sub="يُستخدم لتحويل الرقم المحلي إلى صيغة واتساب تلقائياً">
          <input
            value={settings.whatsappDefaultCountryCode}
            onChange={e => setField('whatsappDefaultCountryCode', e.target.value)}
            placeholder="964"
            style={{ ...inp, width:90 }}
          />
        </Row>
        {settings.whatsappSendMode === 'cloud_api' && (
          <>
            <Row label="WhatsApp API Version">
              <input
                value={settings.whatsappApiVersion || 'v23.0'}
                onChange={e => setField('whatsappApiVersion', e.target.value)}
                placeholder="v23.0"
                style={{ ...inp, width:120 }}
              />
            </Row>
            <Row label="Phone Number ID" sub="من إعدادات WhatsApp Business Cloud API">
              <input
                value={settings.whatsappPhoneNumberId || ''}
                onChange={e => setField('whatsappPhoneNumberId', e.target.value)}
                placeholder="مثال: 123456789012345"
                style={{ ...inp, width:260 }}
              />
            </Row>
            <Row label="Access Token" sub="يُستخدم للإرسال المباشر. تأكد من حفظه بسرية">
              <input
                type="password"
                value={settings.whatsappAccessToken || ''}
                onChange={e => setField('whatsappAccessToken', e.target.value)}
                placeholder="EAAG..."
                style={{ ...inp, width:320 }}
              />
            </Row>
            <div style={{ color:'#64748b', fontSize:11, marginTop:8, lineHeight:1.8 }}>
              عند تفعيل Cloud API: إرسال الفواتير يتم مباشرة بدون فتح صفحة واتساب.
            </div>
          </>
        )}
      </Section>

      {/* الصور والشعار */}
      <Section title="🖼️ صورة المتجر والعلامة المائية" color="#a78bfa">
        <ImageUploadRow
          label="شعار المتجر (Logo)"
          sub="يظهر في الشريط الجانبي ورأس الفاتورة — يُفضل PNG شفاف"
          preview={logoPreview}
          onRemove={() => removeImage('adwaa_logo', setLogoPreview)}
          onUpload={handleImageUpload('adwaa_logo', setLogoPreview)}
        />
        <ImageUploadRow
          label="رأس الفاتورة (Header Image)"
          sub="صورة كاملة أعلى الفاتورة عند الطباعة (مثلاً ترويسة جاهزة)"
          preview={invoiceHeaderPreview}
          onRemove={() => removeImage('adwaa_invoice_header', setInvoiceHeaderPreview)}
          onUpload={handleImageUpload('adwaa_invoice_header', setInvoiceHeaderPreview)}
        />
        <ImageUploadRow
          label="العلامة المائية (Watermark)"
          sub="تظهر خلف محتوى الفاتورة عند الطباعة"
          preview={watermarkPreview}
          onRemove={() => removeImage('adwaa_watermark', setWatermarkPreview)}
          onUpload={handleImageUpload('adwaa_watermark', setWatermarkPreview)}
        />
      </Section>

      {/* العملة والضرائب */}
      <Section title="💰 العملة والمالية" color="#10b981">
        <Row label="العملة"><input value={settings.currency} onChange={e => setField('currency', e.target.value)} style={{ ...inp, width:180 }}/></Row>
        <Row label="رمز العملة"><input value={settings.currencySymbol} onChange={e => setField('currencySymbol', e.target.value)} style={{ ...inp, width:80 }}/></Row>
        <Row label="نسبة الضريبة %" sub="0 = بدون ضريبة"><input type="number" value={settings.taxRate} onChange={e => setField('taxRate', e.target.value)} min={0} max={100} style={{ ...inp, width:80 }}/></Row>
        <Row label="نسبة ربح المفرد %" sub="تُستخدم لسعر البيع المفرد في المواد وعند تحديث سعر الشراء">
          <input type="number" value={settings.defaultRetailProfitMargin ?? settings.defaultProfitMargin} onChange={e => { setField('defaultRetailProfitMargin', e.target.value); setField('defaultProfitMargin', e.target.value); }} min={0} style={{ ...inp, width:80 }}/>
        </Row>
        <Row label="نسبة ربح الجملة %" sub="تُستخدم لسعر الجملة المقترح">
          <input type="number" value={settings.defaultWholesaleProfitMargin} onChange={e => setField('defaultWholesaleProfitMargin', e.target.value)} min={0} style={{ ...inp, width:80 }}/>
        </Row>
        <Row label="نسبة ربح السعر الخاص %" sub="تُستخدم للسعر الخاص المقترح">
          <input type="number" value={settings.defaultSpecialProfitMargin} onChange={e => setField('defaultSpecialProfitMargin', e.target.value)} min={0} style={{ ...inp, width:80 }}/>
        </Row>
        <Row label="سعر صرف الدولار" sub="1 دولار = كم دينار عراقي">
          <div style={{ display:'flex', alignItems:'center', gap:6 }}>
            <span style={{ color:'#64748b', fontSize:12 }}>1 $ =</span>
            <input type="number" value={settings.exchangeRate} onChange={e => setField('exchangeRate', e.target.value)} min={1} style={{ ...inp, width:100 }}/>
            <span style={{ color:'#64748b', fontSize:12 }}>د.ع</span>
          </div>
        </Row>
      </Section>

      {/* الذكاء الاصطناعي */}
      <Section title="🤖 إعدادات الذكاء الاصطناعي" color="#3b82f6">
        <Row label="تفعيل المساعد الذكي" sub="تحليل تلقائي للمبيعات والربح والمخزون والذمم">
          {toggle('aiAssistantEnabled')}
        </Row>
        <Row label="ملخصات يومية ذكية" sub="إظهار توصيات مختصرة يومية داخل صفحة المساعد">
          {toggle('aiDailyInsights')}
        </Row>
        <Row label="حساسية التنبيهات">
          <select value={settings.aiSensitivity || 'متوسط'} onChange={e => setField('aiSensitivity', e.target.value)} style={{ ...inp, width:120 }}>
            <option value="منخفض">منخفض</option>
            <option value="متوسط">متوسط</option>
            <option value="عالي">عالي</option>
          </select>
        </Row>
        <Row label="الذكاء السحابي (مجاني)" sub="يتطلب مفتاح مجاني من Hugging Face أو OpenRouter">
          {toggle('aiCloudEnabled')}
        </Row>
        <Row label="مزود الخدمة">
          <select value={settings.aiCloudProvider || 'huggingface_free'} onChange={e => setField('aiCloudProvider', e.target.value)} style={{ ...inp, width:180 }}>
            <option value="huggingface_free">Hugging Face (مجاني)</option>
            <option value="openrouter_free">OpenRouter (مجاني)</option>
          </select>
        </Row>
        <Row label="الموديل">
          <input
            value={settings.aiCloudModel || ''}
            onChange={e => setField('aiCloudModel', e.target.value)}
            placeholder={settings.aiCloudProvider === 'openrouter_free' ? 'meta-llama/llama-3.3-8b-instruct:free' : 'Qwen/Qwen2.5-7B-Instruct'}
            style={{ ...inp, width:280 }}
          />
        </Row>
        <Row label="API Key" sub="مفتاح مجاني من مزود الخدمة المختار">
          <input
            type="password"
            value={settings.aiCloudApiKey || ''}
            onChange={e => setField('aiCloudApiKey', e.target.value)}
            placeholder="hf_... أو sk-or-..."
            style={{ ...inp, width:260 }}
          />
        </Row>
        <Row label="مهلة الاتصال (ms)">
          <input
            type="number"
            value={settings.aiCloudTimeoutMs || '15000'}
            onChange={e => setField('aiCloudTimeoutMs', e.target.value)}
            min={3000}
            style={{ ...inp, width:110 }}
          />
        </Row>
        <div style={{ color:'#64748b', fontSize:11, marginTop:8, lineHeight:1.9 }}>
          عند تعذر الخدمة السحابية، المساعد يرجع تلقائياً للتحليل المحلي داخل النظام.
        </div>
      </Section>

      {/* المخزون */}
      <Section title="📦 إعدادات المخزون" color="#a78bfa">
        <Row label="تنبيه المخزون المنخفض">{toggle('lowStockAlert')}</Row>
        <Row label="حد التنبيه للمخزون المنخفض">
          <input type="number" value={settings.lowStockThreshold} onChange={e => setField('lowStockThreshold', e.target.value)} min={1} style={{ ...inp, width:80 }}/>
        </Row>
      </Section>

      {/* النظام */}
      <Section title="🖥️ إعدادات النظام" color="#3b82f6">
        <Row label="الأصوات والتنبيهات">{toggle('soundEffects')}</Row>
        <Row label="شاشة الترحيب عند الدخول">{toggle('showWelcome')}</Row>
        <Row label="نسخ احتياطي تلقائي">{toggle('autoBackup')}</Row>
        <Row label="تنسيق التاريخ">
          <select value={settings.dateFormat} onChange={e => setField('dateFormat', e.target.value)} style={{ ...inp }}>
            <option value="ar-IQ">عربي (يوم/شهر/سنة)</option>
            <option value="en-US">إنجليزي (شهر/يوم/سنة)</option>
          </select>
        </Row>
      </Section>

      {/* معاينة */}
      <div style={{ background:'#ffffff', borderRadius:16, padding:20, border:'1px solid #d9e2f2' }}>
        <div style={{ color:'#64748b', fontSize:12, marginBottom:14 }}>معاينة رأس الفاتورة</div>
        <div style={{ background:'#fff', borderRadius:10, padding:20, textAlign:'center', direction:'rtl', position:'relative', overflow:'hidden' }}>
          {watermarkPreview && (
            <img src={watermarkPreview} style={{ position:'absolute', inset:0, width:'100%', height:'100%', objectFit:'contain', opacity:0.08, pointerEvents:'none' }} alt=""/>
          )}
          {invoiceHeaderPreview ? (
            <img src={invoiceHeaderPreview} style={{ width:'100%', maxHeight:170, objectFit:'contain', borderRadius:8, marginBottom:10, border:'1px solid #e5e7eb', background:'#fff' }} alt="invoice-header"/>
          ) : (
            <>
              {logoPreview && (
                <img src={logoPreview} style={{ width:60, height:60, objectFit:'contain', borderRadius:8, marginBottom:8 }} alt="logo"/>
              )}
              <div style={{ fontSize:18, fontWeight:800, color:'#1e293b', marginBottom:4 }}>{settings.storeName}</div>
              <div style={{ fontSize:12, color:'#64748b', marginBottom:2 }}>{settings.storeAddress}</div>
              <div style={{ fontSize:12, color:'#64748b', marginBottom:8 }}>📞 {settings.storePhone}</div>
            </>
          )}
          <div style={{ borderTop:'1px solid #eee', paddingTop:8, fontSize:11, color:'#64748b' }}>{settings.invoiceFooter}</div>
        </div>
      </div>
    </div>
  );
}
