import React from 'react';
import { FaSearch, FaFilter, FaPlus } from 'react-icons/fa';

const TableToolbar = ({ onSearch, onAddCustomer, searchTerm, loading = false }) => {
  return (
    <div className="p-4 bg-gray-50 rounded-t-lg">
      <div className="flex justify-between items-center">
        <div className="relative">
          <span className="absolute inset-y-0 left-0 flex items-center pl-3">
            <FaSearch className="text-gray-400" />
          </span>
          <input
            type="text"
            placeholder="Search customers..."
            value={searchTerm}
            onChange={(e) => onSearch(e.target.value)}
            className="pl-10 pr-4 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
        </div>
        <div className="flex items-center space-x-3">
          {loading && <span className="text-xs text-gray-500 animate-pulse">Syncing…</span>}
          <button className="flex items-center px-4 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 hover:bg-gray-100">
            <FaFilter className="mr-2" />
            Filter
          </button>
          <button 
            onClick={onAddCustomer}
            className="flex items-center px-4 py-2 bg-indigo-600 border border-transparent rounded-md text-sm font-medium text-white hover:bg-indigo-700"
          >
            <FaPlus className="mr-2" />
            Add Customer
          </button>
        </div>
      </div>
    </div>
  );
};

export default TableToolbar;
