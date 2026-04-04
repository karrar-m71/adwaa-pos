/**
 * helpers.js — دوال مساعدة مشتركة في جميع أنحاء التطبيق
 */

// ── تنسيق الأرقام ──────────────────────────────────────────────────────────

/** تحويل الأرقام العربية/الفارسية إلى أرقام لاتينية */
export const normalizeDigits = (value) =>
  String(value ?? '')
    .replace(/[٠-٩]/g, (d) => '٠١٢٣٤٥٦٧٨٩'.indexOf(d).toString())
    .replace(/[۰-۹]/g, (d) => '۰۱۲۳۴۵۶۷۸۹'.indexOf(d).toString())
    .replace('٫', '.')
    .replace('٬', '');

/** تحويل أي قيمة إلى رقم صحيح (0 إن فشل) */
export const toNum = (v) => {
  const n = Number(normalizeDigits(v).replace(/[^\d.-]/g, '') || 0);
  return Number.isFinite(n) ? n : 0;
};

/** تنسيق الدينار العراقي */
export const fmtIQD = (n) => (n || 0).toLocaleString('ar-IQ') + ' د.ع';

/** تنسيق الدولار الأمريكي */
export const fmtUSD = (n) => `$${(Number(n || 0)).toFixed(2)}`;

/** تنسيق حسب العملة */
export const fmtByCurrency = (amount, currency = 'IQD') =>
  currency === 'USD' ? fmtUSD(amount) : fmtIQD(amount);

// ── سعر الصرف ─────────────────────────────────────────────────────────────

/** الحصول على سعر الصرف من الإعدادات (الافتراضي: 1480) */
export const getExchangeRate = () => {
  try {
    const settings = JSON.parse(localStorage.getItem('adwaa_settings') || '{}');
    const rate = Number(settings.exchangeRate);
    return Number.isFinite(rate) && rate > 0 ? rate : 1480;
  } catch {
    return 1480;
  }
};

/** الحصول على العملة المفضلة من التخزين المحلي */
export const getPreferredCurrency = () => {
  try {
    const settings = JSON.parse(localStorage.getItem('adwaa_settings') || '{}');
    return settings.preferredCurrency === 'USD' ? 'USD' : 'IQD';
  } catch {
    return 'IQD';
  }
};

/** حفظ العملة المفضلة في التخزين المحلي */
export const setPreferredCurrency = (currency = 'IQD') => {
  try {
    const settings = JSON.parse(localStorage.getItem('adwaa_settings') || '{}');
    settings.preferredCurrency = currency === 'USD' ? 'USD' : 'IQD';
    localStorage.setItem('adwaa_settings', JSON.stringify(settings));
  } catch {
    // noop
  }
};

/** تحويل IQD إلى قيمة عرض حسب العملة */
export const toDisplayAmount = (amountIQD, currency, rate) => {
  const r = rate || getExchangeRate();
  return currency === 'USD' ? toNum(amountIQD) / r : toNum(amountIQD);
};

/** تحويل قيمة عرض إلى IQD */
export const toIQDAmount = (displayAmount, currency, rate) => {
  const r = rate || getExchangeRate();
  return currency === 'USD' ? toNum(displayAmount) * r : toNum(displayAmount);
};

// ── التواريخ ───────────────────────────────────────────────────────────────

/** التاريخ الحالي بصيغة ISO (YYYY-MM-DD) */
export const todayISO = () => new Date().toISOString().split('T')[0];

/** التاريخ الحالي بالتنسيق العربي */
export const todayAR = () => new Date().toLocaleDateString('ar-IQ');

/** التاريخ والوقت الحالي بالتنسيق العربي */
export const nowAR = () =>
  new Date().toLocaleDateString('ar-IQ', {
    year: 'numeric', month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });

/** تحويل أي قيمة تاريخ إلى ISO */
export const toISO = (value) => {
  if (!value) return '';
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? '' : d.toISOString().split('T')[0];
};

// ── توليد الرموز ──────────────────────────────────────────────────────────

/** توليد رقم فاتورة عشوائي */
export const genInvoiceNo = (prefix = 'INV') =>
  `${prefix}-${Date.now().toString().slice(-6)}${Math.floor(Math.random() * 90 + 10)}`;

// ── معالجة الأخطاء ────────────────────────────────────────────────────────

