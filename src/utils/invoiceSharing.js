import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';
import { openUrlInApp } from './inAppBrowser';
import { buildProfessionalInvoiceHtml } from './invoicePrint';

const DEFAULT_SETTINGS = {
  storeName: 'أضواء المدينة',
  storePhone: '07714424355',
  storeWhatsApp: '',
  storeAddress: 'كربلاء، العراق',
  invoiceFooter: 'شكراً لتعاملكم معنا',
  whatsappDefaultCountryCode: '964',
  whatsappSendMode: 'app',
  whatsappApiVersion: 'v23.0',
  whatsappPhoneNumberId: '',
  whatsappAccessToken: '',
};

function toNum(v) {
  return Number(v || 0);
}

function formatIQD(value) {
  return `${toNum(value).toLocaleString('ar-IQ')} د.ع`;
}

function readAppSettings() {
  try {
    const raw = localStorage.getItem('adwaa_settings');
    const parsed = raw ? JSON.parse(raw) : {};
    return { ...DEFAULT_SETTINGS, ...parsed };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

function normalizePhoneForWhatsApp(phone, defaultCountryCode = '964') {
  const raw = String(phone || '').trim();
  if (!raw) return '';

  let cleaned = raw.replace(/[^\d+]/g, '');

  if (cleaned.startsWith('00')) {
    cleaned = `+${cleaned.slice(2)}`;
  }

  if (cleaned.startsWith('+')) {
    const digits = cleaned.slice(1).replace(/\D/g, '');
    return digits ? `+${digits}` : '';
  }

  const digitsOnly = cleaned.replace(/\D/g, '');
  if (!digitsOnly) return '';

  const code = String(defaultCountryCode || '964').replace(/\D/g, '') || '964';

  if (digitsOnly.startsWith(code)) {
    return `+${digitsOnly}`;
  }

  if (digitsOnly.startsWith('0')) {
    return `+${code}${digitsOnly.slice(1)}`;
  }

  return `+${digitsOnly}`;
}

function buildItemsSummary(items = []) {
  if (!Array.isArray(items) || items.length === 0) return 'لا توجد مواد';
  const maxLines = 8;
  const lines = items.slice(0, maxLines).map((item) => {
    const name = item?.isPackage ? `${item.name} (${item.packageName || 'تعبئة'})` : (item?.name || '-');
    const qty = toNum(item?.qty);
    const unitPrice = toNum(item?.price ?? item?.buyPrice);
    const total = item?.total ?? unitPrice * qty;
    return `- ${name} | ${qty} × ${formatIQD(unitPrice)} = ${formatIQD(total)}`;
  });

  if (items.length > maxLines) {
    lines.push(`- ... +${items.length - maxLines} مادة إضافية`);
  }

  return lines.join('\n');
}

function buildInvoiceWhatsAppText(invoice, type = 'sale') {
  const settings = readAppSettings();
  const dateValue = invoice?.dateISO || invoice?.date || new Date().toLocaleDateString('ar-IQ');
  const invoiceNo = invoice?.invoiceNo || '-';
  const partyLabel = type === 'purchase' ? 'المورد' : 'الزبون';
  const partyName = type === 'purchase' ? (invoice?.supplier || '-') : (invoice?.customer || 'زبون عام');

  const header = type === 'purchase' ? 'فاتورة شراء' : 'فاتورة بيع';
  const total = formatIQD(invoice?.total);
  const paid = formatIQD(invoice?.paidAmount ?? (invoice?.paymentMethod === 'آجل' ? 0 : invoice?.total));
  const due = formatIQD(invoice?.dueAmount ?? (invoice?.paymentMethod === 'آجل' ? invoice?.total : 0));
  const paymentMethod = invoice?.paymentMethod || '-';

  return [
    `${settings.storeName}`,
    settings.storePhone ? `هاتف المتجر: ${settings.storePhone}` : '',
    settings.storeAddress ? `العنوان: ${settings.storeAddress}` : '',
    '',
    `${header} رقم: ${invoiceNo}`,
    `التاريخ: ${dateValue}`,
    `${partyLabel}: ${partyName}`,
    `طريقة الدفع: ${paymentMethod}`,
    `الإجمالي: ${total}`,
    `المدفوع: ${paid}`,
    `المتبقي: ${due}`,
    '',
    'تفاصيل المواد:',
    buildItemsSummary(invoice?.items || []),
    '',
    settings.invoiceFooter || 'شكراً لتعاملكم معنا',
  ].filter(Boolean).join('\n');
}

function toWhatsAppDigits(normalizedPhone) {
  return String(normalizedPhone || '').replace(/\D/g, '');
}

async function createInvoicePdfBlob(invoice, type) {
  const html = buildProfessionalInvoiceHtml(invoice, type, { includePrintButton: false });
  const parsed = new DOMParser().parseFromString(html, 'text/html');
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
    const target = host.querySelector('.invoice') || host;
    const canvas = await html2canvas(target, {
      scale: 2,
      backgroundColor: '#ffffff',
      useCORS: true,
      logging: false,
    });
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
  } catch {
    const fallback = new jsPDF({ orientation: 'p', unit: 'mm', format: 'a4' });
    fallback.setFont('helvetica', 'bold');
    fallback.setFontSize(14);
    fallback.text(`Invoice #${invoice?.invoiceNo || '-'}`, 14, 18);
    fallback.setFont('helvetica', 'normal');
    fallback.setFontSize(11);
    fallback.text(`Date: ${invoice?.dateISO || invoice?.date || '-'}`, 14, 26);
    fallback.text(`Total: ${formatIQD(invoice?.total)}`, 14, 34);
    return fallback.output('blob');
  } finally {
    host.remove();
  }
}

async function uploadPdfToCloud({ blob, fileName, settings }) {
  const apiVersion = settings.whatsappApiVersion || 'v23.0';
  const phoneNumberId = String(settings.whatsappPhoneNumberId || '').trim();
  const accessToken = String(settings.whatsappAccessToken || '').trim();
  if (!phoneNumberId || !accessToken) {
    return { ok: false, reason: 'cloud-config-missing' };
  }

  const url = `https://graph.facebook.com/${apiVersion}/${phoneNumberId}/media`;
  const form = new FormData();
  form.append('messaging_product', 'whatsapp');
  form.append('type', 'application/pdf');
  form.append('file', new File([blob], fileName, { type: 'application/pdf' }));

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}` },
      body: form,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data?.id) {
      return { ok: false, reason: 'cloud-upload-failed', details: data?.error?.message || 'upload-failed' };
    }
    return { ok: true, mediaId: data.id };
  } catch {
    return { ok: false, reason: 'cloud-network-error' };
  }
}

async function sendPdfViaCloud({ mediaId, toDigits, caption, fileName, settings }) {
  const apiVersion = settings.whatsappApiVersion || 'v23.0';
  const phoneNumberId = String(settings.whatsappPhoneNumberId || '').trim();
  const accessToken = String(settings.whatsappAccessToken || '').trim();
  if (!phoneNumberId || !accessToken) {
    return { ok: false, reason: 'cloud-config-missing' };
  }

  const url = `https://graph.facebook.com/${apiVersion}/${phoneNumberId}/messages`;
  const body = {
    messaging_product: 'whatsapp',
    to: toDigits,
    type: 'document',
    document: {
      id: mediaId,
      caption: String(caption || '').slice(0, 900),
      filename: fileName,
    },
  };

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data?.messages?.[0]?.id) {
      return { ok: false, reason: 'cloud-send-failed', details: data?.error?.message || 'send-failed' };
    }
    return { ok: true, messageId: data.messages[0].id };
  } catch {
    return { ok: false, reason: 'cloud-network-error' };
  }
}

