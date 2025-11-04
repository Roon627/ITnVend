// Lightweight API wrapper with retry logic
// Keep API paths consistent; most calls include the full '/api/...' path already
// Build URL for API requests:
// - If the path is an absolute URL (starts with http), use it unchanged
// - If the path already starts with '/api', use it as-is
// - If the path starts with '/', but not '/api', prepend '/api' so '/customers' -> '/api/customers'
// - If the path is a relative path (no leading '/'), prepend '/api/' as well

const API_BASE = import.meta.env.VITE_API_BASE || '';
const API_DIRECT_FALLBACK = (import.meta.env.VITE_API_DIRECT_FALLBACK || '').trim().replace(/\/$/, '');
let authToken = null;

export function setAuthToken(token) {
  authToken = token;
  if (token) localStorage.setItem('ITnvend_token', token);
  else localStorage.removeItem('ITnvend_token');
}

// initialize from storage
const stored = localStorage.getItem('ITnvend_token');
if (stored) authToken = stored;

async function wait(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function appendParams(path, params) {
  if (!params || Object.keys(params).length === 0) return path;
  const search = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value === undefined || value === null || value === '') return;
    if (Array.isArray(value)) {
      value.forEach((entry) => {
        if (entry !== undefined && entry !== null && entry !== '') {
          search.append(key, entry);
        }
      });
    } else {
      search.append(key, value);
    }
  });
  const query = search.toString();
  if (!query) return path;
  return path.includes('?') ? `${path}&${query}` : `${path}?${query}`;
}

async function fetchWithRetry(path, options = {}, retries = 2, backoff = 200) {
  let attempt = 0;
  let url = null;
  while (attempt <= retries) {
    try {
      if (!options.headers) options.headers = {};
      if (authToken) options.headers['Authorization'] = `Bearer ${authToken}`;
      // include credentials so HttpOnly refresh cookie is sent
      options.credentials = 'include';
    // normalize path to backend API route
    url = null;
      if (/^https?:\/\//.test(path)) {
        url = path;
      } else if (path.startsWith('/api')) {
        url = path;
      } else if (path.startsWith('/')) {
        url = `/api${path}`;
      } else {
        url = `/api/${path}`;
      }
      // prepend configurable API base for production deployments
      url = (API_BASE ? API_BASE : '') + url;

      const res = await fetch(url, options);
      if (!res.ok) {
        const text = await res.text();
        const err = new Error(text || res.statusText);
        // attach status for callers to inspect
        err.status = res.status;
        err.response = res;
        throw err;
      }
      const contentType = res.headers.get('content-type') || '';
      if (contentType.includes('application/json')) return res.json();
      return res;
    } catch (err) {
      // If this was the last attempt and we received a 404 from the dev server
      // try a direct call to the backend host used by the Vite proxy (helpful in local dev)
      if (
        attempt === retries &&
        typeof window !== 'undefined' &&
        err &&
        err.status === 404 &&
        url &&
        url.startsWith('/api') &&
        API_DIRECT_FALLBACK
      ) {
        const direct = `${API_DIRECT_FALLBACK}${url}`;
        if (!options.headers) options.headers = {};
        if (authToken) options.headers['Authorization'] = `Bearer ${authToken}`;
        options.credentials = 'include';
        const directRes = await fetch(direct, options);
        if (!directRes.ok) {
          const text2 = await directRes.text();
          const err2 = new Error(text2 || directRes.statusText);
          err2.status = directRes.status;
          throw err2;
        }
        const ct = directRes.headers.get('content-type') || '';
        if (ct.includes('application/json')) return directRes.json();
        return directRes;
      }
      if (attempt === retries) throw err;
      await wait(backoff * Math.pow(2, attempt));
      attempt += 1;
    }
  }
}

export const api = {
  get: (p, opts = {}) => {
    const { params, ...rest } = opts || {};
    const url = appendParams(p, params);
    return fetchWithRetry(url, { method: 'GET', ...rest });
  },
  post: (p, body, opts = {}) => {
    const { headers: extraHeaders, ...rest } = opts || {};
    const isStringBody = typeof body === 'string';
    return fetchWithRetry(p, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(extraHeaders || {}) },
      body: isStringBody ? body : JSON.stringify(body),
      ...rest,
    });
  },
  put: (p, body, opts = {}) => {
    const { headers: extraHeaders, ...rest } = opts || {};
    const isStringBody = typeof body === 'string';
    return fetchWithRetry(p, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', ...(extraHeaders || {}) },
      body: isStringBody ? body : JSON.stringify(body),
      ...rest,
    });
  },
  del: (p, opts = {}) => fetchWithRetry(p, { method: 'DELETE', ...(opts || {}) }),
  upload: (p, formData, opts = {}) => fetchWithRetry(p, { method: 'POST', body: formData, ...opts }),
};

export default api;
