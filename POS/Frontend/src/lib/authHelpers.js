// Small helpers related to authentication stored centrally so they can be reused
// across components without duplicating constants or parsing logic.

export const LS_TOKEN_KEY = 'ITnvend_token';
export const LS_ROLE_KEY = 'ITnvend_role';
export const LS_USERNAME_KEY = 'ITnvend_username';
export const LS_REFRESH_KEY = 'ITnvend_refresh_token';

export function parseJwt(token) {
  try {
    const payload = token.split('.')[1];
    if (!payload) return null;
    // JWTs are base64url-encoded; convert to standard base64 before decoding
    const normalized = payload.replace(/-/g, '+').replace(/_/g, '/');
    const padded = normalized.padEnd(normalized.length + ((4 - (normalized.length % 4)) % 4), '=');
    const decoded = JSON.parse(atob(padded));
    return decoded;
  } catch {
    return null;
  }
}

export function getStoredToken() {
  try {
    return localStorage.getItem(LS_TOKEN_KEY);
  } catch {
    return null;
  }
}
