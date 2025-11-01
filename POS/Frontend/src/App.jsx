import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import Sidebar from './components/Sidebar';
import POS from './pages/POS';
import Products from './pages/Products';
import Customers from './pages/Customers';
import Invoices from './pages/Invoices';
import CustomerDetail from './pages/CustomerDetail';
import Settings from './pages/Settings/Settings';
import Staff from './pages/Staff';
import Login from './pages/Login';
import ForgotPassword from './pages/ForgotPassword';
import ResetPassword from './pages/ResetPassword';
import Header from './components/Header';
import Accounting from './pages/Accounting/Accounting';
import Reports from './pages/Reports/Reports';
import Operations from './pages/Operations/Operations';
import Profile from './pages/Profile';
import Help from './pages/Help';
import { AuthProvider, useAuth } from './components/AuthContext';
import { UIProvider, useUI } from './components/UIContext';
import { NotificationsProvider } from './components/NotificationsContext';
import { WebSocketProvider } from './components/WebSocketContext';

function App() {
  function AdminOnly({ children }) {
    const { user } = useAuth();
    if (!user) return <Navigate to="/login" replace />;
    return children;
  }

  function RoleGuard({ minRole, children }) {
    const { user } = useAuth();
    const rank = (r) => ({ cashier: 1, accounts: 2, manager: 3, admin: 4 }[r] || 0);
    if (!user) return <Navigate to="/login" replace />;
    if (rank(user.role) < rank(minRole)) return <div className="p-6 text-red-600">Access denied</div>;
    return children;
  }

  function AdminLayout({ children }) {
    const { sidebarCollapsed, sidebarOpen, closeSidebar } = useUI();
    const marginClass = sidebarCollapsed ? 'lg:ml-20' : 'lg:ml-64';
    return (
      <div className="flex">
        <Sidebar />
        {sidebarOpen && (
          <button
            type="button"
            className="fixed inset-0 z-30 bg-black/30 lg:hidden"
            aria-hidden="true"
            onClick={closeSidebar}
          />
        )}
        <div className={`flex-1 min-h-screen flex flex-col transition-[margin] duration-200 ml-0 ${marginClass}`}>
          <Header />
          <main className="flex-1 bg-gray-50">{children}</main>
        </div>
      </div>
    );
  }

  const adminRoutes = (
    <Routes>
      <Route path="/" element={<Navigate to="/pos" replace />} />
      <Route path="/pos" element={<POS />} />
      <Route path="/products" element={<Products />} />
      <Route path="/invoices" element={<Invoices />} />
      <Route path="/customers" element={<Customers />} />
      <Route path="/customers/:id" element={<CustomerDetail />} />
      <Route path="/profile" element={<Profile />} />
      <Route path="/help" element={<Help />} />
      <Route path="/staff" element={<RoleGuard minRole="admin"><Staff /></RoleGuard>} />
      <Route path="/accounting" element={<RoleGuard minRole="accounts"><Accounting /></RoleGuard>} />
      <Route path="/reports" element={<RoleGuard minRole="manager"><Reports /></RoleGuard>} />
      <Route path="/operations" element={<RoleGuard minRole="manager"><Operations /></RoleGuard>} />
      <Route path="/settings" element={<RoleGuard minRole="manager"><Settings /></RoleGuard>} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );

  return (
    <WebSocketProvider>
      <AuthProvider>
        <NotificationsProvider>
          <UIProvider>
            <BrowserRouter>
              <Routes>
                <Route path="/login" element={<Login />} />
                <Route path="/forgot-password" element={<ForgotPassword />} />
                <Route path="/reset-password" element={<ResetPassword />} />
                <Route
                  path="/*"
                  element={
                    <AdminOnly>
                      <AdminLayout>{adminRoutes}</AdminLayout>
                    </AdminOnly>
                  }
                />
              </Routes>
            </BrowserRouter>
          </UIProvider>
        </NotificationsProvider>
      </AuthProvider>
    </WebSocketProvider>
  );
}

export default App;
