import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';
import { openUrlInApp } from './inAppBrowser';
import { normalizePhoneForWhatsApp, readAppSettings } from './invoiceSharing';

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

function esc(v) {
  return String(v ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function fmtIQD(value) {
  return `${Number(value || 0).toLocaleString('ar-IQ')} د.ع`;
}

function fmtUSD(value) {
  return `$${Number(value || 0).toFixed(2)}`;
}

function readEntryAmounts(voucher = {}) {
  return {
    iqd: Number(voucher?.amountIQDEntry || (voucher?.currency === 'دينار عراقي' ? voucher?.amount : 0) || 0) || 0,
    usd: Number(voucher?.amountUSDEntry || (voucher?.currency === 'دولار أمريكي' ? voucher?.amount : 0) || 0) || 0,
  };
}

function readDiscountAmounts(voucher = {}) {
  return {
    iqd: Number(voucher?.discountIQDEntry || 0) || 0,
    usd: Number(voucher?.discountUSDEntry || 0) || 0,
  };
}

function formatDate(value) {
  if (!value) return '-';
  try {
    return new Date(value).toLocaleDateString('ar-IQ');
  } catch {
    return String(value);
  }
}

export function buildProfessionalVoucherHtml(voucher, options = {}) {
  const settings = readAppSettings();
  const assets = readBrandAssets();
  const includePrintButton = options.includePrintButton !== false;
  const balanceIQD = Number(options?.balanceIQD || 0);
  const balanceUSD = Number(options?.balanceUSD || 0);
  const amounts = readEntryAmounts(voucher);
  const discounts = readDiscountAmounts(voucher);
  const effectIQD = amounts.iqd + discounts.iqd;
  const effectUSD = amounts.usd + discounts.usd;
  const typeLabel = voucher?.type === 'قبض'
    ? 'سند قبض'
    : voucher?.type === 'دفع'
      ? 'سند دفع'
      : voucher?.type === 'صرف'
        ? 'سند صرف'
        : 'سند تحويل عملة';

  const transferRows = voucher?.type === 'تحويل'
    ? `
      <div class="row"><div>من</div><div>${esc(voucher?.fromAmount || 0)} ${esc(voucher?.fromCurrency || '-')}</div></div>
      <div class="row"><div>إلى</div><div>${esc(voucher?.toAmount || 0)} ${esc(voucher?.toCurrency || '-')}</div></div>
      <div class="row"><div>سعر الصرف</div><div>${esc(voucher?.rate || '-')}</div></div>
    `
    : `
      <div class="row"><div>المبلغ IQD</div><div>${fmtIQD(amounts.iqd)}</div></div>
      <div class="row"><div>المبلغ USD</div><div>${fmtUSD(amounts.usd)}</div></div>
      <div class="row"><div>الخصم IQD</div><div>${fmtIQD(discounts.iqd)}</div></div>
      <div class="row"><div>الخصم USD</div><div>${fmtUSD(discounts.usd)}</div></div>
      <div class="row"><div>أثر السند IQD</div><div>${fmtIQD(effectIQD)}</div></div>
      <div class="row"><div>أثر السند USD</div><div>${fmtUSD(effectUSD)}</div></div>
      <div class="row"><div>الرصيد الحالي IQD</div><div>${fmtIQD(balanceIQD)}</div></div>
      <div class="row"><div>الرصيد الحالي USD</div><div>${fmtUSD(balanceUSD)}</div></div>
    `;

  return `
<!doctype html>
<html lang="ar" dir="rtl">
<head>
  <meta charset="utf-8" />
  <title>Voucher ${esc(voucher?.voucherNo || '')}</title>
  <style>
    @page { size: A4; margin: 10mm; }
    * { box-sizing: border-box; }
    body { font-family: "Cairo", Tahoma, Arial, sans-serif; margin: 0; color: #111827; background: #fff; }
    .sheet { width: 100%; border: 1px solid #d1d5db; padding: 10px; position: relative; overflow: hidden; }
    .watermark { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; pointer-events: none; z-index: 0; }
    .watermark img { max-width: 70%; max-height: 70%; object-fit: contain; opacity: 0.08; }
    .inner { position: relative; z-index: 1; }
    .header-image-wrap { border-bottom: 2px solid #e5e7eb; padding-bottom: 8px; margin-bottom: 10px; }
    .header-image { width: 100%; max-height: 210px; object-fit: contain; display: block; }
    .head { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; border-bottom: 1px solid #e5e7eb; padding-bottom: 10px; margin-bottom: 10px; }
    .brand { text-align: right; }
    .brand-top { display: flex; gap: 10px; align-items: center; justify-content: flex-end; }
    .brand-logo { width: 58px; height: 58px; object-fit: contain; border-radius: 8px; border: 1px solid #d1d5db; padding: 2px; background: #fff; }
    .brand .name { font-size: 30px; font-weight: 900; color: #b45309; line-height: 1; }
    .brand .sub { font-size: 12px; color: #6b7280; margin-top: 4px; }
    .meta .title { font-size: 18px; font-weight: 800; margin-bottom: 6px; }
    .box { border: 1px solid #9ca3af; border-radius: 8px; overflow: hidden; }
    .row { display: grid; grid-template-columns: 1fr 1fr; }
    .row div { padding: 6px 8px; border-bottom: 1px solid #e5e7eb; font-size: 12px; }
    .row:last-child div { border-bottom: 0; }
    .row div:first-child { background: #f9fafb; font-weight: 700; }
    .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-top: 10px; }
    .notes { margin-top: 10px; border: 1px solid #d1d5db; min-height: 58px; padding: 8px; font-size: 12px; border-radius: 8px; }
    .signs { margin-top: 18px; display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 10px; text-align: center; font-size: 12px; }
    .line { margin-top: 26px; border-top: 1px dashed #6b7280; }
    .footer { margin-top: 12px; text-align: center; font-size: 11px; color: #6b7280; }
    @media print { .no-print { display: none !important; } }
  </style>
</head>
<body>
  <div class="sheet">
    ${assets.watermark ? `<div class="watermark"><img src="${assets.watermark}" alt=""></div>` : ''}
    <div class="inner">
      ${assets.invoiceHeader ? `
        <div class="header-image-wrap">
          <img class="header-image" src="${assets.invoiceHeader}" alt="invoice-header">
        </div>
      ` : ''}
      <div class="head">
        <div class="brand">
          <div class="brand-top">
            <div>
              <div class="name">${esc(settings.storeName || '')}</div>
              <div class="sub">${esc(settings.storeAddress || '')}</div>
            </div>
            ${assets.logo ? `<img class="brand-logo" src="${assets.logo}" alt="">` : ''}
          </div>
          <div class="sub">📞 ${esc(settings.storePhone || '-')}</div>
        </div>
        <div class="meta">
          <div class="title">${typeLabel}</div>
          <div class="box">
            <div class="row"><div>رقم السند</div><div>${esc(voucher?.voucherNo || '-')}</div></div>
            <div class="row"><div>التاريخ</div><div>${esc(voucher?.date || '-')}</div></div>
            <div class="row"><div>الطرف</div><div>${esc(voucher?.fromTo || '-')}</div></div>
            <div class="row"><div>طريقة الدفع</div><div>${esc(voucher?.paymentMethod || '-')}</div></div>
          </div>
        </div>
      </div>
      <div class="grid">
        <div class="box">${transferRows}</div>
        <div class="box">
          <div class="row"><div>البيان</div><div>${esc(voucher?.description || '-')}</div></div>
          <div class="row"><div>أضيف بواسطة</div><div>${esc(voucher?.addedBy || '-')}</div></div>
          <div class="row"><div>الحالة</div><div>${esc(voucher?.status || '-')}</div></div>
        </div>
      </div>
      <div class="notes"><b>الملاحظات:</b> ${esc(voucher?.description || '')}</div>
      <div class="signs">
        <div>اسم المنظم<div class="line"></div>${esc(voucher?.addedBy || '-')}</div>
        <div>التوقيع<div class="line"></div>&nbsp;</div>
        <div>اسم المستلم<div class="line"></div>${esc(voucher?.fromTo || '-')}</div>
      </div>
      <div class="footer">${esc(settings.invoiceFooter || 'شكراً لتعاملكم معنا')}</div>
      ${includePrintButton ? `
        <div class="footer no-print" style="margin-top:14px;">
          <button onclick="window.print()">طباعة</button>
        </div>
      ` : ''}
    </div>
  </div>
</body>
</html>`;
}

export function buildProfessionalStatementHtml(statement, options = {}) {
  const settings = readAppSettings();
  const assets = readBrandAssets();
  const includePrintButton = options.includePrintButton !== false;
  const partyName = statement?.partyName || '-';
  const partyType = statement?.partyType || '-';
  const rows = Array.isArray(statement?.rows) ? statement.rows : [];
  const summary = statement?.summary || {};

  const rowsHtml = rows.map((r) => `
    <tr>
      <td>${formatDate(r?.date)}</td>
      <td>${esc(r?.label || '-')}</td>
      <td>${r?.debit ? fmtIQD(r.debit) : '—'}</td>
      <td>${r?.credit ? fmtIQD(r.credit) : '—'}</td>
      <td>${fmtIQD(Math.abs(Number(r?.balance || 0)))} ${Number(r?.balance || 0) > 0 ? 'مدين' : Number(r?.balance || 0) < 0 ? 'دائن' : 'صفر'}</td>
    </tr>
  `).join('');

  return `
<!doctype html>
<html lang="ar" dir="rtl">
<head>
  <meta charset="utf-8" />
  <title>Statement ${esc(partyName)}</title>
  <style>
    @page { size: A4; margin: 10mm; }
    * { box-sizing: border-box; }
    body { font-family: "Cairo", Tahoma, Arial, sans-serif; margin: 0; color: #111827; background: #fff; }
    .sheet { width: 100%; border: 1px solid #d1d5db; padding: 10px; position: relative; overflow: hidden; }
    .watermark { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; pointer-events: none; z-index: 0; }
    .watermark img { max-width: 70%; max-height: 70%; object-fit: contain; opacity: 0.08; }
    .inner { position: relative; z-index: 1; }
    .header-image-wrap { border-bottom: 2px solid #e5e7eb; padding-bottom: 8px; margin-bottom: 10px; }
    .header-image { width: 100%; max-height: 210px; object-fit: contain; display: block; }
    .head { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; border-bottom: 1px solid #e5e7eb; padding-bottom: 10px; margin-bottom: 10px; }
    .brand { text-align: right; }
    .brand-top { display: flex; gap: 10px; align-items: center; justify-content: flex-end; }
    .brand-logo { width: 58px; height: 58px; object-fit: contain; border-radius: 8px; border: 1px solid #d1d5db; padding: 2px; background: #fff; }
    .brand .name { font-size: 30px; font-weight: 900; color: #b45309; line-height: 1; }
    .brand .sub { font-size: 12px; color: #6b7280; margin-top: 4px; }
    .meta .title { font-size: 18px; font-weight: 800; margin-bottom: 6px; }
    .box { border: 1px solid #9ca3af; border-radius: 8px; overflow: hidden; }
    .row { display: grid; grid-template-columns: 1fr 1fr; }
    .row div { padding: 6px 8px; border-bottom: 1px solid #e5e7eb; font-size: 12px; }
    .row:last-child div { border-bottom: 0; }
    .row div:first-child { background: #f9fafb; font-weight: 700; }
    table { width: 100%; border-collapse: collapse; margin-top: 10px; }
    th, td { border: 1px solid #9ca3af; padding: 4px 6px; font-size: 12px; text-align: center; }
    th { background: #f3f4f6; font-weight: 800; }
    td:nth-child(2) { text-align: right; }
    .summary { margin-top: 10px; display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
    .summary .card { border: 1px solid #9ca3af; border-radius: 8px; overflow: hidden; }
    .summary .card .row div:first-child { background: #f9fafb; }
    .footer { margin-top: 12px; text-align: center; font-size: 11px; color: #6b7280; }
    @media print { .no-print { display: none !important; } }
  </style>
</head>
<body>
  <div class="sheet">
    ${assets.watermark ? `<div class="watermark"><img src="${assets.watermark}" alt=""></div>` : ''}
    <div class="inner">
      ${assets.invoiceHeader ? `
        <div class="header-image-wrap">
          <img class="header-image" src="${assets.invoiceHeader}" alt="invoice-header">
        </div>
      ` : ''}
      <div class="head">
        <div class="brand">
          <div class="brand-top">
            <div>
              <div class="name">${esc(settings.storeName || '')}</div>
              <div class="sub">${esc(settings.storeAddress || '')}</div>
            </div>
            ${assets.logo ? `<img class="brand-logo" src="${assets.logo}" alt="">` : ''}
          </div>
          <div class="sub">📞 ${esc(settings.storePhone || '-')}</div>
        </div>
        <div class="meta">
          <div class="title">كشف حساب</div>
          <div class="box">
            <div class="row"><div>الطرف</div><div>${esc(partyName)}</div></div>
            <div class="row"><div>النوع</div><div>${esc(partyType)}</div></div>
            <div class="row"><div>تاريخ الطباعة</div><div>${formatDate(new Date().toISOString())}</div></div>
            <div class="row"><div>عدد الحركات</div><div>${rows.length}</div></div>
          </div>
        </div>
      </div>

      <table>
        <thead>
          <tr><th>التاريخ</th><th>البيان</th><th>مدين</th><th>دائن</th><th>الرصيد</th></tr>
        </thead>
        <tbody>
          ${rowsHtml || '<tr><td colspan="5">لا توجد حركات</td></tr>'}
        </tbody>
      </table>

      <div class="summary">
        <div class="card">
          <div class="row"><div>مديونية الفواتير</div><div>${fmtIQD(summary?.debtFromInvoices || 0)}</div></div>
          <div class="row"><div>مستلم</div><div>${fmtIQD(summary?.received || 0)}</div></div>
          <div class="row"><div>مدفوع</div><div>${fmtIQD(summary?.paid || 0)}</div></div>
        </div>
        <div class="card">
          <div class="row"><div>الرصيد الحالي IQD</div><div>${fmtIQD(summary?.balanceIQD || 0)}</div></div>
          <div class="row"><div>الرصيد الحالي USD</div><div>${fmtUSD(summary?.balanceUSD || 0)}</div></div>
          <div class="row"><div>الحالة</div><div>${(Number(summary?.balanceIQD || 0) === 0 && Number(summary?.balanceUSD || 0) === 0) ? 'مسدد' : 'مفتوح'}</div></div>
        </div>
      </div>

      <div class="footer">${esc(settings.invoiceFooter || 'شكراً لتعاملكم معنا')}</div>
      ${includePrintButton ? `
        <div class="footer no-print" style="margin-top:14px;">
          <button onclick="window.print()">طباعة</button>
        </div>
      ` : ''}
    </div>
  </div>
</body>
</html>`;
}

function openHtmlForPrint(html) {
  const safeHtml = typeof html === 'string' && html.trim()
    ? html
    : '<!doctype html><html><body style="font-family:Cairo,Tahoma,Arial,sans-serif;padding:24px">تعذر فتح صفحة الطباعة.</body></html>';
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

export function openProfessionalVoucherPrint(voucher, options = {}) {
  if (typeof window === 'undefined' || !voucher) return false;
  const html = buildProfessionalVoucherHtml(voucher, { ...options, includePrintButton: true });
  return openHtmlForPrint(html);
}

export function openProfessionalStatementPrint(statement, options = {}) {
  if (typeof window === 'undefined' || !statement) return false;
  const html = buildProfessionalStatementHtml(statement, { ...options, includePrintButton: true });
  return openHtmlForPrint(html);
}

async function createPdfBlobFromHtml(html) {
  const parsed = new DOMParser().parseFromString(html, 'text/html');
  for (const el of parsed.body.querySelectorAll('*')) {
    for (const attr of [...el.attributes]) {
      if (/^on/i.test(attr.name)) el.removeAttribute(attr.name);
    }
  }
  const styleText = Array.from(parsed.querySelectorAll('style')).map((s) => s.textContent || '').join('\n');
  const bodyHtml = parsed.body?.innerHTML || '';

  const host = document.createElement('div');
  host.style.position = 'fixed';
  host.style.left = '-100000px';
  host.style.top = '0';
  host.style.width = '794px';
  host.style.background = '#fff';
  host.style.zIndex = '-1';
  host.style.pointerEvents = 'none';
  host.innerHTML = `<style>${styleText}</style>${bodyHtml}`;
  document.body.appendChild(host);

  try {
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    const target = host.querySelector('.sheet') || host;
    const canvas = await html2canvas(target, { scale: 2, backgroundColor: '#ffffff', useCORS: true, logging: false });
    const imgData = canvas.toDataURL('image/png');
    const doc = new jsPDF({ orientation: 'p', unit: 'mm', format: 'a4' });
    const pageW = 210;
    const pageH = 297;
    const margin = 6;
    const drawW = pageW - margin * 2;
    const drawH = (canvas.height * drawW) / canvas.width;

    if (drawH <= (pageH - margin * 2)) {
      doc.addImage(imgData, 'PNG', margin, margin, drawW, drawH);
    } else {
      let y = 0;
      let remaining = drawH;
      let page = 0;
      while (remaining > 0) {
        if (page > 0) doc.addPage();
        doc.addImage(imgData, 'PNG', margin, margin - y, drawW, drawH);
        const pageDrawable = pageH - margin * 2;
        remaining -= pageDrawable;
        y += pageDrawable;
        page += 1;
      }
    }
    return doc.output('blob');
  } finally {
    host.remove();
  }
}

async function createVoucherPdfBlob(voucher, options = {}) {
  const html = buildProfessionalVoucherHtml(voucher, { ...options, includePrintButton: false });
  return createPdfBlobFromHtml(html);
}

async function createStatementPdfBlob(statement, options = {}) {
  const html = buildProfessionalStatementHtml(statement, { ...options, includePrintButton: false });
  return createPdfBlobFromHtml(html);
}

async function uploadPdfToCloud({ blob, fileName, settings }) {
  const apiVersion = settings.whatsappApiVersion || 'v23.0';
  const phoneNumberId = String(settings.whatsappPhoneNumberId || '').trim();
  const accessToken = String(settings.whatsappAccessToken || '').trim();
  if (!phoneNumberId || !accessToken) return { ok: false, reason: 'cloud-config-missing' };

  const url = `https://graph.facebook.com/${apiVersion}/${phoneNumberId}/media`;
  const form = new FormData();
  form.append('messaging_product', 'whatsapp');
  form.append('type', 'application/pdf');
  form.append('file', new File([blob], fileName, { type: 'application/pdf' }));

  try {
    const res = await fetch(url, { method: 'POST', headers: { Authorization: `Bearer ${accessToken}` }, body: form });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data?.id) return { ok: false, reason: 'cloud-upload-failed', details: data?.error?.message || 'upload-failed' };
    return { ok: true, mediaId: data.id };
  } catch {
    return { ok: false, reason: 'cloud-network-error' };
  }
}

async function sendPdfViaCloud({ mediaId, toDigits, caption, fileName, settings }) {
  const apiVersion = settings.whatsappApiVersion || 'v23.0';
  const phoneNumberId = String(settings.whatsappPhoneNumberId || '').trim();
  const accessToken = String(settings.whatsappAccessToken || '').trim();
  if (!phoneNumberId || !accessToken) return { ok: false, reason: 'cloud-config-missing' };

  const url = `https://graph.facebook.com/${apiVersion}/${phoneNumberId}/messages`;
  const body = {
    messaging_product: 'whatsapp',
    to: toDigits,
    type: 'document',
    document: { id: mediaId, caption: String(caption || '').slice(0, 900), filename: fileName },
  };
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data?.messages?.[0]?.id) return { ok: false, reason: 'cloud-send-failed', details: data?.error?.message || 'send-failed' };
    return { ok: true, messageId: data.messages[0].id };
  } catch {
    return { ok: false, reason: 'cloud-network-error' };
  }
}

