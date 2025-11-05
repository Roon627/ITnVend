import React, { useState, useEffect } from 'react';
import Modal from './Modal'; // generic Modal component
import { useToast } from './ToastContext';
import api from '../lib/api';

const CustomerDetailModal = ({ customer, isOpen, onClose, onSave }) => {
  const [editedCustomer, setEditedCustomer] = useState(customer);
  const { addToast } = useToast();

  useEffect(() => {
    setEditedCustomer(customer);
  }, [customer]);

  if (!isOpen || !editedCustomer) return null;

  const handleChange = (e) => {
    const { name, value } = e.target;
    setEditedCustomer(prev => ({ ...prev, [name]: value }));
  };

  const handleSave = async () => {
    try {
      // Here you would have a specific API endpoint to update customer details
      // For now, we'll simulate it and call the onSave prop
      await api.put(`/customers/${editedCustomer.id}`, editedCustomer);
      onSave(editedCustomer);
      addToast('Customer details saved successfully!', { appearance: 'success' });
      onClose();
    } catch (error) {
      addToast(`Error: ${error.message}`, { appearance: 'error' });
    }
  };

  const renderVendorDetails = () => (
    <>
      <div className="mt-4">
        <label className="block text-sm font-medium text-gray-700">Commission Rate (%)</label>
        <input
          type="number"
          name="commission_rate"
          value={editedCustomer.commission_rate || '10'}
          onChange={handleChange}
          className="mt-1 block w-full px-3 py-2 bg-white border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
        />
      </div>
      <div className="mt-4">
        <label className="block text-sm font-medium text-gray-700">Bank Details</label>
        <textarea
          name="bank_details"
          value={editedCustomer.bank_details || ''}
          onChange={handleChange}
          rows="3"
          className="mt-1 block w-full px-3 py-2 bg-white border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
        ></textarea>
      </div>
    </>
  );

  const renderCasualSellerDetails = () => (
    <div className="mt-4 p-3 bg-gray-50 rounded-lg">
        <h4 className="text-sm font-medium text-gray-600">Casual Seller Info</h4>
        <p className="text-xs text-gray-500">Items Listed: {editedCustomer.item_count || 0}</p>
        <p className="text-xs text-gray-500">Total Fees Paid: ${(editedCustomer.total_fees_paid || 0).toFixed(2)}</p>
    </div>
  );

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={`Edit ${editedCustomer.name}`}>
      <div>
        <label className="block text-sm font-medium text-gray-700">Name</label>
        <input
          type="text"
          name="name"
          value={editedCustomer.name}
          onChange={handleChange}
          className="mt-1 block w-full px-3 py-2 bg-white border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
        />
      </div>
      <div className="mt-4">
        <label className="block text-sm font-medium text-gray-700">Email</label>
        <input
          type="email"
          name="email"
          value={editedCustomer.email}
          onChange={handleChange}
          className="mt-1 block w-full px-3 py-2 bg-white border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
        />
      </div>
      <div className="mt-4">
        <label className="block text-sm font-medium text-gray-700">Phone</label>
        <input
          type="text"
          name="phone"
          value={editedCustomer.phone}
          onChange={handleChange}
          className="mt-1 block w-full px-3 py-2 bg-white border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
        />
      </div>

      {editedCustomer.customer_type === 'vendor' && renderVendorDetails()}
      {editedCustomer.customer_type === 'one-time-seller' && renderCasualSellerDetails()}

      <div className="mt-6 flex justify-end space-x-3">
        <button
          type="button"
          onClick={onClose}
          className="bg-white py-2 px-4 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={handleSave}
          className="bg-indigo-600 py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
        >
          Save
        </button>
      </div>
    </Modal>
  );
};

export default CustomerDetailModal;
