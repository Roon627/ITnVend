export function getSaleInfo(product) {
  if (!product || typeof product !== 'object') {
    return {
      isOnSale: false,
      basePrice: 0,
      salePrice: null,
      discountPercent: null,
      savingsAmount: 0,
      effectivePrice: 0,
    };
  }

  const basePriceRaw =
    Number(product.price ?? product.basePrice ?? product.originalPrice ?? product.base_price) ||
    Number(product.effective_price ?? product.effectivePrice);
  const basePrice = Number.isFinite(basePriceRaw) && basePriceRaw > 0 ? basePriceRaw : 0;
  const salePriceRaw = Number(product.sale_price ?? product.salePrice);
  const flag = Number(product.is_on_sale ?? product.isOnSale ?? 0) === 1;
  const hasValidSale =
    flag && Number.isFinite(salePriceRaw) && salePriceRaw > 0 && salePriceRaw < basePrice;

  if (hasValidSale) {
    const discount =
      product.discount_percent ??
      product.discountPercent ??
      ((basePrice - salePriceRaw) / basePrice) * 100;
    const savings = basePrice - salePriceRaw;
    return {
      isOnSale: true,
      basePrice,
      salePrice: salePriceRaw,
      discountPercent: discount,
      savingsAmount: savings,
      effectivePrice: salePriceRaw,
    };
  }

  const fallbackEffective =
    Number(product.effective_price ?? product.effectivePrice) || basePrice || 0;

  return {
    isOnSale: false,
    basePrice: basePrice || fallbackEffective,
    salePrice: null,
    discountPercent: null,
    savingsAmount: 0,
    effectivePrice: fallbackEffective,
  };
}

export function formatDiscountLabel(discountPercent) {
  if (!Number.isFinite(discountPercent)) return null;
  const normalized = Math.round(discountPercent);
  if (!normalized) return null;
  return `-${normalized}%`;
}
