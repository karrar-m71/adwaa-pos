export const DEFAULT_PRICING_SETTINGS = {
  retailMargin: 20,
  wholesaleMargin: 12,
  specialMargin: 8,
};

export const PRICE_MODES = {
  retail: { key: 'sellPrice', label: 'مفرد' },
  wholesale: { key: 'wholesalePrice', label: 'جملة' },
  special: { key: 'specialPrice', label: 'خاص' },
};

export function readPricingSettings() {
  try {
    const settings = JSON.parse(localStorage.getItem('adwaa_settings') || '{}');
    return {
      retailMargin: Number.isFinite(Number(settings.defaultRetailProfitMargin))
        ? Number(settings.defaultRetailProfitMargin)
        : Number.isFinite(Number(settings.defaultProfitMargin))
          ? Number(settings.defaultProfitMargin)
          : DEFAULT_PRICING_SETTINGS.retailMargin,
      wholesaleMargin: Number.isFinite(Number(settings.defaultWholesaleProfitMargin))
        ? Number(settings.defaultWholesaleProfitMargin)
        : DEFAULT_PRICING_SETTINGS.wholesaleMargin,
      specialMargin: Number.isFinite(Number(settings.defaultSpecialProfitMargin))
        ? Number(settings.defaultSpecialProfitMargin)
        : DEFAULT_PRICING_SETTINGS.specialMargin,
    };
  } catch {
    return { ...DEFAULT_PRICING_SETTINGS };
  }
}

export function applyMargin(buyPrice, marginPercent) {
  const buy = Number(buyPrice || 0);
  const margin = Number(marginPercent || 0);
  if (!Number.isFinite(buy) || buy <= 0) return 0;
  return Math.round(buy * (1 + (margin / 100)));
}

export function buildSalePricesFromBuyPrice(buyPrice, pricing = readPricingSettings()) {
  return {
    sellPrice: applyMargin(buyPrice, pricing.retailMargin),
    wholesalePrice: applyMargin(buyPrice, pricing.wholesaleMargin),
    specialPrice: applyMargin(buyPrice, pricing.specialMargin),
  };
}

export function getUnitPriceByMode(product = {}, mode = 'retail') {
  const safeMode = PRICE_MODES[mode] ? mode : 'retail';
  const field = PRICE_MODES[safeMode].key;
  const value = Number(product?.[field] || 0);
  if (value > 0) return value;
  if (safeMode !== 'retail' && Number(product?.sellPrice || 0) > 0) return Number(product.sellPrice);
  return 0;
}
