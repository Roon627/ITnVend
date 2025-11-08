export function makeSku({ brandName, productName, year }) {
  const brand = (brandName || '')
    .replace(/[^a-z0-9]/gi, '')
    .slice(0, 3)
    .toUpperCase();
  const nameInitials = (productName || '')
    .split(/\s+/)
    .map((word) => word && word[0] ? word[0] : '')
    .join('')
    .replace(/[^a-z0-9]/ig, '')
    .slice(0, 4)
    .toUpperCase();
  const yy = year ? String(year).slice(-2) : '';
  return [brand || 'GN', nameInitials || 'PRD', yy].filter(Boolean).join('');
}

export default { makeSku };
