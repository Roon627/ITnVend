import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
<<<<<<< HEAD:Frontend/src/pages/App.jsx
import Sidebar from '../components/Sidebar';
import POS from './POS';
import Products from './Products';
import Customers from './Customers';
import Invoices from './Invoices';
import CustomerDetail from './CustomerDetail';
import Settings from './Settings';
import Staff from './Staff';
import Login from './Login';
import Home from './Home';
import Privacy from './Privacy';
import UsePolicy from './UsePolicy';
import VendorOnboarding from './VendorOnboarding';
import Header from '../components/Header';
import PublicProducts from './PublicProducts';
import Cart from './Cart';
import Checkout from './Checkout';
import Accounting from './Accounting';
import Reports from './Reports';
import Profile from './Profile';
import Help from './Help';
import { AuthProvider, useAuth } from '../components/AuthContext';
import { UIProvider, useUI } from '../components/UIContext';
import { NotificationsProvider } from '../components/NotificationsContext';
=======
import Sidebar from './components/Sidebar';
import POS from './pages/POS';
import Products from './pages/Products';
import Customers from './pages/Customers';
import Invoices from './pages/Invoices';
import CustomerDetail from './pages/CustomerDetail';
import Settings from './pages/Settings';
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
import Accounting from './pages/Accounting';
import Reports from './pages/Reports';
import { AuthProvider, useAuth } from './components/AuthContext';
import { UIProvider, useUI } from './components/UIContext';
>>>>>>> a2206d25d59f774106b2fd37712d6665978019d0:client/src/App.jsx

function App() {
  // If VITE_ONLY_ADMIN=1 is set at build time, the app will render only the admin (POS) routes
  // This allows building/deploying the POS module separately for customers who purchase it.
  const ONLY_ADMIN = import.meta.env.VITE_ONLY_ADMIN === '1';
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
          <main className="flex-1 bg-gray-50">
            {children}
          </main>
        </div>
      </div>
    );
  }

  // A simpler layout for public facing pages
  function PublicLayout({ children }) {
    return (
      <div>
        {/* Skip link for keyboard users */}
        <a href="#main-content" className="absolute left-2 -top-16 focus:top-2 focus:z-50 focus:bg-white focus:px-3 focus:py-2 focus:rounded-md focus:shadow-md text-sm text-blue-700">Skip to content</a>
        {/* A public header could go here if needed */}
        <main id="main-content" tabIndex={-1}>{children}</main>
        {/* A public footer could go here */}
      </div>
    )
  }

  return (
    <AuthProvider>
      <NotificationsProvider>
        <UIProvider>
          <BrowserRouter>
          <Routes>
            {ONLY_ADMIN ? (
              // Build/time mode: only expose admin/POS routes at root. Useful for building a POS-only bundle.
              <Route
                path="/*"
                element={
                  <AdminOnly>
                    <AdminLayout>
                      <Routes>
                        <Route path="/" element={<POS />} />
                        <Route path="/products" element={<Products />} />
                        <Route path="/invoices" element={<Invoices />} />
                        <Route path="/customers" element={<Customers />} />
                        <Route path="/customers/:id" element={<CustomerDetail />} />
                        <Route path="/staff" element={<RoleGuard minRole="admin"><Staff /></RoleGuard>} />
                        <Route path="/accounting" element={<RoleGuard minRole="accounts"><Accounting /></RoleGuard>} />
                        <Route path="/reports" element={<RoleGuard minRole="manager"><Reports /></RoleGuard>} />
                        <Route path="/settings" element={<RoleGuard minRole="manager"><Settings /></RoleGuard>} />
                        <Route path="*" element={<Navigate to="/" replace />} />
                      </Routes>
                    </AdminLayout>
                  </AdminOnly>
                }
              />
            ) : (
              // Normal app: public storefront at / (and /home) and admin under /admin/*
              <>
                {/* Public E-commerce Routes */}
                <Route path="/" element={<PublicLayout><Home /></PublicLayout>} />
                <Route path="/home" element={<Home />} />
                <Route path="/store" element={<PublicLayout><PublicProducts /></PublicLayout>} />
                <Route path="/product/:id" element={<PublicLayout><ProductDetail /></PublicLayout>} />
                <Route path="/cart" element={<PublicLayout><Cart /></PublicLayout>} />
                <Route path="/checkout" element={<PublicLayout><Checkout /></PublicLayout>} />
                <Route path="/confirmation" element={<PublicLayout><OrderConfirmation /></PublicLayout>} />
                <Route path="/vendor-onboarding" element={<PublicLayout><VendorOnboarding /></PublicLayout>} />
                <Route path="/privacy" element={<Privacy />} />
                <Route path="/use" element={<UsePolicy />} />
                <Route path="/login" element={<Login />} />

<<<<<<< HEAD:Frontend/src/pages/App.jsx
            {/* Admin/Protected routes */}
            <Route 
              path="/*" 
              element={
                <AdminOnly>
                  <AdminLayout>
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
                      {/* Allow managers to open Settings; server enforces per-field permissions */}
                      <Route path="/settings" element={<RoleGuard minRole="manager"><Settings /></RoleGuard>} />
                      <Route path="*" element={<Navigate to="/" replace />} />
                    </Routes>
                  </AdminLayout>
                </AdminOnly>
              } 
            />
=======
                {/* Admin/Protected routes mounted under /admin */}
                <Route
                  path="/admin/*"
                  element={
                    <AdminOnly>
                      <AdminLayout>
                        <Routes>
                          <Route path="/" element={<POS />} />
                          <Route path="/products" element={<Products />} />
                          <Route path="/invoices" element={<Invoices />} />
                          <Route path="/customers" element={<Customers />} />
                          <Route path="/customers/:id" element={<CustomerDetail />} />
                          <Route path="/staff" element={<RoleGuard minRole="admin"><Staff /></RoleGuard>} />
                          <Route path="/accounting" element={<RoleGuard minRole="accounts"><Accounting /></RoleGuard>} />
                          <Route path="/reports" element={<RoleGuard minRole="manager"><Reports /></RoleGuard>} />
                          <Route path="/settings" element={<RoleGuard minRole="manager"><Settings /></RoleGuard>} />
                          <Route path="*" element={<Navigate to="/" replace />} />
                        </Routes>
                      </AdminLayout>
                    </AdminOnly>
                  }
                />
              </>
            )}
>>>>>>> a2206d25d59f774106b2fd37712d6665978019d0:client/src/App.jsx
          </Routes>
          </BrowserRouter>
        </UIProvider>
      </NotificationsProvider>
    </AuthProvider>
  );
}

export default App;
