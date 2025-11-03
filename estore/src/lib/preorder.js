export function isPreorderProduct(product) {
  if (!product || typeof product !== 'object') return false;
  const flag = product.availableForPreorder
    || product.preorder === true
    || product.preorder === 1
    || product.preorder === '1'
    || product.preorder_enabled === true
    || product.preorder_enabled === 1
    || product.preorder_enabled === '1'
    || product.preorderEnabled === true
    || product.preorderEnabled === 1
    || product.preorderEnabled === '1'
    || product.preorder_only === true
    || product.preorder_only === 1
    || product.preorder_only === '1';
  return Boolean(flag);
}

export function withPreorderFlags(product) {
  if (!product || typeof product !== 'object') return product;
  const preorder = isPreorderProduct(product);
  if (preorder && product.availableForPreorder && product.preorder === true) {
    return product;
  }
  return {
    ...product,
    availableForPreorder: preorder,
    preorder: preorder || product.preorder === true,
    preorder_enabled: preorder ? 1 : product.preorder_enabled,
  };
}

export function mapPreorderFlags(items) {
  if (!Array.isArray(items)) return items;
  return items.map((item) => withPreorderFlags(item));
}