export async function shareVoucherOnWhatsApp({ voucher, phone = '', options = {} }) {
  if (typeof window === 'undefined') return { ok: false, reason: 'no-window' };
  if (!voucher) return { ok: false, reason: 'no-voucher' };
  const settings = readAppSettings();
  const targetPhone = phone || settings.storeWhatsApp || '';
  const normalized = normalizePhoneForWhatsApp(targetPhone, settings.whatsappDefaultCountryCode);
  if (!normalized) return { ok: false, reason: 'no-phone' };

  const voucherNo = voucher?.voucherNo || Date.now();
  const fileName = `voucher-${voucherNo}.pdf`;
  const blob = await createVoucherPdfBlob(voucher, options);
  const digits = normalized.replace('+', '');

  if (settings.whatsappSendMode === 'cloud_api') {
    const upload = await uploadPdfToCloud({ blob, fileName, settings });
    if (!upload.ok) return upload;
    return sendPdfViaCloud({
      mediaId: upload.mediaId,
      toDigits: digits,
      caption: `سند رقم ${voucherNo}\n${settings.storeName || ''}`,
      fileName,
      settings,
    });
  }

  const supportsShare = typeof navigator !== 'undefined' && typeof navigator.share === 'function';
  if (supportsShare) {
    try {
      const file = new File([blob], fileName, { type: 'application/pdf' });
      const canShareFiles = typeof navigator.canShare === 'function'
        ? navigator.canShare({ files: [file] })
        : false;
      if (canShareFiles) {
        await navigator.share({ files: [file], title: `Voucher ${voucherNo}`, text: `سند رقم ${voucherNo}` });
        return { ok: true, mode: 'native-share', fileName };
      }
    } catch {
      // fall through
    }
  }

  const fileUrl = URL.createObjectURL(blob);
  try {
    const a = document.createElement('a');
    a.href = fileUrl;
    a.download = fileName;
    a.style.display = 'none';
    document.body.appendChild(a);
    a.click();
    a.remove();
  } catch {
    openUrlInApp(fileUrl);
  }
  setTimeout(() => URL.revokeObjectURL(fileUrl), 15000);
  openUrlInApp(`https://wa.me/${digits}`);
  return { ok: true, mode: 'download+wa', fileName, manualAttachRequired: true };
}

