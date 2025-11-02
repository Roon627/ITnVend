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
        const raw = await res.text();
        let parsed = null;
        if (raw) {
          try {
            parsed = JSON.parse(raw);
          } catch {
            // not JSON, fall back to raw text
          }
        }
        const message =
          (parsed && (parsed.error || parsed.message)) ||
          raw ||
          res.statusText ||
          `Request failed with status ${res.status}`;
        const err = new Error(message);
        // attach status and parsed payload for callers to inspect
        err.status = res.status;
        err.response = res;
        if (parsed) err.data = parsed;
        throw err;
      }
      const contentType = res.headers.get('content-type') || '';
      if (contentType.includes('application/json')) return res.json();
      return res;
    } catch (err) {
      // optional direct fallback for dev environments
      if (
        attempt === retries &&
        API_DIRECT_FALLBACK &&
        err &&
        err.status === 404 &&
        url &&
        url.startsWith('/api')
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

const apiClient = {
  get: (p, opts = {}) => {
    const { params, ...rest } = opts || {};
    const url = appendParams(p, params);
    return fetchWithRetry(url, { method: 'GET', ...rest });
  },
  post: (p, body, opts = {}) => {
    const { headers: extraHeaders, ...rest } = opts || {};
    return fetchWithRetry(p, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(extraHeaders || {}) },
      body: JSON.stringify(body),
      ...rest,
    });
  },
  put: (p, body, opts = {}) => {
    const { headers: extraHeaders, ...rest } = opts || {};
    return fetchWithRetry(p, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', ...(extraHeaders || {}) },
      body: JSON.stringify(body),
      ...rest,
    });
  },
  patch: (p, body, opts = {}) => {
    const { headers: extraHeaders, ...rest } = opts || {};
    return fetchWithRetry(p, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', ...(extraHeaders || {}) },
      body: JSON.stringify(body),
      ...rest,
    });
  },
  del: (p, opts = {}) => {
    const { headers: extraHeaders, ...rest } = opts || {};
    return fetchWithRetry(p, { method: 'DELETE', headers: extraHeaders, ...rest });
  },
  upload: (p, formData, opts = {}) => fetchWithRetry(p, { method: 'POST', body: formData, ...opts }),
};

export const api = apiClient;
export default apiClient;
