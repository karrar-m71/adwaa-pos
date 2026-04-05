import { getOfflineImagePreview, isOfflineImageRef } from '../../utils/offlineImageQueue';

export const SALES_UI = {
  bg: '#F6F8FC',
  panel: '#FFFFFF',
  soft: '#F8FBFF',
  border: '#D9E2F2',
  borderSoft: '#E8EEF8',
  text: '#18243A',
  muted: '#64748B',
  subtle: '#94A3B8',
  accent: '#C88A12',
  accentSoft: '#FEF3C7',
  success: '#059669',
  successSoft: '#D1FAE5',
  danger: '#DC2626',
  dangerSoft: '#FEE2E2',
  info: '#2563EB',
  infoSoft: '#DBEAFE',
  purple: '#7C3AED',
  purpleSoft: '#F3E8FF',
};

export const toIQD = (price, cur, rate) => cur === 'USD' ? price * rate : price;
export const toDisplay = (iqd, cur, rate) => cur === 'USD' ? iqd / rate : iqd;
export const fmtCur = (n, cur) => cur === 'USD'
  ? '$' + (n || 0).toFixed(2)
  : (n || 0).toLocaleString('ar-IQ') + ' د.ع';
export const today = () => new Date().toISOString().split('T')[0];
export const nowStr = () => new Date().toLocaleDateString('ar-IQ', { year:'numeric', month:'short', day:'numeric' });
export const genCode = (prefix) => `${prefix}-${Date.now().toString().slice(-6)}${Math.floor(Math.random() * 90 + 10)}`;

export function selectFieldValue(event) {
  event.currentTarget.select?.();
}

export const resolveImageUrl = (value = '') => (isOfflineImageRef(value) ? getOfflineImagePreview(value) : value);

export const sortProductsStable = (items = []) => [...items].sort((a, b) => {
  const aCreated = String(a?.createdAt || '');
  const bCreated = String(b?.createdAt || '');
  if (aCreated !== bCreated) return aCreated.localeCompare(bCreated, 'ar');
  const aName = String(a?.name || '');
  const bName = String(b?.name || '');
  const byName = aName.localeCompare(bName, 'ar');
  if (byName !== 0) return byName;
  return String(a?.id || '').localeCompare(String(b?.id || ''), 'en');
});

export const calcLineDiscountAmount = (item = {}, currencyCode = 'IQD', exchangeRate = 1) => {
  const qty = Number(item?.qty || 0);
  const unit = Number(item?.price || 0);
  const base = Math.max(0, qty * unit);
  const discount = Math.max(0, Number(item?.lineDiscount || 0));
  const discountType = item?.lineDiscountType || 'fixed';
  const amount = discountType === 'percent'
    ? Math.min(base, base * (discount / 100))
    : Math.min(base, discount);
  const amountIQD = currencyCode === 'USD' ? amount * Number(exchangeRate || 1) : amount;
  return {
    amount,
    amountIQD: Math.max(0, Number(amountIQD || 0)),
  };
};

export const readDebtByCurrency = (entity = {}) => ({
  IQD: Number(entity?.debtByCurrency?.IQD ?? entity?.debtByCurrency?.iqd ?? entity?.debt ?? 0) || 0,
  USD: Number(entity?.debtByCurrency?.USD ?? entity?.debtByCurrency?.usd ?? 0) || 0,
});

export const readTotalByCurrency = (entity = {}) => ({
  IQD: Number(entity?.totalPurchasesByCurrency?.IQD ?? entity?.totalPurchasesByCurrency?.iqd ?? entity?.totalPurchases ?? 0) || 0,
  USD: Number(entity?.totalPurchasesByCurrency?.USD ?? entity?.totalPurchasesByCurrency?.usd ?? 0) || 0,
});

export const applyCurrencyDelta = (current = { IQD:0, USD:0 }, code = 'IQD', delta = 0) => {
  const next = { IQD:Number(current.IQD || 0), USD:Number(current.USD || 0) };
  const key = code === 'USD' ? 'USD' : 'IQD';
  next[key] = Math.max(0, Number(next[key] || 0) + Number(delta || 0));
  return next;
};

export const resolvePackageMeta = (product = {}, pkg = null) => {
  const qty = Number(product?.packageQty || pkg?.qty || 0);
  const hasData = Boolean(
    product?.hasPackage
    || product?.packageTypeId
    || qty > 0
    || Number(product?.packagePrice || 0) > 0
    || String(product?.packageBarcode || '').trim()
  );
  if (!hasData) return null;
  return {
    qty: qty > 0 ? qty : 1,
    name: String(pkg?.name || product?.packageName || 'تعبئة'),
    unit: String(pkg?.unit || 'وحدة'),
  };
};

export const createEditSession = (draft) => (
  draft?.mode === 'edit' && draft?.invoiceId
    ? {
        mode: 'edit',
        invoiceId: draft.invoiceId,
        invoiceNo: draft.invoiceNo || '',
        createdAt: draft.createdAt || '',
        dateISO: draft.dateISO || '',
        date: draft.date || '',
        originalQtyByProduct: (draft.items || []).reduce((acc, item) => {
          if (!item?.id) return acc;
          const qtyUnits = Number(item.qty || 0) * (item.isPackage ? Number(item.packageQty || 1) : 1);
          acc[item.id] = Number(acc[item.id] || 0) + qtyUnits;
          return acc;
        }, {}),
      }
    : null
);

export const createDraftCart = (draft) => (draft?.items || []).map((item) => ({
  key: item.key || `${item.id}_${item.sellType || (item.isPackage ? 'package' : 'unit')}`,
  id: item.id,
  name: item.name,
  img: item.img || '',
  imgUrl: item.imgUrl || '',
  qty: Number(item.qty || 1),
  price: Number(item.price || 0),
  priceIQD: Number(item.priceIQD || 0),
  sellType: item.sellType || (item.isPackage ? 'package' : 'unit'),
  isPackage: Boolean(item.isPackage),
  packageName: item.packageName || '',
  packageQty: Number(item.packageQty || 1),
  lineDiscount: Number(item.lineDiscount || 0),
  lineDiscountType: item.lineDiscountType || 'fixed',
  stock: Number(item.stock || 0),
}));
