import { NavLink } from 'react-router-dom';
import { FaFileInvoice } from 'react-icons/fa';

export default function Sidebar() {
  const linkClass = ({ isActive }) => `block px-4 py-2 rounded-md font-medium ${isActive ? 'bg-blue-600 text-white' : 'text-gray-700 hover:bg-gray-100'}`;

  return (
    <aside className="w-64 bg-white border-r h-screen p-4 fixed">
      <h1 className="text-xl font-bold mb-6">ITnVend</h1>
      <nav className="space-y-2">
        <NavLink to="/" end className={linkClass}>POS</NavLink>
        <NavLink to="/invoices" className={linkClass}>
          <FaFileInvoice className="mr-3" /> Invoices
        </NavLink>
        <NavLink to="/products" className={linkClass}>Products</NavLink>
        <NavLink to="/customers" className={linkClass}>Customers</NavLink>
        <NavLink to="/settings" className={linkClass}>Settings</NavLink>
      </nav>
    </aside>
  );
}
