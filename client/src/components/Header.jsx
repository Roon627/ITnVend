import { useEffect, useState } from 'react';
import api from '../lib/api';
import { useUI } from './UIContext';
import { FaBars } from 'react-icons/fa';

export default function Header() {
  const [outlet, setOutlet] = useState('ITnVend');
  const [online, setOnline] = useState(navigator.onLine);
  const { toggleSidebar } = useUI();

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
            <div className={`h-3 w-3 rounded-full ${online ? 'bg-green-500' : 'bg-red-400'}`} title={online ? 'Online' : 'Offline'} />
            <button className="text-sm px-3 py-2 rounded-md border">Help</button>
            <button className="text-sm px-3 py-2 rounded-md border">Profile</button>
          </div>
        </div>
      </div>
    </header>
  );
}
