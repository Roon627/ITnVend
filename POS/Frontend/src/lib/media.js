const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '::1']);

function computeBase() {
  const envBase =
    (import.meta.env.VITE_UPLOAD_BASE || import.meta.env.VITE_API_BASE || '').trim();
  if (envBase) return envBase.replace(/\/$/, '');
  if (typeof window !== 'undefined') {
    return window.location.origin.replace(/\/$/, '');
  }
  return '';
}

const normalizedUploadBase = computeBase();

function buildAbsolute(path, search = '', hash = '') {
  if (!path) return null;
  if (!normalizedUploadBase) return `${path}${search}${hash}`;
  return `${normalizedUploadBase}${path}${search}${hash}`;
}

const INVALID_SENTINELS = new Set(['0', 'null', 'undefined', 'false']);

export function resolveMediaUrl(value) {
  if (!value || typeof value !== 'string') return value || null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (INVALID_SENTINELS.has(trimmed.toLowerCase())) return null;
  if (trimmed.startsWith('data:')) return trimmed; // already inline

  // Absolute URLs
  if (/^https?:\/\//i.test(trimmed)) {
    if (!normalizedUploadBase) return trimmed;
    try {
      const url = new URL(trimmed);

      const shouldRewrite =
        LOCAL_HOSTS.has(url.hostname.toLowerCase()) ||
        (typeof window !== 'undefined' &&
          (url.hostname === window.location.hostname ||
            url.host === window.location.host));

      if (shouldRewrite && url.pathname.startsWith('/uploads/')) {
        return buildAbsolute(url.pathname, url.search, url.hash);
      }
    } catch (err) {
      console.debug('resolveMediaUrl failed to parse URL', err);
      return trimmed;
    }
    return trimmed;
  }

  // Windows/Unix absolute filesystem paths - try to extract public/images portion
  if (trimmed.includes(':\\') || trimmed.startsWith('/') || trimmed.includes('public/images')) {
    const normalizedValue = trimmed.replace(/\\/g, '/');
    const marker = '/public/images/';
    const idx = normalizedValue.toLowerCase().indexOf(marker);
    if (idx !== -1) {
      const relative = normalizedValue.slice(idx + marker.length).replace(/^\/+/, '');
      return buildAbsolute(`/uploads/${relative}`);
    }
  }

  if (trimmed.startsWith('/uploads/')) {
    return buildAbsolute(trimmed);
  }

  return trimmed;
}

export default resolveMediaUrl;
