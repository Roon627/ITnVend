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
  const { user } = useAuth();
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(false);
  const pendingFetch = useRef(null);

  const fetchNotifications = useCallback(
    async ({ unreadOnly = false } = {}) => {
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
        setNotifications(Array.isArray(result) ? result : []);
      } catch {
        // swallow auth errors silently to avoid noisy UI when token expires
        if (import.meta.env.DEV) {
          console.debug('Failed to load notifications');
        }
      } finally {
        if (pendingFetch.current === controller) {
          pendingFetch.current = null;
        }
        setLoading(false);
      }
    },
    [user]
  );

  const markRead = useCallback(
    async (id) => {
      setNotifications((prev) =>
        prev.map((item) => (item.id === id ? { ...item, read_at: new Date().toISOString() } : item))
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
      setNotifications((prev) =>
        prev.map((item) => (item.read_at ? item : { ...item, read_at: new Date().toISOString() }))
      );
    } catch (err) {
      console.debug('Failed to mark notifications read', err?.message || err);
      fetchNotifications();
    }
  }, [fetchNotifications]);

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