const ERROR_MESSAGES = {
  'permission-denied':       'ليس لديك صلاحية تنفيذ هذه العملية.',
  'not-found':               'السجل المطلوب غير موجود.',
  'unavailable':             'الخادم غير متاح حالياً. تحقق من الاتصال بالإنترنت.',
  'deadline-exceeded':       'انتهت مهلة العملية. حاول مجدداً.',
  'resource-exhausted':      'تجاوزت الحصة المسموح بها. حاول لاحقاً.',
  'cancelled':               'تم إلغاء العملية.',
  'data-loss':               'حدث فقدان في البيانات. تواصل مع الدعم.',
  'unauthenticated':         'يجب تسجيل الدخول أولاً.',
  'already-exists':          'السجل موجود بالفعل.',
  'invalid-argument':        'بيانات غير صالحة.',
  'network-request-failed':  'فشل الاتصال بالشبكة.',
};

/**
 * استخراج رسالة خطأ مناسبة من خطأ Firebase أو JavaScript
 * @param {unknown} error
 * @param {string} fallback رسالة افتراضية
 * @returns {string}
 */
export const getErrorMessage = (error, fallback = 'حدث خطأ غير متوقع. حاول مجدداً.') => {
  if (!error) return fallback;
  const code = error?.code?.replace('firestore/', '').replace('auth/', '');
  if (code && ERROR_MESSAGES[code]) return ERROR_MESSAGES[code];
  if (error?.message) {
    if (error.message.includes('offline')) return 'أنت غير متصل بالإنترنت. سيتم المزامنة عند الاتصال.';
    if (error.message.includes('quota')) return 'تجاوزت الحصة المسموح بها.';
    if (error.message.includes('network')) return 'فشل الاتصال بالشبكة.';
  }
  return fallback;
};

/**
 * تنفيذ عملية Firebase بأمان مع معالجة الأخطاء
 * @param {() => Promise<T>} fn
 * @param {string} errorMsg
 * @returns {Promise<{ok: boolean, data?: T, error?: string}>}
 */
export const safeAsync = async (fn, errorMsg) => {
  try {
    const data = await fn();
    return { ok: true, data };
  } catch (e) {
    const msg = getErrorMessage(e, errorMsg);
    console.error('[safeAsync]', e);
    return { ok: false, error: msg };
  }
};

// ── التحقق من المدخلات ────────────────────────────────────────────────────

/**
 * التحقق من صحة نموذج إدخال
 * @param {Record<string, unknown>} fields قيم الحقول
 * @param {Record<string, string>} rules قواعد التحقق { fieldKey: 'رسالة الخطأ' }
 * @returns {string|null} أول خطأ أو null
 */
export const validateForm = (fields, rules) => {
  for (const [key, message] of Object.entries(rules)) {
    const value = fields[key];
    if (value === undefined || value === null || String(value).trim() === '' || Number(value) < 0) {
      return message;
    }
  }
  return null;
};

// ── التحديثات المتراكمة للعملات ────────────────────────────────────────────

/**
 * تطبيق دلتا على حقل العملة في كائن الديون
 * @param {{ IQD: number, USD: number }} current
 * @param {'IQD'|'USD'} code
 * @param {number} delta (موجب = زيادة، سالب = نقصان)
 */
export const applyDebtDelta = (current = { IQD: 0, USD: 0 }, code = 'IQD', delta = 0) => {
  const next = { IQD: toNum(current.IQD), USD: toNum(current.USD) };
  const key = code === 'USD' ? 'USD' : 'IQD';
  next[key] = Math.max(0, next[key] + toNum(delta));
  return next;
};

/**
 * قراءة ديون كيان (زبون/مورد) بالعملتين
 */
export const readDebt = (entity = {}) => ({
  IQD: toNum(entity?.debtByCurrency?.IQD ?? entity?.debtByCurrency?.iqd ?? (!entity?.debtByCurrency ? entity?.debt : 0) ?? 0),
  USD: toNum(entity?.debtByCurrency?.USD ?? entity?.debtByCurrency?.usd ?? 0),
});

/**
 * إجمالي الديون بالدينار (تحويل الدولار)
 */
export const totalDebtIQD = (entity, rate) => {
  const { IQD, USD } = readDebt(entity);
  const r = rate || getExchangeRate();
  return IQD + USD * r;
};
