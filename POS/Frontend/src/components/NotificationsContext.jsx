import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import api from '../lib/api';
import { useAuth } from './AuthContext';

const NotificationsContext = createContext({
  notifications: [],
  loading: false,
  unreadCount: 0,
  fetchNotifications: () => {},
  markRead: () => {},
  markAllRead: () => {},
});

export function NotificationsProvider({ children }) {
  const { user, attemptRefresh } = useAuth();
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(false);
  const pendingFetch = useRef(null);
  // Keep a map of locally-marked-as-read timestamps so a subsequent fetch
  // (which may return stale server data) doesn't flip items back to unread.
  const localReadMap = useRef(new Map());

  const fetchNotifications = useCallback(
    async ({ unreadOnly = false, _retried = false } = {}) => {
      if (!user) {
        setNotifications([]);
        setLoading(false);
        return;
      }
      if (pendingFetch.current) {
        pendingFetch.current.abort();
      }
      const controller = new AbortController();
      pendingFetch.current = controller;
      setLoading(true);
      try {
  const params = unreadOnly ? { unreadOnly: true } : undefined;
        const result = await api.get('/notifications', { params, signal: controller.signal });
        // Merge server notifications with any local read state we've applied.
        // Also normalize timestamp fields to ISO8601 with timezone info so the
        // UI displays consistent local times. Backend may return SQLite
        // CURRENT_TIMESTAMP values like "YYYY-MM-DD HH:MM:SS" which lack
        // timezone info; treat those as UTC and convert to ISO.
        const serverList = Array.isArray(result) ? result : [];
        const normalizeTimestamp = (raw) => {
          if (!raw) return null;
          const s = String(raw).trim();
          // If already ISO-like with timezone or offset, parse directly.
          if (/\d{4}-\d{2}-\d{2}T.*Z$/.test(s) || /[+-]\d{2}:?\d{2}$/.test(s)) {
            const d = new Date(s);
            return Number.isNaN(d.getTime()) ? null : d.toISOString();
          }

          // For ambiguous timestamps (no timezone), evaluate both UTC and local
          // interpretations and pick the one closest to "now". This mirrors the
          // display logic in Header.jsx so we don't introduce artificial offsets
          // for servers that emit localtime strings.
          let base = s.includes(' ') ? s.replace(' ', 'T') : s;
          if (/^\d{4}-\d{2}-\d{2}$/.test(base)) {
            base = `${base}T00:00:00`;
          }
          const candidates = [];
          const localCandidate = new Date(base);
          if (!Number.isNaN(localCandidate.getTime())) candidates.push(localCandidate);
          const utcCandidate = new Date(base + 'Z');
          if (!Number.isNaN(utcCandidate.getTime())) candidates.push(utcCandidate);
          if (!candidates.length) return null;
          if (candidates.length === 1) return candidates[0].toISOString();

          const now = Date.now();
          let best = candidates[0];
          let smallest = Math.abs(now - candidates[0].getTime());
          for (let i = 1; i < candidates.length; i += 1) {
            const diff = Math.abs(now - candidates[i].getTime());
            if (diff < smallest) {
              smallest = diff;
              best = candidates[i];
            }
          }
          return best.toISOString();
        };

        const merged = serverList.map((item) => {
          const localRead = localReadMap.current.get(item.id);
          const created_at = normalizeTimestamp(item.created_at);
          const read_at = localRead ? localRead : normalizeTimestamp(item.read_at);
          return { ...item, created_at, read_at };
        });
        if (import.meta.env.DEV && merged.length) {
          console.debug('Notifications timestamps', {
            raw: serverList.slice(0, 3).map((n) => ({ id: n.id, created_at: n.created_at })),
            normalized: merged.slice(0, 3).map((n) => ({ id: n.id, created_at: n.created_at })),
          });
        }
        setNotifications(merged);
      } catch (err) {
        if (err?.status === 401 && !_retried && attemptRefresh) {
          const refreshed = await attemptRefresh({ force: true });
          if (refreshed) {
            return fetchNotifications({ unreadOnly, _retried: true });
          }
        }
        if (err?.name !== 'AbortError') {
          // Log the error (including status/message) to help debugging. Keep
          // behavior non-fatal in production but provide detail in DEV.
          if (import.meta.env.DEV) {
            console.debug('Failed to load notifications', err && (err.message || err));
          }
        }
      } finally {
        if (pendingFetch.current === controller) {
          pendingFetch.current = null;
        }
        setLoading(false);
      }
    },
    [user, attemptRefresh]
  );

  const markRead = useCallback(
    async (id) => {
      const ts = new Date().toISOString();
      // Record locally so fetches don't undo this state while the server catches up
      localReadMap.current.set(id, ts);
      setNotifications((prev) =>
        prev.map((item) => (item.id === id ? { ...item, read_at: ts } : item))
      );
      try {
        await api.post(`/notifications/${id}/read`, {});
      } catch (err) {
        console.debug('Failed to mark notification read', err?.message || err);
        fetchNotifications();
      }
    },
    [fetchNotifications]
  );

  const markAllRead = useCallback(async () => {
    try {
      await api.post('/notifications/read-all', {});
      const ts = new Date().toISOString();
      // mark locally
      setNotifications((prev) => prev.map((item) => (item.read_at ? item : { ...item, read_at: ts })));
      // remember locally for future fetches
      prevNotificationsToMap(notifications, ts).forEach(([id, t]) => localReadMap.current.set(id, t));
    } catch (err) {
      console.debug('Failed to mark notifications read', err?.message || err);
      fetchNotifications();
    }
  }, [fetchNotifications]);

  // Helper to create an array of [id, ts] for unread notifications
  const prevNotificationsToMap = (list, ts) => {
    const pairs = [];
    (list || []).forEach((n) => {
      if (!n.read_at) pairs.push([n.id, ts]);
    });
    return pairs;
  };

  useEffect(() => {
    if (!user) {
      setNotifications([]);
      return;
    }
    fetchNotifications();
    const interval = setInterval(() => fetchNotifications(), 60000);
    return () => clearInterval(interval);
  }, [user, fetchNotifications]);

  const unreadCount = useMemo(
    () => notifications.filter((item) => !item.read_at).length,
    [notifications]
  );

  const value = useMemo(
    () => ({
      notifications,
      loading,
      unreadCount,
      fetchNotifications,
      markRead,
      markAllRead,
    }),
    [notifications, loading, unreadCount, fetchNotifications, markRead, markAllRead]
  );

  return (
    <NotificationsContext.Provider value={value}>
      {children}
    </NotificationsContext.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export function useNotifications() {
  return useContext(NotificationsContext);
}
