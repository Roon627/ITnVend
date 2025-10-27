import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
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
import { AuthProvider, useAuth } from './components/AuthContext';
import { UIProvider, useUI } from './components/UIContext';

function App() {
  function AdminOnly({ children }) {
    const { user } = useAuth();
    if (!user) return <Navigate to="/login" replace />;
    return children;
  }

  function RoleGuard({ minRole, children }) {
    const { user } = useAuth();
    const rank = (r) => ({ cashier: 1, manager: 2, admin: 3 }[r] || 0);
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
                      <Route path="/staff" element={<RoleGuard minRole="admin"><Staff /></RoleGuard>} />
                      <Route path="/settings" element={<RoleGuard minRole="admin"><Settings /></RoleGuard>} />
                      <Route path="*" element={<Navigate to="/" replace />} />
                    </Routes>
                  </AdminLayout>
                </AdminOnly>
              } 
            />
          </Routes>
        </BrowserRouter>
      </UIProvider>
    </AuthProvider>
  );
}

export default App;
