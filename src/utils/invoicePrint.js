const DEFAULT_SETTINGS = {
  storeName: 'أضواء المدينة',
  storePhone: '07714424355',
  storeAddress: 'كربلاء، العراق',
  invoiceFooter: 'شكراً لتعاملكم معنا',
};

const PUBLIC_INVOICE_HEADER_PATH = '/print-header.png';

function readBrandAssets() {
  try {
    const storedHeader = localStorage.getItem('adwaa_invoice_header') || '';
    return {
      logo: localStorage.getItem('adwaa_logo') || '',
      invoiceHeader: storedHeader,
      watermark: localStorage.getItem('adwaa_watermark') || '',
    };
  } catch {
    return { logo: '', invoiceHeader: '', watermark: '' };
  }
}

function readSettings() {
  try {
    const raw = localStorage.getItem('adwaa_settings');
    const parsed = raw ? JSON.parse(raw) : {};
    return { ...DEFAULT_SETTINGS, ...parsed };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

// ── إعدادات عرض الفاتورة (من صفحة إعدادات الفاتورة) ──
const DEFAULT_DISPLAY_SETTINGS = {
  showHeader:           true,
  showPartyPhone:       true,
  showPartyAddress:     false,
  showExchangeRate:     true,
  showPreviousDebt:     true,
  showItemDiscount:     true,
  showStatusStrip:      true,
  showFooterSignatures: true,
  showNotes:            false,
  showSecondaryTotals:  true,
  showAccountBox:       true,
  compactMode:          false,
};

function readDisplaySettings() {
  try {
    const raw = localStorage.getItem('adwaa_invoice_settings');
    const saved = raw ? JSON.parse(raw) : {};
    return { ...DEFAULT_DISPLAY_SETTINGS, ...saved };
  } catch {
    return { ...DEFAULT_DISPLAY_SETTINGS };
  }
}

function money(v) {
  return `${Number(v || 0).toLocaleString('ar-IQ')} د.ع`;
}

function moneyWithDisplay(v, currencyCode = 'IQD', rate = 1) {
  const amount = Number(v || 0);
  if (currencyCode === 'USD') {
    const display = rate ? amount / Number(rate || 1) : amount;
    return `${display.toFixed(2)} $`;
  }
  return money(amount);
}

function esc(v) {
  return String(v ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function lineTotal(item) {
  const unitPrice = Number(item?.price ?? item?.buyPrice ?? 0);
  const qty = Number(item?.qty ?? item?.returnQty ?? 0);
  const base = unitPrice * qty;
  const discountAmount = Number(item?.lineDiscountAmount ?? item?.discountAmount ?? 0);
  return Number(item?.total ?? Math.max(0, base - discountAmount));
}

function lineDiscount(item) {
  const unitPrice = Number(item?.price ?? item?.buyPrice ?? 0);
  const qty = Number(item?.qty ?? item?.returnQty ?? 0);
  const base = unitPrice * qty;
  if (item?.lineDiscountAmount != null) {
    return Math.max(0, Number(item.lineDiscountAmount || 0));
  }
  const rawDiscount = Number(item?.lineDiscount || item?.discount || 0);
  const discountType = item?.lineDiscountType || item?.discountType || 'fixed';
  if (discountType === 'percent') {
    return Math.min(base, Math.max(0, base * (rawDiscount / 100)));
  }
  return Math.min(base, Math.max(0, rawDiscount));
}

function lineNotes(item) {
  return String(item?.notes || item?.note || item?.description || '').trim();
}

export function buildProfessionalInvoiceHtml(invoice, type = 'sale', options = {}) {
  try {
    const includePrintButton = options.includePrintButton !== false;
    const settings = readSettings();
    const assets = readBrandAssets();
    // قراءة إعدادات العرض من صفحة إعدادات الفاتورة
    const ds = readDisplaySettings();
    const isSale = type === 'sale' || type === 'sale_return';
    const isReturn = type === 'sale_return' || type === 'purchase_return';
    const isSaleReturn = type === 'sale_return';
    const isPurchaseReturn = type === 'purchase_return';
    const partyLabel = isSale ? 'تحرير الى السيد' : 'اسم المورد';
    const party = isSale ? (invoice.customer || 'زبون عام') : (invoice.supplier || '-');
    const partyPhone = isSale ? (invoice.customerPhone || '-') : (invoice.supplierPhone || '-');
    const dateValue = invoice.dateISO || invoice.date || new Date().toISOString().slice(0, 10);
    const rows = Array.isArray(invoice.items) ? invoice.items : [];

    const subtotal = Number(invoice.subtotal ?? rows.reduce((s, it) => s + lineTotal(it), 0));
    const discountValue = Number(invoice.discountAmount ?? 0);
    const total = Number(invoice.total ?? Math.max(0, subtotal - discountValue));
    const paid = Number(invoice.paidAmount ?? (invoice.paymentMethod === 'آجل' ? 0 : total));
    const due = Number(invoice.dueAmount ?? Math.max(0, total - paid));
    const currencyCode = invoice.currency === 'USD' ? 'USD' : 'IQD';
    const exchangeRate = Number(invoice.exchangeRate || 1);
    const previousDebt = Number(invoice.previousDebt ?? 0);
    const accountTotal = Number(invoice.accountTotal ?? Math.max(0, previousDebt + due));
    const settledAmount = Number(invoice.settledAmount ?? paid);
    const receivedAmount = Number(invoice.receivedAmount ?? invoice.cash ?? paid);
    const changeAmount = Number(invoice.change ?? Math.max(0, receivedAmount - total));
    const partyAddress = isSale ? (invoice.customerAddress || '-') : (invoice.supplierAddress || '-');
    const createdBy = invoice.cashier || invoice.addedBy || '-';
    const paymentStatus = invoice.paymentStatus || (due > 0 ? 'غير مدفوع' : 'مدفوع');
    const secondaryTotals = currencyCode === 'USD';
    const accountBoxTitle = isSale ? 'الحساب المحاسبي للزبون' : 'الحساب المحاسبي للمورد';
    const settlementLabel = isSale ? 'الواصل من الزبون' : 'الواصل للمورد';
    const remainingLabel = isSale ? 'المتبقي على الزبون' : 'المتبقي للمورد';
    const previousDebtLabel = isSale ? 'الدين السابق' : 'الدين السابق';
    const accountTotalLabel = isSale ? 'مبلغ الحساب الكلي' : 'مبلغ الحساب الكلي';
    const titleText = isSaleReturn
      ? 'فاتورة إرجاع بيع'
      : isPurchaseReturn
        ? 'فاتورة إرجاع شراء'
        : isSale
          ? (invoice.paymentMethod === 'آجل' ? 'فاتورة بيع آجلة' : 'فاتورة بيع')
          : 'فاتورة شراء';
    const showItemNotes = rows.some((item) => lineNotes(item));
    const headerImageSrc = assets.invoiceHeader || PUBLIC_INVOICE_HEADER_PATH;
    const metaRows = [
      [isReturn ? 'رقم الإرجاع' : 'رقم الفاتورة', invoice.returnNo || invoice.invoiceNo || '-'],
      ['التاريخ', dateValue],
      [partyLabel, party],
      ['نوع الفاتورة', titleText],
      ['العملة', currencyCode === 'USD' ? 'دولار أمريكي' : 'دينار عراقي'],
      ['المنظم', createdBy],
      // الهاتف: يُخفى إذا كانت الإعداد مُعطّلاً أو كانت القيمة فارغة
      ...(ds.showPartyPhone && partyPhone && partyPhone !== '-' ? [['الهاتف', partyPhone]] : []),
      // العنوان: يُخفى إذا كانت الإعداد مُعطّلاً أو كانت القيمة فارغة
      ...(ds.showPartyAddress && partyAddress && partyAddress !== '-' ? [['العنوان', partyAddress]] : []),
      // سعر الصرف: يُخفى حسب الإعداد
      ...(currencyCode === 'USD' && ds.showExchangeRate ? [['سعر الصرف', exchangeRate]] : []),
    ];
    const summaryRows = [
      ['مجموع القائمة', moneyWithDisplay(subtotal, currencyCode, exchangeRate)],
      // الخصم: يُخفى إذا لم يكن هناك خصم
      ...(discountValue > 0 || ds.showItemDiscount ? [['الخصم', moneyWithDisplay(discountValue, currencyCode, exchangeRate)]] : []),
      ['المبلغ النهائي', moneyWithDisplay(total, currencyCode, exchangeRate), 'is-strong'],
      ['المدفوع', moneyWithDisplay(paid, currencyCode, exchangeRate)],
      ['الواصل الفعلي', moneyWithDisplay(receivedAmount, currencyCode, exchangeRate)],
      ['الباقي / المتبقي', moneyWithDisplay(due, currencyCode, exchangeRate)],
      ...(changeAmount > 0 ? [['الباقي للزبون', moneyWithDisplay(changeAmount, currencyCode, exchangeRate)]] : []),
      // "ما يعادل بالدينار": حسب الإعداد
      ...(secondaryTotals && ds.showSecondaryTotals ? [['ما يعادل بالدينار', money(total)]] : []),
    ];

    // إظهار عمود الخصم فقط إذا كان الإعداد مُفعَّلاً
    const showDiscountCol = ds.showItemDiscount;
    const rowsHtml = rows.map((item, idx) => {
      const unitPrice = Number(item?.price ?? item?.buyPrice ?? 0);
      const itemDiscount = lineDiscount(item);
      return `
        <tr>
          <td>${idx + 1}</td>
          <td class="item-cell">${esc(item?.name || '-')}</td>
          <td>${Number(item?.qty ?? item?.returnQty ?? 0)}</td>
          <td>${moneyWithDisplay(unitPrice, currencyCode, exchangeRate)}</td>
          ${showDiscountCol ? `<td>${moneyWithDisplay(itemDiscount, currencyCode, exchangeRate)}</td>` : ''}
          <td>${moneyWithDisplay(lineTotal(item), currencyCode, exchangeRate)}</td>
          ${showItemNotes ? `<td class="notes-cell">${esc(lineNotes(item) || '-')}</td>` : ''}
        </tr>
      `;
    }).join('');

    const html = `
<!doctype html>
<html lang="ar" dir="rtl">
<head>
  <meta charset="utf-8" />
  <title>Invoice ${esc(invoice.invoiceNo || '')}</title>
  <style>
    @page { size: A4 portrait; margin: 9mm 10mm 11mm; }
    * { box-sizing: border-box; }
    html, body { width: 100%; margin: 0; padding: 0; background: #fff; color: #111827; }
    body { font-family: "Cairo", Tahoma, Arial, sans-serif; direction: rtl; line-height: 1.55; }
    .invoice-sheet { width: 100%; max-width: 190mm; margin: 0 auto; position: relative; }
    .watermark { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; pointer-events: none; z-index: 0; }
    .watermark img { max-width: 58%; max-height: 58%; object-fit: contain; opacity: 0.055; }
    .invoice-inner { position: relative; z-index: 1; }
    .header-image-wrap { width: 100%; margin: 0 0 7mm; border-bottom: 1px solid #9ca3af; padding-bottom: 3mm; }
    .header-image { width: 100%; max-height: 46mm; object-fit: contain; display: block; }
    .header-fallback-inline { display: none; }
    .header-fallback { display: grid; grid-template-columns: 1fr auto; gap: 6mm; align-items: end; padding-bottom: 3mm; border-bottom: 1px solid #9ca3af; margin-bottom: 7mm; }
    .brand-copy { text-align: right; }
    .brand-copy .name { font-size: 20pt; font-weight: 900; color: #202939; letter-spacing: 0.3px; }
    .brand-copy .sub { margin-top: 2mm; font-size: 10pt; color: #475569; }
    .brand-copy .phone { margin-top: 2mm; font-size: 9.2pt; color: #334155; }
    .brand-logo { width: 22mm; height: 22mm; object-fit: contain; }
    .invoice-title { text-align: center; font-size: 17pt; font-weight: 800; color: #111827; margin: 0 0 4mm; }
    .meta-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); border: 1px solid #7c8798; border-bottom: none; }
    .meta-item { display: grid; grid-template-columns: 38mm 1fr; min-height: 11mm; border-bottom: 1px solid #7c8798; }
    .meta-item:nth-child(odd) { border-left: 1px solid #7c8798; }
    .meta-label, .meta-value { padding: 2.6mm 3mm; font-size: 9.6pt; }
    .meta-label { background: #f3f4f6; font-weight: 700; color: #1f2937; border-left: 1px solid #cbd5e1; }
    .meta-value { background: #fff; color: #111827; font-weight: 600; }
    .status-strip { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 2.5mm; margin-top: 4mm; }
    .status-chip { border: 1px solid #cbd5e1; background: #f8fafc; padding: 2.5mm 3mm; min-height: 12mm; }
    .status-chip .label { color: #64748b; font-size: 8.6pt; }
    .status-chip .value { color: #111827; font-size: 10pt; font-weight: 800; margin-top: 1mm; }
    .section { margin-top: 5mm; }
    .section-title { font-size: 10pt; font-weight: 800; color: #334155; margin-bottom: 2mm; }
    table { width: 100%; border-collapse: collapse; table-layout: fixed; }
    .items-table { border: 1px solid #6b7280; }
    .items-table col.col-index { width: 8%; }
    .items-table col.col-item { width: ${showItemNotes ? '30%' : (showDiscountCol ? '38%' : '48%')}; }
    .items-table col.col-qty { width: 10%; }
    .items-table col.col-price { width: 15%; }
    .items-table col.col-discount { width: 13%; }
    .items-table col.col-total { width: ${showDiscountCol ? '14%' : '19%'}; }
    .items-table col.col-notes { width: 16%; }
    th, td { border: 1px solid #6b7280; padding: 2.4mm 2.2mm; font-size: 9.3pt; vertical-align: middle; }
    thead th { background: #eef2f7; color: #111827; font-weight: 800; text-align: center; }
    tbody td { text-align: center; }
    tbody td.item-cell, tbody td.notes-cell { text-align: right; }
    .summary-layout { display: grid; grid-template-columns: 1.2fr 0.9fr; gap: 4mm; margin-top: 5mm; align-items: start; }
    .summary-box, .account-box, .notes-box { border: 1px solid #7c8798; background: #fff; }
    .summary-head, .notes-head { background: #f3f4f6; color: #1f2937; font-size: 9.8pt; font-weight: 800; padding: 2.5mm 3mm; border-bottom: 1px solid #cbd5e1; }
    .summary-row { display: grid; grid-template-columns: 1fr 1fr; }
    .summary-row > div { padding: 2.6mm 3mm; border-bottom: 1px solid #e5e7eb; font-size: 9.4pt; }
    .summary-row > div:first-child { background: #fafafa; font-weight: 700; color: #334155; }
    .summary-row:last-child > div { border-bottom: none; }
    .summary-row.is-strong > div { font-weight: 900; font-size: 10pt; }
    .notes-box { min-height: ${invoice.notes ? '30mm' : '14mm'}; }
    .notes-body { padding: 3mm; font-size: 9.4pt; color: #1f2937; min-height: ${invoice.notes ? '22mm' : '8mm'}; }
    .footer-line { margin-top: 6mm; display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 5mm; text-align: center; font-size: 9.2pt; }
    .footer-line .line { margin-top: 8mm; border-top: 1px solid #94a3b8; }
    .footer { margin-top: 4mm; text-align: center; font-size: 8.8pt; color: #64748b; }
    @media print {
      .no-print { display: none !important; }
      html, body { width: 210mm; }
      .invoice-sheet { max-width: 100%; }
      .header-image { max-height: 43mm; }
      .status-strip { gap: 2mm; }
      th, td { font-size: 9pt; }
    }
    ${ds.compactMode ? `
    /* وضع الضغط: توفير الورق بتقليل المسافات */
    @page { margin: 4mm 5mm 5mm; }
    .meta-label, .meta-value { padding: 1.4mm 2mm; font-size: 8.8pt; }
    .meta-item { min-height: 8mm; }
    th, td { padding: 1.5mm 1.8mm; font-size: 8.5pt; }
    .status-chip { padding: 1.5mm 2mm; min-height: 8mm; }
    .status-chip .label { font-size: 7.8pt; }
    .status-chip .value { font-size: 9pt; margin-top: 0.5mm; }
    .summary-row > div { padding: 1.5mm 2mm; font-size: 8.8pt; }
    .section { margin-top: 2.5mm; }
    .invoice-title { margin: 0 0 2.5mm; font-size: 15pt; }
    .header-image-wrap { margin: 0 0 4mm; padding-bottom: 2mm; }
    .header-image { max-height: 30mm; }
    .notes-box { min-height: 10mm; }
    .notes-body { min-height: 6mm; padding: 2mm; font-size: 8.8pt; }
    .footer-line { margin-top: 3mm; font-size: 8.5pt; }
    .footer-line .line { margin-top: 5mm; }
    .footer { margin-top: 2mm; font-size: 8.2pt; }
    ` : ''}
  </style>
</head>
<body>
  <div class="invoice-sheet">
    ${assets.watermark ? `<div class="watermark"><img src="${assets.watermark}" alt=""></div>` : ''}
    <div class="invoice-inner">
      ${ds.showHeader ? `
      <div class="header-image-wrap">
        <img class="header-image" src="${headerImageSrc}" alt="invoice-header" onerror="this.style.display='none';this.nextElementSibling.style.display='grid'">
        <div class="header-fallback header-fallback-inline">
          <div class="brand-copy">
            <div class="name">${esc(settings.storeName)}</div>
            <div class="sub">${esc(settings.storeAddress || '')}</div>
            <div class="phone">${esc(settings.storePhone || '-')}</div>
          </div>
          ${assets.logo ? `<img class="brand-logo" src="${assets.logo}" alt="">` : `<div></div>`}
        </div>
      </div>
      ` : ''}
      <div class="invoice-title">${titleText}</div>

      <div class="meta-grid">
        ${metaRows.map(([label, value]) => `
          <div class="meta-item">
            <div class="meta-label">${esc(label)}</div>
            <div class="meta-value">${esc(value)}</div>
          </div>
        `).join('')}
      </div>

      ${ds.showStatusStrip ? `
      <div class="status-strip">
        <div class="status-chip"><div class="label">الدفع</div><div class="value">${esc(invoice.paymentMethod || '-')}</div></div>
        <div class="status-chip"><div class="label">حالة السداد</div><div class="value">${esc(paymentStatus)}</div></div>
        ${ds.showPreviousDebt ? `<div class="status-chip"><div class="label">${previousDebtLabel}</div><div class="value">${moneyWithDisplay(previousDebt, currencyCode, exchangeRate)}</div></div>` : ''}
        <div class="status-chip"><div class="label">${accountTotalLabel}</div><div class="value">${moneyWithDisplay(accountTotal, currencyCode, exchangeRate)}</div></div>
      </div>
      ` : ''}

      <div class="section">
        <div class="section-title">المفردات</div>
        <table class="items-table">
          <colgroup>
            <col class="col-index" />
            <col class="col-item" />
            <col class="col-qty" />
            <col class="col-price" />
            ${showDiscountCol ? '<col class="col-discount" />' : ''}
            <col class="col-total" />
            ${showItemNotes ? '<col class="col-notes" />' : ''}
          </colgroup>
          <thead>
            <tr>
              <th>ت</th>
              <th>المادة</th>
              <th>العدد</th>
              <th>السعر</th>
              ${showDiscountCol ? '<th>خصم المادة</th>' : ''}
              <th>المجموع</th>
              ${showItemNotes ? '<th>الملاحظات</th>' : ''}
            </tr>
          </thead>
          <tbody>
            ${rowsHtml}
          </tbody>
        </table>
      </div>

      <div class="summary-layout">
        ${ds.showAccountBox ? `
        <div class="summary-box">
          <div class="summary-head">الحسابات</div>
          <div class="summary-row"><div>${settlementLabel}</div><div>${moneyWithDisplay(receivedAmount, currencyCode, exchangeRate)}</div></div>
          <div class="summary-row"><div>${remainingLabel}</div><div>${moneyWithDisplay(due, currencyCode, exchangeRate)}</div></div>
          ${isReturn ? `<div class="summary-row"><div>المسوّى فعليًا</div><div>${moneyWithDisplay(settledAmount, currencyCode, exchangeRate)}</div></div>` : ''}
          <div class="summary-row"><div>الحالة</div><div>${esc(paymentStatus)}</div></div>
          <div class="summary-row"><div>${accountBoxTitle}</div><div>${moneyWithDisplay(accountTotal, currencyCode, exchangeRate)}</div></div>
        </div>
        ` : ''}
        <div class="summary-box">
          <div class="summary-head">المجاميع</div>
          ${summaryRows.map(([label, value, className = '']) => `
            <div class="summary-row ${className}">
              <div>${esc(label)}</div>
              <div>${esc(value)}</div>
            </div>
          `).join('')}
        </div>
      </div>

      ${(invoice.notes || ds.showNotes) ? `
      <div class="notes-box section">
        <div class="notes-head">الملاحظات</div>
        <div class="notes-body">${esc(invoice.notes || '')}</div>
      </div>
      ` : ''}

      ${ds.showFooterSignatures ? `
      <div class="footer-line">
        <div>اسم المنظم<div class="line"></div>${esc(invoice.cashier || invoice.addedBy || '-')}</div>
        <div>التوقيع<div class="line"></div>&nbsp;</div>
        <div>اسم المستلم<div class="line"></div>${esc(party)}</div>
      </div>
      ` : ''}

      <div class="footer">${esc(settings.invoiceFooter || '')}</div>
      ${includePrintButton ? `
        <div class="footer no-print" style="margin-top:14px;">
          <button onclick="window.print()">طباعة</button>
        </div>
      ` : ''}
    </div>
  </div>
</body>
</html>`;
    return html;
  } catch (err) {
    return `<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"/><title>Invoice</title></head><body style="font-family:Cairo,Tahoma,Arial,sans-serif;padding:24px"><h3>تعذر توليد نموذج الفاتورة</h3><p>يرجى المحاولة مرة أخرى.</p><pre style="white-space:pre-wrap;color:#b91c1c">${esc(err?.message || '')}</pre></body></html>`;
  }
}

export function openProfessionalInvoicePrint(invoice, type = 'sale') {
  if (typeof window === 'undefined' || !invoice) return false;
  const html = buildProfessionalInvoiceHtml(invoice, type, { includePrintButton: true });
  const safeHtml = typeof html === 'string' && html.trim()
    ? html
    : '<!doctype html><html><body style="font-family:Cairo,Tahoma,Arial,sans-serif;padding:24px">تعذر فتح صفحة الطباعة.</body></html>';

  if (window?.adwaaDesktop?.isDesktop && typeof window.adwaaDesktop.printHtml === 'function') {
    window.adwaaDesktop.printHtml({
      html: safeHtml,
      title: invoice?.invoiceNo || 'Adwaa POS Print',
    }).catch((error) => {
      console.error('[adwaa-print] Desktop print failed', error);
    });
    return true;
  }

  const blob = new Blob([safeHtml], { type: 'text/html;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const w = window.open(url, '_blank', 'width=1100,height=800');
  if (!w) return false;
  setTimeout(() => {
    try { w.focus(); } catch { /* noop */ }
  }, 50);
  setTimeout(() => URL.revokeObjectURL(url), 30000);
  return true;
}
