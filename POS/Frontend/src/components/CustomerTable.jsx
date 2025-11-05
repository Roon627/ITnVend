import React, { useState, useMemo } from 'react';
import { FaSort, FaSortUp, FaSortDown, FaEdit, FaEye, FaFileInvoice } from 'react-icons/fa';

const CustomerTypeBadge = ({ customer }) => {
  const baseClasses = 'px-2 py-1 text-xs font-semibold rounded-full';
  const type = (customer.customer_type || '').toString().toLowerCase();
  const isBusiness = customer.is_business === 1 || customer.is_business === true;

  if (type.includes('vendor') || type.includes('business') || isBusiness) {
    return <span className={`bg-green-100 text-green-800 ${baseClasses}`}>Business</span>;
  }
  if (type.includes('one-time') || type.includes('one_time') || type.includes('seller') || type.includes('casual')) {
    return <span className={`bg-yellow-100 text-yellow-800 ${baseClasses}`}>Casual Seller</span>;
  }
  return <span className={`bg-blue-100 text-blue-800 ${baseClasses}`}>Regular</span>;
};

const CustomerTable = ({
  customers = [],
  onEdit,
  onView,
  onCreateBill,
  tab,
  onApprove,
  onReject,
  loading = false,
  emptyMessage = 'No customers found.',
  formatCurrency,
}) => {
  const [sortConfig, setSortConfig] = useState({ key: 'name', direction: 'ascending' });

  const fallbackCurrency = useMemo(
    () => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }),
    []
  );

  const formatAmount = (value) => {
    const numeric = Number(value ?? 0);
    if (typeof formatCurrency === 'function') {
      return formatCurrency(numeric);
    }
    return fallbackCurrency.format(numeric);
  };

  const sortedCustomers = useMemo(() => {
    const data = Array.isArray(customers) ? [...customers] : [];
    if (!sortConfig || !sortConfig.key) {
      return data;
    }
    const direction = sortConfig.direction === 'ascending' ? 1 : -1;
    const key = sortConfig.key;
    return data.sort((aRow, bRow) => {
      const aRaw = aRow?.[key];
      const bRaw = bRow?.[key];

      if (aRaw == null && bRaw == null) return 0;
      if (aRaw == null) return 1 * direction;
      if (bRaw == null) return -1 * direction;

      if (key === 'last_activity') {
        const aTime = new Date(aRaw).getTime() || 0;
        const bTime = new Date(bRaw).getTime() || 0;
        if (aTime === bTime) return 0;
        return aTime < bTime ? -1 * direction : 1 * direction;
      }

      if (typeof aRaw === 'string' || typeof bRaw === 'string') {
        return aRaw.toString().localeCompare(bRaw.toString(), undefined, { sensitivity: 'base' }) * direction;
      }

      const aVal = Number(aRaw) || 0;
      const bVal = Number(bRaw) || 0;
      if (aVal === bVal) return 0;
      return aVal < bVal ? -1 * direction : 1 * direction;
    });
  }, [customers, sortConfig]);

  const requestSort = (key) => {
    let direction = 'ascending';
    if (sortConfig.key === key && sortConfig.direction === 'ascending') {
      direction = 'descending';
    }
    setSortConfig({ key, direction });
  };

  const getSortIcon = (name) => {
    if (sortConfig.key !== name) {
      return <FaSort className="text-gray-400" />;
    }
    if (sortConfig.direction === 'ascending') {
      return <FaSortUp />;
    }
    return <FaSortDown />;
  };

  return (
    <div className="overflow-x-auto bg-white rounded-lg shadow">
      <table className="min-w-full divide-y divide-gray-200">
        <thead className="bg-gray-50 sticky top-0">
          <tr>
            <th onClick={() => requestSort('name')} className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer">
              <div className="flex items-center">Name {getSortIcon('name')}</div>
            </th>
            <th onClick={() => requestSort('customer_type')} className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer">
              <div className="flex items-center">Type {getSortIcon('customer_type')}</div>
            </th>
            <th onClick={() => requestSort('total_invoices')} className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer">
              <div className="flex items-center">Total Invoices {getSortIcon('total_invoices')}</div>
            </th>
            <th onClick={() => requestSort('total_spent')} className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer">
              <div className="flex items-center">Total Spent {getSortIcon('total_spent')}</div>
            </th>
            <th onClick={() => requestSort('last_activity')} className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer">
              <div className="flex items-center">Last Activity {getSortIcon('last_activity')}</div>
            </th>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
          </tr>
        </thead>
        <tbody className="bg-white divide-y divide-gray-200">
          {loading ? (
            <tr>
              <td colSpan={6} className="px-6 py-8 text-center text-sm text-gray-500">Loading customers…</td>
            </tr>
          ) : sortedCustomers.length ? (
            sortedCustomers.map((customer) => (
              <tr key={customer.id} className="hover:bg-gray-50">
                <td className="px-6 py-4 whitespace-nowrap">
                  <div className="flex items-center">
                    <div className="font-medium text-gray-900">{customer.name}</div>
                  </div>
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <CustomerTypeBadge customer={customer} />
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{customer.total_invoices || 0}</td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                  <span className="font-semibold text-gray-800">{formatAmount(customer.total_spent)}</span>
                  {Number(customer.outstanding_balance) > 0 && (
                    <span className="block text-xs text-amber-600">Outstanding {formatAmount(customer.outstanding_balance)}</span>
                  )}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                  {customer.last_activity ? new Date(customer.last_activity).toLocaleDateString() : 'N/A'}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                  <div className="flex items-center space-x-3">
                    {/* View button - read-only modal via onView prop */}
                    <button
                      type="button"
                      onClick={() => onView && onView(customer)}
                      title="View customer"
                      className="inline-flex items-center gap-2 px-3 py-1 rounded-md text-sm font-medium bg-blue-100 text-blue-800 hover:shadow-md hover:-translate-y-0.5 transform transition"
                    >
                      <FaEye />
                      <span>View</span>
                    </button>

                    {/* Edit button - editable modal via onEdit prop */}
                    <button
                      type="button"
                      onClick={() => onEdit && onEdit(customer)}
                      title="Edit customer"
                      className="inline-flex items-center gap-2 px-3 py-1 rounded-md text-sm font-medium bg-amber-100 text-amber-800 hover:shadow-md hover:-translate-y-0.5 transform transition"
                    >
                      <FaEdit />
                      <span>Edit</span>
                    </button>

                    {/* Create Bill - trigger provided handler (responsible for navigation to /pos?customer_id=...) */}
                    <button
                      type="button"
                      onClick={() => onCreateBill && onCreateBill(customer)}
                      title="Create bill for customer"
                      className="inline-flex items-center gap-2 px-3 py-1 rounded-md text-sm font-medium bg-emerald-100 text-emerald-800 hover:shadow-md hover:-translate-y-0.5 transform transition"
                    >
                      <FaFileInvoice />
                      <span>Create Bill</span>
                    </button>
                    {/* Approve / Reject actions for request rows */}
                    {tab === 'vendor-requests' && customer.vendor_id && (
                      <>
                        <button onClick={() => onApprove(customer.vendor_id)} className="px-2 py-1 bg-emerald-500 text-white rounded text-xs">Approve</button>
                        <button onClick={() => onReject(customer.vendor_id)} className="px-2 py-1 bg-red-100 text-red-600 rounded text-xs">Reject</button>
                      </>
                    )}
                    {tab === 'one-time-requests' && customer.casual_item_id && (
                      <>
                        <button onClick={() => onApprove(customer.casual_item_id)} className="px-2 py-1 bg-emerald-500 text-white rounded text-xs">Approve</button>
                        <button onClick={() => onReject(customer.casual_item_id)} className="px-2 py-1 bg-red-100 text-red-600 rounded text-xs">Reject</button>
                      </>
                    )}
                  </div>
                </td>
              </tr>
            ))
          ) : (
            <tr>
              <td colSpan={6} className="px-6 py-8 text-center text-sm text-gray-500">{emptyMessage}</td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
};

export default CustomerTable;
