import { createContext, useContext, useState } from 'react';

const ToastContext = createContext(null);

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);

  function push(message, type = 'info', timeout = 4000) {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t, { id, message, type }]);
    if (timeout) setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), timeout);
  }

  return (
    <ToastContext.Provider value={{ push }}>
      {children}
      <div className="fixed bottom-4 right-4 space-y-2 z-50">
        {toasts.map((t) => (
          <div key={t.id} className={`px-4 py-2 rounded shadow ${t.type === 'error' ? 'bg-red-600 text-white' : 'bg-white text-black'}`}>
            {t.message}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  return useContext(ToastContext);
}
