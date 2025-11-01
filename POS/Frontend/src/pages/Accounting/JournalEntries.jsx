import React, { useState } from 'react';
import { api } from '../../lib/api';
import { useSettings } from '../../components/SettingsContext';

export default function JournalEntries({ entries = [], onRefresh }) {
  const { formatCurrency } = useSettings();
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
      onRefresh && onRefresh();
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
}
