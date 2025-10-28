import { NavLink } from 'react-router-dom';
import { FaFileInvoice, FaBoxOpen, FaUsers, FaCog, FaCashRegister, FaUserCog, FaCalculator, FaChartBar, FaQuestionCircle } from 'react-icons/fa';
import { useAuth } from './AuthContext';
import { useUI } from './UIContext';

export default function Sidebar() {
  const { sidebarCollapsed } = useUI();
  const { user } = useAuth();
  const canViewAccounting = user && ['accounts', 'manager', 'admin'].includes(user.role);
  const canViewReports = user && ['manager', 'admin'].includes(user.role);
  const canManageStaff = user && user.role === 'admin';
  const linkClass = ({ isActive }) => `flex items-center px-4 py-2 rounded-md font-medium gap-3 ${isActive ? 'bg-blue-600 text-white' : 'text-gray-700 hover:bg-gray-100'}`;

  return (
    <aside className={`${sidebarCollapsed ? 'w-20' : 'w-64'} bg-white border-r h-screen p-4 fixed transition-width`}> 
      <div className={`flex items-center ${sidebarCollapsed ? 'justify-center' : 'justify-between'}`}>
        <h1 className={`text-xl font-bold mb-6 ${sidebarCollapsed ? 'sr-only' : ''}`}>ITnVend</h1>
        {/* small logo when collapsed */}
        {sidebarCollapsed && <div className="w-8 h-8 rounded-md bg-gradient-to-br from-teal-400 to-teal-600 flex items-center justify-center text-white font-bold">IT</div>}
      </div>
      <nav className="space-y-2 mt-4">
        <NavLink to="/" end className={linkClass}>
          <FaCashRegister /> {!sidebarCollapsed && 'POS'}
        </NavLink>
        <NavLink to="/invoices" className={linkClass}>
          <FaFileInvoice /> {!sidebarCollapsed && 'Invoices'}
        </NavLink>
        <NavLink to="/products" className={linkClass}>
          <FaBoxOpen /> {!sidebarCollapsed && 'Products'}
        </NavLink>
        <NavLink to="/customers" className={linkClass}>
          <FaUsers /> {!sidebarCollapsed && 'Customers'}
        </NavLink>
        {canViewAccounting && (
          <NavLink to="/accounting" className={linkClass}>
            <FaCalculator /> {!sidebarCollapsed && 'Accounting'}
          </NavLink>
        )}
        {canViewReports && (
          <NavLink to="/reports" className={linkClass}>
            <FaChartBar /> {!sidebarCollapsed && 'Reports'}
          </NavLink>
        )}
        {canManageStaff && (
          <NavLink to="/staff" className={linkClass}>
            <FaUserCog /> {!sidebarCollapsed && 'Staff'}
          </NavLink>
        )}
        <NavLink to="/help" className={linkClass}>
          <FaQuestionCircle /> {!sidebarCollapsed && 'Help'}
        </NavLink>
        <NavLink to="/settings" className={linkClass}>
          <FaCog /> {!sidebarCollapsed && 'Settings'}
        </NavLink>
      </nav>
    </aside>
  );
}
