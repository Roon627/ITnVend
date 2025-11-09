import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import Sidebar from './components/Sidebar';
import POS from './pages/POS';
import Products from './pages/Products';
import Customers from './pages/Customers';
import Invoices from './pages/Invoices';
import CustomerDetail from './pages/CustomerDetail';
import Settings from './pages/Settings/Settings';
import VendorRegister from './pages/VendorRegister';
import CasualSeller from './pages/CasualSeller';
import Vendors from './pages/Vendors';
import OneTimeSellers from './pages/OneTimeSellers';
import Submissions from './pages/Submissions';
import Staff from './pages/Staff';
import Login from './pages/Login';
import ForgotPassword from './pages/ForgotPassword';
import ResetPassword from './pages/ResetPassword';
import Header from './components/Header';
import Accounting from './pages/Accounting/Accounting';
import Reports from './pages/Reports/Reports';
import Operations from './pages/Operations/Operations';
import Preorders from './pages/Preorders';
import Profile from './pages/Profile';
import Help from './pages/Help';
import ContactOnly from './pages/ContactOnly';
import ManageLookups from './pages/ManageLookups';
import ValidateSlip from './pages/ValidateSlip';
import Slips from './pages/Slips';
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
  <Route path="/vendors" element={<RoleGuard minRole="manager"><Vendors /></RoleGuard>} />
  <Route path="/vendors/register" element={<RoleGuard minRole="manager"><VendorRegister /></RoleGuard>} />
  <Route path="/casual-seller" element={<RoleGuard minRole="cashier"><CasualSeller /></RoleGuard>} />
  <Route path="/casual-items" element={<RoleGuard minRole="manager"><OneTimeSellers /></RoleGuard>} />
  <Route path="/submissions" element={<RoleGuard minRole="cashier"><Submissions /></RoleGuard>} />
      <Route path="/customers" element={<Customers />} />
      <Route path="/customers/:id" element={<CustomerDetail />} />
      <Route path="/profile" element={<Profile />} />
      <Route path="/help" element={<Help />} />
      <Route path="/staff" element={<RoleGuard minRole="admin"><Staff /></RoleGuard>} />
      <Route path="/accounting" element={<RoleGuard minRole="accounts"><Accounting /></RoleGuard>} />
      <Route path="/reports" element={<RoleGuard minRole="manager"><Reports /></RoleGuard>} />
      <Route path="/operations" element={<RoleGuard minRole="manager"><Operations /></RoleGuard>} />
      <Route path="/preorders" element={<RoleGuard minRole="accounts"><Preorders /></RoleGuard>} />
  <Route path="/validate-slip" element={<RoleGuard minRole="accounts"><ValidateSlip /></RoleGuard>} />
  <Route path="/slips" element={<RoleGuard minRole="accounts"><Slips /></RoleGuard>} />
      <Route path="/settings" element={<RoleGuard minRole="manager"><Settings /></RoleGuard>} />
      <Route path="/manage-lookups" element={<RoleGuard minRole="admin"><ManageLookups /></RoleGuard>} />
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
          <Route path="/contact" element={<ContactOnly />} />
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
