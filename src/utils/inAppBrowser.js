function isWhatsAppUrl(url) {
  try {
    const u = new URL(url);
    return u.hostname === 'wa.me' || u.hostname === 'web.whatsapp.com';
  } catch {
    return false;
  }
}

function buildWhatsAppNativeUrl(url) {
  try {
    const u = new URL(url);
    let phone = '';
    let text = '';
    if (u.hostname === 'wa.me') {
      phone = (u.pathname || '').replace(/\//g, '');
      text = u.searchParams.get('text') || '';
    } else {
      phone = u.searchParams.get('phone') || '';
      text = u.searchParams.get('text') || '';
    }
    const params = new URLSearchParams();
    if (phone) params.set('phone', phone);
    if (text) params.set('text', text);
    return `whatsapp://send?${params.toString()}`;
  } catch {
    return '';
  }
}

export function openUrlInApp(url) {
  if (typeof window === 'undefined' || !url) return false;
  if (isWhatsAppUrl(url)) {
    const nativeUrl = buildWhatsAppNativeUrl(url);
    if (nativeUrl) {
      // يفتح تطبيق واتساب مباشرة (بدل iframe الذي يرفضه wa.me)
      window.location.href = nativeUrl;
      setTimeout(() => {
        const useWeb = window.confirm('إذا لم يُفتح تطبيق واتساب، هل تريد فتح واتساب ويب؟');
        if (useWeb) {
          window.open(url, '_blank', 'noopener,noreferrer');
        }
      }, 900);
      return true;
    }
  }
  if (window.__adwaaInAppBrowserReady) {
    window.dispatchEvent(new CustomEvent('adwaa:open-in-app-browser', { detail: { url } }));
  } else {
    window.location.href = url;
  }
  return true;
}