export async function shareStatementOnWhatsApp({ statement, phone = '', options = {} }) {
  if (typeof window === 'undefined') return { ok: false, reason: 'no-window' };
  if (!statement) return { ok: false, reason: 'no-statement' };
  const settings = readAppSettings();
  const targetPhone = phone || settings.storeWhatsApp || '';
  const normalized = normalizePhoneForWhatsApp(targetPhone, settings.whatsappDefaultCountryCode);
  if (!normalized) return { ok: false, reason: 'no-phone' };

  const fileName = `statement-${String(statement?.partyName || 'party').replace(/\s+/g, '-')}.pdf`;
  const blob = await createStatementPdfBlob(statement, options);
  const digits = normalized.replace('+', '');

  if (settings.whatsappSendMode === 'cloud_api') {
    const upload = await uploadPdfToCloud({ blob, fileName, settings });
    if (!upload.ok) return upload;
    return sendPdfViaCloud({
      mediaId: upload.mediaId,
      toDigits: digits,
      caption: `كشف حساب ${statement?.partyName || ''}\n${settings.storeName || ''}`.trim(),
      fileName,
      settings,
    });
  }

  const fileUrl = URL.createObjectURL(blob);
  try {
    const a = document.createElement('a');
    a.href = fileUrl;
    a.download = fileName;
    a.style.display = 'none';
    document.body.appendChild(a);
    a.click();
    a.remove();
  } catch {
    openUrlInApp(fileUrl);
  }
  setTimeout(() => URL.revokeObjectURL(fileUrl), 15000);
  openUrlInApp(`https://wa.me/${digits}`);
  return { ok: true, mode: 'download+wa', fileName, manualAttachRequired: true };
}

export function explainVoucherShareError(result) {
  const reason = result?.reason || '';
  const details = result?.details ? `\n${result.details}` : '';
  if (reason === 'no-phone') return 'لا يمكن الإرسال عبر واتساب: رقم الهاتف غير متوفر أو غير صالح.';
  if (reason === 'cloud-config-missing') return 'إعدادات WhatsApp Cloud API غير مكتملة. تحقق من Phone Number ID وAccess Token.';
  if (reason === 'cloud-upload-failed') return `فشل رفع ملف السند PDF إلى واتساب.${details}`;
  if (reason === 'cloud-send-failed') return `فشل إرسال السند عبر واتساب.${details}`;
  if (reason === 'cloud-network-error') return 'تعذر الاتصال بخدمة واتساب Cloud API.';
  if (reason === 'no-statement') return `تعذر إرسال كشف الحساب.${details}`;
  return `تعذر الإرسال عبر واتساب.${details}`;
}
