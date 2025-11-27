import { Suspense, lazy } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import Sidebar from './components/Sidebar';
import Header from './components/Header';
import { AuthProvider, useAuth } from './components/AuthContext';
import { UIProvider, useUI } from './components/UIContext';
import { NotificationsProvider } from './components/NotificationsContext';
import { WebSocketProvider } from './components/WebSocketContext';

const POS = lazy(() => import('./pages/POS'));
const Products = lazy(() => import('./pages/Products'));
const Customers = lazy(() => import('./pages/Customers'));
const Invoices = lazy(() => import('./pages/Invoices'));
const CustomerDetail = lazy(() => import('./pages/CustomerDetail'));
const Settings = lazy(() => import('./pages/Settings/Settings'));
const VendorRegister = lazy(() => import('./pages/VendorRegister'));
const CasualSeller = lazy(() => import('./pages/CasualSeller'));
const Vendors = lazy(() => import('./pages/Vendors'));
const VendorEdit = lazy(() => import('./pages/VendorEdit'));
const OneTimeSellers = lazy(() => import('./pages/OneTimeSellers'));
const Submissions = lazy(() => import('./pages/Submissions'));
const Staff = lazy(() => import('./pages/Staff'));
const Login = lazy(() => import('./pages/Login'));
const ForgotPassword = lazy(() => import('./pages/ForgotPassword'));
const ResetPassword = lazy(() => import('./pages/ResetPassword'));
const Accounting = lazy(() => import('./pages/Accounting/Accounting'));
const Reports = lazy(() => import('./pages/Reports/Reports'));
const Operations = lazy(() => import('./pages/Operations/Operations'));
const Preorders = lazy(() => import('./pages/Preorders'));
const Profile = lazy(() => import('./pages/Profile'));
const Help = lazy(() => import('./pages/Help'));
const Orders = lazy(() => import('./pages/Orders'));
const ContactOnly = lazy(() => import('./pages/ContactOnly'));
const VendorLogin = lazy(() => import('./modules/vendor/VendorLogin'));
const VendorDashboard = lazy(() => import('./modules/vendor/VendorDashboard'));
const VendorProducts = lazy(() => import('./pages/vendor/VendorProducts'));
const VendorSettings = lazy(() => import('./pages/vendor/VendorSettings'));
const VendorOrders = lazy(() => import('./pages/vendor/VendorOrders'));
const ManageLookups = lazy(() => import('./pages/ManageLookups'));
const AddProduct = lazy(() => import('./pages/AddProduct'));
const EditProduct = lazy(() => import('./pages/EditProduct'));
const NotFound = lazy(() => import('./pages/NotFound'));
const ValidateSlip = lazy(() => import('./pages/ValidateSlip'));
const Slips = lazy(() => import('./pages/Slips'));

function App() {
  const INTERNAL_ROLES = new Set(['cashier', 'accounts', 'manager', 'admin', 'owner', 'staff']);
  const LoadingScreen = () => (
    <div className="p-6 text-sm text-slate-500">Loading interface…</div>
  );
  function AdminOnly({ children }) {
    const { user } = useAuth();
    if (!user || user.role === 'vendor') return <Navigate to="/login" replace />;
    if (user.role && !INTERNAL_ROLES.has(user.role)) return <Navigate to="/login" replace />;
    return children;
  }

  function RoleGuard({ minRole, children }) {
    const { user } = useAuth();
    const rank = (r) => ({ cashier: 1, accounts: 2, manager: 3, admin: 4 }[r] || 0);
    if (!user || user.role === 'vendor') return <Navigate to="/login" replace />;
    if (rank(user.role) < rank(minRole)) return <div className="p-6 text-red-600">Access denied</div>;
    return children;
  }

  function VendorOnly({ children }) {
    const { user } = useAuth();
    if (!user) return <Navigate to="/vendor/login" replace />;
    if (user.role !== 'vendor') return <Navigate to="/login" replace />;
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
      <Route path="/products/add" element={<AddProduct />} />
      <Route path="/products/:id/edit" element={<EditProduct />} />
      <Route path="/invoices" element={<Invoices />} />
      <Route path="/orders" element={<RoleGuard minRole="accounts"><Orders /></RoleGuard>} />
  <Route path="/vendors" element={<RoleGuard minRole="manager"><Vendors /></RoleGuard>} />
  <Route path="/vendors/register" element={<RoleGuard minRole="manager"><VendorRegister /></RoleGuard>} />
  <Route path="/vendors/:id/edit" element={<RoleGuard minRole="manager"><VendorEdit /></RoleGuard>} />
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
      <Route path="*" element={<NotFound />} />
    </Routes>
  );

  return (
    <WebSocketProvider>
      <AuthProvider>
        <NotificationsProvider>
          <UIProvider>
            <BrowserRouter>
              <Suspense fallback={<LoadingScreen />}>
                <Routes>
                  <Route path="/login" element={<Login />} />
                  <Route path="/vendor/login" element={<VendorLogin />} />
                  <Route path="/vendor/dashboard" element={<VendorOnly><VendorDashboard /></VendorOnly>} />
                  <Route path="/vendor/products" element={<VendorOnly><VendorProducts /></VendorOnly>} />
                  <Route path="/vendor/orders" element={<VendorOnly><VendorOrders /></VendorOnly>} />
                  <Route path="/vendor/settings" element={<VendorOnly><VendorSettings /></VendorOnly>} />
                  <Route path="/vendor/reset-password" element={<ResetPassword />} />
                  <Route path="/vendor/forgot-password" element={<ForgotPassword />} />
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
              </Suspense>
            </BrowserRouter>
          </UIProvider>
        </NotificationsProvider>
      </AuthProvider>
    </WebSocketProvider>
  );
}

export default App;
