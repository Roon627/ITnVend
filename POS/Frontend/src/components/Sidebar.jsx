import { NavLink } from 'react-router-dom';
import {
  FaFileInvoice,
  FaBoxOpen,
  FaUsers,
  FaCog,
  FaCashRegister,
  FaUserCog,
  FaCalculator,
  FaChartBar,
  FaQuestionCircle,
  FaClipboardList,
  FaTimes,
  FaInbox,
} from 'react-icons/fa';
import { useAuth } from './AuthContext';
import { useUI } from './UIContext';

export default function Sidebar() {
  const { sidebarCollapsed, sidebarOpen, isDesktop, closeSidebar } = useUI();
  const { user } = useAuth();
  const canViewAccounting = user && ['accounts', 'manager', 'admin'].includes(user.role);
  const canViewReports = user && ['manager', 'admin'].includes(user.role);
  const canManagePreorders = user && ['accounts', 'manager', 'admin'].includes(user.role);
  const canManageStaff = user && user.role === 'admin';

  const linkClass = ({ isActive }) =>
    `flex items-center px-4 py-2 rounded-md font-medium gap-3 ${
      isActive ? 'bg-blue-600 text-white' : 'text-gray-700 hover:bg-gray-100'
    }`;

  const handleNavClick = () => {
    if (!isDesktop) {
      closeSidebar();
    }
  };

  const collapsedLabelsHidden = sidebarCollapsed && isDesktop;

  return (
    <aside
      className={`fixed inset-y-0 left-0 z-40 bg-white border-r shadow-lg lg:shadow-none transform transition-transform duration-200 ease-out w-64 ${
        sidebarOpen ? 'translate-x-0' : '-translate-x-full'
      } ${sidebarCollapsed ? 'lg:w-20' : 'lg:w-64'} lg:translate-x-0`}
      aria-hidden={!sidebarOpen && !isDesktop}
    >
      <div className={`flex items-center justify-between p-4 border-b lg:border-b-0 ${collapsedLabelsHidden ? 'lg:justify-center' : ''}`}>
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-md bg-gradient-to-br from-teal-400 to-teal-600 flex items-center justify-center text-white font-bold">
            IT
          </div>
          <h1 className={`text-xl font-bold ${collapsedLabelsHidden ? 'hidden lg:block lg:sr-only' : ''}`}>ITnVend</h1>
        </div>
        {!isDesktop && (
          <button
            type="button"
            onClick={closeSidebar}
            className="p-2 rounded-md text-gray-500 hover:text-gray-700 hover:bg-gray-100"
            aria-label="Close sidebar"
          >
            <FaTimes />
          </button>
        )}
      </div>
      <nav className="space-y-2 p-4 overflow-y-auto h-[calc(100%-4rem)] lg:h-full">
        <NavLink to="/pos" className={linkClass} onClick={handleNavClick}>
          <FaCashRegister /> {!collapsedLabelsHidden && 'POS'}
        </NavLink>
        <NavLink to="/invoices" className={linkClass} onClick={handleNavClick}>
          <FaFileInvoice /> {!collapsedLabelsHidden && 'Invoices'}
        </NavLink>
        <NavLink to="/products" className={linkClass} onClick={handleNavClick}>
          <FaBoxOpen /> {!collapsedLabelsHidden && 'Products'}
        </NavLink>
        <NavLink to="/customers" className={linkClass} onClick={handleNavClick}>
          <FaUsers /> {!collapsedLabelsHidden && 'Customers'}
        </NavLink>
        {canManagePreorders && (
          <NavLink to="/preorders" className={linkClass} onClick={handleNavClick}>
            <FaInbox /> {!collapsedLabelsHidden && 'Preorders'}
          </NavLink>
        )}
        {canViewAccounting && (
          <NavLink to="/accounting" className={linkClass} onClick={handleNavClick}>
            <FaCalculator /> {!collapsedLabelsHidden && 'Accounting'}
          </NavLink>
        )}
        {canViewReports && (
          <NavLink to="/reports" className={linkClass} onClick={handleNavClick}>
            <FaChartBar /> {!collapsedLabelsHidden && 'Reports'}
          </NavLink>
        )}
        {canViewReports && (
          <NavLink to="/operations" className={linkClass} onClick={handleNavClick}>
            <FaCog /> {!collapsedLabelsHidden && 'Operations'}
          </NavLink>
        )}
        {canManageStaff && (
          <NavLink to="/staff" className={linkClass} onClick={handleNavClick}>
            <FaUserCog /> {!collapsedLabelsHidden && 'Staff'}
          </NavLink>
        )}
        {canManageStaff && (
          <NavLink to="/manage-lookups" className={linkClass} onClick={handleNavClick}>
            <FaClipboardList /> {!collapsedLabelsHidden && 'Manage Lookups'}
          </NavLink>
        )}
        <NavLink to="/help" className={linkClass} onClick={handleNavClick}>
          <FaQuestionCircle /> {!collapsedLabelsHidden && 'Help'}
        </NavLink>
        <NavLink to="/settings" className={linkClass} onClick={handleNavClick}>
          <FaCog /> {!collapsedLabelsHidden && 'Settings'}
        </NavLink>
      </nav>
    </aside>
  );
}
