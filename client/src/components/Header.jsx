import { useEffect, useState } from 'react';
import api from '../lib/api';
import { useUI } from './UIContext';
import { FaBars } from 'react-icons/fa';
import { useAuth } from './AuthContext';
import { useToast } from './ToastContext';

export default function Header() {
  const [outlet, setOutlet] = useState('ITnVend');
  const [online, setOnline] = useState(navigator.onLine);
  const { toggleSidebar } = useUI();
  const { reauthRequired, attemptRefresh } = useAuth();
  const toast = useToast();
  const [notifications, setNotifications] = useState([]);
  const [showNotifications, setShowNotifications] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [showProfile, setShowProfile] = useState(false);
  const { user, logout } = useAuth();

  // poll notifications for logged-in staff, also allow on-demand refresh when dropdown opens
  useEffect(() => {
    let mounted = true;
    let timer = null;
    async function fetchNotifications() {
      try {
        const list = await api.get('/notifications');
        if (!mounted) return;
        setNotifications(list || []);
      } catch (err) {
        // ignore - likely unauthorized when not logged in
      }
    }
    fetchNotifications();
    timer = setInterval(fetchNotifications, 10000);
    return () => { mounted = false; if (timer) clearInterval(timer); };
  }, []);

  useEffect(() => {
    api.get('/settings').then((s) => {
      setOutlet(s.outlet_name || (s.outlet && s.outlet.name) || 'ITnVend');
    }).catch(() => {});

    function onOnline() { setOnline(true); }
    function onOffline() { setOnline(false); }
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    return () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
    };
  }, []);

  return (
    <header className="bg-white border-b">
      {reauthRequired && (
        <div className="bg-yellow-100 text-yellow-800 px-4 py-2 text-sm text-center">
          Your session needs re-authentication. <button className="underline ml-2" onClick={async () => { const ok = await attemptRefresh(); if (!ok) { toast.push('Please log in again', 'error'); window.location.href = '/login'; } }}>Try refresh</button>
        </div>
      )}
      <div className="container mx-auto px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button
            className="p-2 rounded-md hover:bg-gray-100"
            onClick={() => toggleSidebar()}
            aria-label="Toggle sidebar"
            title="Toggle sidebar"
          >
            <FaBars />
          </button>
          <div className="w-10 h-10 rounded-md bg-gradient-to-br from-teal-400 to-teal-600 flex items-center justify-center text-white font-bold">IT</div>
          <div>
            <h1 className="text-lg font-semibold">{outlet}</h1>
            <p className="text-sm text-slate-500">Point of Sale & Invoicing</p>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <div className="flex items-center gap-3">
            <div className="relative">
              <button className="p-2 rounded-md hover:bg-gray-100 flex items-center" title="Notifications" onClick={async () => {
                // open dropdown and refresh notifications
                setShowNotifications(v => !v);
                try {
                  const list = await api.get('/notifications');
                  setNotifications(list || []);
                } catch (err) { /* ignore */ }
              }}>
                <span className="text-lg">🔔</span>
                {notifications.filter(n => !n.is_read).length > 0 && (
                  <span className="ml-1 inline-block bg-red-500 text-white text-xs px-2 py-0.5 rounded-full">{notifications.filter(n => !n.is_read).length}</span>
                )}
              </button>
              {showNotifications && (
                <div className="absolute right-0 mt-2 w-96 bg-white border rounded shadow-lg z-50">
                  <div className="p-2 text-sm font-semibold flex items-center justify-between">
                    <div>Notifications</div>
                    <div>
                      <button className="text-xs text-blue-600" onClick={async (e) => { e.stopPropagation(); try { await api.put('/notifications/mark-read-all'); const list = await api.get('/notifications'); setNotifications(list||[]); } catch (err) { /* ignore */ } }}>Mark all read</button>
                    </div>
                  </div>
                  <div className="max-h-64 overflow-y-auto">
                    {notifications.length === 0 && <div className="p-4 text-sm text-gray-500">No notifications</div>}
                    {notifications.map(n => (
                      <div key={n.id} className={`p-2 border-t text-sm ${n.is_read ? 'text-gray-500' : 'text-gray-900'}`}>
                        <div className="flex justify-between items-start gap-2">
                          <div className="flex-1">
                            <div className="font-medium">{n.type}</div>
                            <div className="truncate">{n.message}</div>
                            <div className="text-xs text-gray-400">{new Date(n.created_at).toLocaleString()}</div>
                          </div>
                          <div className="flex flex-col items-end gap-1">
                            <button className="text-xs text-blue-600" onClick={async (e) => {
                              e.stopPropagation();
                              try {
                                await api.put(`/notifications/${n.id}/read`);
                                const list = await api.get('/notifications');
                                setNotifications(list || []);
                                // navigate if link present
                                if (n.link) window.location.href = n.link;
                              } catch (err) { console.error(err); }
                            }}>Open</button>
                            <button className="text-xs text-red-600" onClick={async (e) => { e.stopPropagation(); try { await api.del(`/notifications/${n.id}`); const list = await api.get('/notifications'); setNotifications(list||[]); } catch (err) { console.error(err); } }}>Dismiss</button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
            <div className={`h-3 w-3 rounded-full ${online ? 'bg-green-500' : 'bg-red-400'}`} title={online ? 'Online' : 'Offline'} />
            <button onClick={() => window.open('/home', '_blank')} className="text-sm px-3 py-2 rounded-md border">Store</button>
            <button className="text-sm px-3 py-2 rounded-md border" onClick={() => setShowHelp(true)}>Help</button>
            <div className="relative inline-block">
              <button className="text-sm px-3 py-2 rounded-md border" onClick={() => setShowProfile(v => !v)}>Profile</button>
              {showProfile && (
                <div className="absolute right-0 mt-2 w-56 bg-white border rounded shadow-lg z-50 p-3 text-sm">
                  <div className="font-medium">{user?.username || 'Guest'}</div>
                  <div className="text-xs text-gray-500">{user?.role || 'staff'}</div>
                  <div className="mt-2">
                    <button className="w-full text-left px-2 py-1 rounded hover:bg-gray-50" onClick={() => { window.location.href = '/profile'; }}>Open Profile</button>
                    <button className="w-full text-left px-2 py-1 rounded hover:bg-gray-50" onClick={() => { logout(); window.location.href = '/login'; }}>Logout</button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
      {/* Help modal */}
      {showHelp && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/40" onClick={() => setShowHelp(false)} />
          <div className="bg-white rounded p-6 z-10 w-full max-w-2xl">
            <h3 className="text-lg font-semibold mb-2">Help & Shortcuts</h3>
            <p className="text-sm text-gray-700">- Use the sidebar to navigate modules.<br/>- Products: add/edit products, upload images, scan barcodes.<br/>- POS: quick checkout and receipt printing.</p>
            <div className="mt-4 text-right">
              <button className="px-3 py-1 border rounded" onClick={() => setShowHelp(false)}>Close</button>
            </div>
          </div>
        </div>
      )}
    </header>
  );
}
