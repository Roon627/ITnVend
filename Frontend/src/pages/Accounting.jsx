import React, { useState, useEffect } from 'react';
import { api } from '../lib/api';
import { useSettings } from '../components/SettingsContext';

const Accounting = () => {
  const { formatCurrency, currencySymbol } = useSettings();
  const [activeTab, setActiveTab] = useState('dashboard');
  const [chartOfAccounts, setChartOfAccounts] = useState([]);
  const [journalEntries, setJournalEntries] = useState([]);
  const [accountsPayable, setAccountsPayable] = useState([]);
  const [accountsReceivable, setAccountsReceivable] = useState([]);
  const [trialBalance, setTrialBalance] = useState([]);
  const [balanceSheet, setBalanceSheet] = useState({});
  const [profitLoss, setProfitLoss] = useState({});
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    loadData();
  }, [activeTab]);

  const loadData = async () => {
    setLoading(true);
    try {
      switch (activeTab) {
        case 'chart':
          const chartData = await api.get('/api/accounts/chart');
          setChartOfAccounts(chartData);
          break;
        case 'journal':
          const journalData = await api.get('/api/accounts/journal-entries');
          setJournalEntries(journalData);
          break;
        case 'payable':
          const payableData = await api.get('/api/accounts/payable');
          setAccountsPayable(payableData);
          break;
        case 'receivable':
          const receivableData = await api.get('/api/accounts/receivable');
          setAccountsReceivable(receivableData);
          break;
        case 'reports':
          await loadReports();
          break;
        default:
          break;
      }
    } catch (error) {
      console.error('Error loading data:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadReports = async () => {
    try {
      const [trialData, balanceData, plData] = await Promise.all([
        api.get('/api/accounts/reports/trial-balance'),
        api.get('/api/accounts/reports/balance-sheet'),
        api.get('/api/accounts/reports/profit-loss', {
          params: {
            start_date: new Date(new Date().getFullYear(), 0, 1).toISOString().split('T')[0],
            end_date: new Date().toISOString().split('T')[0]
          }
        })
      ]);
      setTrialBalance(trialData);
      setBalanceSheet(balanceData);
      setProfitLoss(plData);
    } catch (error) {
      console.error('Error loading reports:', error);
    }
  };

  const tabs = [
    { id: 'dashboard', label: 'Dashboard', icon: '📊' },
    { id: 'chart', label: 'Chart of Accounts', icon: '📋' },
    { id: 'journal', label: 'Journal Entries', icon: '📝' },
    { id: 'payable', label: 'Accounts Payable', icon: '💰' },
    { id: 'receivable', label: 'Accounts Receivable', icon: '💳' },
    { id: 'reports', label: 'Financial Reports', icon: '📈' },
  ];

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-white shadow">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center py-6">
            <h1 className="text-3xl font-bold text-gray-900">Accounting</h1>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Navigation Tabs */}
        <div className="mb-8">
          <nav className="flex space-x-8" aria-label="Tabs">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`whitespace-nowrap py-2 px-1 border-b-2 font-medium text-sm ${
                  activeTab === tab.id
                    ? 'border-blue-500 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                <span className="mr-2">{tab.icon}</span>
                {tab.label}
              </button>
            ))}
          </nav>
        </div>

        {/* Content Area */}
        <div className="bg-white shadow rounded-lg">
          {loading ? (
            <div className="p-8 text-center">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto"></div>
              <p className="mt-4 text-gray-600">Loading...</p>
            </div>
          ) : (
            <div className="p-6">
              {activeTab === 'dashboard' && <AccountingDashboard />}
              {activeTab === 'chart' && (
                <ChartOfAccounts
                  accounts={chartOfAccounts}
                  onRefresh={loadData}
                />
              )}
              {activeTab === 'journal' && (
                <JournalEntries
                  entries={journalEntries}
                  onRefresh={loadData}
                />
              )}
              {activeTab === 'payable' && (
                <AccountsPayable
                  invoices={accountsPayable}
                  onRefresh={loadData}
                />
              )}
              {activeTab === 'receivable' && (
                <AccountsReceivable
                  receivables={accountsReceivable}
                  onRefresh={loadData}
                />
              )}
              {activeTab === 'reports' && (
                <FinancialReports
                  trialBalance={trialBalance}
                  balanceSheet={balanceSheet}
                  profitLoss={profitLoss}
                />
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

// Dashboard Component
const AccountingDashboard = () => {
  return (
    <div>
      <h2 className="text-2xl font-bold text-gray-900 mb-6">Accounting Dashboard</h2>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <div className="bg-blue-50 p-6 rounded-lg">
          <div className="flex items-center">
            <div className="p-2 bg-blue-500 rounded-lg">
              <span className="text-white text-xl">📊</span>
            </div>
            <div className="ml-4">
              <p className="text-sm font-medium text-blue-600">Total Accounts</p>
              <p className="text-2xl font-bold text-blue-900">--</p>
            </div>
          </div>
        </div>
        <div className="bg-green-50 p-6 rounded-lg">
          <div className="flex items-center">
            <div className="p-2 bg-green-500 rounded-lg">
              <span className="text-white text-xl">💰</span>
            </div>
            <div className="ml-4">
              <p className="text-sm font-medium text-green-600">Outstanding Payables</p>
              <p className="text-2xl font-bold text-green-900">--</p>
            </div>
          </div>
        </div>
        <div className="bg-yellow-50 p-6 rounded-lg">
          <div className="flex items-center">
            <div className="p-2 bg-yellow-500 rounded-lg">
              <span className="text-white text-xl">💳</span>
            </div>
            <div className="ml-4">
              <p className="text-sm font-medium text-yellow-600">Outstanding Receivables</p>
              <p className="text-2xl font-bold text-yellow-900">--</p>
            </div>
          </div>
        </div>
        <div className="bg-purple-50 p-6 rounded-lg">
          <div className="flex items-center">
            <div className="p-2 bg-purple-500 rounded-lg">
              <span className="text-white text-xl">📈</span>
            </div>
            <div className="ml-4">
              <p className="text-sm font-medium text-purple-600">Net Income</p>
              <p className="text-2xl font-bold text-purple-900">--</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

// Chart of Accounts Component
const ChartOfAccounts = ({ accounts, onRefresh }) => {
  const [showForm, setShowForm] = useState(false);
  const [editingAccount, setEditingAccount] = useState(null);
  const [formData, setFormData] = useState({
    account_number: '',
    name: '',
    type: 'asset',
    category: '',
    description: '',
    parent_account_id: null
  });

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      if (editingAccount) {
        await api.put(`/api/accounts/chart/${editingAccount.id}`, formData);
      } else {
        await api.post('/api/accounts/chart', formData);
      }
      setShowForm(false);
      setEditingAccount(null);
      setFormData({
        account_number: '',
        name: '',
        type: 'asset',
        category: '',
        description: '',
        parent_account_id: null
      });
      onRefresh();
    } catch (error) {
      console.error('Error saving account:', error);
    }
  };

  const handleEdit = (account) => {
    setEditingAccount(account);
    setFormData({
      account_number: account.account_number,
      name: account.name,
      type: account.type,
      category: account.category,
      description: account.description || '',
      parent_account_id: account.parent_account_id
    });
    setShowForm(true);
  };

  const handleDelete = async (accountId) => {
    if (window.confirm('Are you sure you want to delete this account?')) {
      try {
        await api.delete(`/api/accounts/chart/${accountId}`);
        onRefresh();
      } catch (error) {
        console.error('Error deleting account:', error);
      }
    }
  };

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-2xl font-bold text-gray-900">Chart of Accounts</h2>
        <button
          onClick={() => setShowForm(true)}
          className="bg-blue-500 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded"
        >
          Add Account
        </button>
      </div>

      {showForm && (
        <div className="mb-6 p-4 border rounded-lg bg-gray-50">
          <h3 className="text-lg font-semibold mb-4">
            {editingAccount ? 'Edit Account' : 'Add New Account'}
          </h3>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700">Account Number</label>
                <input
                  type="text"
                  value={formData.account_number}
                  onChange={(e) => setFormData({...formData, account_number: e.target.value})}
                  className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm p-2"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">Account Name</label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({...formData, name: e.target.value})}
                  className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm p-2"
                  required
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700">Type</label>
                <select
                  value={formData.type}
                  onChange={(e) => setFormData({...formData, type: e.target.value})}
                  className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm p-2"
                >
                  <option value="asset">Asset</option>
                  <option value="liability">Liability</option>
                  <option value="equity">Equity</option>
                  <option value="revenue">Revenue</option>
                  <option value="expense">Expense</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">Category</label>
                <input
                  type="text"
                  value={formData.category}
                  onChange={(e) => setFormData({...formData, category: e.target.value})}
                  className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm p-2"
                />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">Description</label>
              <textarea
                value={formData.description}
                onChange={(e) => setFormData({...formData, description: e.target.value})}
                className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm p-2"
                rows="3"
              />
            </div>
            <div className="flex space-x-2">
              <button
                type="submit"
                className="bg-blue-500 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded"
              >
                {editingAccount ? 'Update' : 'Create'} Account
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowForm(false);
                  setEditingAccount(null);
                  setFormData({
                    account_number: '',
                    name: '',
                    type: 'asset',
                    category: '',
                    description: '',
                    parent_account_id: null
                  });
                }}
                className="bg-gray-500 hover:bg-gray-700 text-white font-bold py-2 px-4 rounded"
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Account Number
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Name
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Type
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Category
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {accounts.map((account) => (
              <tr key={account.id}>
                <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                  {account.account_number}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                  {account.name}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 capitalize">
                  {account.type}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                  {account.category}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                  <button
                    onClick={() => handleEdit(account)}
                    className="text-indigo-600 hover:text-indigo-900 mr-4"
                  >
                    Edit
                  </button>
                  <button
                    onClick={() => handleDelete(account.id)}
                    className="text-red-600 hover:text-red-900"
                  >
                    Delete
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

// Journal Entries Component
const JournalEntries = ({ entries, onRefresh }) => {
  const [showForm, setShowForm] = useState(false);
  const [formData, setFormData] = useState({
    entry_date: new Date().toISOString().split('T')[0],
    description: '',
    reference: '',
    lines: [{ account_id: '', debit: 0, credit: 0, description: '' }]
  });

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      await api.post('/api/accounts/journal-entries', formData);
      setShowForm(false);
      setFormData({
        entry_date: new Date().toISOString().split('T')[0],
        description: '',
        reference: '',
        lines: [{ account_id: '', debit: 0, credit: 0, description: '' }]
      });
      onRefresh();
    } catch (error) {
      console.error('Error creating journal entry:', error);
    }
  };

  const addLine = () => {
    setFormData({
      ...formData,
      lines: [...formData.lines, { account_id: '', debit: 0, credit: 0, description: '' }]
    });
  };

  const updateLine = (index, field, value) => {
    const newLines = [...formData.lines];
    newLines[index][field] = value;
    setFormData({ ...formData, lines: newLines });
  };

  const removeLine = (index) => {
    if (formData.lines.length > 1) {
      const newLines = formData.lines.filter((_, i) => i !== index);
      setFormData({ ...formData, lines: newLines });
    }
  };

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-2xl font-bold text-gray-900">Journal Entries</h2>
        <button
          onClick={() => setShowForm(true)}
          className="bg-blue-500 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded"
        >
          New Journal Entry
        </button>
      </div>

      {showForm && (
        <div className="mb-6 p-4 border rounded-lg bg-gray-50">
          <h3 className="text-lg font-semibold mb-4">New Journal Entry</h3>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700">Entry Date</label>
                <input
                  type="date"
                  value={formData.entry_date}
                  onChange={(e) => setFormData({...formData, entry_date: e.target.value})}
                  className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm p-2"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">Reference</label>
                <input
                  type="text"
                  value={formData.reference}
                  onChange={(e) => setFormData({...formData, reference: e.target.value})}
                  className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm p-2"
                />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">Description</label>
              <textarea
                value={formData.description}
                onChange={(e) => setFormData({...formData, description: e.target.value})}
                className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm p-2"
                rows="3"
                required
              />
            </div>

            <div>
              <div className="flex justify-between items-center mb-2">
                <h4 className="text-md font-medium">Journal Lines</h4>
                <button
                  type="button"
                  onClick={addLine}
                  className="bg-green-500 hover:bg-green-700 text-white font-bold py-1 px-2 rounded text-sm"
                >
                  Add Line
                </button>
              </div>
              {formData.lines.map((line, index) => (
                <div key={index} className="grid grid-cols-12 gap-2 mb-2 p-2 border rounded">
                  <div className="col-span-3">
                    <input
                      type="text"
                      placeholder="Account ID"
                      value={line.account_id}
                      onChange={(e) => updateLine(index, 'account_id', e.target.value)}
                      className="w-full border border-gray-300 rounded p-1 text-sm"
                      required
                    />
                  </div>
                  <div className="col-span-2">
                    <input
                      type="number"
                      step="0.01"
                      placeholder="Debit"
                      value={line.debit}
                      onChange={(e) => updateLine(index, 'debit', parseFloat(e.target.value) || 0)}
                      className="w-full border border-gray-300 rounded p-1 text-sm"
                    />
                  </div>
                  <div className="col-span-2">
                    <input
                      type="number"
                      step="0.01"
                      placeholder="Credit"
                      value={line.credit}
                      onChange={(e) => updateLine(index, 'credit', parseFloat(e.target.value) || 0)}
                      className="w-full border border-gray-300 rounded p-1 text-sm"
                    />
                  </div>
                  <div className="col-span-4">
                    <input
                      type="text"
                      placeholder="Description"
                      value={line.description}
                      onChange={(e) => updateLine(index, 'description', e.target.value)}
                      className="w-full border border-gray-300 rounded p-1 text-sm"
                    />
                  </div>
                  <div className="col-span-1">
                    {formData.lines.length > 1 && (
                      <button
                        type="button"
                        onClick={() => removeLine(index)}
                        className="bg-red-500 hover:bg-red-700 text-white font-bold py-1 px-2 rounded text-sm"
                      >
                        ×
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>

            <div className="flex space-x-2">
              <button
                type="submit"
                className="bg-blue-500 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded"
              >
                Create Journal Entry
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowForm(false);
                  setFormData({
                    entry_date: new Date().toISOString().split('T')[0],
                    description: '',
                    reference: '',
                    lines: [{ account_id: '', debit: 0, credit: 0, description: '' }]
                  });
                }}
                className="bg-gray-500 hover:bg-gray-700 text-white font-bold py-2 px-4 rounded"
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Date
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Description
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Reference
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Total Debit
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Total Credit
              </th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {entries.map((entry) => (
              <tr key={entry.id}>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                  {new Date(entry.entry_date).toLocaleDateString()}
                </td>
                <td className="px-6 py-4 text-sm text-gray-900">
                  {entry.description}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                  {entry.reference}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                  {formatCurrency(entry.total_debit)}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                  {formatCurrency(entry.total_credit)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

// Accounts Payable Component
const AccountsPayable = ({ invoices, onRefresh }) => {
  const [showForm, setShowForm] = useState(false);
  const [formData, setFormData] = useState({
    vendor_id: '',
    invoice_number: '',
    invoice_date: new Date().toISOString().split('T')[0],
    due_date: '',
    amount: 0,
    description: ''
  });

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      await api.post('/api/accounts/payable', formData);
      setShowForm(false);
      setFormData({
        vendor_id: '',
        invoice_number: '',
        invoice_date: new Date().toISOString().split('T')[0],
        due_date: '',
        amount: 0,
        description: ''
      });
      onRefresh();
    } catch (error) {
      console.error('Error creating payable invoice:', error);
    }
  };

  const handlePayment = async (invoiceId, paymentAmount, paymentDate) => {
    try {
      await api.put(`/api/accounts/payable/${invoiceId}/payment`, {
        payment_amount: paymentAmount,
        payment_date: paymentDate,
        payment_method: 'check',
        reference: `Payment for invoice ${invoiceId}`
      });
      onRefresh();
    } catch (error) {
      console.error('Error recording payment:', error);
    }
  };

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-2xl font-bold text-gray-900">Accounts Payable</h2>
        <button
          onClick={() => setShowForm(true)}
          className="bg-blue-500 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded"
        >
          Add Invoice
        </button>
      </div>

      {showForm && (
        <div className="mb-6 p-4 border rounded-lg bg-gray-50">
          <h3 className="text-lg font-semibold mb-4">Add Payable Invoice</h3>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700">Vendor ID</label>
                <input
                  type="text"
                  value={formData.vendor_id}
                  onChange={(e) => setFormData({...formData, vendor_id: e.target.value})}
                  className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm p-2"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">Invoice Number</label>
                <input
                  type="text"
                  value={formData.invoice_number}
                  onChange={(e) => setFormData({...formData, invoice_number: e.target.value})}
                  className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm p-2"
                  required
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700">Invoice Date</label>
                <input
                  type="date"
                  value={formData.invoice_date}
                  onChange={(e) => setFormData({...formData, invoice_date: e.target.value})}
                  className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm p-2"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">Due Date</label>
                <input
                  type="date"
                  value={formData.due_date}
                  onChange={(e) => setFormData({...formData, due_date: e.target.value})}
                  className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm p-2"
                  required
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700">Amount</label>
                <input
                  type="number"
                  step="0.01"
                  value={formData.amount}
                  onChange={(e) => setFormData({...formData, amount: parseFloat(e.target.value) || 0})}
                  className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm p-2"
                  required
                />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">Description</label>
              <textarea
                value={formData.description}
                onChange={(e) => setFormData({...formData, description: e.target.value})}
                className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm p-2"
                rows="3"
              />
            </div>
            <div className="flex space-x-2">
              <button
                type="submit"
                className="bg-blue-500 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded"
              >
                Create Invoice
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowForm(false);
                  setFormData({
                    vendor_id: '',
                    invoice_number: '',
                    invoice_date: new Date().toISOString().split('T')[0],
                    due_date: '',
                    amount: 0,
                    description: ''
                  });
                }}
                className="bg-gray-500 hover:bg-gray-700 text-white font-bold py-2 px-4 rounded"
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Vendor
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Invoice Number
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Due Date
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Amount
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Paid
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Status
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {invoices.map((invoice) => (
              <tr key={invoice.id}>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                  {invoice.vendor_name}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                  {invoice.invoice_number}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                  {new Date(invoice.due_date).toLocaleDateString()}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                  {formatCurrency(invoice.amount)}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                  {formatCurrency(invoice.paid_amount)}
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${
                    invoice.status === 'paid'
                      ? 'bg-green-100 text-green-800'
                      : invoice.status === 'partial'
                      ? 'bg-yellow-100 text-yellow-800'
                      : 'bg-red-100 text-red-800'
                  }`}>
                    {invoice.status}
                  </span>
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                  {invoice.status !== 'paid' && (
                    <button
                      onClick={() => {
                        const paymentAmount = prompt(`Enter payment amount (${currencySymbol})`, (invoice.amount - invoice.paid_amount).toFixed(2));
                        if (paymentAmount) {
                          handlePayment(invoice.id, parseFloat(paymentAmount), new Date().toISOString().split('T')[0]);
                        }
                      }}
                      className="text-green-600 hover:text-green-900"
                    >
                      Record Payment
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

// Accounts Receivable Component
const AccountsReceivable = ({ receivables, onRefresh }) => {
  const handlePayment = async (receivableId, paymentAmount, paymentDate) => {
    try {
      await api.put(`/api/accounts/receivable/${receivableId}/payment`, {
        payment_amount: paymentAmount,
        payment_date: paymentDate,
        payment_method: 'cash',
        reference: `Payment received for receivable ${receivableId}`
      });
      onRefresh();
    } catch (error) {
      console.error('Error recording payment:', error);
    }
  };

  return (
    <div>
      <h2 className="text-2xl font-bold text-gray-900 mb-6">Accounts Receivable</h2>

      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Customer
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Invoice ID
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Due Date
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Amount
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Paid
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Status
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {receivables.map((receivable) => (
              <tr key={receivable.id}>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                  {receivable.customer_name}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                  {receivable.invoice_id}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                  {new Date(receivable.due_date).toLocaleDateString()}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                  {formatCurrency(receivable.amount)}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                  {formatCurrency(receivable.paid_amount)}
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${
                    receivable.status === 'paid'
                      ? 'bg-green-100 text-green-800'
                      : receivable.status === 'partial'
                      ? 'bg-yellow-100 text-yellow-800'
                      : 'bg-red-100 text-red-800'
                  }`}>
                    {receivable.status}
                  </span>
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                  {receivable.status !== 'paid' && (
                    <button
                      onClick={() => {
                        const paymentAmount = prompt(`Enter payment amount (${currencySymbol})`, (receivable.amount - receivable.paid_amount).toFixed(2));
                        if (paymentAmount) {
                          handlePayment(receivable.id, parseFloat(paymentAmount), new Date().toISOString().split('T')[0]);
                        }
                      }}
                      className="text-green-600 hover:text-green-900"
                    >
                      Record Payment
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

// Financial Reports Component
const FinancialReports = ({ trialBalance, balanceSheet, profitLoss }) => {
  const [activeReport, setActiveReport] = useState('trial-balance');

  return (
    <div>
      <h2 className="text-2xl font-bold text-gray-900 mb-6">Financial Reports</h2>

      <div className="mb-6">
        <nav className="flex space-x-8" aria-label="Report Tabs">
          {[
            { id: 'trial-balance', label: 'Trial Balance' },
            { id: 'balance-sheet', label: 'Balance Sheet' },
            { id: 'profit-loss', label: 'Profit & Loss' }
          ].map((report) => (
            <button
              key={report.id}
              onClick={() => setActiveReport(report.id)}
              className={`whitespace-nowrap py-2 px-1 border-b-2 font-medium text-sm ${
                activeReport === report.id
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              {report.label}
            </button>
          ))}
        </nav>
      </div>

      {activeReport === 'trial-balance' && (
        <div>
          <h3 className="text-xl font-semibold mb-4">Trial Balance</h3>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Account Number
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Account Name
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Type
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Debit
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Credit
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Balance
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {trialBalance.map((account) => (
                  <tr key={account.id}>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                      {account.account_number}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {account.name}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 capitalize">
                      {account.type}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-right text-gray-900">
                      {formatCurrency(account.debit_total)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-right text-gray-900">
                      {formatCurrency(account.credit_total)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-right font-medium text-gray-900">
                      {formatCurrency(account.balance)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {activeReport === 'balance-sheet' && (
        <div>
          <h3 className="text-xl font-semibold mb-4">Balance Sheet</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            <div>
              <h4 className="text-lg font-medium mb-4">Assets</h4>
              <div className="space-y-2">
                {balanceSheet.assets?.map((asset) => (
                    <div key={asset.account_number} className="flex justify-between">
                    <span>{asset.name}</span>
                    <span>{formatCurrency(asset.balance)}</span>
                  </div>
                ))}
                <div className="border-t pt-2 font-semibold">
                    <div className="flex justify-between">
                    <span>Total Assets</span>
                    <span>{formatCurrency(balanceSheet.totals?.assets)}</span>
                  </div>
                </div>
              </div>
            </div>
            <div>
              <h4 className="text-lg font-medium mb-4">Liabilities & Equity</h4>
              <div className="space-y-2">
                {balanceSheet.liabilities?.map((liability) => (
                    <div key={liability.account_number} className="flex justify-between">
                    <span>{liability.name}</span>
                    <span>{formatCurrency(liability.balance)}</span>
                  </div>
                ))}
                {balanceSheet.equity?.map((equity) => (
                  <div key={equity.account_number} className="flex justify-between">
                    <span>{equity.name}</span>
                    <span>{formatCurrency(equity.balance)}</span>
                  </div>
                ))}
                <div className="border-t pt-2 font-semibold">
                    <div className="flex justify-between">
                    <span>Total Liabilities & Equity</span>
                    <span>{formatCurrency(balanceSheet.totals?.liabilitiesAndEquity)}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {activeReport === 'profit-loss' && (
        <div>
          <h3 className="text-xl font-semibold mb-4">Profit & Loss Statement</h3>
          <div className="space-y-6">
            <div>
              <h4 className="text-lg font-medium mb-4">Revenue</h4>
              <div className="space-y-2">
                {profitLoss.revenue?.map((rev) => (
                  <div key={rev.account_number} className="flex justify-between">
                    <span>{rev.name}</span>
                    <span>{formatCurrency(rev.amount)}</span>
                  </div>
                ))}
                <div className="border-t pt-2 font-semibold">
                    <div className="flex justify-between">
                    <span>Total Revenue</span>
                    <span>{formatCurrency(profitLoss.totals?.revenue)}</span>
                  </div>
                </div>
              </div>
            </div>
            <div>
              <h4 className="text-lg font-medium mb-4">Expenses</h4>
              <div className="space-y-2">
                {profitLoss.expenses?.map((exp) => (
                  <div key={exp.account_number} className="flex justify-between">
                    <span>{exp.name}</span>
                    <span>{formatCurrency(exp.amount)}</span>
                  </div>
                ))}
                <div className="border-t pt-2 font-semibold">
                    <div className="flex justify-between">
                    <span>Total Expenses</span>
                    <span>{formatCurrency(profitLoss.totals?.expenses)}</span>
                  </div>
                </div>
              </div>
            </div>
            <div className="border-t pt-4">
              <div className="flex justify-between text-xl font-bold">
                <span>Net Income</span>
                <span>{formatCurrency(profitLoss.totals?.netIncome)}</span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Accounting;