async function sendTextViaCloud({ toDigits, text, settings }) {
  const apiVersion = settings.whatsappApiVersion || 'v23.0';
  const phoneNumberId = String(settings.whatsappPhoneNumberId || '').trim();
  const accessToken = String(settings.whatsappAccessToken || '').trim();
  if (!phoneNumberId || !accessToken) {
    return { ok: false, reason: 'cloud-config-missing' };
  }

  const url = `https://graph.facebook.com/${apiVersion}/${phoneNumberId}/messages`;
  const body = {
    messaging_product: 'whatsapp',
    to: toDigits,
    type: 'text',
    text: { body: String(text || '').slice(0, 3900) },
  };
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data?.messages?.[0]?.id) {
      return { ok: false, reason: 'cloud-send-failed', details: data?.error?.message || 'send-failed' };
    }
    return { ok: true, messageId: data.messages[0].id };
  } catch {
    return { ok: false, reason: 'cloud-network-error' };
  }
}

export async function shareInvoiceOnWhatsApp({ invoice, type = 'sale', phone = '' }) {
  if (typeof window === 'undefined') return { ok: false, reason: 'no-window' };
  if (!invoice) return { ok: false, reason: 'no-invoice' };

  const settings = readAppSettings();
  const targetPhone = phone || settings.storeWhatsApp || '';
  const normalized = normalizePhoneForWhatsApp(targetPhone, settings.whatsappDefaultCountryCode);

  if (!normalized) {
    return { ok: false, reason: 'no-phone' };
  }

  const invoiceNo = invoice?.invoiceNo || Date.now();
  const fileName = `${type === 'purchase' ? 'purchase' : 'sale'}-${invoiceNo}.pdf`;
  const blob = await createInvoicePdfBlob(invoice, type);
  const digits = normalized.replace('+', '');

  // وضع الإرسال الصامت عبر Cloud API (بدون فتح واتساب)
  if (settings.whatsappSendMode === 'cloud_api') {
    const targetDigits = toWhatsAppDigits(normalized);
    const upload = await uploadPdfToCloud({ blob, fileName, settings });
    if (!upload.ok) return { ok: false, reason: upload.reason, details: upload.details };
    const send = await sendPdfViaCloud({
      mediaId: upload.mediaId,
      toDigits: targetDigits,
      caption: `فاتورة رقم ${invoiceNo}\n${settings.storeName || ''}\n${settings.storePhone ? `هاتف: ${settings.storePhone}` : ''}`.trim(),
      fileName,
      settings,
    });
    if (!send.ok) return { ok: false, reason: send.reason, details: send.details };
    return { ok: true, mode: 'cloud-api', phone: normalized, fileName, messageId: send.messageId };
  }

  const url = `https://wa.me/${digits}`;

  const supportsShare = typeof navigator !== 'undefined' && typeof navigator.share === 'function';
  if (supportsShare) {
    try {
      const file = new File([blob], fileName, { type: 'application/pdf' });
      const canShareFiles = typeof navigator.canShare === 'function'
        ? navigator.canShare({ files: [file] })
        : false;
      if (canShareFiles) {
        await navigator.share({
          files: [file],
          title: `Invoice ${invoiceNo}`,
          text: `فاتورة رقم ${invoiceNo}`,
        });
        return { ok: true, mode: 'native-share', phone: normalized };
      }
    } catch {
      // fall through to fallback method
    }
  }

  // fallback: download PDF then open WhatsApp chat with ready message
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

  openUrlInApp(url);
  return { ok: true, mode: 'download+wa', url, phone: normalized, fileName, manualAttachRequired: true };
}

