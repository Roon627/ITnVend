import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
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
        {/* A public header could go here if needed */}
        <main>{children}</main>
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
            {/* Public E-commerce Routes */}
            <Route path="/store" element={<PublicLayout><PublicProducts /></PublicLayout>} />
            <Route path="/cart" element={<PublicLayout><Cart /></PublicLayout>} />
            <Route path="/checkout" element={<PublicLayout><Checkout /></PublicLayout>} />
            <Route path="/vendor-onboarding" element={<PublicLayout><VendorOnboarding /></PublicLayout>} />
            
            {/* Other Public Routes */}
            <Route path="/home" element={<Home />} />
            <Route path="/privacy" element={<Privacy />} />
            <Route path="/use" element={<UsePolicy />} />
            <Route path="/login" element={<Login />} />

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
          </Routes>
          </BrowserRouter>
        </UIProvider>
      </NotificationsProvider>
    </AuthProvider>
  );
}

export default App;
