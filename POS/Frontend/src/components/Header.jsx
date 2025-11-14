import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useUI } from './UIContext';
import { FaBars, FaBell, FaTimes, FaChevronDown } from 'react-icons/fa';
import { useAuth } from './AuthContext';
import { useToast } from './ToastContext';
import { useNotifications } from './NotificationsContext';
import { useWebSocket } from './WebSocketContext';
import { useSettings } from './SettingsContext';
import BrandLogo from './BrandLogo';

const NOTIFICATION_LOCALE = import.meta.env.VITE_NOTIFICATIONS_LOCALE || undefined;
const NOTIFICATION_TIMEZONE = import.meta.env.VITE_NOTIFICATIONS_TIMEZONE || null;

function formatAbsolute(date) {
  const options = {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZoneName: 'short',
  };
  if (NOTIFICATION_TIMEZONE) options.timeZone = NOTIFICATION_TIMEZONE;
  try {
    return new Intl.DateTimeFormat(NOTIFICATION_LOCALE, options).format(date);
  } catch {
    // Fallback if locale/timezone are invalid
    return date.toLocaleString();
  }
}

function formatRelativeTime(value) {
  if (!value) return '';
  let input;
  if (typeof value === 'string') {
    // Normalize timestamp parsing for ambiguous strings (those without an
    // explicit timezone). We attempt to parse both as UTC and as local time and
    // pick the result closest to the current time. This handles mixed sources
    // where some rows are populated by SQLite CURRENT_TIMESTAMP (no timezone)
    // and others by new Date().toISOString() (with 'Z').
    let s = value.trim();
    // If the string already contains a timezone indicator (Z or ±HH:MM) parse
    // it directly.
    if (/Z|[+-]\d{2}:?\d{2}$/.test(s)) {
      input = new Date(s);
    } else {
      // For plain date format (YYYY-MM-DD) treat as start-of-day when parsing
      // but still consider both UTC and local interpretations.
      if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
        s = s + 'T00:00:00';
      }
      // Normalize space-separated date-times to ISO-like without timezone so
      // both parsers behave consistently (e.g. "YYYY-MM-DD HH:MM:SS" ->
      // "YYYY-MM-DDTHH:MM:SS").
      if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(s)) {
        s = s.replace(' ', 'T');
      }

      const asUtc = new Date(s + 'Z');
      const asLocal = new Date(s);
      const now = Date.now();
      const dUtc = Number.isNaN(asUtc.getTime()) ? Infinity : Math.abs(now - asUtc.getTime());
      const dLocal = Number.isNaN(asLocal.getTime()) ? Infinity : Math.abs(now - asLocal.getTime());
      if (dUtc === Infinity && dLocal === Infinity) {
        input = new Date(s);
      } else {
        input = dUtc <= dLocal ? asUtc : asLocal;
      }
    }
  } else {
    input = value;
  }
  if (!(input instanceof Date) || Number.isNaN(input.getTime())) return '';
  const diff = Date.now() - input.getTime();
  const absDiff = Math.abs(diff);
  if (absDiff < 60 * 1000) return 'Just now';
  if (diff < 0) return formatAbsolute(input);
  if (diff < 60 * 60 * 1000) return `${Math.floor(diff / (60 * 1000))}m ago`;
  if (diff < 24 * 60 * 60 * 1000) return `${Math.floor(diff / (60 * 60 * 1000))}h ago`;
  // For older items show a localized date/time
  return formatAbsolute(input);
}