export async function sendWhatsAppText({ phone = '', text = '' }) {
  if (typeof window === 'undefined') return { ok: false, reason: 'no-window' };
  const body = String(text || '').trim();
  if (!body) return { ok: false, reason: 'empty-text' };

  const settings = readAppSettings();
  const targetPhone = phone || settings.storeWhatsApp || '';
  const normalized = normalizePhoneForWhatsApp(targetPhone, settings.whatsappDefaultCountryCode);
  if (!normalized) return { ok: false, reason: 'no-phone' };

  if (settings.whatsappSendMode === 'cloud_api') {
    const send = await sendTextViaCloud({
      toDigits: toWhatsAppDigits(normalized),
      text: body,
      settings,
    });
    if (!send.ok) return send;
    return { ok: true, mode: 'cloud-api', phone: normalized, messageId: send.messageId };
  }

  const url = `https://wa.me/${toWhatsAppDigits(normalized)}?text=${encodeURIComponent(body)}`;
  openUrlInApp(url);
  return { ok: true, mode: 'app', phone: normalized, url };
}

function explainWhatsAppError(result) {
  const reason = result?.reason || '';
  const details = result?.details ? `\n${result.details}` : '';
  if (reason === 'no-phone') return 'لا يمكن الإرسال عبر واتساب: رقم الهاتف غير متوفر أو غير صالح.';
  if (reason === 'cloud-config-missing') return 'إعدادات WhatsApp Cloud API غير مكتملة. تحقق من Phone Number ID وAccess Token.';
  if (reason === 'cloud-upload-failed') return `فشل رفع ملف PDF إلى واتساب Cloud API.${details}`;
  if (reason === 'cloud-send-failed') return `فشل إرسال الفاتورة عبر WhatsApp Cloud API.${details}`;
  if (reason === 'cloud-network-error') return 'تعذر الاتصال بخدمة واتساب Cloud API. تحقق من الإنترنت أو الصلاحيات.';
  if (reason === 'empty-text') return 'لا يمكن الإرسال: نص الرسالة فارغ.';
  return `تعذر إرسال الفاتورة عبر واتساب.${details}`;
}

export { buildInvoiceWhatsAppText, normalizePhoneForWhatsApp, readAppSettings, explainWhatsAppError };
