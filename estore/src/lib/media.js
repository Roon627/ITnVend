const UPLOAD_BASE = import.meta.env.VITE_UPLOAD_BASE || import.meta.env.VITE_API_BASE || '';

function isAbsolute(value) {
  return /^https?:\/\//i.test(value);
}

function normalizePath(value) {
  if (!value) return '';
  if (isAbsolute(value)) return value;
  if (value.startsWith('/uploads/') || value.startsWith('/images/')) return value;
  if (value.startsWith('uploads/')) return `/${value}`;
  if (value.includes('public/images/')) {
    const idx = value.indexOf('public/images/');
    return `/uploads/${value.slice(idx + 'public/images/'.length)}`;
  }
  return value.startsWith('/') ? value : `/uploads/${value}`;
}

export function resolveMediaUrl(value) {
  const path = normalizePath(value);
  if (!path) return '';
  if (isAbsolute(path)) return path;
  if (UPLOAD_BASE) {
    const base = UPLOAD_BASE.endsWith('/') ? UPLOAD_BASE.slice(0, -1) : UPLOAD_BASE;
    return `${base}${path}`;
  }
  if (typeof window !== 'undefined') {
    const origin = window.location.origin;
    return `${origin}${path}`;
  }
  return path;
}

export default resolveMediaUrl;
