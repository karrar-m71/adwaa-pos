const DEFAULT_SETTINGS = {
  storeName: 'أضواء المدينة',
  storePhone: '07714424355',
  storeAddress: 'كربلاء، العراق',
  invoiceFooter: 'شكراً لتعاملكم معنا',
};

function readBrandAssets() {
  try {
    return {
      logo: localStorage.getItem('adwaa_logo') || '',
      invoiceHeader: localStorage.getItem('adwaa_invoice_header') || '',
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

export function buildProfessionalInvoiceHtml(invoice, type = 'sale', options = {}) {
  try {
    const includePrintButton = options.includePrintButton !== false;
    const settings = readSettings();
    const assets = readBrandAssets();
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

    const rowsHtml = rows.map((item, idx) => {
      const unitPrice = Number(item?.price ?? item?.buyPrice ?? 0);
      const itemDiscount = lineDiscount(item);
      return `
        <tr>
          <td>${idx + 1}</td>
          <td>${esc(item?.name || '-')}</td>
          <td>${Number(item?.qty ?? item?.returnQty ?? 0)}</td>
          <td>${moneyWithDisplay(unitPrice, currencyCode, exchangeRate)}</td>
          <td>${moneyWithDisplay(itemDiscount, currencyCode, exchangeRate)}</td>
          <td>${moneyWithDisplay(lineTotal(item), currencyCode, exchangeRate)}</td>
        </tr>
      `;
    }).join('');

    const titleText = isSaleReturn
      ? 'فاتورة إرجاع بيع'
      : isPurchaseReturn
        ? 'فاتورة إرجاع شراء'
        : isSale
          ? (invoice.paymentMethod === 'آجل' ? 'فاتورة بيع آجلة' : 'فاتورة بيع')
          : 'فاتورة شراء';
    const html = `
<!doctype html>
<html lang="ar" dir="rtl">
<head>
  <meta charset="utf-8" />
  <title>Invoice ${esc(invoice.invoiceNo || '')}</title>
  <style>
    @page { size: auto; margin: 4mm; }
    * { box-sizing: border-box; }
    body { font-family: "Cairo", Tahoma, Arial, sans-serif; margin: 0; color: #111827; background: #fff; }
    .invoice { width: 100%; border: 1px solid #d1d5db; padding: 10px; position: relative; overflow: hidden; border-radius: 18px; }
    .watermark { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; pointer-events: none; z-index: 0; }
    .watermark img { max-width: 70%; max-height: 70%; object-fit: contain; opacity: 0.08; }
    .invoice-inner { position: relative; z-index: 1; }
    .head { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; align-items: center; border-bottom: 2px solid #e5e7eb; padding-bottom: 8px; }
    .header-image-wrap { border-bottom: 2px solid #e5e7eb; padding-bottom: 8px; margin-bottom: 8px; }
    .header-image { width: 100%; max-height: 210px; object-fit: contain; display: block; border-radius: 14px; }
    .brand { text-align: right; }
    .brand-top { display: flex; gap: 10px; align-items: center; justify-content: flex-end; }
    .brand-logo { width: 62px; height: 62px; object-fit: contain; border-radius: 8px; border: 1px solid #d1d5db; padding: 2px; background: #fff; }
    .brand .name { font-size: 36px; font-weight: 900; color: #b45309; line-height: 1; }
    .brand .sub { font-size: 13px; color: #6b7280; margin-top: 4px; }
    .phones { display: flex; gap: 8px; justify-content: flex-end; margin-top: 8px; font-size: 12px; color: #374151; }
    .phones span { border: 1px solid #d1d5db; border-radius: 16px; padding: 2px 10px; }
    .meta { text-align: left; }
    .meta .title { font-size: 18px; font-weight: 800; margin-bottom: 6px; color: #111827; }
    .meta .box { border: 1px solid #9ca3af; display: grid; grid-template-columns: 120px 1fr; font-size: 13px; }
    .meta .box div { padding: 4px 8px; border-bottom: 1px solid #d1d5db; }
    .meta .box div:nth-last-child(-n+2) { border-bottom: 0; }
    .meta .box div:nth-child(odd) { background: #f3f4f6; font-weight: 700; }
    table { width: 100%; border-collapse: collapse; margin-top: 10px; }
    th, td { border: 1px solid #9ca3af; padding: 4px 6px; font-size: 11px; text-align: center; }
    th { background: #f3f4f6; font-weight: 800; }
    td:nth-child(2) { text-align: right; }
    .compact-meta { margin-top: 8px; display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 6px; }
    .compact-chip { border: 1px solid #d1d5db; border-radius: 10px; padding: 6px 8px; background: #f8fafc; }
    .compact-chip .label { color: #64748b; font-size: 10px; margin-bottom: 2px; }
    .compact-chip .value { color: #0f172a; font-size: 11px; font-weight: 800; }
    .info-grid { margin-top: 10px; display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
    .info-box { border: 1px solid #d1d5db; border-radius: 12px; overflow: hidden; }
    .info-box-title { background: #f8fafc; padding: 8px 10px; font-size: 12px; font-weight: 800; color: #334155; border-bottom: 1px solid #e5e7eb; }
    .totals { margin-top: 8px; display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
    .totals .box { border: 1px solid #9ca3af; }
    .totals .row { display: grid; grid-template-columns: 1fr 1fr; }
    .totals .row div { padding: 5px 8px; border-bottom: 1px solid #e5e7eb; font-size: 12px; }
    .totals .row:last-child div { border-bottom: 0; font-weight: 800; }
    .totals .row div:first-child { background: #f9fafb; }
    .accounting { margin-top: 8px; display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
    .accounting .box { border: 1px solid #9ca3af; }
    .badge { display: inline-flex; align-items: center; gap: 6px; border-radius: 999px; padding: 4px 10px; font-size: 12px; font-weight: 800; }
    .badge.success { background: #ecfdf5; color: #047857; border: 1px solid #a7f3d0; }
    .badge.warn { background: #fff7ed; color: #c2410c; border: 1px solid #fdba74; }
    .notes { margin-top: 10px; border: 1px solid #d1d5db; min-height: 48px; padding: 6px; font-size: 12px; }
    .signs { margin-top: 18px; display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 10px; text-align: center; font-size: 12px; }
    .line { margin-top: 26px; border-top: 1px dashed #6b7280; }
    .footer { margin-top: 10px; text-align: center; font-size: 11px; color: #6b7280; }
    @media print {
      .no-print { display: none !important; }
      body { background: #fff; }
      .invoice {
        width: 76mm;
        max-width: 76mm;
        border: none;
        border-radius: 0;
        padding: 0;
        margin: 0 auto;
      }
      .header-image-wrap, .watermark, .signs { display: none !important; }
      .head { grid-template-columns: 1fr; gap: 6px; padding-bottom: 6px; }
      .brand .name { font-size: 22px; }
      .brand .sub, .phones { font-size: 10px; }
      .meta .title { font-size: 14px; margin-bottom: 4px; }
      .meta .box { grid-template-columns: 90px 1fr; font-size: 10px; }
      .meta .box div { padding: 3px 5px; }
      table { margin-top: 6px; }
      th, td { font-size: 10px; padding: 3px 4px; }
      .compact-meta { grid-template-columns: 1fr 1fr; }
      .info-grid, .totals, .accounting { grid-template-columns: 1fr; gap: 6px; margin-top: 6px; }
      .info-box-title, .totals .row div, .notes, .footer { font-size: 10px; }
      .notes { min-height: 20px; padding: 5px; }
    }
  </style>
</head>
<body>
  <div class="invoice">
    ${assets.watermark ? `<div class="watermark"><img src="${assets.watermark}" alt=""></div>` : ''}
    <div class="invoice-inner">
      ${assets.invoiceHeader ? `
        <div class="header-image-wrap">
          <img class="header-image" src="${assets.invoiceHeader}" alt="invoice-header">
        </div>
      ` : ''}

      ${assets.invoiceHeader ? `
        <div class="head" style="grid-template-columns: 1fr;">
          <div class="meta" style="text-align:right;">
            <div class="title">${titleText}</div>
            <div class="box">
              <div>${isReturn ? 'رقم الإرجاع' : 'رقم الفاتورة'}</div><div>${esc(invoice.returnNo || invoice.invoiceNo || '-')}</div>
              <div>التاريخ</div><div>${esc(dateValue)}</div>
              <div>${partyLabel}</div><div>${esc(party)}</div>
              <div>رقم الهاتف</div><div>${esc(partyPhone)}</div>
              <div>العنوان</div><div>${esc(partyAddress)}</div>
            </div>
          </div>
        </div>
      ` : `
        <div class="head">
          <div class="brand">
            <div class="brand-top">
              <div>
                <div class="name">${esc(settings.storeName)}</div>
                <div class="sub">${esc(settings.storeAddress || '')}</div>
              </div>
              ${assets.logo ? `<img class="brand-logo" src="${assets.logo}" alt="">` : ''}
            </div>
            <div class="phones">
              <span>${esc(settings.storePhone || '-')}</span>
            </div>
          </div>
          <div class="meta">
            <div class="title">${titleText}</div>
            <div class="box">
              <div>${isReturn ? 'رقم الإرجاع' : 'رقم الفاتورة'}</div><div>${esc(invoice.returnNo || invoice.invoiceNo || '-')}</div>
              <div>التاريخ</div><div>${esc(dateValue)}</div>
              <div>${partyLabel}</div><div>${esc(party)}</div>
              <div>رقم الهاتف</div><div>${esc(partyPhone)}</div>
              <div>العنوان</div><div>${esc(partyAddress)}</div>
            </div>
          </div>
        </div>
      `}

      <div class="compact-meta">
        <div class="compact-chip"><div class="label">الدفع</div><div class="value">${esc(invoice.paymentMethod || '-')}</div></div>
        <div class="compact-chip"><div class="label">حالة السداد</div><div class="value">${esc(paymentStatus)}</div></div>
        <div class="compact-chip"><div class="label">المنظم</div><div class="value">${esc(createdBy)}</div></div>
        <div class="compact-chip"><div class="label">العملة</div><div class="value">${currencyCode === 'USD' ? 'دولار' : 'دينار'}</div></div>
      </div>

      <div class="info-grid">
        <div class="info-box">
          <div class="info-box-title">بيانات الفاتورة</div>
          <div class="totals" style="margin-top:0;grid-template-columns:1fr;">
            <div class="box" style="border:none;">
              <div class="row"><div>نوع الفاتورة</div><div>${esc(titleText)}</div></div>
              <div class="row"><div>${isSale ? 'الهاتف' : 'هاتف المورد'}</div><div>${esc(partyPhone)}</div></div>
              <div class="row"><div>${isSale ? 'العنوان' : 'العنوان'}</div><div>${esc(partyAddress)}</div></div>
              ${currencyCode === 'USD' ? `<div class="row"><div>سعر الصرف</div><div>${esc(exchangeRate)}</div></div>` : ''}
            </div>
          </div>
        </div>
        <div class="info-box">
          <div class="info-box-title">${accountBoxTitle}</div>
          <div class="totals" style="margin-top:0;grid-template-columns:1fr;">
            <div class="box" style="border:none;">
              <div class="row"><div>${previousDebtLabel}</div><div>${moneyWithDisplay(previousDebt, currencyCode, exchangeRate)}</div></div>
              ${isReturn ? `<div class="row"><div>المسوّى فعليًا</div><div>${moneyWithDisplay(settledAmount, currencyCode, exchangeRate)}</div></div>` : ''}
              <div class="row"><div>${settlementLabel}</div><div>${moneyWithDisplay(receivedAmount, currencyCode, exchangeRate)}</div></div>
              <div class="row"><div>${remainingLabel}</div><div>${moneyWithDisplay(due, currencyCode, exchangeRate)}</div></div>
              <div class="row"><div>${accountTotalLabel}</div><div>${moneyWithDisplay(accountTotal, currencyCode, exchangeRate)}</div></div>
            </div>
          </div>
        </div>
      </div>

      <table>
        <thead>
          <tr>
            <th>ت</th>
            <th>المادة</th>
            <th>العدد</th>
            <th>السعر</th>
            <th>خصم المادة</th>
            <th>المجموع</th>
          </tr>
        </thead>
        <tbody>
          ${rowsHtml}
        </tbody>
      </table>

      <div class="totals">
        <div class="box">
          <div class="row"><div>المجموع</div><div>${moneyWithDisplay(subtotal, currencyCode, exchangeRate)}</div></div>
          <div class="row"><div>الخصم</div><div>${moneyWithDisplay(discountValue, currencyCode, exchangeRate)}</div></div>
          <div class="row"><div>المبلغ النهائي</div><div>${moneyWithDisplay(total, currencyCode, exchangeRate)}</div></div>
        </div>
        <div class="box">
          <div class="row"><div>المدفوع</div><div>${moneyWithDisplay(paid, currencyCode, exchangeRate)}</div></div>
          <div class="row"><div>الواصل الفعلي</div><div>${moneyWithDisplay(receivedAmount, currencyCode, exchangeRate)}</div></div>
          <div class="row"><div>المتبقي</div><div>${moneyWithDisplay(due, currencyCode, exchangeRate)}</div></div>
          <div class="row"><div>الباقي</div><div>${moneyWithDisplay(changeAmount, currencyCode, exchangeRate)}</div></div>
        </div>
      </div>

      ${secondaryTotals ? `
      <div class="accounting">
        <div class="box">
          <div class="row"><div>المبلغ النهائي بالدينار</div><div>${money(total)}</div></div>
          <div class="row"><div>الواصل بالدينار</div><div>${money(receivedAmount)}</div></div>
          <div class="row"><div>المتبقي بالدينار</div><div>${money(due)}</div></div>
          <div class="row"><div>الحساب الكلي بالدينار</div><div>${money(accountTotal)}</div></div>
        </div>
      </div>
      ` : ''}

      <div class="notes"><b>الملاحظات:</b> ${esc(invoice.notes || '')}</div>

      <div class="signs">
        <div>اسم المنظم<div class="line"></div>${esc(invoice.cashier || invoice.addedBy || '-')}</div>
        <div>التوقيع<div class="line"></div>&nbsp;</div>
        <div>اسم المستلم<div class="line"></div>${esc(party)}</div>
      </div>

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
