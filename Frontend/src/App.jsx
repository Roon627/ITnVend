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
import Home from './pages/Home';
import Privacy from './pages/Privacy';
import UsePolicy from './pages/UsePolicy';
import VendorOnboarding from './pages/VendorOnboarding';
import Header from './components/Header';
import PublicProducts from './pages/PublicProducts';
import Cart from './pages/Cart';
import Checkout from './pages/Checkout';
import OrderConfirmation from './pages/OrderConfirmation';
import ProductDetail from './pages/ProductDetail';
import Accounting from './pages/Accounting/Accounting';
import Reports from './pages/Reports/Reports';
import Operations from './pages/Operations/Operations';
import Profile from './pages/Profile';
import Help from './pages/Help';
import { AuthProvider, useAuth } from './components/AuthContext';
import { UIProvider, useUI } from './components/UIContext';
import { NotificationsProvider } from './components/NotificationsContext';
import { WebSocketProvider } from './components/WebSocketContext';

const ONLY_ADMIN = import.meta.env.VITE_ONLY_ADMIN === '1';

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
    const { sidebarCollapsed } = useUI();
    return (
      <div className="flex">
        <Sidebar />
        <div className={`flex-1 ${sidebarCollapsed ? 'ml-20' : 'ml-64'} min-h-screen flex flex-col`}>
          <Header />
          <main className="flex-1 bg-gray-50">{children}</main>
        </div>
      </div>
    );
  }

  function PublicLayout({ children }) {
    return (
      <div>
        <a
          href="#main-content"
          className="absolute left-2 -top-16 focus:top-2 focus:z-50 focus:bg-white focus:px-3 focus:py-2 focus:rounded-md focus:shadow-md text-sm text-blue-700"
        >
          Skip to content
        </a>
        <main id="main-content" tabIndex={-1}>
          {children}
        </main>
      </div>
    );
  }

  const adminRoutes = (
    <Routes>
      <Route path="/" element={<POS />} />
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
                {ONLY_ADMIN ? (
                  <Route
                    path="/*"
                    element={
                      <AdminOnly>
                        <AdminLayout>{adminRoutes}</AdminLayout>
                      </AdminOnly>
                    }
                  />
                ) : (
                  <>
                    <Route path="/" element={<PublicLayout><Home /></PublicLayout>} />
                    <Route path="/home" element={<PublicLayout><Home /></PublicLayout>} />
                    <Route path="/store" element={<PublicLayout><PublicProducts /></PublicLayout>} />
                    <Route path="/product/:id" element={<PublicLayout><ProductDetail /></PublicLayout>} />
                    <Route path="/cart" element={<PublicLayout><Cart /></PublicLayout>} />
                    <Route path="/checkout" element={<PublicLayout><Checkout /></PublicLayout>} />
                    <Route path="/confirmation" element={<PublicLayout><OrderConfirmation /></PublicLayout>} />
                    <Route path="/vendor-onboarding" element={<PublicLayout><VendorOnboarding /></PublicLayout>} />
                    <Route path="/privacy" element={<PublicLayout><Privacy /></PublicLayout>} />
                    <Route path="/use" element={<PublicLayout><UsePolicy /></PublicLayout>} />
                    <Route path="/login" element={<Login />} />
                    <Route
                      path="/admin/*"
                      element={
                        <AdminOnly>
                          <AdminLayout>{adminRoutes}</AdminLayout>
                        </AdminOnly>
                      }
                    />
                    <Route path="*" element={<Navigate to="/" replace />} />
                  </>
                )}
              </Routes>
            </BrowserRouter>
          </UIProvider>
        </NotificationsProvider>
      </AuthProvider>
    </WebSocketProvider>
  );
}

export default App;