export default function Header() {
  const [online, setOnline] = useState(navigator.onLine);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const { toggleSidebar } = useUI();
  const navigate = useNavigate();
  const { user, reauthRequired, attemptRefresh, logout } = useAuth();
  const toast = useToast();
  const { notifications, unreadCount, markRead, markAllRead } = useNotifications();
  const { isConnected: wsConnected } = useWebSocket();
  const notificationsRef = useRef(null);
  const notificationsButtonRef = useRef(null);
  const notificationsPanelRef = useRef(null);
  const profileRef = useRef(null);
  const profileButtonRef = useRef(null);
  const [profileOpen, setProfileOpen] = useState(false);
  const storeUrl = (import.meta.env.VITE_ESTORE_URL || 'https://estore.itnvend.com').replace(/\/$/, '');
  const { settings } = useSettings();
  const outlet = settings?.outlet?.name || settings?.outlet_name || 'ITnVend';

  useEffect(() => {
    function onOnline() { setOnline(true); }
    function onOffline() { setOnline(false); }
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    return () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
    };
  }, []);

  useEffect(() => {
    if (!notificationsOpen) return;
    function handleClickOutside(event) {
      if (notificationsRef.current && !notificationsRef.current.contains(event.target)) {
        setNotificationsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [notificationsOpen]);

  // close profile dropdown when clicking outside
  useEffect(() => {
    if (!profileOpen) return;
    function handleClickOutside(e) {
      if (profileRef.current && !profileRef.current.contains(e.target)) {
        setProfileOpen(false);
      }
    }
    function onKey(e) {
      if (e.key === 'Escape') {
        setProfileOpen(false);
        profileButtonRef.current?.focus();
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', onKey);
    };
  }, [profileOpen]);

  useEffect(() => {
    if (!notificationsOpen) return;
    const focusPanel = () => {
      if (notificationsPanelRef.current) {
        notificationsPanelRef.current.focus();
      }
    };
    const timer = window.setTimeout(focusPanel, 0);
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        setNotificationsOpen(false);
        notificationsButtonRef.current?.focus();
        return;
      }
      if (event.key === 'Tab') {
        const panel = notificationsPanelRef.current;
        if (!panel) return;
        const focusable = Array.from(
          panel.querySelectorAll(
            'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
          )
        );
        if (!focusable.length) {
          return;
        }
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (event.shiftKey) {
          if (document.activeElement === first || document.activeElement === panel) {
            event.preventDefault();
            if (last instanceof HTMLElement) last.focus();
          }
        } else if (document.activeElement === last) {
          event.preventDefault();
          if (first instanceof HTMLElement) first.focus();
        }
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [notificationsOpen]);

  const handleNotificationClick = (notification) => {
    markRead(notification.id);
    if (notification.link) {
      if (/^https?:\/\//.test(notification.link)) {
        window.open(notification.link, '_blank', 'noopener,noreferrer');
      } else {
        navigate(notification.link);
      }
    }
    setNotificationsOpen(false);
    notificationsButtonRef.current?.focus();
  };

  return (
    <header className="bg-white border-b sticky top-0 z-30">
      {reauthRequired && (
        <div className="bg-yellow-100 text-yellow-800 px-4 py-2 text-sm text-center">
          Your session needs re-authentication. <button className="underline ml-2" onClick={async () => { const ok = await attemptRefresh(); if (!ok) { toast.push('Please log in again', 'error'); window.location.href = '/login'; } }}>Try refresh</button>
        </div>
      )}
      <div className="mx-auto max-w-7xl px-4 sm:px-6 py-4 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <button
            className="p-2 rounded-md hover:bg-gray-100"
            onClick={() => toggleSidebar()}
            aria-label="Toggle sidebar"
            title="Toggle sidebar"
          >
            <FaBars />
          </button>
          <BrandLogo size={40} />
          <div>
            <h1 className="text-lg font-semibold">{outlet}</h1>
            <p className="text-sm text-slate-500">Point of Sale & Invoicing</p>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-end gap-2 sm:gap-3">
            <div className="flex items-center gap-2 sm:gap-3">
              <div className={`h-3 w-3 rounded-full ${online ? 'bg-green-500' : 'bg-red-400'}`} title={online ? 'Online' : 'Offline'} />
              <div className={`h-3 w-3 rounded-full ${wsConnected ? 'bg-blue-500' : 'bg-gray-400'}`} title={wsConnected ? 'Real-time connected' : 'Real-time disconnected'} />
              <button onClick={() => window.open(storeUrl, '_blank', 'noopener,noreferrer')} className="text-xs sm:text-sm px-3 py-2 rounded-md border">Store</button>
              <button onClick={() => navigate('/help')} className="text-xs sm:text-sm px-3 py-2 rounded-md border">Help</button>
              <div className="relative" ref={profileRef}>
                <button
                  ref={profileButtonRef}
                  onClick={() => setProfileOpen((v) => !v)}
                  className="text-sm px-2 py-1 rounded-md border inline-flex items-center gap-2"
                  aria-haspopup="menu"
                  aria-expanded={profileOpen}
                  aria-controls="profile-menu"
                >
                  {/* Avatar / initials */}
                  {user?.avatar ? (
                    <img src={user.avatar} alt={user.username || 'User avatar'} className="w-7 h-7 rounded-full object-cover" />
                  ) : (
                    <span className="w-7 h-7 rounded-full bg-slate-200 text-slate-700 flex items-center justify-center font-semibold">{(user?.username || 'U').charAt(0).toUpperCase()}</span>
                  )}
                  <span className="hidden sm:inline">{user?.username ? `Hi, ${user.username}` : 'Profile'}</span>
                  <FaChevronDown className="text-sm" />
                </button>
                {profileOpen && (
                  <div
                    id="profile-menu"
                    role="menu"
                    tabIndex={-1}
                    className="absolute right-0 mt-2 w-44 rounded-md border bg-white shadow-lg z-50"
                  >
                    <button
                      role="menuitem"
                      onClick={() => { setProfileOpen(false); navigate('/profile'); }}
                      className="w-full text-left px-4 py-2 hover:bg-slate-50"
                    >
                      View profile
                    </button>
                    <button
                      role="menuitem"
                      onClick={() => { setProfileOpen(false); navigate('/settings'); }}
                      className="w-full text-left px-4 py-2 hover:bg-slate-50"
                    >
                      Settings
                    </button>
                    <div className="border-t" />
                    <button
                      role="menuitem"
                      onClick={async () => { setProfileOpen(false); await logout(); navigate('/login'); }}
                      className="w-full text-left px-4 py-2 text-red-600 hover:bg-slate-50"
                    >
                      Logout
                    </button>
                  </div>
                )}
              </div>
            </div>
          <div className="relative" ref={notificationsRef}>
            <button
              ref={notificationsButtonRef}
              onClick={() => setNotificationsOpen((open) => !open)}
              className="relative p-2 rounded-md border hover:bg-gray-100 transition"
              aria-label="Open notifications"
              aria-haspopup="dialog"
              aria-controls="app-notifications-panel"
              aria-expanded={notificationsOpen}
            >
              <FaBell />
              {unreadCount > 0 && (
                <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs w-5 h-5 rounded-full flex items-center justify-center">
                  {unreadCount > 9 ? '9+' : unreadCount}
                </span>
              )}
            </button>
            {notificationsOpen && (
              <div
                ref={notificationsPanelRef}
                id="app-notifications-panel"
                role="dialog"
                aria-modal="false"
                aria-label="Notifications"
                tabIndex={-1}
                className="absolute right-0 mt-3 w-80 max-h-[28rem] overflow-hidden rounded-lg border bg-white shadow-lg z-50"
              >
                <div className="flex items-center justify-between px-4 py-3 border-b bg-slate-50">
                  <span className="font-semibold text-sm">Notifications</span>
                  <div className="flex items-center gap-2 text-xs">
                    <button
                      onClick={() => markAllRead()}
                      className="text-blue-600 hover:underline disabled:text-slate-400"
                      disabled={!notifications.length}
                    >
                      Mark all read
                    </button>
                    <button
                      onClick={() => setNotificationsOpen(false)}
                      className="p-1 rounded hover:bg-slate-200"
                      aria-label="Close notifications"
                    >
                      <FaTimes />
                    </button>
                  </div>
                </div>
                <div className="max-h-[22rem] overflow-y-auto">
                  {notifications.length === 0 && (
                    <div className="px-4 py-6 text-center text-sm text-slate-500">
                      You're all caught up!
                    </div>
                  )}
                  {notifications.map((item) => (
                    <button
                      key={item.id}
                      onClick={() => handleNotificationClick(item)}
                      className={`w-full text-left px-4 py-3 border-b hover:bg-slate-50 transition ${item.read_at ? 'bg-white' : 'bg-blue-50'}`}
                    >
                      <div className="flex items-baseline justify-between gap-3">
                        <p className="font-medium text-sm text-slate-700">{item.title}</p>
                        <span className="text-xs text-slate-400">{formatRelativeTime(item.created_at)}</span>
                      </div>
                      <p className="text-xs text-slate-600 mt-1">{item.message}</p>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}
