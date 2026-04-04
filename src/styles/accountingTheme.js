export const accountingTheme = {
  pageBg: '#f3f6fb',
  surface: '#ffffff',
  surfaceAlt: '#f8fbff',
  headerBg: '#edf2fb',
  border: '#d9e2f2',
  borderSoft: '#eef2fa',
  text: '#18243a',
  textMuted: '#64748b',
  primary: '#1f6feb',
  success: '#059669',
  warning: '#d97706',
  danger: '#dc2626',
  info: '#0f766e',
};

export const accountingStyles = {
  page: {
    padding: 20,
    fontFamily: "'Cairo'",
    direction: 'rtl',
    background: accountingTheme.pageBg,
    minHeight: '100%',
  },
  title: {
    color: accountingTheme.text,
    fontSize: 22,
    fontWeight: 900,
  },
  primaryButton: {
    background: accountingTheme.primary,
    color: '#fff',
    border: 'none',
    borderRadius: 12,
    padding: '9px 18px',
    fontWeight: 800,
    cursor: 'pointer',
    fontSize: 13,
  },
  card: {
    background: accountingTheme.surface,
    border: `1px solid ${accountingTheme.border}`,
    borderRadius: 12,
    padding: 12,
  },
  input: {
    background: accountingTheme.surface,
    border: `1px solid #cdd8ec`,
    borderRadius: 10,
    padding: '9px 12px',
    color: '#0f172a',
    fontSize: 12,
    outline: 'none',
    boxSizing: 'border-box',
  },
  tableWrap: {
    background: accountingTheme.surface,
    borderRadius: 14,
    border: `1px solid ${accountingTheme.border}`,
    overflow: 'hidden',
  },
  tableHead: {
    background: accountingTheme.headerBg,
    borderBottom: `1px solid ${accountingTheme.border}`,
  },
};

export function paymentBadgeStyle(method) {
  if (method === 'آجل') {
    return { background: '#fff3e0', color: accountingTheme.warning };
  }
  if (method === 'تحويل') {
    return { background: '#e8f1ff', color: accountingTheme.primary };
  }
  return { background: '#e8f8f2', color: accountingTheme.success };
}

export function statusBadgeStyle(status) {
  if (status === 'مدفوع') {
    return { background: '#e8f8f2', color: accountingTheme.success };
  }
  return { background: '#fff3e0', color: accountingTheme.warning };
}
