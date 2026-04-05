import { useState } from 'react';

// ── مفتاح التخزين في localStorage ──────────────
export const INVOICE_SETTINGS_KEY = 'adwaa_invoice_settings';

// ── الإعدادات الافتراضية ────────────────────────
export const DEFAULT_INVOICE_DISPLAY_SETTINGS = {
  showHeader:           true,   // رأس الفاتورة / الشعار
  showPartyPhone:       true,   // هاتف الزبون / المورد
  showPartyAddress:     false,  // عنوان الزبون / المورد
  showExchangeRate:     true,   // سعر الصرف
  showPreviousDebt:     true,   // الدين السابق
  showItemDiscount:     true,   // عمود خصم المادة
  showStatusStrip:      true,   // شريط الحالة (نقدي/آجل/...)
  showFooterSignatures: true,   // التواقيع أسفل الفاتورة
  showNotes:            false,  // قسم الملاحظات (يظهر دائماً إن كان فيه نص)
  showSecondaryTotals:  true,   // "ما يعادل بالدينار" عند استخدام الدولار
  showAccountBox:       true,   // صندوق الحساب المحاسبي
  compactMode:          false,  // وضع الضغط (تقليل المسافات)
};

// ── قراءة الإعدادات من localStorage ─────────────
export function readInvoiceDisplaySettings() {
  try {
    const raw = localStorage.getItem(INVOICE_SETTINGS_KEY);
    const saved = raw ? JSON.parse(raw) : {};
    return { ...DEFAULT_INVOICE_DISPLAY_SETTINGS, ...saved };
  } catch {
    return { ...DEFAULT_INVOICE_DISPLAY_SETTINGS };
  }
}

// ── حفظ الإعدادات في localStorage ───────────────
function saveInvoiceDisplaySettings(settings) {
  try {
    localStorage.setItem(INVOICE_SETTINGS_KEY, JSON.stringify(settings));
    return true;
  } catch {
    return false;
  }
}

// ── تعريف الخيارات مع التسميات ──────────────────
const OPTIONS = [
  { key: 'showHeader',           label: 'رأس الفاتورة / الشعار',        icon: '🖼️',  desc: 'صورة الرأس أو اسم المحل في أعلى الفاتورة' },
  { key: 'showPartyPhone',       label: 'هاتف الزبون / المورد',          icon: '📞',  desc: 'رقم هاتف الطرف المقابل في المعلومات' },
  { key: 'showPartyAddress',     label: 'عنوان الزبون / المورد',         icon: '📍',  desc: 'عنوان الطرف المقابل في المعلومات' },
  { key: 'showExchangeRate',     label: 'سعر الصرف (عند الدولار)',       icon: '💱',  desc: 'يظهر فقط عند استخدام الدولار' },
  { key: 'showPreviousDebt',     label: 'الدين السابق للزبون',           icon: '📊',  desc: 'شريط الدين السابق في الحساب المحاسبي' },
  { key: 'showItemDiscount',     label: 'عمود خصم المادة',               icon: '🏷️',  desc: 'عمود "خصم المادة" في جدول المفردات' },
  { key: 'showStatusStrip',      label: 'شريط حالة الفاتورة',            icon: '📋',  desc: 'الشريط الذي يعرض: الدفع، حالة السداد، الدين...' },
  { key: 'showAccountBox',       label: 'صندوق الحساب المحاسبي',         icon: '🧾',  desc: 'يعرض الواصل والمتبقي والحساب الكلي' },
  { key: 'showFooterSignatures', label: 'التواقيع أسفل الفاتورة',        icon: '✍️',  desc: 'خانات: المنظم، التوقيع، المستلم' },
  { key: 'showNotes',            label: 'مربع الملاحظات (دائماً)',        icon: '📝',  desc: 'المربع يظهر دائماً حتى لو لم توجد ملاحظات' },
  { key: 'showSecondaryTotals',  label: 'ما يعادل بالدينار (دولار)',      icon: '💵',  desc: 'يظهر فقط في الفواتير بالدولار' },
  { key: 'compactMode',          label: 'وضع الضغط (توفير الورق)',        icon: '📄',  desc: 'تقليل المسافات والخطوط لتوفير الورق' },
];

