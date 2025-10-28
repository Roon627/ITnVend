import { createContext, useContext, useState } from 'react';

const UIContext = createContext(null);

export function UIProvider({ children }) {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  function toggleSidebar() {
    setSidebarCollapsed((s) => !s);
  }

  return (
    <UIContext.Provider value={{ sidebarCollapsed, toggleSidebar }}>
      {children}
    </UIContext.Provider>
  );
}

export function useUI() {
  const ctx = useContext(UIContext);
  if (!ctx) throw new Error('useUI must be used within UIProvider');
  return ctx;
}
