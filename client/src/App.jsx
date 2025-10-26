import { BrowserRouter, Routes, Route } from 'react-router-dom';
import Sidebar from './components/Sidebar';
import POS from './pages/POS';
import Products from './pages/Products';
import Customers from './pages/Customers';
import Invoices from './pages/Invoices';
import CustomerDetail from './pages/CustomerDetail';
import Settings from './pages/Settings';
import Login from './pages/Login';
import Header from './components/Header';
import { AuthProvider, useAuth } from './components/AuthContext';
import { Navigate } from 'react-router-dom';

function App() {
  function AdminOnly({ children }) {
    const { user } = useAuth();
    if (!user) return <Navigate to="/login" replace />;
    if (user.role !== 'admin') return <div className="p-6 text-red-600">Access denied (admin only)</div>;
    return children;
  }

  return (
    <AuthProvider>
      <BrowserRouter>
        <div className="flex">
          <Sidebar />
          <div className="flex-1 ml-64 min-h-screen flex flex-col">
            <Header />
            <main className="flex-1">
              <Routes>
                <Route path="/" element={<POS />} />
                <Route path="/products" element={<Products />} />
                <Route path="/invoices" element={<Invoices />} />
                <Route path="/customers" element={<Customers />} />
                <Route path="/customers/:id" element={<CustomerDetail />} />
                <Route path="/settings" element={<AdminOnly><Settings /></AdminOnly>} />
                <Route path="/login" element={<Login />} />
              </Routes>
            </main>
          </div>
        </div>
      </BrowserRouter>
    </AuthProvider>
  );
}

export default App;
