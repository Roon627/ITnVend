// Small helpers related to authentication stored centrally so they can be reused
// across components without duplicating constants or parsing logic.

export const LS_TOKEN_KEY = 'ITnvend_token';
export const LS_ROLE_KEY = 'ITnvend_role';
export const LS_USERNAME_KEY = 'ITnvend_username';

export function parseJwt(token) {
  try {
    const payload = token.split('.')[1];
    // atob is available in the browser environment used by this frontend
    const decoded = JSON.parse(atob(payload));
    return decoded;
  } catch (_e) {
    return null;
  }
}

export function getStoredToken() {
  try {
    return localStorage.getItem(LS_TOKEN_KEY);
  } catch (_e) {
    return null;
  }
}