// ── أنماط CSS ──────────────────────────────────
const S = {
  page:    { padding: 28, fontFamily: "'Cairo', Tahoma, Arial, sans-serif", direction: 'rtl', maxWidth: 800, margin: '0 auto' },
  title:   { color: '#fff', fontSize: 22, fontWeight: 800, marginBottom: 6 },
  sub:     { color: '#64748b', fontSize: 13, marginBottom: 24 },
  card:    { background: '#ffffff', border: '1px solid #d9e2f2', borderRadius: 16, overflow: 'hidden', marginBottom: 20 },
  head:    { background: '#f8fbff', borderBottom: '1px solid #e2e8f7', padding: '12px 18px', fontSize: 13, fontWeight: 700, color: '#334155' },
  row:     { display: 'flex', alignItems: 'center', gap: 14, padding: '12px 18px', borderBottom: '1px solid #f1f5fb', cursor: 'pointer' },
  rowLast: { display: 'flex', alignItems: 'center', gap: 14, padding: '12px 18px', cursor: 'pointer' },
  icon:    { fontSize: 22, minWidth: 28, textAlign: 'center' },
  info:    { flex: 1 },
  lbl:     { color: '#1e293b', fontSize: 13, fontWeight: 600 },
  desc:    { color: '#94a3b8', fontSize: 11, marginTop: 2 },
  toggle:  (on) => ({
    width: 44, height: 24, borderRadius: 12, background: on ? '#F5C800' : '#d1d5db',
    border: 'none', cursor: 'pointer', position: 'relative', transition: 'background 0.2s', flexShrink: 0,
  }),
  dot:     (on) => ({
    position: 'absolute', top: 3, left: on ? 23 : 3, width: 18, height: 18,
    borderRadius: 9, background: '#fff', transition: 'left 0.2s', boxShadow: '0 1px 3px #0002',
  }),
  actions: { display: 'flex', gap: 12, marginTop: 4 },
  btnSave: { background: 'linear-gradient(135deg,#F5C800,#d4a900)', color: '#fff', border: 'none', borderRadius: 10, padding: '10px 24px', fontWeight: 700, cursor: 'pointer', fontFamily: "'Cairo'", fontSize: 13 },
  btnReset:{ background: '#f1f5fb', color: '#64748b', border: '1px solid #d9e2f2', borderRadius: 10, padding: '10px 18px', fontWeight: 700, cursor: 'pointer', fontFamily: "'Cairo'", fontSize: 13 },
  saved:   { color: '#10b981', fontSize: 12, fontWeight: 700, alignSelf: 'center' },
  preview: { background: '#f8fbff', border: '1px solid #d9e2f2', borderRadius: 12, padding: '14px 18px', marginTop: 4, fontSize: 12, color: '#475569' },
};

export default function InvoiceSettings() {
  const [settings, setSettings] = useState(() => readInvoiceDisplaySettings());
  const [savedMsg, setSavedMsg] = useState('');

  const toggle = (key) => setSettings((prev) => ({ ...prev, [key]: !prev[key] }));

  const handleSave = () => {
    const ok = saveInvoiceDisplaySettings(settings);
    setSavedMsg(ok ? '✅ تم الحفظ' : '❌ فشل الحفظ');
    setTimeout(() => setSavedMsg(''), 2500);
  };

  const handleReset = () => {
    setSettings({ ...DEFAULT_INVOICE_DISPLAY_SETTINGS });
    saveInvoiceDisplaySettings({ ...DEFAULT_INVOICE_DISPLAY_SETTINGS });
    setSavedMsg('🔄 تمت إعادة التعيين');
    setTimeout(() => setSavedMsg(''), 2500);
  };

  // تقسيم الخيارات: الأولى 8 في بطاقة، الباقي في بطاقة ثانية
  const mainOptions    = OPTIONS.filter((o) => o.key !== 'compactMode');
  const compactOption  = OPTIONS.find((o) => o.key === 'compactMode');

  const renderOption = (opt, isLast) => (
    <div key={opt.key} style={isLast ? S.rowLast : S.row} onClick={() => toggle(opt.key)}>
      <span style={S.icon}>{opt.icon}</span>
      <div style={S.info}>
        <div style={S.lbl}>{opt.label}</div>
        <div style={S.desc}>{opt.desc}</div>
      </div>
      <button style={S.toggle(settings[opt.key])} onClick={(e) => { e.stopPropagation(); toggle(opt.key); }}>
        <div style={S.dot(settings[opt.key])} />
      </button>
    </div>
  );

  return (
    <div style={S.page}>
      <div style={S.title}>🖨️ إعدادات الفاتورة</div>
      <div style={S.sub}>تحكم بما يظهر في الفاتورة عند الطباعة — يُحفظ تلقائياً على هذا الجهاز</div>

      {/* خيارات الطباعة الرئيسية */}
      <div style={S.card}>
        <div style={S.head}>⚙️ عناصر الفاتورة</div>
        {mainOptions.map((opt, i) => renderOption(opt, i === mainOptions.length - 1))}
      </div>

      {/* وضع الضغط منفصل */}
      <div style={S.card}>
        <div style={S.head}>📄 خيارات الورق</div>
        {compactOption && renderOption(compactOption, true)}
        {settings.compactMode && (
          <div style={{ ...S.preview, margin: '0 18px 14px', borderColor: '#fbbf24', background: '#fffbeb' }}>
            <strong style={{ color: '#d97706' }}>وضع الضغط مفعّل:</strong> سيتم تقليل المسافات بين الأسطر وتصغير الخطوط بشكل طفيف لتوفير الورق.
            مناسب للورق الصغير (A5 أو 80mm).
          </div>
        )}
      </div>

      {/* الأزرار */}
      <div style={S.actions}>
        <button style={S.btnSave} onClick={handleSave}>💾 حفظ الإعدادات</button>
        <button style={S.btnReset} onClick={handleReset}>↺ إعادة التعيين</button>
        {savedMsg && <span style={S.saved}>{savedMsg}</span>}
      </div>

      {/* معاينة نصية */}
      <div style={{ ...S.preview, marginTop: 20 }}>
        <strong>ملاحظة:</strong> هذه الإعدادات تؤثر فقط على الفاتورة عند الطباعة ولا تغير البيانات المحفوظة.
        تُخزَّن محلياً على هذا الجهاز وتُطبَّق في كل فاتورة تُطبع من هنا.
      </div>
    </div>
  );
}
